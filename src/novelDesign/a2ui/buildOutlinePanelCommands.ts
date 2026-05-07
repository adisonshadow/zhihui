import type { XAgentCommand_v0_9 } from '@ant-design/x-card';
import type { ScreenwriterOutlinePanelPayload } from '@/novelDesign/utils/screenwriterOutlinePayload';
import { OUTLINE_PANEL_CATALOG_ID } from './registerOutlinePanelCatalog';

export const OUTLINE_PANEL_SURFACE_ID = 'screenwriter-outline-panel';

type OutlineUiNode = {
  id: string;
  component: string;
  child?: string;
  children?: string[];
  [key: string]: unknown;
};

export function buildOutlinePanelCommands(
  panel: ScreenwriterOutlinePanelPayload,
  context: {
    outlineProse: string;
    fullAssistantContent: string;
    /** 是否已在「我的大纲」收藏（按 outlineUuid） */
    outlineFavorited?: boolean;
  }
): XAgentCommand_v0_9[] {
  const surfaceId = OUTLINE_PANEL_SURFACE_ID;
  const components = buildOutlineComponents(panel, context.outlineFavorited ?? false);
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId, catalogId: OUTLINE_PANEL_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: { surfaceId, components },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: '/outline',
        value: {
          storyName: panel.storyName,
          source: panel.source,
          summary: panel.summary,
          ...(panel.outlineUuid ? { outlineUuid: panel.outlineUuid } : {}),
          outlineProse: context.outlineProse,
          fullAssistantContent: context.fullAssistantContent,
        },
      },
    },
  ];
}

function buildOutlineComponents(
  panel: ScreenwriterOutlinePanelPayload,
  outlineFavorited: boolean
): OutlineUiNode[] {
  const badgeId = 'op_badge';
  const headingId = 'op_heading';
  const children: string[] = [badgeId, headingId];

  const comps: OutlineUiNode[] = [
    { id: badgeId, component: 'OutlinePanelBadge', text: '故事大纲' },
    {
      id: headingId,
      component: 'OutlinePanelHeading',
      title: '故事大纲',
    },
  ];

  if (panel.storyName.trim()) {
    const id = 'op_name';
    children.push(id);
    comps.push({ id, component: 'OutlinePanelField', label: '故事名称', body: panel.storyName.trim() });
  }
  if (panel.source.trim()) {
    const id = 'op_src';
    children.push(id);
    comps.push({ id, component: 'OutlinePanelField', label: '大纲来源', body: panel.source.trim() });
  }
  if (panel.summary.trim()) {
    const id = 'op_sum';
    children.push(id);
    comps.push({ id, component: 'OutlinePanelField', label: '大纲简介', body: panel.summary.trim() });
  }

  const regenId = 'op_regen';
  const favId = 'op_fav';
  const createId = 'op_create';
  const rowId = 'op_row';
  children.push(rowId);

  comps.push(
    {
      id: regenId,
      component: 'OutlinePanelButton',
      label: '重新生成',
      type: 'default',
      action: {
        event: {
          name: 'outlinePanel_regenerate',
          context: {},
        },
      },
    },
    {
      id: favId,
      component: 'OutlinePanelFavoriteButton',
      label: outlineFavorited ? '已收藏' : '收藏大纲',
      favorited: outlineFavorited,
      action: {
        event: {
          name: 'outlinePanel_favorite',
          context: {
            outlineUuid: panel.outlineUuid ?? '',
          },
        },
      },
    },
    {
      id: createId,
      component: 'OutlinePanelButton',
      label: '创建小说项目',
      type: 'primary',
      action: {
        event: {
          name: 'outlinePanel_createProject',
          context: {},
        },
      },
    },
    {
      id: rowId,
      component: 'OutlinePanelButtonRow',
      gap: 8,
      children: [regenId, favId, createId],
    }
  );

  comps.push({
    id: 'root',
    component: 'OutlinePanelColumn',
    gap: 12,
    children,
  });

  return comps;
}
