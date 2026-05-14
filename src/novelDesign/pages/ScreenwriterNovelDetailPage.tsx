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
  Tooltip,
} from 'antd';
import { MenuUnfoldOutlined, CommentOutlined, OrderedListOutlined, AlignLeftOutlined } from '@ant-design/icons';

import { AIChat, applyRefIndicatorUserChoicePrefix } from '@/components/AIChat';
import type { SidePanelAssistantContentRenderArgs } from '@/components/AIChat/AIChatSidePanel';
import type { AIChatSidePanelHandle } from '@/components/AIChat/aiChatPanelHandles';
import type { AIChatSidePanelOnSubmit, AIChatContextTag, RefIndicatorType } from '@/components/AIChat/types';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { NovelCrepeEditor, type NovelCrepeEditorHandle } from '@/novelDesign/components/NovelCrepeEditor';
import { ScreenwriterAssistantMarkdown } from '@/novelDesign/components/ScreenwriterAssistantMarkdown';
import { buildNovelEditorFunctionCalls } from '@/novelDesign/AITools/novelEditorFunctionCalls';
import { NovelEditorThoughtChain } from '@/novelDesign/components/NovelEditorThoughtChain';
import { NextSuggestionButtons } from '@/novelDesign/components/NextSuggestionButtons';
import { extractNextSuggestions } from '@/novelDesign/parsers/nextSuggestionJsonParser';
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
import { extractNovelWritePayload } from '@/novelDesign/parsers/novelBodyJsonParser';
import { useNovelAiStream } from '@/novelDesign/hooks/useNovelAiStream';
import { useWorkspaceSync } from '@/novelDesign/hooks/useWorkspaceSync';
import { NovelCoverAiPopover } from '@/novelDesign/components/NovelCoverAiPopover';
import '@ant-design/x-markdown/themes/dark.css';
import './ScreenwriterNovelDetailPage.css';

const { Text } = Typography;

const STORY_OUTLINE_CONTEXT_CHARS = 20000;
const CURRENT_EPISODE_CONTEXT_CHARS = 12000;

/** refIndicator：当前集（切换集时仅保留本项，清空选文等其它引用） */
const NOVEL_REF_EPISODE = 'selectedEpisode';
/** refIndicator：正文选区（同集内更新选文时仅替换本 key，保留集项） */
const NOVEL_REF_SELECTION = 'selectedText';

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

  const lastUserMsgIdRef = useRef<string | number>('');
  const contextSentThisTurnRef = useRef(false);

  const wrappedOnAssistStream = useCallback(
    (payload: Parameters<typeof onAssistStream>[0]) => {
      const uid = payload.lastUserMessageId;
      if (uid !== undefined && uid !== null && uid !== lastUserMsgIdRef.current) {
        lastUserMsgIdRef.current = uid;
        contextSentThisTurnRef.current = false;
      }
      onAssistStream(payload);
    },
    [onAssistStream]
  );

  const [navQuery, setNavQuery] = useState('');
  const [novelTitleDraft, setNovelTitleDraft] = useState('');
  const [selectionPlain, setSelectionPlain] = useState('');
  /** 立即更新，发送消息时用于携带完整选区（不走 state 延迟） */
  const selectionPlainRef = useRef('');
  /** 已同步给 refIndicator 防抖结束值，防止重复触发 setState */
  const selectionPlainForSenderRef = useRef('');
  /** 防抖 timer：拖选过程中不刷新 refIndicator，避免 DOM 变动抢走焦点 */
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

  /** 仅在换集或改标题时参与 refIndicator 同步，避免正文每击键触发 */
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

  const novelAiOnSubmit: AIChatSidePanelOnSubmit = useCallback(
    (message, _slotConfig, _skill, refIndicator) => ({
      message: applyRefIndicatorUserChoicePrefix(message, refIndicator),
    }),
    []
  );

  useEffect(() => {
    const chat = chatRef.current;
    const ws = workspaceRef.current;
    if (!chat || !ws) return;
    const ep = ws.episodes.find((e) => e.id === ws.activeEpisodeId);
    if (!ep) return;
    const episodeItem: RefIndicatorType = {
      key: NOVEL_REF_EPISODE,
      description: '选中的集：%f',
      icon: <OrderedListOutlined />,
      content: formatNovelEpisodeNavLabel(ep),
    };
    const fullSel = selectionPlainRef.current.trim();
    if (!fullSel) {
      chat.setRefIndicator([episodeItem]);
      return;
    }
    chat.setRefIndicator([
      episodeItem,
      {
        key: NOVEL_REF_SELECTION,
        description: '选中文本：%f',
        icon: <AlignLeftOutlined />,
        content: fullSel,
      },
    ]);
  }, [workspace?.activeEpisodeId, activeEpisodeTitleForTags, selectionPlain]);

  const formatNovelContextTags = useCallback((_tags: AIChatContextTag[]) => {
    if (contextSentThisTurnRef.current) return '';
    contextSentThisTurnRef.current = true;
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

  const suggestionMessages: Record<string, string> = useMemo(() => ({
    '新增一集': '根据故事大纲和当前剧情，新增一集小说。先查看最后一集是否已完成，未完成则继续完成，已完成则创建新集',
    '续写当前内容': '从当前章节末尾自然续写，保持人称、时态与原有文风，追加到当前集',
    '重写本集': '重写当前章节，换个表达方式但保留核心情节走向，替换当前集内容',
    '润色润稿': '润色当前章节，提升流畅度与画面感，不要改变原意，替换当前集内容',
    '扩写细写': '将当前章节扩写，补充环境描写、心理活动或动作细节，替换当前集内容',
    '精简压缩': '将当前章节压缩为更短篇幅，保留关键情节与情绪，替换当前集内容',
    '优化对白': '优化当前章节的人物对白，使其更符合人设、有潜台词，替换当前集内容',
    '加强冲突': '在当前章节中加强戏剧冲突，替换当前集内容',
  }), []);

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
      onSubmit={novelAiOnSubmit}
      onAssistStream={wrappedOnAssistStream}
      renderToolMessageContent={() => null}
      sidePanelAssistantContentRender={({
        toolCallNames,
        status,
        bubbleMessageIndex,
        conversationBubbleSnapshot,
        content,
        defaultNode,
      }: SidePanelAssistantContentRenderArgs) => {
        const isStreaming = status === 'loading' || status === 'updating';

        const bubbleToolResults: string[] = [];
        if (
          conversationBubbleSnapshot?.length &&
          typeof bubbleMessageIndex === 'number' &&
          (toolCallNames?.length ?? 0) > 0
        ) {
          for (let i = bubbleMessageIndex + 1; i < conversationBubbleSnapshot.length; i++) {
            const row = conversationBubbleSnapshot[i];
            if (row?.role === 'tool') {
              bubbleToolResults.push(row.content);
            } else if (row?.role === 'user' || row?.role === 'assistant') {
              break;
            }
          }
        }

        const toolChainNodes =
          toolCallNames?.length
            ? toolCallNames.map((name, i) => (
                <NovelEditorThoughtChain
                  key={`${name}_${bubbleMessageIndex}_${i}`}
                  toolCallNames={[name]}
                  toolResultContents={[bubbleToolResults[i] ?? '']}
                  streaming={isStreaming}
                />
              ))
            : null;

        const parsedContent = extractNovelWritePayload(content);
        const nsDisplay = extractNextSuggestions(parsedContent.displayText);
        const nsPre = extractNextSuggestions(parsedContent.preMarkerContent || '');
        const nsPost = extractNextSuggestions(parsedContent.postMarkerContent || '');
        const mergedSuggestionLabels = [
          ...new Set([...nsDisplay.suggestions, ...nsPre.suggestions, ...nsPost.suggestions]),
        ];
        const suggestionNodes =
          mergedSuggestionLabels.length > 0 ? (
            <NextSuggestionButtons
              suggestions={mergedSuggestionLabels}
              onSuggestionClick={(label) => {
                const msg = suggestionMessages[label] ?? label;
                chatRef.current?.emitUserMessage(msg);
              }}
            />
          ) : null;

        const finalDisplayText = nsDisplay.displayText;
        const asPlain =
          [nsPre.displayText, nsPost.displayText, nsDisplay.displayText]
            .filter((x) => x.trim())
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim() || finalDisplayText.replace(/\s+/g, ' ').trim();
        let prevUser = '';
        if (asPlain && typeof bubbleMessageIndex === 'number' && conversationBubbleSnapshot?.length) {
          for (let i = bubbleMessageIndex - 1; i >= 0; i--) {
            const row = conversationBubbleSnapshot[i];
            if (row?.role === 'user') {
              prevUser = row.content.replace(/\s+/g, ' ').trim();
              break;
            }
          }
          if (prevUser && prevUser === asPlain) return null;
        }

        if (parsedContent.payload) {
          if (!finalDisplayText && !suggestionNodes) return null;
          return (
            <Flex vertical gap={8}>
              {finalDisplayText ? <ScreenwriterAssistantMarkdown content={finalDisplayText} /> : null}
              {toolChainNodes}
              {suggestionNodes}
            </Flex>
          );
        }

        if (parsedContent.hasMarker) {
          const isWriting = isStreaming;
          const writeLine = isWriting ? '⏳ 正在写入编辑器…' : '✅ 正文已写入编辑器';
          const preMd = nsPre.displayText;
          const postMd = nsPost.displayText;
          return (
            <Flex vertical gap={8}>
              {preMd ? <ScreenwriterAssistantMarkdown content={preMd} /> : null}
              <span style={{ fontSize: 12, color: 'rgba(120,220,160,0.9)' }}>{writeLine}</span>
              {postMd ? <ScreenwriterAssistantMarkdown content={postMd} /> : null}
              {toolChainNodes}
              {suggestionNodes}
            </Flex>
          );
        }

        if (toolChainNodes || suggestionNodes) {
          const assistantBodyWithoutSuggestions =
            mergedSuggestionLabels.length > 0 ? extractNextSuggestions(content).displayText : null;
          return (
            <Flex vertical gap={8}>
              {assistantBodyWithoutSuggestions !== null ? (
                <ScreenwriterAssistantMarkdown content={assistantBodyWithoutSuggestions} />
              ) : (
                defaultNode
              )}
              {toolChainNodes}
              {suggestionNodes}
            </Flex>
          );
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
          <Tooltip title="返回列表">
            <Button type="text" icon={<i className="iconfont">&#xe930;</i>} onClick={() => navigate('/screenwriter')}>
              <i className="iconfont">&#xe647;</i>
            </Button>
          </Tooltip>
          <Input
            value={novelTitleDraft}
            variant="filled"
            onChange={(e) => setNovelTitleDraft(e.target.value)}
            onBlur={commitNovelTitle}
            style={{ width: 220, flex: '0 1 220px' }}
            placeholder="小说名称"
            maxLength={120}
          />
          <Tooltip title="设置封面">
            <NovelCoverAiPopover
              novelId={novelId}
              models={models}
              getSnapshot={() => workspaceRef.current}
              onCoverSaved={() => message.success('封面已更新')}
              trigger={
                <Button type="text">
                  <i className="iconfont">&#xe988;</i>
                </Button>
              }
            />
          </Tooltip>
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
