# AI 对话组件升级 —— Gap 分析与执行计划

> 基于 `AI对话组件全业务逻辑方案（完整修订版）.md` vs 现有实现（`src/components/AIChat/`）的全面差距分析  
> 生成日期：2026-05-15  
> 上次更新：2026-05-14 → 2026-05-15 方案新增 `exposedMultimodalAgents`、多模态 Tool 可选包装 Agent、Tool 渲染细节规范

---

## 一、核心发现

当前实现已具备 **组件外壳**（多模式展示、Agent 配置、Function Call 注册、基础 Provider），但距离方案文档描述的 **三层架构 + 标准化注册系统 + 智能调度中枢** 差距仍然较大。

**相比上次分析的方案变更要点**：

| 变更点 | 原方案要求 | 新版方案要求 | 影响 |
|--------|----------|-------------|------|
| 多模态 Tool 定位 | 纯原子 Tool，不作为独立 Agent | 原子 Tool + **可选包装为独立 Skill Agent**（通过 `exposedMultimodalAgents` 控制） | G4 从"降级"变为"重构+包装"；drawer 不再矛盾，需改造为符合新机制的结构 |
| 多模态 Agent 细节配置区 | 未明确 | §5.5 给出了各 Tool 类型（绘图/视频/TTS/音乐/音效/对话）的专属配置字段表 | 新增实现需求 |
| 多模态独立 Agent 调度流程 | 未单独描述 | §7.3 规定：选中多模态独立 Agent 后通用 Agent 纯透传，不输出文字结果，A2UI 直出 | 新增渲染判定约束 |
| §6 Tool 渲染细节 | 无 | 每个 Tool 的请求参数、生成中状态、结果渲染交互均有详细规范 | 新增 6 组渲染组件需求 |
| 页面配置项 | 6 项 | 新增第 6 项 `exposedMultimodalAgents`，共 7 项 | AIChatCoreProps 需新增字段 |

---

## 二、Gap 清单

### P0（方案必须，否则架构不成立）

| # | 主题 | 方案要求 | 当前状态 | 差距说明 |
|---|------|---------|---------|---------|
| G1 | **通用智能 Agent 正式化** | 作为全局大脑，负责意图理解、任务拆解、Skill Agent 调度、Tool 编排，绑定 `tag=通用智能` 的模型 | `main` Agent 无实质调度逻辑，仅有基础对话能力 | `AIChatCore.tsx` 中 main agent 与其他 agent 走同一套 `useXChat` 流程，无调度决策代码 |
| G2 | **scenePrompt 机制** | 每个页面独立配置场景提示词，页面加载时注入通用 Agent 系统消息作为顶层指令 | 不存在 | 页面可在 `extraPrompt` 中传提示词，但无标准化 scenePrompt 注入+合并逻辑 |
| G3 | **业务 Skill Agent 标准化注册** | 每个 Skill Agent 需包含唯一标识、显示名称、描述、能力提示词模板、优先模型列表、兜底模型、UI 配置（面板+字段列表）、允许调用的原子 Tool 白名单、输入输出类型；系统启动时从固定目录加载 | `AgentConfig[]` 仅有 key/label/welcomeMessage/requiredCapabilityKeys；提示词在独立 ts 文件中 | 整个 `experts/index.ts` 和 `agents/*.ts` 需重构为标准化注册表 |

### P1（方案核心体验，缺少则组件无法按设计复用）

| # | 主题 | 方案要求 | 当前状态 | 差距说明 |
|---|------|---------|---------|---------|
| G4 | **多模态 Tool 重构 + 可选 Agent 包装机制** | 1) 每个多模态 Tool 注册为原子 `FunctionCallDef`；<br>2) 页面通过 `exposedMultimodalAgents` 声明哪些 Tool 暴露为独立 Agent；<br>3) 暴露后的 Agent 名称、图标、细节配置区（比例/数量/风格等）由系统根据 Tool 类型自动生成或配置覆盖；<br>4) 用户选中后通用 Agent 仅透传，不输出文字，A2UI 直接展示结果 | `drawer` 是独立 Agent（`providerType: 'images'`），有专属 slotConfig、welcomeSlot；`generate_images` Tool 已注册但 `drawer` Agent 未使用它 | 需要：<br>1. 重构 `drawer` 为 Tool + 可选 Agent 包装两层结构<br>2. 新增 `exposedMultimodalAgents` 配置字段<br>3. 实现自动生成 Agent UI 配置（名称、icon、细节配置区）的引擎<br>4. 实现"通用 Agent 仅透传、不输出文字"的调度分支 |
| G5 | **Agent 切换模块（Footer 按钮组）** | 默认显示「通用智能 Agent」，Footer 有可用 Agent 按钮组（业务 Skill Agent + 暴露的多模态独立 Agent）；按钮超宽折叠为 Dropdown；选中后切换为 Agent 名称+关闭+专属配置区 | 当前 Footer 只有 Link 按钮 + drawer 选项 + SendButton | `AIChatSidePanel.tsx` footer 逻辑需重构成 §5 的布局 |
| G6 | **ThoughtChain 合并/拆分规则** | 通用智能 Agent 自主判定：无中间文字的 Tool 合入一条 Chain；需要用户交互/中间文字的分拆 | 不存在 | `AIChatCore.tsx` 提交逻辑是线性流，无合并/拆分判定 |
| G7 | **TaskID 贯穿 + ThoughtChain 绑定** | 每次请求绑定唯一 TaskID，每条 ThoughtChain 绑定 TaskID + 唯一 Key | Task ID 不存在；ThoughtChain 仅为 ant-design/x 组件 | 需在 `AIChatCore` 中引入 TaskID 生成逻辑，并在消息/状态中传递 |
| G8 | **A2UI 组件渲染模块** | 集成 A2UI v0.9 协议（[官方文档](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn#boxprops)），支持 catalog 路径、组件命令分发、统一样式（unifiedStyleSchema） | 不存在 | 当前 Tool 返回的 data URL 图片通过自定义 Bubble 渲染，无标准化协议 |
| G9 | **Sender Footer 上传按钮显隐逻辑** | 根据当前匹配模型的输入类型显示/隐藏上传按钮 | `Attachments` 组件始终渲染，无输入类型判断 | `AIChatCore` 的 `senderHeader` 无模型输入类型检查逻辑 |
| G10 | **模型-能力 Tag 体系补充「通用智能」Tag** | 需有 `通用智能` Tag 区分哪些模型可做调度 Agent | `agent_orchestration` 能力 key 存在但无对应 Tag 标签 | 需在 `CAPABILITY_TAGS`/`modelPresets.ts` 中新增 |
| G11 | **Sender Footer 模型切换显隐规则** | 可用模型数量≤1 时隐藏 | 当前 Agent 切换时模型 select 始终显示 | 需增加 `validModels.length <= 1` 判断 |

### P2（方案完善，可分批实施）

| # | 主题 | 方案要求 | 当前状态 | 差距说明 |
|---|------|---------|---------|---------|
| G12 | **禁止用 Agents 数组** | 页面可传入禁止列表，优先级高于支持列表 | 不存在 | `AIChatProps` 及 `AIChatCoreProps` 均无此字段 |
| G13 | **多模态 Tool 扩展注册（视频/TTS/音效/音乐/对话）** | 应有 6 组 Tool：绘图、生视频、生对话、生音效、生音乐、TTS | 仅 `generate_text`、`generate_images`、`update_data` | `tools/builtInTools/` 目录已预留结构，需逐个实现 |
| G14 | **Think 深度思考展示模块** | 使用 `@ant-design/x` 原生 `Think` 组件（`import { Think } from "@ant-design/x"`）展示深度思考过程，受页面配置开关控制 | `enableReasoning` 已存在但仅为 Provider 层控制，无独立 Think 组件渲染 | 需引入 `Think` 组件并实现显隐逻辑 |
| G15 | **会话隔离** | 按业务场景做会话隔离 | 会话按 localStorage key 存储，无场景隔离维度 | `CONV_STORAGE_PREFIX` 是全局的 |
| G16 | **A2UI 配置项** | catalog 路径、unifiedStyleSchema、默认展示方式（`a2ui`/`thoughtchain`），使用 `@ant-design/x` 原生 A2UI 协议（[官方文档](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn#boxprops)） | 不存在 | 需在 `AIChatProps` 中新增配置项 |
| G17 | **Tool 结果展示判定逻辑** | 优先级：用户交互→ThoughtChain，纯多模态→A2UI，页面配置覆盖；多模态独立 Agent 不输出文字 | 不存在 | 需实现判定函数 + 多模态独立 Agent 的不输出文字分支 |
| G18 | **通用 Agent 权限受控** | 严格遵守页面 Tools 申明清单，不可越权调用 | `getFunctionCallsForOrchestrator()` 返回所有 `orchestrator` 域工具，无页面级过滤 | 需在 Tool 注册/获取时增加页面级限制 |
| G19 | **中间结果实时展示与输出管控** | Tool 调用结果应通过 ThoughtChain 或 A2UI 逐条展示，不阻塞；多图生成依次显示占位→结果 | 当前图片生成完成后一次性返回 | 需实现流式结果展示和占位/骨架屏 |
| G20 | **多模态 Tool 渲染规范** | §6 对每个 Tool 有详细规范：生成中状态（骨架屏/进度条/波形动画）、结果渲染（Image 组件预览下载/video 自动播放/音频播放器/waveform/乐谱缩略图）、交互（重试/全部下载/一键送 TTS） | 仅基本的图片 data URL 渲染 | 需实现 6 组渲染组件，全部优先使用 A2UI，样式遵循 unifiedStyleSchema |

---

## 三、执行计划

### 阶段一：架构重塑（P0 + P1 核心）

```
Phase 1.1 — Agent/Skill 注册系统改造
  1.1.1  新增 SkillAgentDefinition 类型（含 agentId/agentName/agentType/
         skillPromptTemplate/supportedModels/fallbackModel/uiConfig/
         allowedTools/inputType/outputType）
  1.1.2  实现 SkillAgentRegistry（启动时从固定目录加载，全局注册表）
  1.1.3  重构 agents/*.ts 为标准化 Skill 定义（novel/script/novelIdea/novelToScript）
  1.1.4  新增「通用智能」能力 Tag，更新 CAPABILITY_TAGS 和模型预设

Phase 1.2 — 通用智能 Agent 正式化
  1.2.1  新增 scenePrompt 字段到 AIChatCoreProps
  1.2.2  实现 scenePrompt + skillPromptTemplate 合并逻辑
  1.2.3  main agent 增加 TaskID 生成器，贯穿会话
  1.2.4  实现 Tool 调用判定路由（ThoughtChain vs A2UI）

Phase 1.3 — 多模态 Tool 重构 + 可选 Agent 包装
  1.3.1  重构 drawer 为纯 Tool（drawerAgent.tsx → generate_images Tool 增强）
  1.3.2  设计并实现 MultiModalToolDefinition 类型（含 toolId/displayName/参数定义/
         配置区字段列表/默认占位样式/结果渲染模板/关联模型Tag）
  1.3.3  实现 exposedMultimodalAgentEngine：读取 Tool 定义 → 自动生成 Agent 配置
         （名称/图标/uiConfig），注册到 Agent 注册表
  1.3.4  实现多模态独立 Agent 调度分支：通用 Agent 选中后纯透传 + 不输出文字
  1.3.5  新增 exposedMultimodalAgents 页面配置字段

Phase 1.4 — Sender Footer 重构
  1.4.1  实现可用 Agent 按钮组（从注册表读取，过滤禁止列表，排除通用 Agent）
  1.4.2  实现按钮超出宽度折叠为 Dropdown
  1.4.3  实现选中 Agent 后显示名称+关闭+专属配置区（uiConfig 渲染）
  1.4.4  实现上传按钮模型输入类型显隐逻辑
  1.4.5  实现模型切换下拉框 ≤1 隐藏逻辑
```

### 阶段二：体验完善（P1 剩余 + P2 关键）

```
Phase 2.1 — 展示层规范化
  2.1.1  集成 @ant-design/x A2UI v0.9 协议（[官方文档](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn#boxprops)）
  2.1.2  实现 unifiedStyleSchema 定义与 ThoughtChain 统一消费
  2.1.3  实现 Tool 结果展示判定函数 + 多模态独立 Agent 无文字分支
  2.1.4  实现中间结果逐条展示（多图占位→结果渐入，视频进度等）
  2.1.5  引入 @ant-design/x 原生 Think 组件（`import { Think } from "@ant-design/x"`）并实现显隐逻辑

Phase 2.2 — 调度逻辑完善
  2.2.1  实现 ThoughtChain 合并/拆分策略引擎
  2.2.2  通用 Agent 增加页面级 Tools 清单过滤
  2.2.3  增加禁止 Agents 数组支持
  2.2.4  增加暂停/询问/续跑交互逻辑
```

### 阶段三：能力扩展（P2 剩余）

```
Phase 3 — 多模态 Tool 补齐 + 渲染组件 + 配置项完善
  3.1   实现生视频 Tool（video_generation），含生成中进度+视频播放渲染
  3.2   实现 TTS 生成 Tool（tts_generation），含音频波形播放器
  3.3   实现生音效 Tool（sound_effect_generation）
  3.4   实现生音乐 Tool（music_generation）
  3.5   实现生对话 Tool（dialogue_generation），含气泡对话渲染+一键送 TTS
  3.6   实现 A2UI 配置项（catalogPath、unifiedStyleSchema、defaultDisplayMode），使用 `@ant-design/x` 原生 A2UI 协议（[官方文档](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn#boxprops)）
  3.7   实现按场景会话隔离
  3.8   实现全部下载（zip）和重试功能
```

---

## 四、Todo 看板

### 阶段一

- [x] **1.1.1** 新增 `SkillAgentDefinition` 类型定义  
- [x] **1.1.2** 实现 `SkillAgentRegistry` 加载器 + 全局注册表  
- [x] **1.1.3** 重构 `agents/*.ts` 为标准化 Skill 定义（novel/script/novelIdea/novelToScript）  
- [x] **1.1.4** 新增「通用智能」能力 Tag，更新 `CAPABILITY_TAGS` 和 `modelPresets.ts`  
- [x] **1.2.1** 新增 `scenePrompt` 到 `AIChatCoreProps`  
- [x] **1.2.2** 实现 `scenePrompt + skillPromptTemplate` 合并逻辑  
- [x] **1.2.3** main agent 增加 TaskID 生成器  
- [x] **1.2.4** 实现 Tool 调用判定路由函数  
- [x] **1.3.1** 重构 drawer 为纯 Tool，增强 `generate_images`  
- [x] **1.3.2** 设计实现 `MultiModalToolDefinition` 类型  
- [x] **1.3.3** 实现 `exposedMultimodalAgentEngine`（Tool 定义 → Agent 配置）  
- [x] **1.3.4** 实现多模态独立 Agent 调度分支（透传 + 无文字）  
- [x] **1.3.5** 新增 `exposedMultimodalAgents` 页面配置字段  
- [x] **1.4.1** Footer 实现可用 Agent 按钮组  
- [x] **1.4.2** Footer 实现按钮超宽折叠为 Dropdown  
- [x] **1.4.3** Footer 实现选中 Agent 后显示名称+关闭+专属配置区  
- [x] **1.4.4** Footer 实现上传按钮模型输入类型显隐逻辑  
- [x] **1.4.5** Footer 实现模型切换下拉框显隐规则  

### 阶段二

- [x] **2.1.1** 集成 A2UI v0.9 协议（`A2UIConfig` 类型 + `a2uiConfig` 字段 + `UnifiedStyleProvider`）  
- [x] **2.1.2** 实现 `unifiedStyleSchema` + `UnifiedStyleContext` 供 ThoughtChain/A2UI 统一消费  
- [x] **2.1.3** 实现 Tool 结果展示判定逻辑（含多模态独立 Agent 无文字分支）  
- [x] **2.1.4** 实现中间结果逐条展示（`DrawerBubbleSkeleton` 骨架占位）  
- [x] **2.1.5** 引入 `@ant-design/x` 原生 `Think` 组件并实现显隐（已在 drawerContentRender.tsx 中完成）  
- [x] **2.2.1** 实现 ThoughtChain 合并/拆分策略（`canMergeIntoSameThoughtchain` + `splitIntoThoughtchains`）  
- [x] **2.2.2** 通用 Agent 增加页面级 Tools 过滤（`toolsDeclarationList` 过滤）  
- [x] **2.2.3** 增加禁止 Agents 数组（`bannedAgentIds` 在 SidePanel 中过滤）  
- [x] **2.2.4** 增加暂停/询问/续跑交互  

### 阶段三

- [ ] **3.1** 实现生视频 Tool + 视频播放渲染  
- [ ] **3.2** 实现 TTS 生成 Tool + 音频波形播放器  
- [ ] **3.3** 实现生音效 Tool  
- [ ] **3.4** 实现生音乐 Tool  
- [ ] **3.5** 实现生对话 Tool + 气泡渲染 + 一键送 TTS  
- [ ] **3.6** 实现 A2UI 配置项注入  
- [ ] **3.7** 实现按场景会话隔离  
- [ ] **3.8** 实现全部下载（zip）和重试按钮  

---

## 五、关键矛盾与设计决策记录

| # | 矛盾 | 现有实现 | 方案要求 | 影响决策 |
|---|------|---------|---------|---------|
| D1 | drawer 定位 | `providerType: 'images'` 独立 Agent，有 welcomeSlot、专属 slotConfig | 原子 Tool + **可选**包装为独立 Agent，通过 `exposedMultimodalAgents` 控制暴露 | 不降级而是拆分：drawerAgent.tsx 的 Agent 包装逻辑移入暴露引擎，绘图核心逻辑移入 `generate_images` Tool。现有页面的绘制调用需适配新路径 |
| D2 | Agent 定义 | `AgentConfig[]` + `AgentPrompts` 两段式 | 标准化注册（agentType/skillPromptTemplate/supportedModels/uiConfig/allowedTools） | `useAgentModel.ts`、`experts/index.ts`、`AIChatCore.tsx` 三处均需改造 |
| D3 | 多模态调度 | drawer Agent 直接调用图片生成，结果用自定义 Bubble 展示 | 选中多模态独立 Agent 后通用 Agent 纯透传，不输出文字；结果用 A2UI 直出 | 需在 `AIChatCore.tsx` 提交路径中增加分支：检测当前是否为多模态独立 Agent → 跳过意图分析 → 直接 Tool 调用 → A2UI 渲染 |
| D4 | Tool 渲染 | 自定义 Bubble 渲染图片 data URL | §6 对 6 组 Tool 各有详细规范（骨架屏、进度、音频波形、视频播放、批量下载等） | 渲染系统投入最大：需实现 6 组专用组件，全部优先使用 A2UI 协议 |
| D5 | Task 模型 | 无 TaskID，消息按对话顺序排列 | 每个请求唯一 TaskID，ThoughtChain 绑定 TaskID | 消息存储结构需增加 taskId 字段，展示需按 TaskID 分组 |
| D6 | Footer 按钮布局 | 无 Agent 切换按钮组 | §5 完整布局：上传→模型 Select→Think Toggle→可用 Agent 按钮组（超宽折叠为 Dropdown） | 需要重构 Footer 区域 + 动态渲染 uiConfig |

---

## 六、依赖与风险

- **依赖 ant-design-x 版本**：A2UI v0.9 协议（[官方文档](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn#boxprops)）和 `Think` 组件（`import { Think } from "@ant-design/x"`）均为 `@ant-design/x` 原生支持，无需自研。需确认当前 `package.json` 中 `@ant-design/x` 版本是否已包含这两项（A2UI v0.9 + Think），若不支持需升级对应版本
- **向后兼容风险**：阶段一改造可能影响现有页面（尤其是 drawer 相关），需逐页验证
- **`scenePrompt` 文案**：每个页面需独立 scenePrompt，需业务方提供（故事抽卡/生成大纲/小说/剧本/有声书/漫剧各一份）
- **`exposedMultimodalAgents` 配置决策**：各页面默认暴露哪些多模态 Tool 需与产品确认默认值
- **多模态 Tool 的配置区字段**：§5.5 的配置字段表是示例，实际实现时需确认各 Tool 的最终参数范围
- **测试覆盖**：当前组件缺少单元测试，重构时建议同步补齐

---

## 七、方案版本变更记录

| 日期 | 版本 | 变更说明 |
|------|------|---------|
| 2026-05-15 | v2 | 同步方案完整修订版：新增 `exposedMultimodalAgents`、多模态 Tool 可选包装机制、§6 渲染细节规范、§7.3 独立 Agent 调度流程；G4 从"降级"改为"重构+包装"；新增 G20（渲染规范）；新增 D3/D4/D6 设计决策；新增阶段三 todo 3.8 |
| 2026-05-14 | v1 | 初始版本，基于方案第一版生成 20 个 Gap |

---

*本文档基于 2026-05-15 的代码基和方案完整修订版生成，随实现推进需持续更新。*
