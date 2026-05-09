/**
 * A2UI：故事大纲末尾 JSON 解析后的操作面板（重新生成 / 收藏 / 创建项目）
 */
import { useCallback, useMemo } from 'react';
import { App } from 'antd';
import { Box, Card, type ActionPayload } from '@ant-design/x-card';

import '@/novelDesign/a2ui/registerOutlinePanelCatalog';
import type { ScreenwriterOutlinePanelPayload } from '@/novelDesign/utils/screenwriterOutlinePayload';
import {
  OUTLINE_PANEL_SURFACE_ID,
  buildOutlinePanelCommands,
} from '@/novelDesign/a2ui/buildOutlinePanelCommands';
import { OUTLINE_PANEL_UI_COMPONENT_MAP } from '@/novelDesign/a2ui/OutlinePanelA2uiComponents';

export interface OutlinePanelA2uiProps {
  panel: ScreenwriterOutlinePanelPayload;
  outlineProse: string;
  fullAssistantContent: string;
  /** 当前已收藏大纲的 outlineUuid（小写）集合，用于星标 */
  favoritedOutlineUuidSet?: Set<string>;
  /** 创作偏好文本块（显示在卡片中） */
  preferenceBlock?: string;
  onRegenerate: () => void;
  onFavorite: () => void;
  onCreateProject: () => void;
}

export function OutlinePanelA2ui({
  panel,
  outlineProse,
  fullAssistantContent,
  favoritedOutlineUuidSet,
  preferenceBlock,
  onRegenerate,
  onFavorite,
  onCreateProject,
}: OutlinePanelA2uiProps) {
  const { message } = App.useApp();

  const outlineFavorited = useMemo(() => {
    const uid = panel.outlineUuid?.trim().toLowerCase();
    if (!uid) return false;
    return Boolean(favoritedOutlineUuidSet?.has(uid));
  }, [favoritedOutlineUuidSet, panel.outlineUuid]);

  const commands = useMemo(
    () =>
      buildOutlinePanelCommands(panel, {
        outlineProse,
        fullAssistantContent,
        outlineFavorited,
        preferenceBlock,
      }),
    [fullAssistantContent, outlineFavorited, outlineProse, panel, preferenceBlock]
  );

  const onAction = useCallback(
    (payload: ActionPayload) => {
      const n = payload.name;
      if (n === 'outlinePanel_regenerate') {
        onRegenerate();
        return;
      }
      if (n === 'outlinePanel_favorite') {
        onFavorite();
        return;
      }
      if (n === 'outlinePanel_createProject') {
        onCreateProject();
        return;
      }
      message.warning('未知操作');
    },
    [message, onCreateProject, onFavorite, onRegenerate]
  );

  return (
    <Box commands={commands} components={OUTLINE_PANEL_UI_COMPONENT_MAP} onAction={onAction}>
      <div
        className="screenwriter-outline-a2ui-surface"
        style={{
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          padding: '12px 14px',
        }}
      >
        <Card id={OUTLINE_PANEL_SURFACE_ID} />
      </div>
    </Box>
  );
}
