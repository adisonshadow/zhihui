---
name: 云端TTS音色复刻与缓存
overview: 为阿里云百炼 qwen3-TTS、CosyVoice(v3.5-flash/plus) 与 MiniMax Speech 三家云端 TTS 实现「音色复刻 → 获得可复用 voice id → 本地缓存 → 失败自动重刻重试」的统一链路，并明确小米 MiMo 因接口无 voice id 概念而不适用该机制。
todos:
  - id: cache
    content: 新增 electron/main/remoteVoiceIdCache.ts（磁盘 JSON）+ IPC + preload window.yiman.voiceId
    status: completed
  - id: minimax
    content: src/components/tts/providers/minimaxVoiceClone.ts：files/upload→voice_clone→voice_id（含 GroupId、缓存）
    status: completed
  - id: dashscope-enroll
    content: src/components/tts/providers/dashscopeVoiceEnrollment.ts：Qwen(base64)/CosyVoice(URL) 复刻，返回 voice id
    status: completed
  - id: qwen-synth
    content: src/components/tts/providers/qwen3TtsSynthesize.ts：multimodal-generation 同步合成
    status: completed
  - id: cosy-ws
    content: electron/main/cosyVoiceWsService.ts：Node ws 实现 run/continue/finish-task 合成 + preload 暴露（先 yarn add ws）
    status: completed
  - id: adapter
    content: 改 ttsModelAdapters.ts：新增 adapter kind、路由、确保 voice id→合成、失败重刻重试
    status: completed
  - id: presets-ui
    content: 改 modelPresets.ts（CosyVoice 仅 v3.5-flash/plus、MiniMax GroupId）与 TtsEditModal 音色来源 UI
    status: completed
  - id: audiobook
    content: 改 audiobookTtsSynthesize.ts：三家复刻接入大纲 wav 与缓存，CosyVoice URL/voice_id 引导
    status: completed
  - id: mimo-doc
    content: 在 MiMo 相关代码补注释：克隆为无状态内联、无 voice id 缓存，说明设计取舍
    status: completed
isProject: false
---

# 云端 TTS 音色复刻与缓存方案

## 0. 现状确认（已核查代码与官方文档）

- **小米 MiMo TTS**：无「上传→换 voice id→缓存→重试」。克隆是无状态的，每次把参考 wav 以 `data:audio/...;base64` 内联进 `audio.voice`（见 [src/novelDesign/utils/audiobookTtsSynthesize.ts](src/novelDesign/utils/audiobookTtsSynthesize.ts) `loadVoiceCloneDataUrlFromOutline` 与 [src/components/tts/mimoV25TtsBuilder.ts](src/components/tts/mimoV25TtsBuilder.ts) 的 voiceclone 分支）。MiMo 接口本身不返回可复用 voice id，故该机制对 MiMo 不适用——本期保持原状，仅在文档/注释里写明。
- **音色设计是否有 id**：MiMo `voicedesign` 只产出 wav 无 id；阿里云百炼「声音设计/复刻」走同一接口、**都会返回可复用 voice id**（本期先做复刻，设计预留扩展点）。
- 项目现状：远程 TTS 在渲染层直接 `fetch`（见 [src/components/tts/ttsModelAdapters.ts](src/components/tts/ttsModelAdapters.ts) `fetchRemoteTtsAudio`）；**无对象存储上传能力、无 WebSocket 客户端**；本地参考音色缓存只服务本地 MLX 模型（[python/voice_reference_cache.py](python/voice_reference_cache.py)）。

## 1. 采纳的默认决策（可改）

- CosyVoice 参考音频 = **公网 URL**（兼容直接填 voice_id）；CosyVoice 合成 = **Electron 主进程 Node `ws`**；voice id 缓存 = **磁盘 JSON（userData）**；范围 = **仅音色复刻 + 缓存**。

## 2. 三家接口形态（已查官方文档）

- **MiniMax Speech**（全同步 HTTP，渲染层可做）：`POST /v1/files/upload`(multipart, `purpose=voice_clone`)→`file.file_id`；`POST /v1/voice_clone`(`{file_id, voice_id 自定义, model}`)；合成 `POST /v1/t2a_v2`（已实现）。注意 upload/clone 需 `GroupId`。
- **Qwen3-TTS**（同步 HTTP，渲染层可做）：复刻 `POST /api/v1/services/audio/tts/customization`（`model:qwen-voice-enrollment`,`action:create`,`audio.data` 支持 **base64 data URL**,`target_model:qwen3-tts-vc-*`）→ `output.voice`；合成 `POST /api/v1/services/aigc/multimodal-generation/generation`（`stream:false`,`input:{text,voice,language_type}`）。
- **CosyVoice v3.5-flash/plus**：复刻同上 customization 接口（`model:voice-enrollment`,`action:create_voice`,`url` **必须公网可访问**）→ `output.voice_id`；合成 **WebSocket** `wss://dashscope.aliyuncs.com/api-ws/v1/inference`（run-task/continue-task/finish-task），握手带 `Authorization`，**必须在主进程实现**。

## 3. 设计与改动点

### 3.1 远程音色 id 缓存层（新增）
- 主进程新增 `electron/main/remoteVoiceIdCache.ts`：磁盘 JSON 于 `userData/yiman/remote-voice-id-cache/{provider}.json`。
- 缓存键：`provider + targetModel + 音频指纹(abspath+mtime+size 或 base64 sha256) + 参考文本指纹`，值：`{ voiceId, createdAt }`。复用 [python/voice_reference_cache.py](python/voice_reference_cache.py) 的指纹思路（abspath+mtime+size）。
- 通过 [electron/preload/index.ts](electron/preload/index.ts) 暴露 `window.yiman.voiceId.{get,set,invalidate}`，并在 [electron/main/index.ts](electron/main/index.ts) 注册 IPC。

### 3.2 各 provider 复刻/合成模块（新增，渲染层）
- `src/components/tts/providers/minimaxVoiceClone.ts`：upload→voice_clone→返回 voice_id；读缓存命中则跳过。
- `src/components/tts/providers/dashscopeVoiceEnrollment.ts`：统一封装 customization 接口；Qwen 用 base64，CosyVoice 用公网 URL；返回 voice/voice_id。
- `src/components/tts/providers/qwen3TtsSynthesize.ts`：multimodal-generation 同步合成 → arrayBuffer。
- CosyVoice 合成走主进程：`electron/main/cosyVoiceWsService.ts`（Node `ws`，run/continue/finish-task，聚合音频帧返回 base64），preload 暴露 `window.yiman.cosyVoice.synthesize`。

### 3.3 适配器接入与重试（改 [src/components/tts/ttsModelAdapters.ts](src/components/tts/ttsModelAdapters.ts)）
- `TtsAdapterKind` 新增：`qwen3_tts_dashscope`、`cosyvoice_dashscope_ws`（MiniMax 复用 `minimax_t2a_v2`）。
- `inferRemoteAdapter`：dashscope 且模型名含 `qwen3-tts`→qwen3_tts；含 `cosyvoice`→cosyvoice_ws。
- 在 `fetchRemoteTtsAudio` 接入「先确保 voice id（查缓存→否则复刻→写缓存）→合成」；合成报「voice not found/已下线」→`invalidate` 缓存→重刻一次→重试（重试上限 1）。

### 3.4 配置与 UI
- [src/components/AIChat/constants/modelPresets.ts](src/components/AIChat/constants/modelPresets.ts)：`cosyvoice` 预设改为只列 `cosyvoice-v3.5-flash`/`cosyvoice-v3.5-plus`；`qwen_tts` 标注「版本众多、请求/响应一致」；为 MiniMax 增加可填 `GroupId`（新增 `AIModelConfig.minimaxGroupId?` 于 [src/types/settings.ts](src/types/settings.ts)，或在编辑弹窗补字段）。
- [src/components/tts/TtsEditModal.tsx](src/components/tts/TtsEditModal.tsx)：为三家补「音色来源」选择——预置音色 / 已复刻 voice_id / 由音色文件复刻（CosyVoice 额外支持粘贴公网 URL）。

### 3.5 有声书链路（改 [src/novelDesign/utils/audiobookTtsSynthesize.ts](src/novelDesign/utils/audiobookTtsSynthesize.ts)）
- 大纲绑定的本地 wav：MiniMax→上传得 file_id；Qwen3-TTS→读为 base64 复刻；CosyVoice→需公网 URL 或大纲直填 voice_id（否则给出明确报错引导）。
- 全部经 3.1 缓存，命中直接复用 voice id。

## 4. 风险/边界
- CosyVoice 在「本地 wav」场景受公网 URL 限制，audiobook 流程需用户提供 URL 或预置 voice_id（已在 UI/报错中引导）。
- MiniMax 需 `GroupId`，缺失时给出配置提示。
- 主进程 `ws` 依赖需经 `yarn add ws`（按项目规则用代理 + yarn，不直接改 package.json）。