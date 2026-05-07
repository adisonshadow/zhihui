import { registerCatalog, type Catalog } from '@ant-design/x-card';

/** 本地 Catalog id，与 createSurface.catalogId 一致 */
export const STORY_SEED_CATALOG_ID = 'yiman://novel-design/story-seed-a2ui/v1';

let registered = false;

/** 向 @ant-design/x-card 注册小说雏形专用 Catalog（幂等） */
export function registerStorySeedA2uiCatalog(): void {
  if (registered) return;
  registered = true;
  registerCatalog(storySeedCatalog);
}

const storySeedCatalog: Catalog = {
  $id: STORY_SEED_CATALOG_ID,
  title: '编剧小说雏形卡片',
  description: 'A2UI v0.9 结构化展示小说雏形',
  components: {
    StorySeedColumn: {
      type: 'object',
      required: ['children'],
      properties: {
        gap: { type: 'number' },
        children: {
          description: '子节点 id 列表',
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    StorySeedButtonRow: {
      type: 'object',
      required: ['children'],
      properties: {
        gap: { type: 'number' },
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    StorySeedBadge: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string' } },
    },
    StorySeedHeading: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
      },
    },
    StorySeedField: {
      type: 'object',
      required: ['label', 'body'],
      properties: {
        label: { type: 'string' },
        body: { type: 'string' },
      },
    },
    StorySeedCharBlock: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        bulletText: { type: 'string' },
      },
    },
    StorySeedSummary: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        body: { type: 'string' },
      },
    },
    StorySeedFavoriteButton: {
      type: 'object',
      required: ['action'],
      properties: {
        label: { type: 'string' },
        favorited: { type: 'boolean' },
        action: { type: 'object' },
      },
    },
    StorySeedOutlineButton: {
      type: 'object',
      required: ['action'],
      properties: {
        label: { type: 'string' },
        type: { type: 'string' },
        action: { type: 'object' },
      },
    },
  },
};

registerStorySeedA2uiCatalog();
