import { registerCatalog, type Catalog } from '@ant-design/x-card';

export const NOVEL_EDITOR_TOOL_CATALOG_ID = 'yiman://novel-design/editor-tool-result/v1';

let registered = false;

export function registerNovelEditorToolA2uiCatalog(): void {
  if (registered) return;
  registered = true;
  registerCatalog(novelEditorToolCatalog);
}

const novelEditorToolCatalog: Catalog = {
  $id: NOVEL_EDITOR_TOOL_CATALOG_ID,
  title: '小说编辑工具结果',
  description: 'A2UI v0.9 展示 novel_* 函数返回',
  components: {
    NovelToolColumn: {
      type: 'object',
      properties: {
        gap: { type: 'number' },
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    NovelToolTitle: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
        iconType: { type: 'string', enum: ['loading', 'error', 'success'] },
      },
    },
    NovelToolCollapsibleCard: {
      type: 'object',
      required: ['children'],
      properties: {
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    NovelToolField: {
      type: 'object',
      required: ['label', 'body'],
      properties: {
        label: { type: 'string' },
        body: { type: 'string' },
      },
    },
    NovelToolCollapsibleField: {
      type: 'object',
      required: ['label', 'body'],
      properties: {
        label: { type: 'string' },
        body: { type: 'string' },
        defaultCollapsed: { type: 'boolean' },
      },
    },
  },
};

registerNovelEditorToolA2uiCatalog();
