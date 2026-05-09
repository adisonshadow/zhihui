/**
 * AI 流式写入管理 Hook。
 *
 * 职责：
 * 1. 监听 AI onAssistStream 回调，检测用户写意图
 * 2. 管理流式遮罩层（撰写中预览）的显隐和内容
 * 3. AI 完成回复后将正文保存到 workspace
 *
 * 状态机：idle → pending_stream → stream_detected → saving → idle
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findBodyEpisodeByEpisodeNumber,
  setActiveEpisode,
  updateEpisodeMarkdown,
  upsertEpisode,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  extractNovelWritePayload,
  getBestBodyContent,
  getBestTargetN,
  type ParsedNovelWritePayload,
} from '@/novelDesign/parsers/novelBodyJsonParser';
import {
  hasNovelBodyWriteIntent,
  inferNovelBodyWriteMode,
  resolveNovelStreamWriteTarget,
} from '@/novelDesign/utils/novelWriteIntent';

const NOVEL_CREATE_EPISODE_TOOL_NAME = 'novel_create_episode_and_open';
const NOVEL_OUTLINE_EPISODE_ID = '__story_outline__';

const TOOL_EDIT_NAMES = new Set([
  'novel_replace_content',
  'novel_delete_segment',
  'novel_update_outline',
]);

interface AssistStreamPayload {
  isRequesting: boolean;
  lastAssistantPlain: string;
  lastUserPlain: string;
  lastUserMessageId?: string | number;
  assistantStreaming: boolean;
  toolCallsPending: boolean;
  toolCallNamesAfterLastUser: string[];
}

interface AiWritePending {
  targetEpisodeId: string | null;
  mode: 'append' | 'replace';
  baselineMarkdown: string;
  userPrompt: string;
}

type AiWritePhase = 'idle' | 'pending_stream' | 'stream_detected' | 'saving';

/**
 * 保存一条 AI 生成的正文到 workspace。
 * 纯函数逻辑，可单元测试。
 */
export function saveWritePayload(
  snapshot: NovelWorkspaceSnapshot,
  bodyContent: string,
  targetN: number | null,
  parsed: ParsedNovelWritePayload,
  pending: AiWritePending,
  hasCreateEpisodeToolInTurn: boolean
): { snapshot: NovelWorkspaceSnapshot; targetEpisodeId: string } | { error: string } {
  let next = snapshot;
  let targetEpisodeId = pending.targetEpisodeId;

  if (targetN != null && targetN >= 1) {
    const hit = findBodyEpisodeByEpisodeNumber(next, targetN);
    if (hit) {
      targetEpisodeId = hit.id;
    } else {
      const title = parsed.payload?.title?.trim() || `第${targetN}集`;
      const created = upsertEpisode(next, {
        title,
        contentMarkdown: '',
      });
      next = created.snapshot;
      targetEpisodeId = created.episode.id;
    }
  }

  if (!targetEpisodeId && hasCreateEpisodeToolInTurn) {
    const active = next.episodes.find((e) => e.id === next.activeEpisodeId);
    targetEpisodeId = active && active.id !== NOVEL_OUTLINE_EPISODE_ID ? active.id : null;
  }

  if (!targetEpisodeId) {
    return { error: '未找到可写入的目标集；新增集必须先由 AI 调用新建集工具。' };
  }

  if (parsed.payload?.title?.trim()) {
    next = upsertEpisode(next, { id: targetEpisodeId, title: parsed.payload.title }).snapshot;
  }

  const mode = parsed.payload?.mode === 'append' ? 'append' : pending.mode;
  const currentContent = next.episodes.find((e) => e.id === targetEpisodeId)?.contentMarkdown ?? '';
  const effectiveMode = !currentContent.trim() ? 'append' : mode;
  const base = effectiveMode === 'append'
    ? (next.episodes.find((e) => e.id === targetEpisodeId)?.contentMarkdown ?? pending.baselineMarkdown)
    : '';
  const fin = effectiveMode === 'append' ? `${base}\n\n${bodyContent}`.trim() : bodyContent;

  if (next.activeEpisodeId !== targetEpisodeId) {
    next = setActiveEpisode(next, targetEpisodeId);
  }
  next = updateEpisodeMarkdown(next, targetEpisodeId, fin, true);

  return { snapshot: next, targetEpisodeId };
}

export function useNovelAiStream(options: {
  workspaceRef: { current: NovelWorkspaceSnapshot | null };
  updateWorkspace: (snap: NovelWorkspaceSnapshot | ((prev: NovelWorkspaceSnapshot | null) => NovelWorkspaceSnapshot | null)) => void;
  message: { warning: (msg: string) => void; info: (msg: string) => void; success: (msg: string) => void };
  novelId: string;
}) {
  const { workspaceRef, updateWorkspace, message } = options;

  /* ---- 状态机 ---- */
  const [phase, setPhase] = useState<AiWritePhase>('idle');
  const [streamPreviewMd, setStreamPreviewMd] = useState('');
  const streamMaskRef = useRef<HTMLDivElement | null>(null);

  const aiStreamOverlay = phase === 'pending_stream' || phase === 'stream_detected';
  const editorExternallyBusy = aiStreamOverlay;

  /* ---- 内部追踪 ref（需要同一 tick 读取，不用 state） ---- */
  const prevRequestingRef = useRef(false);
  const aiPendingRef = useRef<AiWritePending | null>(null);
  const turnTouchedWriteToolRef = useRef(false);
  const turnUserPromptRef = useRef('');

  /* ---- 自动滚到底部 ---- */
  useEffect(() => {
    if (!aiStreamOverlay || !streamPreviewMd) return;
    const el = streamMaskRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [streamPreviewMd, aiStreamOverlay]);

  /* ---- 核心回调 ---- */
  const onAssistStream = useCallback(
    (payload: AssistStreamPayload) => {
      const wsInner = workspaceRef.current;
      if (!wsInner) return;

      const started = payload.isRequesting && !prevRequestingRef.current;
      const ended = !payload.isRequesting && prevRequestingRef.current;
      prevRequestingRef.current = payload.isRequesting;

      const hasCreateEpisodeToolInTurn = payload.toolCallNamesAfterLastUser.includes(NOVEL_CREATE_EPISODE_TOOL_NAME);
      const hasWriteToolsInTurn = payload.toolCallNamesAfterLastUser.some((name) => TOOL_EDIT_NAMES.has(name));
      const user = payload.lastUserPlain.trim();
      const userTurnKey = payload.lastUserMessageId != null ? String(payload.lastUserMessageId) : user;

      /* 新轮次重置 */
      if (started && userTurnKey !== turnUserPromptRef.current) {
        turnUserPromptRef.current = userTurnKey;
        turnTouchedWriteToolRef.current = false;
      }
      if (hasWriteToolsInTurn) {
        turnTouchedWriteToolRef.current = true;
      }

      /* 写工具接管 → 取消流式写入 */
      if (hasWriteToolsInTurn && aiPendingRef.current) {
        aiPendingRef.current = null;
        setPhase('idle');
        setStreamPreviewMd('');
      }

      /* ----- 每轮首次：检测写意图，建立 pending ----- */
      if (payload.isRequesting && !aiPendingRef.current) {
        if (turnTouchedWriteToolRef.current) {
          setPhase('idle');
          setStreamPreviewMd('');
          return;
        }
        if (!hasNovelBodyWriteIntent(user)) {
          setPhase('idle');
          setStreamPreviewMd('');
          return;
        }

        const resolved = resolveNovelStreamWriteTarget(user, wsInner);
        let snap = resolved.snapshot;
        const targetId = resolved.targetEpisodeId;
        if (targetId && targetId !== NOVEL_OUTLINE_EPISODE_ID && snap.activeEpisodeId !== targetId) {
          snap = setActiveEpisode(snap, targetId);
        }
        if (snap !== wsInner) {
          workspaceRef.current = snap;
          updateWorkspace(snap);
        }

        const baseline = targetId
          ? (snap.episodes.find((e) => e.id === targetId)?.contentMarkdown ?? '')
          : '';

        aiPendingRef.current = {
          targetEpisodeId: targetId,
          mode: inferNovelBodyWriteMode(user),
          baselineMarkdown: baseline,
          userPrompt: user,
        };
        setPhase('pending_stream');
      }

      /* ----- 流式预览：检测 novel-body-json marker ----- */
      const pending = aiPendingRef.current;
      if (pending && payload.isRequesting && !payload.toolCallsPending && !hasWriteToolsInTurn) {
        const parsed = extractNovelWritePayload(payload.lastAssistantPlain);
        if (parsed.hasMarker) {
          let targetEpisodeId = pending.targetEpisodeId;
          let wsForTarget = workspaceRef.current;
          if (!targetEpisodeId && parsed.streamTargetN && wsForTarget) {
            targetEpisodeId = findBodyEpisodeByEpisodeNumber(wsForTarget, parsed.streamTargetN)?.id ?? null;
          }
          if (!targetEpisodeId && hasCreateEpisodeToolInTurn && wsForTarget) {
            const active = wsForTarget.episodes.find((e) => e.id === wsForTarget.activeEpisodeId);
            targetEpisodeId = active && active.id !== NOVEL_OUTLINE_EPISODE_ID ? active.id : null;
          }
          if (!targetEpisodeId) {
            setPhase('idle');
            setStreamPreviewMd('');
            return;
          }
          if (targetEpisodeId !== pending.targetEpisodeId && wsForTarget) {
            const baseline = wsForTarget.episodes.find((e) => e.id === targetEpisodeId)?.contentMarkdown ?? '';
            aiPendingRef.current = { ...pending, targetEpisodeId, baselineMarkdown: baseline };
          }
          const baselineMarkdown =
            wsForTarget?.episodes.find((e) => e.id === targetEpisodeId)?.contentMarkdown ?? pending.baselineMarkdown;
          const streamingBody = parsed.streamContentMarkdown;
          const preview =
            pending.mode === 'append'
              ? `${baselineMarkdown}\n\n${streamingBody}`.trim()
              : streamingBody.trim();
          setPhase('stream_detected');
          setStreamPreviewMd(preview);
        } else {
          setPhase('idle');
          setStreamPreviewMd('');
        }
      }

      /* ----- AI 结束回复：保存正文 ----- */
      if (ended) {
        if (!aiPendingRef.current) {
          setPhase('idle');
          setStreamPreviewMd('');
          return;
        }

        const pend = aiPendingRef.current;
        aiPendingRef.current = null;
        setPhase('idle');
        setStreamPreviewMd('');

        if (turnTouchedWriteToolRef.current) return;
        if (payload.toolCallsPending || hasWriteToolsInTurn) return;

        const parsed = extractNovelWritePayload(payload.lastAssistantPlain);
        const body = getBestBodyContent(parsed);

        if (!body) {
          message.warning('AI 未返回正文内容');
          return;
        }

        const currentSnapshot = workspaceRef.current;
        if (!currentSnapshot) return;

        const targetN = getBestTargetN(parsed);
        const result = saveWritePayload(
          { ...currentSnapshot },
          body,
          targetN,
          parsed,
          pend,
          hasCreateEpisodeToolInTurn
        );

        if ('error' in result) {
          message.warning(result.error);
          return;
        }

        workspaceRef.current = result.snapshot;
        updateWorkspace(result.snapshot);
      }
    },
    [workspaceRef, updateWorkspace, message]
  );

  return {
    onAssistStream,
    aiStreamOverlay,
    streamPreviewMd,
    streamMaskRef,
    editorExternallyBusy,
  };
}
