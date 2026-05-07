import { registerCatalog, type Catalog } from '@ant-design/x-card';

export const OUTLINE_PANEL_CATALOG_ID = 'yiman://novel-design/outline-panel-a2ui/v1';

let registered = false;

export function registerOutlinePanelA2uiCatalog(): void {
  if (registered) return;
  registered = true;
  registerCatalog(outlinePanelCatalog);
}

const outlinePanelCatalog: Catalog = {
  $id: OUTLINE_PANEL_CATALOG_ID,
  title: '编剧故事大纲操作面板',
  description: 'A2UI v0.9 大纲来源与操作',
  components: {
    OutlinePanelColumn: {
      type: 'object',
      required: ['children'],
      properties: {
        gap: { type: 'number' },
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    OutlinePanelButtonRow: {
      type: 'object',
      required: ['children'],
      properties: {
        gap: { type: 'number' },
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    OutlinePanelBadge: {
      type: 'object',
      properties: { text: { type: 'string' } },
    },
    OutlinePanelHeading: {
      type: 'object',
      properties: { title: { type: 'string' } },
    },
    OutlinePanelField: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        body: { type: 'string' },
      },
    },
    OutlinePanelButton: {
      type: 'object',
      required: ['action'],
      properties: {
        label: { type: 'string' },
        type: { type: 'string' },
        action: { type: 'object' },
      },
    },
    OutlinePanelFavoriteButton: {
      type: 'object',
      required: ['action'],
      properties: {
        label: { type: 'string' },
        favorited: { type: 'boolean' },
        action: { type: 'object' },
      },
    },
  },
};

registerOutlinePanelA2uiCatalog();
