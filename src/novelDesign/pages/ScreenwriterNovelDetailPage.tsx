/**
 * 小说编写工作台：顶栏 + 三栏（集导航｜Crepe 编辑｜AI SidePanel）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Empty,
  Flex,
  Input,
  Switch,
  Splitter,
  Typography,
  App,
  Space,
  Modal,
} from 'antd';
import { ArrowLeftOutlined, MenuUnfoldOutlined, CommentOutlined } from '@ant-design/icons';

import { AIChat } from '@/components/AIChat';
import type { SidePanelAssistantContentRenderArgs } from '@/components/AIChat/AIChatSidePanel';
import type { AIChatSidePanelHandle } from '@/components/AIChat/aiChatPanelHandles';
import type { AIChatContextTag } from '@/components/AIChat/types';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { NovelCrepeEditor, type NovelCrepeEditorHandle } from '@/novelDesign/components/NovelCrepeEditor';
import { ScreenwriterAssistantMarkdown } from '@/novelDesign/components/ScreenwriterAssistantMarkdown';
import { buildNovelEditorFunctionCalls } from '@/novelDesign/AITools/novelEditorFunctionCalls';
import { NovelEditorToolA2uiBubble } from '@/novelDesign/a2ui/NovelEditorToolA2uiBubble';
import { getNovelEditorProjectPrompt } from '@/novelDesign/prompts/novelEditorProjectPrompt';
import { formatNovelEpisodeNavLabel } from '@/novelDesign/utils/novelEpisodeDisplay';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  ensureNovelWorkspace,
  renameWorkspaceTitle,
  setActiveEpisode,
  updateEpisodeMarkdown,
  upsertEpisode,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { extractNovelWritePayload, truncateUnicodeChars } from '@/novelDesign/parsers/novelBodyJsonParser';
import { hasNovelBodyWriteIntent } from '@/novelDesign/utils/novelWriteIntent';
import { useNovelAiStream } from '@/novelDesign/hooks/useNovelAiStream';
import { useWorkspaceSync } from '@/novelDesign/hooks/useWorkspaceSync';
import '@ant-design/x-markdown/themes/dark.css';
import './ScreenwriterNovelDetailPage.css';

const { Text } = Typography;

/** Sender 槽位里选中文本最长展示字符数（汉字/符号均按 Unicode 标量计） */
const SELECTION_SENDER_DISPLAY_CHARS = 6;
/** 每次发给模型的故事大纲正文上限，避免长篇大纲撑爆上下文。 */
const STORY_OUTLINE_CONTEXT_CHARS = 20000;
const CURRENT_EPISODE_CONTEXT_CHARS = 12000;
const NOVEL_BODY_WRITE_TOOL_NAMES = new Set(['novel_write_body_episode', 'novel_write_episode']);
const TOOL_EDIT_NAMES = new Set([
  'novel_replace_content',
  'novel_delete_segment',
  'novel_update_outline',
]);

export default function ScreenwriterNovelDetailPage() {
  const navigate = useNavigate();
  const { id: novelId } = useParams<{ id: string }>();
  const { message, modal } = App.useApp();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const chatRef = useRef<AIChatSidePanelHandle | null>(null);
  const novelCrepeRef = useRef<NovelCrepeEditorHandle | null>(null);
  const novelEditorMountRef = useRef<HTMLDivElement | null>(null);

  const { workspace, workspaceRef, updateWorkspace, setSnapshot: setWorkspace } = useWorkspaceSync();

  const {
    onAssistStream,
    aiStreamOverlay,
    streamPreviewMd,
    streamMaskRef,
    editorExternallyBusy,
  } = useNovelAiStream({
    workspaceRef,
    updateWorkspace,
    message,
    novelId: novelId ?? '',
  });

  const isAiRequestingRef = useRef(false);

  const wrappedOnAssistStream = useCallback(
    (payload: Parameters<typeof onAssistStream>[0]) => {
      isAiRequestingRef.current = payload.isRequesting;
      onAssistStream(payload);
    },
    [onAssistStream]
  );

  const [navQuery, setNavQuery] = useState('');
  const [novelTitleDraft, setNovelTitleDraft] = useState('');
  const [selectionPlain, setSelectionPlain] = useState('');
  /** 立即更新，发送消息时用于携带完整选区（不走 state 延迟） */
  const selectionPlainRef = useRef('');
  /** 已同步给 Sender slot 的值，防止重复触发 */
  const selectionPlainForSenderRef = useRef('');
  /** 防抖 timer：拖选过程中不刷新 Sender slot，避免 DOM 变动抢走焦点 */
  const selectionSenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [episodeNavOpen, setEpisodeNavOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);

  const [addEpOpen, setAddEpOpen] = useState(false);
  const [newEpTitle, setNewEpTitle] = useState('');

  useEffect(() => {
    if (!novelId) return;
    updateWorkspace(ensureNovelWorkspace(novelId));
    const listItem = loadNovelList().find((x) => x.id === novelId);
    setNovelTitleDraft(listItem?.title ?? '');
  }, [novelId, updateWorkspace]);

  const activeEpisode = useMemo(() => {
    if (!workspace) return null;
    return workspace.episodes.find((e) => e.id === workspace.activeEpisodeId) ?? null;
  }, [workspace]);

  /** 仅在换集或改标题时需要刷新 Sender Slot，避免正文每击键触发 slotConfig 变化抢焦点 */
  const activeEpisodeIdForTags = workspace?.activeEpisodeId ?? '';
  const activeEpisodeTitleForTags = useMemo(() => {
    if (!workspace?.activeEpisodeId) return '';
    return workspace.episodes.find((e) => e.id === workspace.activeEpisodeId)?.title ?? '';
  }, [workspace, workspace?.activeEpisodeId]);

  const remountKey = useMemo(() => {
    if (!workspace || !activeEpisode) return '0';
    return activeEpisode.id;
  }, [workspace, activeEpisode]);


  const commitNovelTitle = useCallback(() => {
    if (!novelId || !workspace) return;
    const raw = novelTitleDraft.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!raw) {
      message.warning('书名不能为空');
      return;
    }
    const list = loadNovelList();
    const item = list.find((x) => x.id === novelId);
    const now = new Date().toISOString();
    const merged: NovelWorkspaceItem =
      item ?
        { ...item, title: raw, updatedAt: now }
      : {
          id: novelId,
          title: raw,
          genres: [],
          coverDataUrl: null,
          updatedAt: now,
          createdAt: now,
        };
    upsertNovel(merged);
    const nextWs = renameWorkspaceTitle(workspace, raw);
    setWorkspace(nextWs);
    message.success('书名已保存');
  }, [novelId, novelTitleDraft, workspace, message]);

  const selectEpisode = useCallback((episodeId: string) => {
    setWorkspace((w) => (w ? setActiveEpisode(w, episodeId) : w));
    selectionPlainRef.current = '';
    selectionPlainForSenderRef.current = '';
    if (selectionSenderTimerRef.current !== null) {
      clearTimeout(selectionSenderTimerRef.current);
      selectionSenderTimerRef.current = null;
    }
    setSelectionPlain('');
  }, []);

  const onEditorMarkdownChange = useCallback(
    (md: string) => {
      setWorkspace((w) => {
        if (!w || !activeEpisode) return w;
        return updateEpisodeMarkdown(w, activeEpisode.id, md, false);
      });
    },
    [activeEpisode]
  );

  const onSelectionPlain = useCallback((text: string) => {
    const next = text.trim();
    // 立即更新 ref，保证发送时能读到最新选区
    selectionPlainRef.current = next;
    // 取消旧的防抖
    if (selectionSenderTimerRef.current !== null) {
      clearTimeout(selectionSenderTimerRef.current);
      selectionSenderTimerRef.current = null;
    }
    if (!next) {
      // 选区清空：立即同步，避免 tag 残留
      if (selectionPlainForSenderRef.current !== '') {
        selectionPlainForSenderRef.current = '';
        setSelectionPlain('');
      }
      return;
    }
    // 选区建立 / 变化：防抖 300ms，用户停手后才刷新 Sender slot
    // 这段延迟内 Sender DOM 不变，ProseMirror 不会在拖选过程中失去焦点
    selectionSenderTimerRef.current = setTimeout(() => {
      selectionSenderTimerRef.current = null;
      const stable = selectionPlainRef.current; // 取防抖结束时的最新值
      if (stable === selectionPlainForSenderRef.current) return;
      selectionPlainForSenderRef.current = stable;
      setSelectionPlain(stable);
    }, 300);
  }, []);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat || !activeEpisodeIdForTags) return;
    const epLine = `「${activeEpisodeTitleForTags}」`;
    const tags: AIChatContextTag[] =
      selectionPlain.trim() ?
        [
          { id: 'novel_ctx_episode', description: `${epLine}` },
          {
            id: 'novel_ctx_selection',
            description: `选中文本：「${truncateUnicodeChars(selectionPlain, SELECTION_SENDER_DISPLAY_CHARS)}」`,
          },
        ]
      : [{ id: 'novel_ctx_episode', description: `${epLine}` }];
    chat.updateGlobalContext({ replace: true, contextTags: tags });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 勿依赖全文内容，避免编辑时反复刷新 Sender
  }, [activeEpisodeIdForTags, activeEpisodeTitleForTags, selectionPlain]);

  const formatNovelContextTags = useCallback((_tags: AIChatContextTag[]) => {
    if (isAiRequestingRef.current) return '';
    const ws = workspaceRef.current;
    if (!ws) return '';
    const ep = ws.episodes.find((e) => e.id === ws.activeEpisodeId);
    const outline = ws.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
    const parts: string[] = [];
    if (outline) {
      const md = outline.contentMarkdown.trim();
      const body =
        md.length > STORY_OUTLINE_CONTEXT_CHARS ?
          `${md.slice(0, STORY_OUTLINE_CONTEXT_CHARS)}\n…（故事大纲已截断）`
        : md;
      parts.push(`【故事大纲】\n${body || '（故事大纲为空）'}`);
    }
    if (ep) {
      const md = ep.contentMarkdown.trim();
      if (ep.id !== NOVEL_OUTLINE_EPISODE_ID) {
        const body =
          md.length > CURRENT_EPISODE_CONTEXT_CHARS ?
            `${md.slice(0, CURRENT_EPISODE_CONTEXT_CHARS)}\n…（正文已截断）`
          : md;
        parts.push(`【当前编辑】${ep.title}\n${body || '（正文为空）'}`);
      }
    }
    const sel = selectionPlainRef.current.trim();
    if (sel) parts.push(`【选中文本】\n${sel}`);
    return parts.join('\n\n');
  }, []);

  const filteredEpisodes = useMemo(() => {
    if (!workspace) return [];
    const q = navQuery.trim().toLowerCase();
    const eps = [...workspace.episodes].sort((a, b) => a.order - b.order);
    if (!q) return eps;
    return eps.filter((e) => {
      const nav = formatNovelEpisodeNavLabel(e).toLowerCase();
      return (
        nav.includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.contentMarkdown.toLowerCase().includes(q)
      );
    });
  }, [workspace, navQuery]);

  const openAddEpisode = () => {
    setNewEpTitle('');
    setAddEpOpen(true);
  };

  const confirmAddEpisode = () => {
    if (!workspace) return;
    const title = newEpTitle.replace(/\s+/g, ' ').trim().slice(0, 56);
    const { snapshot } = upsertEpisode(workspace, title ? { title } : {});
    setWorkspace(snapshot);
    setAddEpOpen(false);
    message.success('已添加新的一集');
  };

  const requestDeleteEpisodeConfirm = useCallback((episodeId: string, title: string) => {
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: '删除该集？',
        content: `确定删除「${title || episodeId}」吗？删除后不可恢复。`,
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);

  const requestDeleteEpisodesConfirm = useCallback(
    (items: Array<{ episodeId: string; episode: number; title: string }>) => {
      return new Promise<boolean>((resolve) => {
        const sorted = [...items].sort((a, b) => a.episode - b.episode);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const rangeTitle =
          first && last && first.episode !== last.episode ?
            `第${first.episode}集至第${last.episode}集`
          : first ? `第${first.episode}集`
          : '所选集';
        modal.confirm({
          title: `删除${rangeTitle}？`,
          content: `将删除${rangeTitle}，共 ${sorted.length} 集。删除后不可恢复。`,
          okText: `删除 ${sorted.length} 集`,
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
    },
    [modal]
  );

  const novelEditorExtraFunctionCalls = useMemo(() => {
    if (!novelId) return [];
    return buildNovelEditorFunctionCalls({
      getSnapshot: () => workspaceRef.current,
      setSnapshot: setWorkspace,
      novelId,
      requestDeleteEpisodeConfirm,
      requestDeleteEpisodesConfirm,
    });
  }, [novelId, requestDeleteEpisodeConfirm, requestDeleteEpisodesConfirm, setWorkspace]);

  const novelProjectPrompt = useMemo(() => {
    if (!workspace) return getNovelEditorProjectPrompt([]);
    const eps = [...workspace.episodes]
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        id: e.id,
        editor_title: e.title,
        nav_label: formatNovelEpisodeNavLabel(e),
        episode: e.id === NOVEL_OUTLINE_EPISODE_ID ? null : (e.episode ?? null),
        order: e.order,
        isOutline: e.id === NOVEL_OUTLINE_EPISODE_ID,
      }));
    return getNovelEditorProjectPrompt(eps);
  }, [workspace]);

  const novelChat = (
    <AIChat
      ref={chatRef}
      mode="SidePanel"
      agentKey="novel"
      allowAgentSwitch={false}
      disableAttachmentsHeader
      models={models}
      projectPrompt={novelProjectPrompt}
      extraFunctionCalls={novelEditorExtraFunctionCalls}
      storageKeySuffix={`novel-workspace:${novelId ?? 'unknown'}`}
      senderPlaceholder="输入改写、续写、生成等需求；可按 Shift+Enter 换行"
      suppressAgentSenderWelcome
      suppressSenderAgentSkill
      formatContextTags={formatNovelContextTags}
      onAssistStream={wrappedOnAssistStream}
      renderToolMessageContent={(toolContent, meta) => (
        <NovelEditorToolA2uiBubble raw={toolContent} toolName={meta?.toolName} />
      )}
      sidePanelAssistantContentRender={({
        toolCallNames,
        status,
        bubbleMessageIndex,
        conversationBubbleSnapshot,
        content,
        defaultNode,
      }: SidePanelAssistantContentRenderArgs) => {
        const hasEditTool = toolCallNames?.some((name) => TOOL_EDIT_NAMES.has(name)) ?? false;
        if (hasEditTool && (status === 'loading' || status === 'updating')) {
          const raw = JSON.stringify({
            ok: true,
            phase: 'writing',
            title_in_editor: activeEpisodeTitleForTags || activeEpisode?.title || '当前章节',
            summary: '正在生成文档...',
          });
          return <NovelEditorToolA2uiBubble raw={raw} toolName={toolCallNames?.[0]} />;
        }
        const hasBodyWriteTool = toolCallNames?.some((name) => NOVEL_BODY_WRITE_TOOL_NAMES.has(name));
        const parsedContent = extractNovelWritePayload(content);
        const asPlain = parsedContent.displayText.replace(/\s+/g, ' ').trim();
        let prevUser = '';
        if (
          asPlain &&
          typeof bubbleMessageIndex === 'number' &&
          conversationBubbleSnapshot?.length
        ) {
          for (let i = bubbleMessageIndex - 1; i >= 0; i--) {
            const row = conversationBubbleSnapshot[i];
            if (row?.role === 'user') {
              prevUser = row.content.replace(/\s+/g, ' ').trim();
              break;
            }
          }
          if (prevUser && prevUser === asPlain) return null;
        }
        const prevUserIsWriteIntent = prevUser ? hasNovelBodyWriteIntent(prevUser) : false;
        const renderWriteCard = (phase: 'writing' | 'done') => {
          const raw = JSON.stringify({
            ok: true,
            phase,
            title_in_editor: activeEpisodeTitleForTags || activeEpisode?.title || '当前章节',
            ...(phase === 'done' ?
              {
                created_time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                summary: '正文已写入编辑器。',
              }
            : { summary: '正在生成文档...' }),
          });
          return <NovelEditorToolA2uiBubble raw={raw} toolName={toolCallNames?.[0]} />;
        };
        const renderPrePostWithCard = (phase: 'writing' | 'done') => (
          <Flex vertical gap={8}>
            {parsedContent.preMarkerContent ? <ScreenwriterAssistantMarkdown content={parsedContent.preMarkerContent} /> : null}
            {renderWriteCard(phase)}
            {parsedContent.postMarkerContent ? <ScreenwriterAssistantMarkdown content={parsedContent.postMarkerContent} /> : null}
          </Flex>
        );
        if (prevUserIsWriteIntent && !hasBodyWriteTool && (status === 'loading' || status === 'updating')) {
          if (!parsedContent.hasMarker) return defaultNode;
          return renderPrePostWithCard('writing');
        }
        if (prevUserIsWriteIntent && !hasBodyWriteTool && status !== 'loading' && status !== 'updating') {
          if (!parsedContent.hasMarker) return defaultNode;
          return renderPrePostWithCard('done');
        }
        if (hasBodyWriteTool) return null;
        if (parsedContent.payload) {
          if (!parsedContent.displayText) return null;
          return <ScreenwriterAssistantMarkdown content={parsedContent.displayText} />;
        }
        if (parsedContent.hasMarker) {
          return renderPrePostWithCard(status === 'loading' || status === 'updating' ? 'writing' : 'done');
        }
        return defaultNode;
      }}
    />
  );

  const renderEditorColumn = () => (
    <Flex vertical style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {aiStreamOverlay && (streamPreviewMd || editorExternallyBusy) ?
        <div className="novel-editor-stream-mask" ref={streamMaskRef}>
          <div className="novel-editor-writing-pill">撰写中...</div>
          <div className="novel-editor-stream-body">
            <ScreenwriterAssistantMarkdown content={streamPreviewMd} streaming />
          </div>
        </div>
      : activeEpisode ?
        <div
          ref={novelEditorMountRef}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <NovelCrepeEditor
            ref={novelCrepeRef}
            providerKey={remountKey}
            initialMarkdown={activeEpisode.contentMarkdown}
            readOnly={editorExternallyBusy}
            onMarkdownChange={onEditorMarkdownChange}
            onSelectionPlain={onSelectionPlain}
          />
        </div>
      : <Empty description="未选择正文" />}
    </Flex>
  );

  if (!novelId || !workspace) {
    return (
      <Flex align="center" justify="center" style={{ height: '100vh', color: 'rgba(255,255,255,0.45)' }}>
        载入中…
      </Flex>
    );
  }

  return (
    <div className="screenwriter-novel-workbench">
      <header className="screenwriter-novel-topbar">
        <Space orientation="horizontal" size={14} wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/screenwriter')}>
            返回列表
          </Button>
          <Input
            value={novelTitleDraft}
            variant="filled"
            onChange={(e) => setNovelTitleDraft(e.target.value)}
            onBlur={commitNovelTitle}
            style={{ width: 220, flex: '0 1 220px' }}
            placeholder="小说名称"
            maxLength={120}
          />
          <Flex align="center" gap={8}>
            <MenuUnfoldOutlined style={{ opacity: episodeNavOpen ? 1 : 0.55 }} />
            <Text style={{ whiteSpace: 'nowrap' }}>集导航</Text>
            <Switch checked={episodeNavOpen} size="small" onChange={(c) => setEpisodeNavOpen(c)} />
          </Flex>
          <Flex align="center" gap={8}>
            <CommentOutlined style={{ opacity: aiOpen ? 1 : 0.55 }} />
            <Text style={{ whiteSpace: 'nowrap' }}>AI 对话</Text>
            <Switch checked={aiOpen} size="small" onChange={(c) => setAiOpen(c)} />
          </Flex>
        </Space>
      </header>

      <div className="screenwriter-novel-body">
        {episodeNavOpen && aiOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel defaultSize={240} min={180} max={420} className="novel-episode-pane">
              <Flex vertical gap={10} style={{ height: '100%', padding: 12, overflow: 'hidden', minHeight: 0 }}>
                <Input.Search
                  allowClear
                  placeholder="搜索集或大纲内容…"
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                />
                <Button type="primary" block onClick={openAddEpisode}>
                  添加集
                </Button>
                <div className="novel-episode-scroll">
                  {filteredEpisodes.map((ep) => {
                    const on = workspace.activeEpisodeId === ep.id;
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        className={`novel-episode-item ${on ? 'novel-episode-item-active' : ''}`}
                        onClick={() => selectEpisode(ep.id)}
                      >
                        <span className="novel-episode-item-title">{formatNovelEpisodeNavLabel(ep)}</span>
                        {/* {ep.id !== NOVEL_OUTLINE_EPISODE_ID ?
                          <span className="novel-episode-item-sub">
                            {ellipsis(ep.contentMarkdown, 72) || '（空）'}
                          </span>
                        : null} */}
                      </button>
                    );
                  })}
                </div>
              </Flex>
            </Splitter.Panel>
            <Splitter.Panel defaultSize="58%" min="40%">
              {renderEditorColumn()}
            </Splitter.Panel>
            <Splitter.Panel defaultSize={360} min={280} max={560} className="novel-ai-pane">
              {novelChat}
            </Splitter.Panel>
          </Splitter>
        : episodeNavOpen && !aiOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel defaultSize={260} min={180} max={440} className="novel-episode-pane">
              <Flex vertical gap={10} style={{ height: '100%', padding: 12, overflow: 'hidden', minHeight: 0 }}>
                <Input.Search
                  allowClear
                  placeholder="搜索集或大纲内容…"
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                />
                <Button type="primary" block onClick={openAddEpisode}>
                  添加集
                </Button>
                <div className="novel-episode-scroll">
                  {filteredEpisodes.map((ep) => {
                    const on = workspace.activeEpisodeId === ep.id;
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        className={`novel-episode-item ${on ? 'novel-episode-item-active' : ''}`}
                        onClick={() => selectEpisode(ep.id)}
                      >
                        <span className="novel-episode-item-title">{formatNovelEpisodeNavLabel(ep)}</span>
                        {/* {ep.id !== NOVEL_OUTLINE_EPISODE_ID ?
                          <span className="novel-episode-item-sub">
                            {ellipsis(ep.contentMarkdown, 72) || '（空）'}
                          </span>
                        : null} */}
                      </button>
                    );
                  })}
                </div>
              </Flex>
            </Splitter.Panel>
            <Splitter.Panel min={320}>{renderEditorColumn()}</Splitter.Panel>
          </Splitter>
        : !episodeNavOpen && aiOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel min={320}>{renderEditorColumn()}</Splitter.Panel>
            <Splitter.Panel defaultSize={380} min={280} className="novel-ai-pane">
              {novelChat}
            </Splitter.Panel>
          </Splitter>
        : <div className="novel-editor-full">{renderEditorColumn()}</div>}
      </div>

      <Modal
        title="添加集（Episode）"
        open={addEpOpen}
        onOk={confirmAddEpisode}
        onCancel={() => setAddEpOpen(false)}
        okText="添加"
        destroyOnHidden
      >
        <Input
          placeholder="集标题（可空，自动生成）"
          value={newEpTitle}
          maxLength={56}
          onChange={(e) => setNewEpTitle(e.target.value)}
        />
      </Modal>
    </div>
  );
}
