
# AI对话组件全业务逻辑方案（完整修订版）

## 一、全局核心定义

### 1. 三大核心能力层

#### （1）通用智能Agent（决策层）

- **绑定规则**：模型配置中标记 **tag=通用智能** 的模型，专属归属该Agent使用
- **核心定位**：全局任务大脑、意图理解、自主决策、任务编排、Skill Agent调度中枢
- **核心权责**：理解用户需求、拆分复杂任务、判定调用哪些Tool、决策ThoughtChain合并/拆分、自主调度各类业务Skill Agent与多模态Tool、处理人机交互停顿与续跑、最终落地业务数据回填
- **运行约束**：不直接承担重度专项生成工作，仅做决策与调度；受页面配置的允许/禁止Agent列表、Tools清单严格限制，不可越权调用；始终遵守当前页面的场景提示词（scenePrompt）

#### （2）业务Skill Agent（执行层）

所有业务Skill Agent仅负责**专项文本/内容生产执行**，不做任务拆解、不做跨Agent调度、不做决策判断；其能力通过专属**Skill提示词模板**定义，模板需精准匹配其专项能力，明确能力边界与输出标准。

**标准业务Skill Agent列表**（系统内置，可扩展）：
- 小说作家
- 剧本作家
- 有声书导演
- 漫剧导演

**定义与注册规范**（概念描述，不包含代码）：
- 每个Skill Agent必须包含：唯一标识、显示名称、描述、能力提示词模板、优先模型列表、兜底模型、UI配置（是否显示配置面板及字段列表）、允许调用的原子Tool白名单、输入输出类型。
- 系统启动时从固定目录加载所有Skill Agent定义，存入全局注册表。页面通过“支持的Agents数组”引用已注册的Agent。

#### （3）多模态基础Tool集（原子能力层）与可选独立Agent包装

多模态能力定位为**内置基础Tool**，通过Function Call协议被通用智能Agent直接调度，仅提供底层原子能力。同时，为了满足用户“单独使用某类多模态能力”的场景，系统**允许将任一多模态Tool可选地包装为一个独立Skill Agent**，使其出现在Agent切换列表中，供用户手动选中。这种包装不改变Tool的原子性，仅提供一种更直接的交互入口。

**内置多模态Tool列表**（每个Tool均可独立包装为Skill Agent）：
- 绘图Tool
- 生视频Tool
- 生对话Tool（生成对话/配音文本）
- 生音效Tool
- 生音乐Tool
- TTS生成Tool（文字转语音）

**包装规则**：
- 通过页面配置项 `exposedMultimodalAgents` 数组，声明哪些多模态Tool需要暴露为独立Skill Agent。
- 暴露后的Agent名称、图标、细节配置区（如绘图的比例、数量；视频的时长、比例等）由系统根据Tool类型自动生成，也可通过配置覆盖。
- 该Agent被用户选中后，所有用户输入均视为对该Tool的直接调用参数，通用Agent仍参与后台转发（保证安全与统一日志），但不做额外的任务拆解或思考输出，仅将结果通过A2UI组件直接展示。

**注册与管理**：每个多模态Tool有独立定义（名称、参数、输出类型、关联模型Tag、默认生成中占位样式、结果渲染模板），系统启动时加载至全局Tool注册表。页面通过“Tools申明清单”控制可用范围；通过“exposedMultimodalAgents”控制哪些Tool以独立Agent形式展示。

### 2. 模型配置核心规则

- 支持基座模型：火山引擎、DeepSeek、通义千问
- 每项模型必配三项核心属性：
  1. **能力Tag**：标记是否支持「通用智能」、是否适配某类业务Skill Agent、是否支持某类多模态Tool（如图像生成、视频生成等）。
  2. **输入类型**：纯文本、图文/多模态等，用于控制上传按钮显隐。
  3. **输出类型**：普通文本、流式输出、生图、生视频、生音频、TTS等。
- **模型与Agent匹配规则**：
  - 通用Agent只调用tag=通用智能的模型。
  - 业务Skill Agent优先匹配其声明模型中支持该能力Tag的模型。
  - 多模态Tool调用时，通用Agent自动选择支持对应输出能力且当前可用的模型。

### 3. Task / Tool / ThoughtChain 标准定义与绑定规则

- **Task**：用户单次完整业务目标，对应唯一TaskID，贯穿全流程。
- **Tool**：纯原子能力工具，严禁业务复合式Tool。分为两类：
  - 多模态基础Tool（Function Call）：绘图、生视频、生对话、生音效、生音乐、TTS。
  - 业务类原子Tool：文本段落生成、业务数据结构更新、内容回填等。
- **ThoughtChain**：大模型单次思考+Tool执行的完整逻辑单元，必须强制绑定TaskID+唯一Key，不可跨Task混用。

### 4. Tool调用处理与结果展示规则（结合A2UI v0.9规范）

- **核心原则**：Tool调用的处理与结果展示，可根据场景选择ThoughtChain或A2UI组件展示，两种方式样式完全统一。
- **方式一：ThoughtChain展示**：适用于需要展示思考–调用–执行–结果完整链路的复杂场景。
- **方式二：A2UI组件展示**：适用于仅需呈现Tool执行结果的场景（尤其是多模态Tool的结果）。对于独立包装为Skill Agent的多模态Tool，默认使用A2UI组件直接展示结果，不输出任何文字思考。
- **判定优先级**：
  1. 涉及用户交互、多Tool串联且需解释、调用报错 → 强制ThoughtChain。
  2. 单一Tool调用且输出为纯多模态内容 → 优先A2UI。
  3. 用户可在页面偏好设置中覆盖（简洁模式/专业模式）。
- **统一样式规范**：页面A2UI配置项中包含`unifiedStyleSchema`，定义图片/音频/视频的尺寸、边框、控件样式，ThoughtChain渲染同类结果时必须读取同一份样式参数。

## 二、ThoughtChain 合并与拆分强制规则

1. 若多个Tool之间不需要大模型输出文字描述、不需要中间过渡文案、不需要询问用户、不需要等待用户反馈，可合并至同一条ThoughtChain中执行。
2. 若必须依赖大模型输出文字过渡、必须向用户展示中间结果、必须停顿询问用户选择/确认/补充信息，必须强制拆分为多条独立ThoughtChain。
3. 用户交互停顿、分步结果回显、多轮确认场景，每一段独立思考+执行动作都对应独立ThoughtChain，且归属同一个TaskID。
4. ThoughtChain只记录AI思考与工具执行逻辑，不承载前端交互状态变更。

## 三、AI Chat公共组件完整构成

全页面复用同一组件，内部模块固定，
不要开发，使用 [ant-design-x](https://ant-design-x.antgroup.com/components/introduce-cn/)：

1. **Bubble对话气泡模块**：展示用户输入、AI回复、中间结果、最终内容、多模态素材，按会话时序排列。
2. **Conversations会话管理模块**：会话新建、切换、保存、删除、历史记录加载。
3. **Think深度思考模块**：展示大模型思考过程，受页面配置开关控制。（import { Think } from "@ant-design/x"）
4. **ThoughtChain思维链模块**：按TaskID分组展示每条思维链，结果样式与A2UI统一。
5. **Sender输入发送模块**：文本输入框、底部功能Footer区、内容发送触发、状态重置控制。
6. **Agent切换模块**：展示通用智能Agent、业务Skill Agent、以及被暴露的多模态独立Agent，支持选择、切换、禁用。
7. **模型切换模块**：按当前Agent与页面配置，展示可用模型列表。
8. **A2UI组件渲染模块**：承载A2UI v0.9协议组件的渲染、命令分发与交互。

## 四、组件页面可配置属性

故事抽卡、生成大纲、小说、剧本、有声书、漫剧等所有页面，通过以下配置项实现差异化：

1. **scenePrompt（场景系统提示词）**：每个页面独立配置，页面加载时注入通用Agent系统消息，包含业务目标、操作流程、输出格式、能力边界等。
2. **支持的Agents数组**：可包含通用智能Agent、已注册的业务Skill Agent、以及通过`exposedMultimodalAgents`暴露的多模态独立Agent。数组中第一个元素为默认选中。
3. **禁止使用的Agents数组**：屏蔽指定Agent，用户不可选、通用Agent不可调度。
4. **是否允许使用Think深度思考**：控制Think模块显隐与默认状态。
5. **Tools申明清单**：声明当前页面允许调用的全部原子Tool（含多模态Tool与业务Tool）。
6. **exposedMultimodalAgents（新增）**：数组，声明哪些多模态Tool需要暴露为独立Skill Agent。例如 `["绘图Tool", "生视频Tool"]`。系统自动生成对应Agent的UI配置（名称、图标、细节配置区）。
7. **A2UI配置项**：是否启用A2UI、catalog路径、统一样式参数、默认展示方式（a2ui/thoughtchain）。

## 五、Sender Footer 完整布局、显隐规则、交互逻辑

### 1. 核心前提

- 通用智能Agent自主调度任意Agent或Tool时，Footer无任何变化。
- 只有用户手动点击选择某个Agent（业务Skill Agent或暴露的多模态独立Agent）时，才触发Footer布局变更。
- 默认激活Agent为通用智能Agent。

### 2. 默认状态（通用Agent激活）Footer从左到右顺序

**上传按钮 → 模型切换Select → 深度思考Toggle → 可用Agent按钮组**

其中“可用Agent按钮组”包括：
- 页面“支持的Agents数组”中除通用智能Agent外的所有Agent（业务Skill Agent + 暴露的多模态独立Agent）。
- 按钮组宽度超出Footer可视区域时，超出部分自动隐藏并折叠为一个Dropdown下拉菜单，菜单项按原顺序排列。

### 3. 各控件显隐前置规则

- **上传按钮**：依据当前匹配模型的输入类型显示/隐藏。
- **模型切换下拉框**：可用模型数量≤1时隐藏。
- **深度思考Toggle**：依据页面配置“是否允许使用Think”显隐。
- **可用Agent按钮组**：始终显示（除非支持的Agents数组中没有除通用Agent以外的任何Agent，则隐藏该区域）。

### 4. 用户手动选中某个Agent后的交互变更

1. 选中的Agent（称为“当前激活Agent”）高亮，其名称显示在Footer最左侧，名称右侧带有一个“关闭”按钮（X）。
2. 原“可用Agent按钮组”整体隐藏。
3. 如果该Agent有**细节配置区**（例如绘图专家有比例、生成数量；视频专家有比例、时长；小说作家有文风、章节长度等），则原按钮组区域替换为该Agent的专属细节配置区。配置区的字段和样式由Agent定义中的`uiConfig`决定。
4. 用户在该状态下发送消息，消息直接路由给当前激活Agent（若为多模态独立Agent，通用Agent仅做透传转发并调用对应Tool；若为业务Skill Agent，则按标准流程处理）。
5. 点击关闭按钮：取消选中状态，清空细节配置区，恢复默认Footer布局（显示可用Agent按钮组），激活Agent切回通用智能Agent。

### 5. 多模态独立Agent的细节配置区示例

| Agent类型 | 配置字段 | 可选值/说明 |
|----------|---------|-------------|
| 绘图Tool | 图片比例 | 1:1, 16:9, 9:16, 3:4, 4:3 |
| 绘图Tool | 生成数量 | 1, 2, 4（一次生成几张） |
| 绘图Tool | 风格（可选） | 写实、动漫、油画等（根据模型能力） |
| 生视频Tool | 视频比例 | 16:9, 9:16, 1:1 |
| 生视频Tool | 时长（秒） | 3, 5, 10（根据模型上限） |
| 生视频Tool | 运动幅度 | 低、中、高 |
| TTS生成Tool | 音色 | 温柔女声、沉稳男声、童声等 |
| TTS生成Tool | 语速 | 0.8, 1.0, 1.2 |
| 生音乐Tool | 音乐风格 | 古典、电子、爵士、钢琴 |
| 生音乐Tool | 时长（秒） | 15, 30, 60 |
| 生音效Tool | 音效类型 | 风声、雨声、脚步、枪声等 |
| 生对话Tool | 对话风格 | 日常、正式、幽默 |

## 六、多模态基础Tool的请求与结果渲染细节

以下为每个多模态Tool的专用设计，包括请求参数、生成中状态、结果展示与交互。所有结果渲染优先使用A2UI组件，样式遵循`unifiedStyleSchema`。

### 1. 绘图Tool

**请求参数**（用户通过自然语言或配置区提供）：
- 提示词（必填）
- 图片比例（可选，默认1:1）
- 生成数量（可选，默认1，最大4）
- 风格/参考图（可选，根据模型能力）

**生成中状态**：
- 每个图片生成任务在对话气泡中占据一个独立的宽高位置，大小和生成后的图片的缩略图的大小一样大。
- 生成过程中显示图片生成中占位卡片（灰色块+loading动画），并标注“生成中...”。
- 若生成数量>1，则依次出现多个占位卡片，逐个变为结果图。

**结果渲染与交互**：
- 每张图片使用A2UI的`Image`组件渲染，支持懒加载。
- 点击单张图片时，使用Ant Design的`Image.Group`或类似组件实现全屏预览，支持左右切换（多图时）。
- 每张图片下方提供操作按钮：下载（原图）、复制提示词、重新生成（针对单图）。
- 批量生成完成后，底部提供“全部下载”按钮（打包为zip）。
- 若生成失败，占位卡变为错误提示，并提供“重试”按钮。

### 2. 生视频Tool

**请求参数**：
- 提示词或首尾帧图（必填）
- 视频比例（16:9, 9:16, 1:1）
- 时长（秒，通常3-10秒）
- 运动幅度/镜头控制（可选）

**生成中状态**：
- 一个视频占一个卡片，显示视频占位符+“视频生成中，约需X秒”进度提示（如果API返回进度则展示进度条）。
- 禁止用户连续提交多个视频生成请求（前端可做节流）。

**结果渲染与交互**：
- 使用HTML5 `<video>` 标签或A2UI视频组件，自动播放（静音）或显示封面图。
- 提供播放/暂停、音量、全屏控件。
- 提供下载按钮（MP4格式）。
- 支持右键保存。

### 3. TTS生成Tool（文字转语音）

**请求参数**：
- 文本内容（必填，最长限制）
- 音色（可选）
- 语速（可选）

**生成中状态**：
- 显示音频波形占位动画，提示“正在合成语音...”。

**结果渲染与交互**：
- 使用A2UI音频播放器组件，显示波形图或频谱，包含播放/暂停、进度条、下载（MP3）按钮。
- 同时提供文本字幕滚动显示（与音频同步）可选。

### 4. 生音乐Tool

**请求参数**：
- 音乐风格/描述（必填）
- 时长（秒，15-60）
- 是否包含人声（可选）

**生成中状态**：
- 类似TTS，显示波形占位+“作曲中...”。

**结果渲染与交互**：
- 音频播放器组件，支持循环播放、下载。
- 可额外显示生成的乐谱缩略图（如果有）。

### 5. 生音效Tool

**请求参数**：
- 音效描述（如“雨声”、“门铃”）
- 时长（1-5秒）

**生成中状态**：
- 短时生成，可显示简单加载指示器。

**结果渲染与交互**：
- 提供播放按钮（一次性播放）和下载按钮（短音频）。
- 支持连续试听不同音效。

### 6. 生对话Tool（生成对话文本或配音脚本）

**说明**：此Tool输出为文本（对话脚本），但通常配合TTS使用；也可独立使用。

**请求参数**：
- 场景描述/角色设定
- 对话轮数
- 语气风格

**生成中状态**：
- 显示打字机效果或加载中提示。

**结果渲染与交互**：
- 以气泡对话样式展示文本，每句标注角色名。
- 支持复制全部对话。
- 支持一键发送到TTS生成音频（调用TTS Tool）。

## 七、通用Agent调度业务Skill Agent与Tool 完整业务逻辑

### 1. Tool边界绝对规则

- 所有Tool必须是原子能力，禁止业务耦合式粗粒度Tool。
- 多模态能力统一为内置基础Tool，可选暴露为独立Agent。
- 所有业务复合需求由通用Agent自主完成意图理解、任务拆解、时序编排。
- 内容修改、数据回填等统一通过业务数据结构更新原子Tool完成。

### 2. 通用Agent调度核心原则

- **后台无感调度**：调度Skill Agent或Tool不影响前端UI、不改变Sender状态（除非用户手动选中Agent）。
- **中间结果实时可见**：通过A2UI或ThoughtChain逐条展示，不阻塞。
- **用户交互优先**：需要用户确认时主动暂停。
- **权限严格受控**：遵守页面允许/禁止列表及Tools清单。
- **展示规范统一**：A2UI与ThoughtChain样式一致。

### 3. 多模态独立Agent的调度流程

当用户手动选中“绘图Tool”这类独立Agent时：
1. Footer切换为Agent名称+关闭按钮+细节配置区（比例、数量等）。
2. 用户在Sender输入框输入提示词（可结合配置区参数），点击发送。
3. 通用Agent收到请求后，不进行任何意图重定向或任务拆解，直接调用对应的多模态Tool（如`generateImage`），携带用户输入和配置区参数。
4. 通用Agent不输出任何文字回复，仅将Tool调用结果通过A2UI组件直接渲染到对话气泡。
5. 若用户需要多个结果（如生成4张图），每条结果独立展示，支持逐个操作。
6. 用户可连续输入新提示词，每次都是独立调用，不保留上下文（除非配置了会话记忆）。

### 4. 典型场景：在故事抽卡页面单独使用绘图Agent

- 页面配置：`scenePrompt` 为故事抽卡场景，同时`exposedMultimodalAgents` 包含“绘图Tool”。
- Footer默认显示通用Agent按钮组（含故事抽卡相关业务Agent和“绘图Tool”按钮）。
- 用户点击“绘图Tool”按钮 → Footer切换为绘图Agent名称+关闭+比例/数量配置区。
- 用户输入“一只穿西服的猫，赛博朋克风格” → 通用Agent调用绘图Tool → 对话气泡中直接展示生成的图片（A2UI组件，支持预览下载）。
- 用户点击关闭按钮，回到通用Agent，可继续故事抽卡操作。

## 八、全页面业务复用统一逻辑

1. 故事抽卡、生成大纲、小说、剧本、有声书、漫剧全场景共用同一AI Chat组件。
2. 各页面功能差异通过外部配置项控制（scenePrompt、Agents列表、Tools清单、exposedMultimodalAgents、A2UI样式等）。
3. 通用Agent作为默认大脑，承载用户模糊/复合/跨模态需求，也可通过手动选中独立Agent切换为“单一能力”模式。
4. 业务Skill Agent仅作为专项执行单元；多模态Tool既可作为底层能力被通用Agent调用，也可选择性暴露为独立Agent供用户直接使用。
5. 所有Task、ThoughtChain、Tool调用、会话记录、多模态结果按场景与会话维度隔离。
6. 全页面A2UI组件遵循A2UI v0.9协议，确保技术实现规范统一。

## 九、Tool 结果图片展示机制：Tool 气泡隐藏 + extraInfo 透传

### 1. 背景问题

`generate_images` tool 执行后，对话中会出现两条包含同一组图片的气泡：

1. **Tool 气泡**：`GenerateImagesToolResult` 渲染 `ImagesArtifactGrid`
2. **Assistant 气泡（续流）**：`DrawerBubbleContent` 从模型回显的 content 中解析 URL，再次渲染 `ImagesArtifactGrid`

这种重复的原因是 tool 结果以 `role: tool` 注入对话上下文，模型在续流回复中可能将图片 URL 以 markdown 或纯文本形式回写到 assistant 的 `content` 中。

### 2. 解决策略

**隐藏 tool 气泡 + 通过 extraInfo 透传工具结果图片到 assistant 气泡。**

不再依赖模型是否回显图片 URL，而是直接从 tool 结果消息中提取图片 URL，通过 `extraInfo.toolResultImages` 透传给 `DrawerBubbleContent` 渲染。

### 3. 数据流

```
Tool handler 返回 {ok: true, images: ["url1", "url2"], ...}
         ↓
toolAdds.push({ role: 'tool', content: JSON.stringify({...}) })   ← 注入对话上下文
         ↓
AIChatCore bubbleItems 计算：
  extractToolResultImages(sdkList, currentMsg.id)
    → 从 sdkList 中向前扫描 tool 消息
    → 提取 imageUrls
    → 放入 extraInfo.toolResultImages
         ↓
AIChatSidePanel 从 extraInfo 取出 → 传给 DrawerBubbleContent
         ↓
DrawerBubbleContent 优先使用 toolResultImages 渲染 ImagesArtifactGrid
```

### 4. 关键实现细节

#### AIChatCore.tsx

- `VISIBLE_TOOL_NAMES` 移除 `generate_images`，tool 气泡不再渲染。
- `extractToolResultImages(sdkList, currentMsgId)` 工具函数：从当前 assistant 消息向前扫描，收集相邻 tool 消息中的图片 URL，去重后返回。
- 只在 `role === 'assistant' && !toolCalls.length && m.status === 'success'` 时执行扫描（即续流后已完成的 assistant 消息）。
- 图片 URL 通过 `extraInfo.toolResultImages` 传递，不修改 `message.content`，不持久化到对话历史。

#### drawerContentRender.tsx

- `DrawerBubbleContentProps` 新增 `toolResultImages?: string[]`。
- 渲染逻辑：`displayImages = toolResultImages?.length ? toolResultImages : images`。
- `text` 来自 `parseDrawerContent(content).text`（ URL 已被剥离），作为 markdown 展示时不会重复出图。

#### AIChatSidePanel.tsx

- `extraInfo` 类型注解新增 `toolResultImages?: string[]`。
- 透传给 `DrawerBubbleContent` 的 `toolResultImages` prop。

### 5. 优点

- 图片始终展示，不依赖模型是否回显 URL。
- `message.content` 不被修改，持久化和上下文大小不受影响。
- 图片只渲染一次（工具结果图片代替 content 解析图片）。