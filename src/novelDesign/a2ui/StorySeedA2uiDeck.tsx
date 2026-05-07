/**
 * A2UI v0.9：多 Surface「小说雏形」卡片组（@ant-design/x-card 的 Box + Card；协议见 https://a2ui.org/concepts/data-flow/）
 */
import { useCallback, useMemo } from 'react';
import { Box, Card, type ActionPayload } from '@ant-design/x-card';
import { Flex, message } from 'antd';

import '@/novelDesign/a2ui/registerStorySeedCatalog';
import type { StorySeedFields } from '@/novelDesign/utils/screenwriterStoryPayload';
import { buildMultiStorySeedCommands } from '@/novelDesign/a2ui/buildStorySeedCommands';
import { STORY_SEED_UI_COMPONENT_MAP } from '@/novelDesign/a2ui/StorySeedA2uiComponents';
import { buildGenerateOutlinePrompt } from '@/novelDesign/components/ScreenwriterStoryToolPanel';
import { toggleStorySeedFavorite } from '@/novelDesign/storage/screenwriterFavoriteStorage';

export interface StorySeedA2uiDeckProps {
  seeds: StorySeedFields[];
  sourceConversationKey?: string | null;
  onFavoriteChange?: () => void;
  /** 与当前助手泡对应的用户抽卡偏好全文，收藏时附在正文末尾 */
  rawDrawBrief?: string;
  /** 已收藏雏形的 seedUuid 集合（小写），用于星标态 */
  favoritedSeedUuidSet?: Set<string>;
  /** 与用户发送一条「生成大纲」消息一致（参数为可直接发送的 prompt 全文） */
  onGenerateOutline: (outlinePromptFull: string) => void;
}

function surfaceIdFor(seed: StorySeedFields, index: number): string {
  return `novel-story-${index}-${seed.index}`;
}

export function StorySeedA2uiDeck({
  seeds,
  sourceConversationKey,
  onFavoriteChange,
  rawDrawBrief,
  favoritedSeedUuidSet,
  onGenerateOutline,
}: StorySeedA2uiDeckProps) {
  const items = useMemo(
    () => seeds.map((seed, idx) => ({ surfaceId: surfaceIdFor(seed, idx), seed })),
    [seeds]
  );

  const commands = useMemo(
    () => buildMultiStorySeedCommands(items, favoritedSeedUuidSet),
    [items, favoritedSeedUuidSet]
  );

  const onAction = useCallback(
    (payload: ActionPayload) => {
      const ctx = payload.context ?? {};
      if (payload.name === 'storySeed_favorite') {
        const fullContent = typeof ctx.fullContent === 'string' ? ctx.fullContent : '';
        if (fullContent) {
          const seedUuid = typeof ctx.seedUuid === 'string' ? ctx.seedUuid : '';
          const res = toggleStorySeedFavorite({
            seedUuid: seedUuid || undefined,
            storyBodyContent: fullContent,
            sourceConversationKey,
            rawDrawBrief: rawDrawBrief ?? undefined,
          });
          onFavoriteChange?.();
          message.success(res.favorited ? '已收藏雏形' : '已取消收藏');
        }
        return;
      }
      if (payload.name === 'storySeed_outline') {
        const fullContent = typeof ctx.fullContent === 'string' ? ctx.fullContent : '';
        if (fullContent) {
          onGenerateOutline(buildGenerateOutlinePrompt(fullContent));
        }
      }
    },
    [onFavoriteChange, onGenerateOutline, rawDrawBrief, sourceConversationKey]
  );

  if (items.length === 0) return null;

  return (
    <Box
      commands={commands}
      components={STORY_SEED_UI_COMPONENT_MAP}
      onAction={onAction}
    >
      <Flex vertical gap={16} style={{ width: '100%' }}>
        {items.map(({ surfaceId }) => (
          <div
            key={surfaceId}
            className="screenwriter-story-a2ui-surface"
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.03)',
              padding: '12px 14px',
            }}
          >
            <Card id={surfaceId} />
          </div>
        ))}
      </Flex>
    </Box>
  );
}
