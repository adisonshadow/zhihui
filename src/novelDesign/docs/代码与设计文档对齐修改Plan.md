# 代码与设计文档对齐修改 Plan

> 基于 `AI写小说业务逻辑与提示词设计说明.md`（下称「设计文档」）对 `ScreenwriterNovelDetailPage.tsx` 及关联代码进行系统性检查后制定的修改计划。

---

## 一、审查概览

审查范围涉及以下文件和模块：

| 文件/模块 | 路径 | 角色 |
|-----------|------|------|
| 主页面 | `src/novelDesign/pages/ScreenwriterNovelDetailPage.tsx` | 三栏工作台入口，组装 AI 对话、编辑器、导航 |
| Agent 基础提示词 | `src/components/AIChat/agents/novelAgent.ts` | Agent `novel` 的 basePrompt + 常用提示词 |
| 项目级提示词 | `src/novelDesign/prompts/novelEditorProjectPrompt.ts` | 注入 projectPrompt 的项目自定义规则 |
| AI 工具函数 | `src/novelDesign/AITools/novelEditorFunctionCalls.ts` | 17 个 Function Call 定义 |
| 流式写入 Hook | `src/novelDesign/hooks/useNovelAiStream.ts` | AI 正文流的检测、预览、保存 |
| 写入意图判断 | `src/novelDesign/utils/novelWriteIntent.ts` | 用户意图识别与写入策略 |
| 正文解析器 | `src/novelDesign/parsers/novelBodyJsonParser.ts` | novel-body-json 解析 |
| 思考链组件 | `src/novelDesign/components/NovelEditorThoughtChain.tsx` | ThoughtChain 可视化 |
| 章节存储 | `src/novelDesign/storage/novelWorkspaceStorage.ts` | 本地持久化 |

---

## 二、发现的问题与差距

### 🔴 P0 — 关键缺失

#### 2.1 缺少「下一步操作建议」功能（设计文档 §3.1 步骤5、§9）

**现状**：AI 完成正文写入后，对话区没有任何可点击的「下一步操作建议」按钮。设计文档明确要求：
> "完成正文输出后，必须提供下一步操作建议（以按钮形式呈现的建议列表）。"

**影响**：用户完成一次写作后不知道可以做什么，需要手动输入指令，体验断裂。

**修复方案**：
1. 在 `ScreenwriterNovelDetailPage.tsx` 中实现 `writeBackActions` prop，在 AI 完成内容写入后（检测到 `novel-body-json` 已被解析并保存），在 Footer 区域渲染操作建议按钮
2. 在 `novelEditorProjectPrompt.ts` 系统提示词中增加规则：完成正文输出后必须提供建议条（中文自然语言列举即可，前端解析渲染）
3. 或者简化为：在 AI 返回的文本末尾提供 Markdown 格式的建议列表，前端通过正则提取渲染为按钮

**涉及文件**：
- `src/novelDesign/pages/ScreenwriterNovelDetailPage.tsx` — 新增 `writeBackActions` 逻辑
- `src/novelDesign/prompts/novelEditorProjectPrompt.ts` — 提示词中增加建议规则

---

#### 2.2 Agent 基础提示词与设计文档严重不一致（设计文档 §6.1）

**现状**：`novelAgent.ts` 的 `basePrompt` 内容为通用的"小说写作助手"描述，与设计文档 §6.1 定义的系统提示词差异巨大：

| 设计文档要求 | novelAgent.ts 现状 |
|-------------|-------------------|
| "所有操作均基于工具调用" | ❌ 未提及工具 |
| "执行操作前必须先检查故事大纲" | ❌ 未提及 |
| "所有回复必须使用 ThoughtChain 结构" | ❌ 未提及 |
| "正文输出必须使用 novel-body-json 代码块" | ❌ 写的是"直接输出正文即可" |
| "完成正文后必须提供下一步建议" | ❌ 未提及 |
| "遇到需确认情况必须停下询问" | ❌ 未提及 |

**影响**：`basePrompt` 和 `projectPrompt` 之间存在冲突——`basePrompt` 让 AI "直接输出正文"，而 `projectPrompt` 要求用 `novel-body-json`。AI 可能产生不一致行为。

**修复方案**：
1. 重写 `novelAgent.ts` 的 `basePrompt`，使其与设计文档 §6.1 保持一致，强调工具调用优先、`novel-body-json` 代码块格式、ThoughtChain 结构
2. 将当前 `basePrompt` 中"文风、节奏、对白"等创作规则保留，作为次要规则
3. 调整常用提示词（prompts），使其引导 AI 走正确的工具+代码块流程

**涉及文件**：
- `src/components/AIChat/agents/novelAgent.ts`

---

#### 2.3 项目提示词缺少「停止确认」规则（设计文档 §6.1 规则6、§10）

**现状**：`novelEditorProjectPrompt.ts` 没有明确要求 AI 在遇到需要用户确认的情况（如"清空重写"、"最后一集不是有效正文"）时暂停并询问。

**修复方案**：在 `novelEditorProjectPrompt.ts` 中增加规则：
- 新增一集前，如果最后一集内容为空/仅为大纲/明显不完整，必须先向用户说明情况并询问
- 涉及删除操作时，确认后再执行

---

### 🟡 P1 — 重要优化

#### 2.4 常用提示词（Prompt Items）未对齐设计文档流程

**现状**：`novelAgent.ts` 的 prompts 列表包含 "直接输出正文即可" 风格的提示，与项目要求使用 `novel-body-json` 代码块的流程不一致。

**示例**：
- `"请从当前文段自然续写，保持人称、时态与原有文风"` — 这会让 AI 直接在对话区输出续写内容，而不是通过 `novel-body-json` 写入编辑器

**修复方案**：
1. 将所有涉及"写作/生成正文"的 prompt message 改为引导 AI 使用工具+代码块流程
2. 例如："续写内容" → "请根据故事大纲和当前章节内容，续写当前集，通过 novel-body-json 写入编辑器"
3. 保留纯咨询类提示词（如"润色润稿"、"优化对白"）但确保其要求也通过代码块输出

---

#### 2.5 项目提示词缺少「建议按钮」输出格式说明

**现状**：`novelEditorProjectPrompt.ts` 没有说明 AI 应该如何输出"下一步操作建议"。

**修复方案**：在提示词中增加规则：完成正文写入后，必须以特定格式输出建议列表（如 Markdown 列表或特定标记），前端据此渲染可点击按钮。

---

#### 2.6 上下文注入方式与设计文档 §11 不完全一致

**现状**：设计文档 §11 建议：
> "前端通过 AI 发送用户消息时，可附带当前上下文信息到 Assistant 消息的 context 字段，但不要放入 user 消息正文，以保持对话整洁。"

当前实现通过 `formatContextTags` → `buildContextMessages` 将上下文作为 `role: 'user'` 消息注入。这会导致：
1. 对话历史中多出不可见的"系统上下文"消息
2. 影响回退（rollback）逻辑

**修复方案**：
- 评估是否可改为 `role: 'system'` 注入（但可能影响模型的注意力分配）
- 或保持现状但在提示词中说明这些是系统注入的上下文（当前已部分实现，`formatNovelContextTags` 中使用了 `contextSentThisTurnRef` 控制每轮只发一次）
- **判定**：当前实现功能正常，风险较低，标记为 P2

---

### 🔵 P2 — 细微改进

#### 2.7 ThoughtChain 展示位置可优化

**现状**：`NovelEditorThoughtChain` 在 `sidePanelAssistantContentRender` 中渲染在 assistant 消息内容的下方。

**设计文档要求**：§3.1 步骤3 描述了 "思考 → 执行 → 生成" 的完整可视化流程，ThoughtChain 应在整个过程的前端展示。

**现状**基本满足要求，但可考虑：
- 在流式等待阶段（`pending_stream`）也展示 loading 状态的 ThoughtChain
- 当前只在检测到 tool calls 后才展示

---

#### 2.8 工具名称与设计文档对标审查

**现状**：代码中工具名称与设计文档 §4 不完全一致，但 `projectPrompt` 的"可用工具速查"部分已正确反映实际工具名称。AI 能正确匹配工具调用。

**结论**：无需修改。工具名称以代码为准，`projectPrompt` 中已做对应说明。✅

---

#### 2.9 编辑器「预览模式」锁定

**现状**：通过 `editorExternallyBusy` 将编辑器设为 `readOnly`，在 AI 流式写入期间禁止用户编辑。符合设计文档 §11 要求。

**结论**：已正确实现。✅

---

## 三、修改执行计划

### 阶段一：提示词修复（P0 + P1）

| 序号 | 任务 | 文件 | 优先级 |
|------|------|------|--------|
| 3.1 | 重写 `novelAgent.ts` basePrompt，对齐设计文档 §6.1 | `src/components/AIChat/agents/novelAgent.ts` | P0 |
| 3.2 | 重写 `novelAgent.ts` prompts 列表，引导工具+代码块流程 | `src/components/AIChat/agents/novelAgent.ts` | P1 |
| 3.3 | `novelEditorProjectPrompt.ts` 增加「停止确认」规则 | `src/novelDesign/prompts/novelEditorProjectPrompt.ts` | P0 |
| 3.4 | `novelEditorProjectPrompt.ts` 增加「下一步建议」输出格式规则 | `src/novelDesign/prompts/novelEditorProjectPrompt.ts` | P0 |

### 阶段二：下一步建议按钮（P0）

| 序号 | 任务 | 文件 | 优先级 |
|------|------|------|--------|
| 3.5 | 实现 `writeBackActions` — AI 完成正文写入后渲染建议按钮 | `src/novelDesign/pages/ScreenwriterNovelDetailPage.tsx` | P0 |

### 阶段三：上下文注入优化（P2，可选）

| 序号 | 任务 | 文件 | 优先级 |
|------|------|------|--------|
| 3.6 | 评估上下文注入 role 调整（system vs user） | `src/novelDesign/pages/ScreenwriterNovelDetailPage.tsx`、`src/components/AIChat/AIChatCore.tsx` | P2 |

---

## 四、具体修改内容

### 4.1 novelAgent.ts basePrompt 重写

**目标**：将 basePrompt 从通用小说助手改为与设计文档 §6.1 一致的工具驱动型提示词。

**修改后的 basePrompt 结构**：
```
你是一个专业的小说创作AI助手，工作于一个三栏式写小说界面中。

你必须严格遵循以下规则：
1. 所有操作均基于工具调用，不可自行假设数据存在。
2. 执行"新增一集""续写"等操作前，必须先检查故事大纲是否存在，然后检查当前集状态。
3. 所有回复必须使用 ThoughtChain 可展示的结构：思考过程 → 工具调用（如有）→ 正文输出。
4. 正文输出必须使用 ```novel-body-json 代码块，遵循字段定义，且 content_markdown 中不能包含标题、分隔线、完结标记或总结语。
5. 完成正文输出后，必须提供下一步操作建议（以可点击按钮列表形式呈现）。
6. 若遇到需要用户确认的情况（如清空重写），必须停下并明确询问。
7. 保持故事一致，根据故事大纲和已有章节内容延续剧情，人物性格、设定不得偏离。
8. 工具调用结果若需展示，用自然语言简要描述，不要输出原始JSON。

【创作规则】
- 保持统一的叙事视角（第一人称/第三人称有限/全知）
- 注重画面感：用细节让读者"看见"而非"被告知"
- 控制节奏：紧张处紧凑，舒缓处留白
- 新人出场注意外貌与身份暗示，老角色用行动体现性格
```

### 4.2 novelAgent.ts prompts 重写

每个 prompt 的 message 需引导 AI 走工具+代码块流程：

| key | label | 新 message |
|-----|-------|-----------|
| goonwriteone | 新增一集 | 请根据故事大纲和当前剧情，新增一集小说。先检查大纲和最后一集状态，然后创建新集并通过 novel-body-json 写入正文 |
| goonwrite | 续写内容 | 请从当前章节末尾自然续写，保持人称、时态与原有文风，通过 novel-body-json 追加到当前集 |
| polish | 润色润稿 | 请润色当前章节，提升流畅度与画面感，通过 novel-body-json 替换当前集内容 |
| expand | 扩写细写 | 请将当前章节扩写，补充环境描写、心理活动或动作细节，通过 novel-body-json 替换 |
| condense | 精简压缩 | 请将当前章节压缩为更短篇幅，保留关键情节与情绪，通过 novel-body-json 替换 |
| dialogue | 优化对白 | 请优化当前章节人物对白，使其更符合人设、有潜台词，通过 novel-body-json 替换 |
| conflict | 加强冲突 | 请在当前章节中加强戏剧冲突，通过 novel-body-json 替换 |
| pov-change | 换视角重述 | 请用另一角色的视角重述当前章节，保持事实一致，通过 novel-body-json 替换 |
| pace | 调整节奏 | 请调整当前章节叙事节奏，通过 novel-body-json 替换 |
| style-transfer | 更改文风 | 请将当前章节改成另一种风格，通过 novel-body-json 替换 |
| rewrite | 整段重写 | 请重写当前章节，换个表达方式但保留核心情节，通过 novel-body-json 替换 |

### 4.3 novelEditorProjectPrompt.ts 新增规则

在现有提示词中追加以下两条规则：

```
【下一步操作建议】
· 完成正文写入后，你必须在回复末尾以"接下来您可以："开头，列出一个建议列表。
· 每条建议独立成行，格式为"- 建议文字"。
· 建议项包括：新增一集、续写当前内容、重写本集、润色润稿、扩写细写、精简压缩、优化对白、加强冲突 等。

【需要确认时停止】
· 若最后一集内容为空/仅为大纲/明显不完整，新增前必须先说明："检测到最后一集[标题]内容可能不是正文或不完整，是否清空并重写？"等待用户确认后再操作。
· 涉及删除操作（如清空某集）时，必须先说明影响并等待用户确认。
```

### 4.4 ScreenwriterNovelDetailPage.tsx 实现 writeBackActions

**方案**：监听 AI 完成正文写入，在 Footer 展示可点击的下一步建议按钮。

**实现思路**：
1. 在 `useNovelAiStream` 中增加一个回调 `onWriteComplete`，在正文保存成功后触发
2. 在 `ScreenwriterNovelDetailPage.tsx` 中通过 `writeBackActions` prop 渲染建议按钮
3. 按钮点击后自动填入对应提示词到 Sender 并触发提交
4. 建议列表：新增一集、续写内容、重写本集、润色润稿、扩写细写

**也可简化方案（更可靠）**：
- 在 AI 返回的文本末尾检测 `接下来您可以：` 或 `建议：` 等模式
- 解析列表项并渲染为 Ant Design X 的 Prompts/Suggestion 组件
- 点击后通过 `chatRef.current.emitUserMessage(text)` 发送

---

## 五、影响范围评估

| 修改项 | 风险等级 | 回归风险 | 备注 |
|--------|---------|---------|------|
| novelAgent.ts basePrompt 重写 | 🟡 中 | 可能改变 AI 行为模式 | 需充分测试各种写作场景 |
| novelAgent.ts prompts 重写 | 🟢 低 | 仅影响常用提示词的触发流程 | prompt item 的 key 不变 |
| projectPrompt 新增规则 | 🟢 低 | 仅追加文本，不影响现有逻辑 | — |
| writeBackActions 实现 | 🟢 低 | 纯新增功能 | — |

---

## 六、执行顺序

1. **先改提示词**（3.1 → 3.2 → 3.3 → 3.4）— 确保 AI 行为符合设计文档
2. **再实现建议按钮**（3.5）— 依赖提示词输出正确格式
3. **最后可选优化**（3.6）— 低优先级

---

*Plan 创建时间：2026-05-10*
*基于设计文档 v1.0 与代码当前状态对比生成*
