# novelDesign/a2ui（小说雏形卡片）

编剧工作区内**小说雏形**的展示采用 **[@ant-design/x-card](https://www.npmjs.com/package/@ant-design/x-card)** 提供的 **Box + Card**，协议为 **A2UI v0.9**，与上游「增量 JSON / 命令流 → 结构化 UI」的模型一致：

- Ant Design X 文档：[A2UI v0.9（卡片）](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn)
- A2UI 协议与数据流说明：[Data Flow · A2UI](https://a2ui.org/concepts/data-flow/)

本目录集中存放 **Catalog 注册**、**v0.9 命令构建**、**React 映射组件**以及 **Deck（多 Surface）** 封装，便于在 `@novelDesign` 其他页面或服务里复用。

---

## 目录与职责

| 文件 | 作用 |
|------|------|
| `registerStorySeedCatalog.ts` | 本地 **Catalog**（`$id`: `yiman://novel-design/story-seed-a2ui/v1`）；调用 `registerCatalog`；模块加载末尾会 **自动注册一次**。 |
| `buildStorySeedCommands.ts` | 将 `@/novelDesign/utils/screenwriterStoryPayload` 中的 **`StorySeedFields`** 编成 **v0.9 命令序列**。 |
| `StorySeedA2uiComponents.tsx` | Catalog 里声明的大写组件名对应的 **React 实现**，以及 **`STORY_SEED_UI_COMPONENT_MAP`**（传给 `Box` 的 `components`）。 |
| `StorySeedA2uiDeck.tsx` | **一个** `Box`，`commands` 内可多 **Surface** 交错；每组命令对应 **`Card`** 的 `id`（与各自 `createSurface.surfaceId` 一致）。 |
| `index.ts` | 对上述符号的条形导出。 |

---

## 命令序列（每条 Surface）

对单个小说雏形，命令顺序通常为：

1. **`createSurface`**：`surfaceId` + **本地** `catalogId`（与 Catalog 的 `$id` 一致）。
2. **`updateComponents`**：组件树的根节点 **`id` 必须为 `root`**（与每条 Surface / Card 的树对应）。
3. **`updateDataModel`**：例如在路径 `/story` 写入结构化数据（可与按钮 `action.context` 中的路径快照配合使用说明区状态）。

多条故事在同一对话里：**多组**上述序列按顺序写入 **同一个** `commands` 数组；`Deck` 内为每组渲染一个 **`Card`**。流式场景中 `seeds` 随 `parseStorySeedFieldsStreaming` **逐项增多**，`commands` 也在尾部加长；**`Box` 不用易变的 `key` 重挂载**，以便内部只 **`slice` 处理新增命令**（与官方「渐进命令」用法一致）。

---

## 与抽卡页的衔接

数据来源与分页展示策略在 **`../utils/screenwriterStoryPayload.ts`**：

- **`StorySeedFields`**：结构化字段（标题、卖点、概要等 + `fullContent` 全文，供收藏/生成大纲）。
- **`parseStorySeedFields(content)`**：完整 JSON 或 legacy 文本已具备时，解析 **`stories` JSON** 或 **`【小说雏形 N】`**。
- **`parseStorySeedFieldsStreaming(content)`**：在上述基础上，对 **未闭合的 JSON** 从 `"stories":[`（或根数组）中 **逐项提取已完整的故事对象**，流式过程中即可驱动 A2UI 卡片渐进出现。

**`ScreenwriterAIDrawPage`** 中的路由：

- 使用 **`parseStorySeedFieldsStreaming`**；有 **至少一条** 可解析故事 → 先发 **前缀说明文字**（`splitStorySegments` 中 `type === 'text'`），再接 **`StorySeedA2uiDeck`**（与 [Ant Design X 流式](https://ant-design-x.antgroup.com/x-cards/a2ui-v-0-9-cn) 观感一致：先有卡片/占位而非整段等宽 JSON）。
- **`parseStorySeedFields` 与流式增量** 解析皆 **为空**、但仍在流式且 **像 JSON 输出** → 使用 **`StorySeedStreamingPlaceholder`**（轻量卡片框 + 加载态），**不再**用等宽代码块顶全流式过程。
- **`parseStorySeedFields` 为空**但仍有 legacy 故事分段 → **回退**为原来的纯文本块 + **`ScreenwriterStoryToolPanel`**。

---

## 交互：`onAction`

卡片按钮通过 **`Box` 的 `onAction`**（见 Ant Design X 的 `ActionPayload`）上报事件名：

| `name` | 行为 |
|--------|------|
| `storySeed_favorite` | `context.fullContent` → `addScreenwriterFavorite` |
| `storySeed_outline` | `context.fullContent` → **`buildGenerateOutlinePrompt`** → 与用户侧「发送一条生成大纲请求」等价（可由上层 `emitUserMessage` 投递） |

与原先每条故事下方的 **`ScreenwriterStoryToolPanel`** 语义对齐。

---

## 在其他页面复用

```ts
import {
  StorySeedA2uiDeck,
  STORY_SEED_CATALOG_ID,
  buildMultiStorySeedCommands,
  registerStorySeedA2uiCatalog,
} from '@/novelDesign/a2ui';
```

- 直接使用 **`StorySeedA2uiDeck`**：传入 **`parseStorySeedFieldsStreaming`**（或 **`parseStorySeedFields`**，仅终态）得到的 **`seeds`** 即可。
- 若需自控 **`Box` / `Card` 层级**：用 **`buildMultiStorySeedCommands`**（或 **`buildStorySeedSurfaceCommands`**）拼装 `commands`，并保证 **`Card` 的 `id`** 与 **`createSurface.surfaceId`** 一一对应；组件映射可复制 **`STORY_SEED_UI_COMPONENT_MAP`**。
- **改样式 / 增减字段**：优先改 **`registerStorySeedCatalog`**（schema）、**`buildStorySeedCommands`**（树与数据）、**`StorySeedA2uiComponents`**（实际 UI）。
