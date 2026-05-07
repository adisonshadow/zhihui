/**
 * 编剧：AI 抽卡（左侧会话列表 + 强制小说作家 SidePanel）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Flex, Input, Modal, Typography, message } from 'antd';
import { PlusOutlined, StarOutlined } from '@ant-design/icons';
import { AIChat } from '@/components/AIChat';
import type {
  AIChatSidePanelHandle,
  ConversationListMetaItem,
} from '@/components/AIChat/aiChatPanelHandles';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import type { SidePanelAssistantContentRenderArgs } from '@/components/AIChat/AIChatSidePanel';
import { ScreenwriterDrawCard } from '@/novelDesign/components/ScreenwriterDrawCard';
import { StorySeedStreamingPlaceholder } from '@/novelDesign/components/StorySeedStreamingPlaceholder';
import { ScreenwriterFavoritesModal } from '@/novelDesign/components/ScreenwriterFavoritesModal';
import { ScreenwriterStoryToolPanel, buildRegenerateOutlinePrompt } from '@/novelDesign/components/ScreenwriterStoryToolPanel';
import { CreateNovelProjectModal } from '@/novelDesign/components/CreateNovelProjectModal';
import { StorySeedA2uiDeck } from '@/novelDesign/a2ui/StorySeedA2uiDeck';
import { OutlinePanelA2ui } from '@/novelDesign/a2ui/OutlinePanelA2ui';
import { ScreenwriterAssistantMarkdown } from '@/novelDesign/components/ScreenwriterAssistantMarkdown';
import {
  getScreenwriterDrawProjectPromptSuffix,
  getScreenwriterOutlineJsonContractSuffix,
} from '@/novelDesign/prompts/screenwriterDrawPrompt';
import {
  looksLikeJsonStoryOutput,
  parseStorySeedFieldsStreaming,
  splitStorySegments,
} from '@/novelDesign/utils/screenwriterStoryPayload';
import {
  looksLikeOutlineJsonStreaming,
  parseScreenwriterOutlineFromAssistant,
  proseBeforeLastJsonFenceOpening,
} from '@/novelDesign/utils/screenwriterOutlinePayload';
import {
  composeOutlineFavoriteAppendix,
  loadScreenwriterOutlineFavorites,
  toggleScreenwriterOutlineFavorite,
} from '@/novelDesign/storage/screenwriterOutlineFavoriteStorage';
import { loadScreenwriterFavorites } from '@/novelDesign/storage/screenwriterFavoriteStorage';
import {
  findLatestDrawBriefBeforeBubble,
  resolveOutlineFavoriteAppendixSources,
} from '@/novelDesign/utils/resolveScreenwriterFavoriteContext';
import { deriveNovelDesignConversationTitle } from '@/novelDesign/utils/deriveNovelDesignConversationTitle';
import { ScreenwriterHistoryConversations } from '@/novelDesign/components/ScreenwriterHistoryConversations';
import '@ant-design/x-markdown/themes/dark.css';
import './ScreenwriterAIDrawPage.css';

function ScreenwriterAIDrawInner() {
  const navigate = useNavigate();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const chatRef = useRef<AIChatSidePanelHandle | null>(null);
  const bootRef = useRef(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoritesRefreshKey, setFavoritesRefreshKey] = useState(0);
  const [convMeta, setConvMeta] = useState<{
    items: ConversationListMetaItem[];
    activeKey: string | null;
  }>({ items: [], activeKey: null });
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const onConversationListChange = useCallback(
    (p: { items: ConversationListMetaItem[]; activeKey: string | null }) => {
      setConvMeta((prev) => {
        const prevSig = JSON.stringify(prev);
        const nextSig = JSON.stringify(p);
        return prevSig === nextSig ? prev : p;
      });
    },
    []
  );

  const openRename = useCallback((key: string, current: string) => {
    setRenameKey(key);
    setRenameValue(current);
    setRenameOpen(true);
  }, []);

  const submitRename = useCallback(() => {
    if (!renameKey) return;
    const v = renameValue.replace(/\s+/g, ' ').trim();
    if (!v) {
      message.warning('名称不能为空');
      return;
    }
    chatRef.current?.renameConversation(renameKey, v);
    setRenameOpen(false);
    setRenameKey(null);
  }, [renameKey, renameValue]);

  const requestDeleteConversation = useCallback((key: string, label: string) => {
    Modal.confirm({
      title: '删除对话',
      content: `确定删除「${label || '未命名'}」？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => chatRef.current?.deleteConversation(key),
    });
  }, []);

  const toggleConversationPin = useCallback((key: string, pinned: boolean) => {
    chatRef.current?.setConversationPinned(key, pinned);
  }, []);

  useEffect(() => {
    if (bootRef.current) return;
    const api = chatRef.current;
    if (!api) return;
    if (convMeta.activeKey) {
      bootRef.current = true;
      return;
    }
    bootRef.current = true;
    api.newConversation();
  }, [convMeta.activeKey, convMeta.items]);

  const drawProjectPrompt = useMemo(
    () =>
      `编剧工作区：小说雏形与长篇小说创作。\n\n${getScreenwriterDrawProjectPromptSuffix()}\n\n${getScreenwriterOutlineJsonContractSuffix()}`,
    []
  );

  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [createSuggestedName, setCreateSuggestedName] = useState('');
  const [createOutlineMarkdown, setCreateOutlineMarkdown] = useState<string | undefined>(undefined);

  const favoritedSeedUuidSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of loadScreenwriterFavorites()) {
      const u = it.seedUuid?.trim().toLowerCase();
      if (u) s.add(u);
    }
    return s;
  }, [favoritesRefreshKey]);

  const favoritedOutlineUuidSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of loadScreenwriterOutlineFavorites()) {
      const u = it.outlineUuid?.trim().toLowerCase();
      if (u) s.add(u);
    }
    return s;
  }, [favoritesRefreshKey]);

  const emptySlot = useMemo(
    () => (
      <ScreenwriterDrawCard
        onStart={(prompt) => {
          chatRef.current?.emitUserMessage(prompt);
        }}
      />
    ),
    []
  );

  const renderAssistantContent = useCallback(
    (args: SidePanelAssistantContentRenderArgs) => {
      const streaming = args.status === 'loading' || args.status === 'updating';
      const segments = splitStorySegments(args.content);
      const storyCount = segments.filter((seg) => seg.type === 'story').length;
      const storySeeds = parseStorySeedFieldsStreaming(args.content);

      const snap = args.conversationBubbleSnapshot ?? [];
      const bIdx =
        typeof args.bubbleMessageIndex === 'number' ? args.bubbleMessageIndex : -1;
      const rawDrawBrief =
        bIdx >= 0 ? findLatestDrawBriefBeforeBubble(snap, bIdx) : '';

      const outlineParsed = parseScreenwriterOutlineFromAssistant(args.content);

      if (outlineParsed) {
        const outlineAppendixMeta =
          bIdx >= 0 ? resolveOutlineFavoriteAppendixSources(snap, bIdx) : null;
        const favoriteAppendix = outlineAppendixMeta
          ? composeOutlineFavoriteAppendix(
              outlineAppendixMeta.drawBrief,
              outlineAppendixMeta.storySeedBlock
            )
          : '';

        return (
          <Flex vertical gap={14} style={{ width: '100%' }}>
            {outlineParsed.prose ? (
              <div className="screenwriter-assistant-md">
                <ScreenwriterAssistantMarkdown content={outlineParsed.prose} streaming={streaming} />
              </div>
            ) : null}
            <OutlinePanelA2ui
              panel={outlineParsed.panel}
              outlineProse={outlineParsed.prose}
              fullAssistantContent={args.content}
              favoritedOutlineUuidSet={favoritedOutlineUuidSet}
              onRegenerate={() =>
                chatRef.current?.emitUserMessage(buildRegenerateOutlinePrompt(outlineParsed.prose))
              }
              onFavorite={() => {
                const r = toggleScreenwriterOutlineFavorite({
                  prose: outlineParsed.prose,
                  panel: outlineParsed.panel,
                  fullContent: args.content,
                  favoriteAppendix: favoriteAppendix || undefined,
                  sourceConversationKey: convMeta.activeKey,
                });
                setFavoritesRefreshKey((v) => v + 1);
                message.success(r.favorited ? '已收藏大纲' : '已取消收藏');
              }}
              onCreateProject={() => {
                setCreateSuggestedName(outlineParsed.panel.storyName);
                setCreateOutlineMarkdown(outlineParsed.prose);
                setCreateProjectModalOpen(true);
              }}
            />
            {streaming ? <StorySeedStreamingPlaceholder variant="footer" /> : null}
          </Flex>
        );
      }

      if (streaming && looksLikeOutlineJsonStreaming(args.content)) {
        const partial = proseBeforeLastJsonFenceOpening(args.content);
        return (
          <Flex vertical gap={14} style={{ width: '100%' }}>
            {partial ? (
              <div className="screenwriter-assistant-md">
                <ScreenwriterAssistantMarkdown content={partial} streaming />
              </div>
            ) : null}
            <StorySeedStreamingPlaceholder variant="footer" />
          </Flex>
        );
      }

      if (storySeeds.length > 0) {
        const leadText = segments
          .filter((seg) => seg.type === 'text')
          .map((seg) => seg.content.trim())
          .filter(Boolean)
          .join('\n\n');
        return (
          <Flex vertical gap={14} style={{ width: '100%' }}>
            {leadText ? (
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'rgba(255,255,255,0.88)',
                  lineHeight: 1.8,
                }}
              >
                {leadText}
              </div>
            ) : null}
            <StorySeedA2uiDeck
              seeds={storySeeds}
              sourceConversationKey={convMeta.activeKey}
              rawDrawBrief={rawDrawBrief}
              favoritedSeedUuidSet={favoritedSeedUuidSet}
              onFavoriteChange={() => setFavoritesRefreshKey((v) => v + 1)}
              onGenerateOutline={(prompt) => chatRef.current?.emitUserMessage(prompt)}
            />
            {streaming ? <StorySeedStreamingPlaceholder variant="footer" /> : null}
          </Flex>
        );
      }

      if (streaming && looksLikeJsonStoryOutput(args.content)) {
        return <StorySeedStreamingPlaceholder />;
      }

      if (storyCount > 0) {
        return (
          <Flex vertical gap={14} style={{ width: '100%' }}>
            {segments.map((seg) => (
              <div key={seg.key}>
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: 'rgba(255,255,255,0.88)',
                    lineHeight: 1.8,
                  }}
                >
                  {seg.content}
                </div>
                {seg.type === 'story' && (
                  <ScreenwriterStoryToolPanel
                    content={seg.content}
                    rawDrawBrief={rawDrawBrief}
                    sourceConversationKey={convMeta.activeKey}
                    onFavoriteChange={() => setFavoritesRefreshKey((v) => v + 1)}
                    onGenerateOutline={(prompt) => chatRef.current?.emitUserMessage(prompt)}
                  />
                )}
              </div>
            ))}
          </Flex>
        );
      }

      return args.defaultNode;
    },
    [convMeta.activeKey, favoritedOutlineUuidSet, favoritedSeedUuidSet]
  );

  return (
    <div className="screenwriter-ai-draw-root">
      <aside className="screenwriter-ai-draw-aside">
        <div className="screenwriter-ai-draw-sidebar-actions">
          <Button
            block
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => chatRef.current?.newConversation()}
          >
            新建对话
          </Button>
          <Button
            block
            icon={<StarOutlined />}
            onClick={() => setFavoritesOpen(true)}
          >
            我的收藏
          </Button>
        </div>
        <Typography.Text type="secondary" className="screenwriter-history-conv-heading">
          历史对话
        </Typography.Text>
        <ScreenwriterHistoryConversations
          items={convMeta.items}
          activeKey={convMeta.activeKey}
          onActiveChange={(key) => {
            if (key === convMeta.activeKey) return;
            chatRef.current?.selectConversation(key);
          }}
          onRenameRequest={openRename}
          onDeleteRequest={requestDeleteConversation}
          onTogglePin={toggleConversationPin}
        />
      </aside>
      <main className="screenwriter-ai-draw-main">
        <AIChat
          ref={chatRef}
          mode="SidePanel"
          agentKey="novel"
          allowAgentSwitch={false}
          disableAttachmentsHeader
          sidePanelOnClose={() => navigate(-1)}
          models={models}
          conversationListLabelDefault="新对话"
          deriveConversationTitle={deriveNovelDesignConversationTitle}
          projectPrompt={drawProjectPrompt}
          storageKeySuffix="screenwriter-draw"
          onConversationListChange={onConversationListChange}
          prepareGenStoriesCardComponent={ScreenwriterDrawCard}
          sidePanelExternalConversationControl
          sidePanelEmptyExtras={emptySlot}
          sidePanelAssistantContentRender={renderAssistantContent}
        />
      </main>
      <ScreenwriterFavoritesModal
        open={favoritesOpen}
        refreshKey={favoritesRefreshKey}
        onClose={() => setFavoritesOpen(false)}
        onGenerateOutline={(prompt) => chatRef.current?.emitUserMessageInNewConversation(prompt)}
      />
      <CreateNovelProjectModal
        open={createProjectModalOpen}
        suggestedName={createSuggestedName}
        outlineBootstrap={createOutlineMarkdown ? { outlineMarkdown: createOutlineMarkdown } : undefined}
        onNavigateToNovelWorkspace={(novelId) => navigate(`/screenwriter/novel/${novelId}`)}
        onClose={() => {
          setCreateProjectModalOpen(false);
          setCreateOutlineMarkdown(undefined);
        }}
      />
      <Modal
        title="重命名对话"
        open={renameOpen}
        onOk={submitRename}
        destroyOnHidden
        onCancel={() => {
          setRenameOpen(false);
          setRenameKey(null);
        }}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          maxLength={56}
          showCount
          autoFocus
          onPressEnter={submitRename}
          placeholder="输入对话标题"
        />
      </Modal>
    </div>
  );
}

export default function ScreenwriterAIDrawPage() {
  return <ScreenwriterAIDrawInner />;
}
