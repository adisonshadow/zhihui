import type { XAgentCommand_v0_9 } from '@ant-design/x-card';
import type { StorySeedFields } from '@/novelDesign/utils/screenwriterStoryPayload';
import { STORY_SEED_CATALOG_ID } from './registerStorySeedCatalog';

/** 单个组件节点的命令描述（遵循 A2UI v0.9 BaseComponent） */
export type StorySeedUiNode = {
  id: string;
  component: string;
  child?: string;
  children?: string[];
  [key: string]: unknown;
};

/** 为单个小说雏形生成 v0.9 命令序列（createSurface → updateComponents → updateDataModel） */
export function buildStorySeedSurfaceCommands(
  surfaceId: string,
  seed: StorySeedFields,
  favoritedSeedUuidSet?: Set<string>
): XAgentCommand_v0_9[] {
  const components = buildStorySeedComponents(seed, favoritedSeedUuidSet);
  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: STORY_SEED_CATALOG_ID,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components,
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: '/story',
        value: {
          index: seed.index,
          title: seed.title,
          fullContent: seed.fullContent,
          ...(seed.seedUuid ? { seedUuid: seed.seedUuid } : {}),
        },
      },
    },
  ];
}

/** 将若干小说雏形展平为一条命令队列（多 Surface 交错），供单个 Box 使用 */
export function buildMultiStorySeedCommands(
  items: Array<{ surfaceId: string; seed: StorySeedFields }>,
  favoritedSeedUuidSet?: Set<string>
): XAgentCommand_v0_9[] {
  const out: XAgentCommand_v0_9[] = [];
  for (const { surfaceId, seed } of items) {
    out.push(...buildStorySeedSurfaceCommands(surfaceId, seed, favoritedSeedUuidSet));
  }
  return out;
}

function buildStorySeedComponents(
  seed: StorySeedFields,
  favoritedSeedUuidSet?: Set<string>
): StorySeedUiNode[] {
  const ix = seed.index;
  const badgeId = `s${ix}_badge`;
  const headingId = `s${ix}_heading`;
  const children: string[] = [badgeId, headingId];

  const comps: StorySeedUiNode[] = [];

  comps.push({
    id: badgeId,
    component: 'StorySeedBadge',
    text: `小说雏形 · ${seed.index}`,
  });

  comps.push({
    id: headingId,
    component: 'StorySeedHeading',
    title: seed.title,
    subtitle: '',
  });

  if (seed.sellingPoint?.trim()) {
    const id = `s${ix}_sell`;
    children.push(id);
    comps.push({
      id,
      component: 'StorySeedField',
      label: '一句话卖点',
      body: seed.sellingPoint.trim(),
    });
  }

  if (seed.worldview?.trim()) {
    const id = `s${ix}_world`;
    children.push(id);
    comps.push({
      id,
      component: 'StorySeedField',
      label: '世界观简述',
      body: seed.worldview.trim(),
    });
  }

  if (seed.characters && seed.characters.length > 0) {
    const id = `s${ix}_chars`;
    children.push(id);
    comps.push({
      id,
      component: 'StorySeedCharBlock',
      label: '主要角色',
      bulletText: seed.characters.map((c) => `• ${c}`).join('\n'),
    });
  }

  if (seed.summary?.trim()) {
    const id = `s${ix}_sum`;
    children.push(id);
    comps.push({
      id,
      component: 'StorySeedSummary',
      label: '故事概要',
      body: seed.summary.trim(),
    });
  }

  const favId = `s${ix}_fav`;
  const outId = `s${ix}_out`;
  const actionsRowId = `s${ix}_actions`;
  children.push(actionsRowId);

  const fid = seed.seedUuid?.trim().toLowerCase();
  const favorited = Boolean(fid && favoritedSeedUuidSet?.has(fid));

  comps.push(
    {
      id: favId,
      component: 'StorySeedFavoriteButton',
      label: favorited ? '已收藏' : '收藏雏形',
      favorited,
      action: {
        event: {
          name: 'storySeed_favorite',
          context: {
            fullContent: seed.fullContent,
            title: seed.title,
            storyIndex: seed.index,
            seedUuid: seed.seedUuid ?? '',
          },
        },
      },
    },
    {
      id: outId,
      component: 'StorySeedOutlineButton',
      label: '生成大纲',
      type: 'primary',
      action: {
        event: {
          name: 'storySeed_outline',
          context: {
            fullContent: seed.fullContent,
            title: seed.title,
            storyIndex: seed.index,
          },
        },
      },
    },
    {
      id: actionsRowId,
      component: 'StorySeedButtonRow',
      gap: 8,
      children: [favId, outId],
    }
  );

  comps.push({
    id: 'root',
    component: 'StorySeedColumn',
    gap: 12,
    children,
  });

  return comps;
}
