# TTS 音色注册与复用架构分析与优化方案

## 1. 背景与目标

有声书 TTS 生成时，每个片段需要指定说话人使用的音色。音色来源分为两类：

| 音色来源 | 说明 | 示例 |
|---------|------|------|
| **系统内置音色** | TTS 厂商自带的固定音色，通过名称/ID 直接使用 | MiMo 的"茉莉"、MiniMax 的"male-qn-qingse" |
| **自定义音色（WAV克隆）** | 用户提供的参考音频 WAV，需要克隆/注册 | 用户录制的旁白样本 |

**核心优化目标**：
1. 系统内置音色 + 目标 TTS 模型匹配时 → **直接使用系统音色 ID**，0 额外开销
2. 自定义音色 + 模型支持克隆时 → **先查本地 voice ID 缓存**，有则复用，无则 clone 后缓存
3. voice ID 缓存在服务端可能过期（各厂商 TTL 不同），需有过期失效后重新 clone 机制

---

## 2. 总体决策流程

```
输入：角色配置的音色 + 目标 TTS 模型
    │
    ├── ① 系统内置音色 && 与目标模型匹配？
    │      是 → 直接使用系统音色 ID，结束
    │
    ├── ② 目标模型支持 voice clone？
    │      否 → 降级：每次附带参考音频（如 MiMo 无 voice ID 机制）
    │      是 → ↓
    │
    ├── ③ 本地 voice ID 缓存命中？
    │      是 → 校验是否过期？
    │           ├── 未过期 → 使用缓存的 voice ID
    │           └── 已过期 → 重新 clone
    │      否 → 调用 clone API → 获取 voice ID → 缓存 → 使用
    │
    └── 输出：{(model, voiceId) | (model, audioFile)}
```

### 关键原则

- **voice ID 是通用的**，不限于某个小说、集或片段——同一参考音频在同一 TTS 模型下共享一个 voice ID
- **缓存不持久化**（voice ID 可能因厂商策略过期，存储过期的 voice ID 没有意义）
- **过期后自动重新 clone**，对用户透明

---

## 3. 各引擎能力矩阵

| 引擎 | 系统内置音色 | 支持 voice clone | voice ID 机制 | 备注 |
|------|------------|-----------------|--------------|------|
| **MiMo (小米)** | ✅ 茉莉、芊芊等 | ❌ 不支持 | 无 | 只能走系统音色或每次内联 WAV |
| **MiniMax** | ✅ 多种预设 | ✅ | ✅ voice ID | 推荐走 voice ID 复用 |
| **Qwen3 TTS** | ✅ 多种预设 | ✅ | ✅ voice ID | 推荐走 voice ID 复用 |
| **OpenAI TTS** | ✅ 多种预设 | ❌（依赖第三方网关） | 无 | 仅系统音色 |
| **本地 TTS** | ❌ | ❌ | 无 | 参考音频路径自动绑定 |

---

## 4. 当前实现分析

### 4.1 现有链路

当前实现在 `mimoAudiobookRoute.ts` 中的 `resolveMimoRouteForAudiobookSegment` 已经做了部分路由判断：

```
大纲绑定参考音频路径
    ↓
resolveMimoRouteForAudiobookSegment()
    ├── 片段有显式预设音色 → preset 模式（mimo-v2.5-tts）
    ├── 大纲有参考音频路径 → voiceclone 模式
    ├── 有声线描述 → voicedesign 模式
    ├── 有人设腔调 → voicedesign 模式
    ├── 有预设 voiceId → preset 模式
    └── 兜底 → preset_fallback 模式
```

### 4.2 存在的问题

#### 问题 1：Voice ID 缓存缺失

- MiniMax 和 Qwen3 已有 `ensureRemoteVoiceIdForTts` 链路，但：
  - `applyAudiobookRemoteVoiceCloneParams()` 中 `clone_from_file` 分支（`audiobookTtsSynthesize.ts` L118-126）直接返回文件路径，没有走注册缓存
  - 缓存键未统一，不同小说/集/片段无法共享 voice ID

#### 问题 2：MiMo 无法注册 voice ID

- MiMo 服务端无 voice ID 概念，只能每次内联 WAV base64
- 已添加 `mimoVoiceCloneCache` 磁盘缓存解决重复文件 I/O，但无法避免每次请求传 WAV 数据

#### 问题 3：系统音色检测

- 当角色配置的音色与目标模型的内置音色匹配时，应直接使用音色 ID
- 当前 `resolveMimoRouteForAudiobookSegment` 已部分实现（`explicitPreset` 检查），但仅限 MiMo
- 对其他引擎未做类似优化

#### 问题 4：Voice ID 过期处理

- 当前 `remoteVoiceIdCache` 无过期机制
- `isRemoteVoiceIdStaleError` 函数仅在合成失败时被动处理
- 需要主动过期或定期刷新

---

## 5. 优化方案

### 5.1 统一 Voice ID 缓存层（高优先级）

**设计**：

```
缓存键：md5(provider + targetModel + referenceAudioPath)
          ↓
  ┌──────────────────────────────┐
  │  Voice ID Cache              │
  │  (内存 Map + 磁盘 JSON)       │
  │  key: md5(provider+model+abs) │
  │  value: { voiceId, createdAt }│
  │  TTL: 24 小时                  │
  └──────────────────────────────┘
```

**特点**：
- **通用缓存键**：`{provider}:{modelId}:{md5(参考音频绝对路径)}`，不包含小说/集/片段信息
- 同一参考音频在同一模型下，所有小说、所有集的同一角色共享一个 voice ID
- **TTL 24 小时**（可根据厂商调整），过期后自动重新 clone
- 合成失败时若返回 voice ID 过期错误，立即 invalidate 并重试

**改动范围**：
- 重构 `electron/main/remoteVoiceIdCache.ts`（现有）或新建统一缓存
- 修改 `ensureRemoteVoiceIdForTts` 使用新的缓存键和 TTL

### 5.2 系统音色优先逻辑（高优先级）

在 `resolveMimoRouteForAudiobookSegment` 中已实现（新增的 `explicitPreset` 检查），需扩展到其他引擎：

```
对所有引擎：
  1. 检查片段 voice.voiceId 是否是该引擎的已知系统音色
  2. 如果是 → 使用系统音色 ID
  3. 如果不是 → 检查是否有克隆参考音频
     a. 有 → 查 voice ID 缓存 → clone/复用
     b. 无 → 使用默认音色
```

### 5.3 MiniMax/Qwen `clone_from_file` 走注册链路（中优先级）

当前 `applyAudiobookRemoteVoiceCloneParams()` 中 `clone_from_file` 分支直接返回本地路径，应改为走 `ensureRemoteVoiceIdForTts` 注册链路：

```
// 当前行为：
clone_from_file → 传本地路径 → 每次调用 MiniMax clone API
// 优化后：
clone_from_file → ensureRemoteVoiceIdForTts → 查缓存 → 有则复用 → 无则 clone → 缓存
```

### 5.4 MiMo WAV 内联优化（低优先级）

MiMo 无法注册 voice ID，只能继续内联 WAV。已增加的优化：
- `mimoVoiceCloneCache` 磁盘缓存：避免重复的文件读取 + base64 编码
- 缓存基于文件路径 + 修改时间，文件变化时自动失效

### 5.5 Voice ID 过期处理

在 `ensureRemoteVoiceIdForTts` 中增加 TTL 检查：

```
cacheGet() 时：
  - 检查 createdAt + TTL > 当前时间
  - 已过期 → 返回 null（触发重新 clone）
  - 未过期 → 返回 voice ID

合成失败时（isRemoteVoiceIdStaleError）：
  - invalidate 缓存
  - 自动重试 clone
```

---

## 6. 推荐实施路线

| 优先级 | 项目 | 预估工作量 | 影响范围 |
|--------|------|-----------|---------|
| P0 | 统一 Voice ID 缓存键 + TTL 过期 | 2-3 天 | MiniMax、Qwen3 |
| P0 | MiniMax/Qwen `clone_from_file` 走注册链路 | 2-3 天 | `audiobookTtsSynthesize.ts` |
| P1 | 系统音色检测扩展到所有引擎 | 1-2 天 | `mimoAudiobookRoute.ts` + 各引擎适配器 |
| P1 | MiMo WAV 内联缓存（已完成） | — | `mimoVoiceCloneCache.ts` |
| P2 | 合成失败自动 invalidate + 重试 | 2-3 天 | `ensureRemoteVoiceIdForTts.ts` |

---

## 7. 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/components/tts/ttsModelAdapters.ts` | 引擎适配器、5 种 adapterKind、参数构建 |
| `src/components/tts/ensureRemoteVoiceId.ts` | 云端 voice ID 注册/缓存（MiniMax/Qwen） |
| `src/components/tts/remoteVoiceIdTypes.ts` | 音色来源类型定义、缓存键构建 |
| `src/components/tts/providers/minimaxVoiceClone.ts` | MiniMax 音色克隆实现 |
| `src/components/tts/providers/dashscopeVoiceEnrollment.ts` | Qwen3 音色注册实现 |
| `src/audiobook/utils/audiobookTtsSynthesize.ts` | 有声书 TTS 合成主逻辑 |
| `src/audiobook/utils/mimoAudiobookRoute.ts` | MiMo 路由选择（预置 vs clone vs design） |
| `src/audiobook/utils/audiobookMimoAssist.ts` | MiMo 本地预处理 |
| `src/audiobook/utils/audiobookSegmentReference.ts` | 音色样本路径解析 |
| `electron/main/mimoVoiceCloneCache.ts` | MiMo WAV base64 磁盘缓存（新建） |
| `electron/main/remoteVoiceIdCache.ts` | 现有 voice ID 缓存（需重构过期逻辑） |
