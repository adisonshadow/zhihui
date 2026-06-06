/**
 * 有声书编辑工作台：只读小说 + Audiobook 片段 + AI
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Empty,
  Flex,
  Input,
  Modal,
  Switch,
  Splitter,
  Typography,
  App,
  Space,
  Radio,
  Tooltip,
} from 'antd';
import {
  MenuUnfoldOutlined,
  CommentOutlined,
  OrderedListOutlined,
  FileTextOutlined,
  DownloadOutlined,
} from '@ant-design/icons';

import { AIChat, applyRefIndicatorUserChoicePrefix } from '@/components/AIChat';
import type { AIChatSidePanelHandle, AIChatEmitUserMessagePayload } from '@/components/AIChat/aiChatPanelHandles';
import type { AIChatSidePanelOnSubmit, RefIndicatorType } from '@/components/AIChat/types';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { NovelCrepeEditor } from '@/novelDesign/components/NovelCrepeEditor';
import { NovelEpisodeNavReadonly } from '@/novelDesign/components/NovelEpisodeNavReadonly';
import { AudiobookEpisodePanel } from '@/audiobook/components/AudiobookEpisodePanel';
import { AudiobookOutlineVoicePanel } from '@/audiobook/components/AudiobookOutlineVoicePanel';
import { useAudiobookPlayback } from '@/audiobook/hooks/useAudiobookPlayback';
import { buildNovelEditorFunctionCalls } from '@/novelDesign/AITools/novelEditorFunctionCalls';
import { buildNovelAudiobookFunctionCalls } from '@/novelDesign/AITools/novelAudiobookFunctionCalls';
import { buildNovelScriptFunctionCalls } from '@/novelDesign/AITools/novelScriptFunctionCalls';
import {
  buildAudiobookOutlineAddCharacterEmit,
  buildAudiobookOutlineFillMainCharactersEmit,
  type AudiobookOutlineVoiceAiEmitParts,
} from '@/audiobook/prompts/audiobookOutlineVoiceAiPrompt';
import { buildNovelAudiobookProjectPromptParts } from '@/audiobook/prompts/novelAudiobookProjectPrompt';
import {
  buildAudiobookSegmentTtsRewriteEphemeralInstructions,
  isAudiobookSegmentTtsRewriteUserIntent,
} from '@/audiobook/prompts/audiobookSegmentTtsRewriteAiPrompt';
import { getAudiobookSegmentQuickPromptMessage } from '@/audiobook/prompts/audiobookSegmentAiPrompts';
import { AUDIOBOOK_TTS_READABILITY_RULE_ZH } from '@/audiobook/prompts/audiobookTtsReadabilityPrompt';
import { formatAudiobookSegmentRefIndicator } from '@/audiobook/utils/audiobookSegmentRefLabel';
import {
  VOICE_EFFECT_LABELS,
  type VoiceEffectKey,
} from '@/audiobook/utils/voiceEffects/types';
import type { AudiobookAddSegmentFormValues } from '@/audiobook/components/AudiobookAddSegmentModal';
import { SegmentType } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { normalizeSegmentInput } from '@/audiobook/utils/audiobookModel';
import { episodeAudiobookHasContent } from '@/audiobook/utils/audiobookModel';
import { normalizeAudiobookSegmentSpeechText } from '@/audiobook/utils/audiobookNovelCornerQuotes';
import { normalizeMimoOverallStyleInstruction } from '@/components/tts/mimoV25StyleTags';
import { formatNovelEpisodeNavLabel } from '@/novelDesign/utils/novelEpisodeDisplay';
import {
  loadSegmentTtsModelKeys,
  saveSegmentTtsModelKeys,
} from '@/audiobook/utils/audiobookSegmentTtsModelStorage';
import { sanitizeAudiobookOutlineVoiceSamples } from '@/audiobook/utils/sanitizeAudiobookOutlineVoiceSamples';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  ensureNovelWorkspace,
  renameWorkspaceTitle,
  saveNovelWorkspace,
  setActiveEpisode,
  updateEpisodeAudiobook,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import { mergeFunctionCallDefs } from '@/components/AIChat/utils/functionRegistry';
import type { AudioSegment, SegmentAttachedAudio } from '@/constants/Audiobook';
import { isTextTtsAudiobookSegment } from '@/audiobook/utils/audiobookAttachedAudio';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { useNovelAiStream } from '@/novelDesign/hooks/useNovelAiStream';
import { useWorkspaceSync } from '@/novelDesign/hooks/useWorkspaceSync';
import '@ant-design/x-markdown/themes/dark.css';
import './AudiobookNovelDetailPage.css';

type MiddleViewMode = 'novel' | 'both' | 'audiobook';

/** 与编剧工作台一致：Sender refIndicator 当前集 key */
const AUDIOBOOK_REF_EPISODE = 'selectedEpisode';
const AUDIOBOOK_REF_SEGMENT = 'audiobookSelectedSegment';

const READ_ONLY_EDITOR_TOOL_NAMES = new Set([
  'novel_list_episodes',
  'novel_get_episode',
  'novel_body_episode_exists',
  'novel_open_body_episode',
]);

/** 有声书工作台：维护「大纲音色」对应之 novelScript 角色（与 novel_audiobook_* 合并） */
const AUDIOBOOK_SCRIPT_TOOL_NAMES = new Set([
  'novel_script_get_meta',
  'novel_script_list_characters',
  'novel_script_upsert_character',
  'novel_script_delete_character',
]);

const { Text } = Typography;

function resolveScriptCharacterId(raw: string | undefined, script: Script | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const chars = script?.characters ?? [];
  if (chars.some((c) => c.id === t)) return t;
  const byName = chars.find((c) => c.name.trim() === t);
  return byName?.id ?? t;
}

export default function AudiobookNovelDetailPage() {
  const navigate = useNavigate();
  const { id: novelId } = useParams<{ id: string }>();
  const { message, modal } = App.useApp();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const chatRef = useRef<AIChatSidePanelHandle | null>(null);
  /** 点击「生成有声书」待送入 AIChat 的全文（opened 面板 + chatRef 就绪后 emit） */
  const pendingAudiobookGenMsgRef = useRef<string | null>(null);
  /** 生成有声书：目标 episode_id、用户消息（用于判定本轮结束） */
  const audiobookGenEpisodeIdRef = useRef<string | null>(null);
  const audiobookGenUserMsgRef = useRef<string | null>(null);
  const audiobookGenPrevRequestingRef = useRef(false);
  /** 最近一次 onAssistStream 快照，供延迟失败判定（避免工具续跑间隙误判） */
  const audiobookGenStreamLatestRef = useRef<{
    isRequesting: boolean;
    toolCallsPending: boolean;
    assistantStreaming: boolean;
    lastUserPlain: string;
  } | null>(null);
  const audiobookGenFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const AUDIOBOOK_GEN_FAIL_DEBOUNCE_MS = 900;

  const { workspace, workspaceRef, updateWorkspace, setSnapshot: setWorkspace } = useWorkspaceSync();
  const [chatAgentKey, setChatAgentKey] = useState('novel-to-audiobook');
  const [middleViewMode, setMiddleViewMode] = useState<MiddleViewMode>('audiobook');
  /** 递增以在 agent 已是 novel-to-audiobook 时仍能触发派发 effect */
  const [audiobookGenTrigger, setAudiobookGenTrigger] = useState(0);
  const [audiobookGenPending, setAudiobookGenPending] = useState(false);
  /** 大纲音色面板派发：气泡仅 displayContent，细则进本轮 system */
  const pendingOutlineVoicePromptRef = useRef<AudiobookOutlineVoiceAiEmitParts | null>(null);
  const [outlineVoiceAiTrigger, setOutlineVoiceAiTrigger] = useState(0);
  const [outlineVoiceAiPending, setOutlineVoiceAiPending] = useState(false);
  /** 片段卡片 AI 快捷提示 */
  const pendingSegmentAiPromptRef = useRef<AIChatEmitUserMessagePayload | null>(null);
  const [segmentAiPromptTrigger, setSegmentAiPromptTrigger] = useState(0);

  /** 项目设置 Modal */
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [effectsDraft, setEffectsDraft] = useState<Record<VoiceEffectKey, boolean>>({
    innerMonologue: false,
    spaceEcho: false,
    telephone: false,
    muffler: false,
  });

  const {
    onAssistStream,
  } = useNovelAiStream({
    workspaceRef,
    updateWorkspace,
    message,
    novelId: novelId ?? '',
    shouldApplyNovelBodyStream: () => false,
  });

  const [navQuery, setNavQuery] = useState('');
  const [novelTitleDraft, setNovelTitleDraft] = useState('');
  const [episodeNavOpen, setEpisodeNavOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  /** 有声书片段单选，供 Sender refIndicator */
  const [selectedAudiobookSegIndex, setSelectedAudiobookSegIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedAudiobookSegIndex(null);
  }, [workspace?.activeEpisodeId]);

  useEffect(() => {
    if (!novelId) return;
    const ws = ensureNovelWorkspace(novelId);
    const item = loadNovelList().find((x) => x.id === novelId);
    if (!item?.audiobookEnabled) {
      message.warning('该小说尚未开通有声书，请从小说编剧工作台创建');
      navigate('/screenwriter');
      return;
    }
    updateWorkspace(ws);
    setNovelTitleDraft(item.title ?? ws.title);
  }, [novelId, updateWorkspace, message, navigate]);

  /** 进入工作台时清理大纲里已失效的云端 engineId / 不完整克隆配对 */
  useEffect(() => {
    if (!novelId || !workspace || workspace.novelId !== novelId || !config) return;
    const { binding, changed } = sanitizeAudiobookOutlineVoiceSamples(
      workspace.audiobookOutlineVoiceSamples,
      config.models ?? [],
    );
    if (!changed) return;
    const next = {
      ...workspace,
      audiobookOutlineVoiceSamples: binding,
      updatedAt: new Date().toISOString(),
    };
    updateWorkspace(next);
    saveNovelWorkspace(next);
  }, [novelId, workspace, config, updateWorkspace]);

  useEffect(() => {
    if (!novelId || !workspace || workspace.novelId !== novelId) return;
    setNovelTitleDraft(workspace.title);
  }, [workspace?.title, workspace?.novelId, novelId]);

  const activeEpisode = useMemo(() => {
    if (!workspace) return null;
    return workspace.episodes.find((e) => e.id === workspace.activeEpisodeId) ?? null;
  }, [workspace]);

  const audiobookPlayback = useAudiobookPlayback({
    novelId,
    episodeId: activeEpisode?.id,
    episode:
      activeEpisode && activeEpisode.id !== NOVEL_OUTLINE_EPISODE_ID ?
        activeEpisode.episodeAudiobook
      : undefined,
    outlineVoice: workspace?.audiobookOutlineVoiceSamples,
    audiobookSettings: config?.audiobook,
    novelScript: workspace?.novelScript ?? null,
    innerMonologueEnabled: workspace?.innerMonologueEnabled === true,
    spaceEchoEnabled: workspace?.spaceEchoEnabled === true,
    telephoneEnabled: workspace?.telephoneEnabled === true,
    mufflerEnabled: workspace?.mufflerEnabled === true,
  });

  /** 换集或改标题时刷新 refIndicator，避免正文级联刷新 */
  const activeEpisodeTitleForTags = useMemo(() => {
    if (!workspace?.activeEpisodeId) return '';
    return workspace.episodes.find((e) => e.id === workspace.activeEpisodeId)?.title ?? '';
  }, [workspace, workspace?.activeEpisodeId]);

  const remountKey = useMemo(() => {
    if (!workspace || !activeEpisode) return '0';
    const v = workspace.remountVersionByEpisode?.[activeEpisode.id] ?? 0;
    return `${activeEpisode.id}:${v}`;
  }, [workspace, activeEpisode]);

  const sortedEpisodes = useMemo(() => {
    if (!workspace) return [];
    return [...workspace.episodes].sort((a, b) => a.order - b.order);
  }, [workspace]);

  const novelListItem = useMemo(
    () => (novelId ? loadNovelList().find((x) => x.id === novelId) ?? null : null),
    [novelId, workspace?.updatedAt],
  );

  const clearAudiobookGenFailTimer = useCallback(() => {
    if (audiobookGenFailTimerRef.current != null) {
      clearTimeout(audiobookGenFailTimerRef.current);
      audiobookGenFailTimerRef.current = null;
    }
  }, []);

  const clearAudiobookGenPending = useCallback(() => {
    clearAudiobookGenFailTimer();
    audiobookGenEpisodeIdRef.current = null;
    audiobookGenUserMsgRef.current = null;
    setAudiobookGenPending(false);
  }, [clearAudiobookGenFailTimer]);

  useEffect(() => () => clearAudiobookGenFailTimer(), [clearAudiobookGenFailTimer]);

  const resolveAudiobookGenIfContentReady = useCallback((): boolean => {
    const targetId = audiobookGenEpisodeIdRef.current;
    if (!targetId) return false;
    const ep = workspaceRef.current?.episodes.find((e) => e.id === targetId);
    if (!episodeAudiobookHasContent(ep?.episodeAudiobook)) return false;
    audiobookGenEpisodeIdRef.current = null;
    audiobookGenUserMsgRef.current = null;
    setAudiobookGenPending(false);
    return true;
  }, [workspaceRef]);

  const scheduleAudiobookGenFailureCheck = useCallback(() => {
    clearAudiobookGenFailTimer();
    audiobookGenFailTimerRef.current = setTimeout(() => {
      audiobookGenFailTimerRef.current = null;
      if (!audiobookGenEpisodeIdRef.current || !audiobookGenUserMsgRef.current) return;

      const latest = audiobookGenStreamLatestRef.current;
      if (!latest) return;

      const turnStillActive =
        latest.isRequesting || latest.toolCallsPending || latest.assistantStreaming;
      if (turnStillActive) return;

      if (resolveAudiobookGenIfContentReady()) return;

      const expected = audiobookGenUserMsgRef.current.trim();
      const user = latest.lastUserPlain.trim();
      if (user !== expected && !user.includes('改编为有声书结构化片段')) return;

      clearAudiobookGenPending();
      message.warning('有声书生成失败或未完成，请重试');
    }, AUDIOBOOK_GEN_FAIL_DEBOUNCE_MS);
  }, [
    clearAudiobookGenFailTimer,
    resolveAudiobookGenIfContentReady,
    clearAudiobookGenPending,
    message,
  ]);

  const wrappedOnAssistStream = useCallback(
    (payload: Parameters<typeof onAssistStream>[0]) => {
      onAssistStream(payload);

      audiobookGenStreamLatestRef.current = {
        isRequesting: payload.isRequesting,
        toolCallsPending: payload.toolCallsPending,
        assistantStreaming: payload.assistantStreaming,
        lastUserPlain: payload.lastUserPlain,
      };

      if (!audiobookGenEpisodeIdRef.current) {
        audiobookGenPrevRequestingRef.current = payload.isRequesting;
        return;
      }

      if (resolveAudiobookGenIfContentReady()) {
        clearAudiobookGenFailTimer();
        audiobookGenPrevRequestingRef.current = payload.isRequesting;
        return;
      }

      const turnInProgress =
        payload.isRequesting || payload.toolCallsPending || payload.assistantStreaming;

      if (turnInProgress) {
        clearAudiobookGenFailTimer();
        audiobookGenPrevRequestingRef.current = true;
        return;
      }

      const ended = audiobookGenPrevRequestingRef.current && !payload.isRequesting;
      audiobookGenPrevRequestingRef.current = payload.isRequesting;

      if (!ended || !audiobookGenUserMsgRef.current) return;

      scheduleAudiobookGenFailureCheck();
    },
    [
      onAssistStream,
      resolveAudiobookGenIfContentReady,
      clearAudiobookGenFailTimer,
      scheduleAudiobookGenFailureCheck,
    ],
  );

  useEffect(() => {
    if (!audiobookGenPending) return;
    resolveAudiobookGenIfContentReady();
  }, [workspace, audiobookGenPending, resolveAudiobookGenIfContentReady]);

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
        { ...item, title: raw, updatedAt: now, audiobookEnabled: true }
      : {
          id: novelId,
          title: raw,
          genres: [],
          audiobookEnabled: true,
          updatedAt: now,
          createdAt: now,
        };
    upsertNovel(merged);
    setWorkspace(renameWorkspaceTitle(workspace, raw));
    message.success('书名已保存');
  }, [novelId, novelTitleDraft, workspace, message, setWorkspace]);

  const selectEpisode = useCallback(
    (episodeId: string) => {
      setWorkspace((w) => (w ? setActiveEpisode(w, episodeId) : w));
    },
    [setWorkspace],
  );

  const onAudiobookSegmentSelect = useCallback(
    (index: number) => {
      setSelectedAudiobookSegIndex((prev) => {
        const next = prev === index ? null : index;
        if (audiobookPlayback.episodePlaybackPhase === 'paused') {
          const total = activeEpisode?.episodeAudiobook?.segments.length ?? 0;
          const cursor =
            next != null && next >= 0 && next < total ? next : 0;
          audiobookPlayback.alignPausedPlaybackCursor(cursor);
        }
        return next;
      });
    },
    [audiobookPlayback, activeEpisode?.episodeAudiobook?.segments.length],
  );

  const onAudiobookSegmentTextChange = useCallback(
    (index: number, text: string) => {
      const episodeId = activeEpisode?.id;
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID) return;
      let changed = false;
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        const seg = ab?.segments[index];
        if (!seg || !('text' in seg)) return w;
        const normalized = normalizeAudiobookSegmentSpeechText(text);
        if (seg.text === normalized) return w;
        changed = true;
        const segments = [...ab.segments];
        segments[index] = { ...seg, text: normalized } as AudioSegment;
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });
      if (changed) audiobookPlayback.clearSegmentTtsCache(index);
    },
    [activeEpisode?.id, setWorkspace, audiobookPlayback.clearSegmentTtsCache],
  );

  const onAudiobookSegmentToneBlurSave = useCallback(
    (index: number, tone: string) => {
      const episodeId = activeEpisode?.id;
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID) return;
      const normalized = normalizeMimoOverallStyleInstruction(tone.trim()) || '自然';
      let changed = false;
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        const seg = ab?.segments[index];
        if (!seg || !('voice' in seg)) return w;
        if (seg.voice.tone === normalized) return w;
        changed = true;
        const segments = [...ab.segments];
        segments[index] = {
          ...seg,
          voice: { ...seg.voice, tone: normalized },
        } as AudioSegment;
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });
      if (changed) audiobookPlayback.clearSegmentTtsCache(index);
    },
    [activeEpisode?.id, setWorkspace, audiobookPlayback.clearSegmentTtsCache],
  );

  const onAudiobookSegmentVoiceEffectChange = useCallback(
    (index: number, effectKey: string | undefined) => {
      const episodeId = activeEpisode?.id;
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID) return;
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        const seg = ab?.segments[index];
        if (!seg) return w;
        if (!('voice' in seg)) return w;
        const segments = [...ab.segments];
        segments[index] = { ...seg, voiceEffect: effectKey } as AudioSegment;
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });
      audiobookPlayback.clearSegmentTtsCache(index);
    },
    [activeEpisode?.id, setWorkspace, audiobookPlayback.clearSegmentTtsCache],
  );

  const onAudiobookAttachedAudioSave = useCallback(
    (index: number, item: SegmentAttachedAudio) => {
      const episodeId = activeEpisode?.id;
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID) return;
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        const seg = ab?.segments[index];
        if (!seg || !isTextTtsAudiobookSegment(seg)) return w;
        const prev = seg.attachedAudio ?? [];
        const nextList = prev.some((a) => a.id === item.id) ?
          prev.map((a) => (a.id === item.id ? item : a))
        : [...prev, item];
        const segments = [...ab.segments];
        segments[index] = { ...seg, attachedAudio: nextList };
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });
    },
    [activeEpisode?.id, setWorkspace],
  );

  const onAudiobookAttachedAudioDelete = useCallback(
    (index: number, itemId: string) => {
      const episodeId = activeEpisode?.id;
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID) return;
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        const seg = ab?.segments[index];
        if (!seg || !isTextTtsAudiobookSegment(seg)) return w;
        const nextList = (seg.attachedAudio ?? []).filter((a) => a.id !== itemId);
        const segments = [...ab.segments];
        segments[index] = {
          ...seg,
          attachedAudio: nextList.length ? nextList : undefined,
        };
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });
    },
    [activeEpisode?.id, setWorkspace],
  );

  const onAudiobookSegmentDelete = useCallback(
    (index: number) => {
      const episodeId = activeEpisode?.id;
      const nid = novelId?.trim();
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID || !nid) return;
      const total = activeEpisode?.episodeAudiobook?.segments.length ?? 0;
      if (index < 0 || index >= total) return;

      modal.confirm({
        title: '删除此片段？',
        content: `确定删除第 ${index + 1} 段？删除后不可恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setWorkspace((w) => {
            if (!w) return w;
            const ep = w.episodes.find((e) => e.id === episodeId);
            const ab = ep?.episodeAudiobook;
            if (!ab || index < 0 || index >= ab.segments.length) return w;
            const segments = ab.segments.filter((_, i) => i !== index);
            return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
          });

          const oldKeys = await loadSegmentTtsModelKeys(nid, episodeId);
          const reindexed: Record<number, string> = {};
          for (const [k, v] of Object.entries(oldKeys)) {
            const oldIdx = Number(k);
            if (!Number.isInteger(oldIdx)) continue;
            if (oldIdx < index) reindexed[oldIdx] = v;
            else if (oldIdx > index) reindexed[oldIdx - 1] = v;
          }
          await saveSegmentTtsModelKeys(nid, episodeId, reindexed);
          audiobookPlayback.clearEpisodeTtsCache();
          audiobookPlayback.reloadSegmentTtsModelKeys();
          audiobookPlayback.stop();

          setSelectedAudiobookSegIndex((prev) => {
            if (prev == null) return null;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
          });
          message.success('已删除片段');
        },
      });
    },
    [activeEpisode, novelId, modal, setWorkspace, audiobookPlayback, message],
  );

  const onAudiobookInsertSegment = useCallback(
    (insertAtIndex: number, values: AudiobookAddSegmentFormValues) => {
      const episodeId = activeEpisode?.id;
      const nid = novelId?.trim();
      if (!episodeId || episodeId === NOVEL_OUTLINE_EPISODE_ID || !nid) return;

      const charId = resolveScriptCharacterId(values.character, workspace?.novelScript ?? null);
      const raw: Record<string, unknown> = {
        type: values.type,
        text: values.text.trim(),
        voice: { tone: '自然' },
      };
      if (values.type === SegmentType.Dialogue) {
        raw.speaker_id = charId;
      } else if (values.type === SegmentType.InnerVoice) {
        raw.character_id = charId;
      }

      const seg = normalizeSegmentInput(raw);
      if (!seg) {
        message.error('片段内容无效，请检查类型与角色');
        return;
      }

      let insertAt = Math.floor(insertAtIndex);
      setWorkspace((w) => {
        if (!w) return w;
        const ep = w.episodes.find((e) => e.id === episodeId);
        const ab = ep?.episodeAudiobook;
        if (!ab) return w;
        if (insertAt < 0) insertAt = 0;
        if (insertAt > ab.segments.length) insertAt = ab.segments.length;
        const segments = [...ab.segments.slice(0, insertAt), seg, ...ab.segments.slice(insertAt)];
        return updateEpisodeAudiobook(w, episodeId, { ...ab, segments }, false);
      });

      const oldKeys = loadSegmentTtsModelKeys(nid, episodeId);
      const reindexed: Record<number, string> = {};
      for (const [k, v] of Object.entries(oldKeys)) {
        const oldIdx = Number(k);
        if (!Number.isInteger(oldIdx)) continue;
        if (oldIdx < insertAt) reindexed[oldIdx] = v;
        else reindexed[oldIdx + 1] = v;
      }
      saveSegmentTtsModelKeys(nid, episodeId, reindexed);
      audiobookPlayback.reloadSegmentTtsModelKeys();

      setSelectedAudiobookSegIndex((prev) => {
        if (prev == null) return insertAt;
        if (prev >= insertAt) return prev + 1;
        return prev;
      });
      message.success('已添加片段');
    },
    [activeEpisode?.id, novelId, workspace?.novelScript, setWorkspace, audiobookPlayback, message],
  );

  const audiobookAiOnSubmit: AIChatSidePanelOnSubmit = useCallback(
    (message, _slotConfig, _skill, refIndicator) => {
      const msg = applyRefIndicatorUserChoicePrefix(message, refIndicator);
      if (isAudiobookSegmentTtsRewriteUserIntent(message)) {
        return {
          message: msg,
          ephemeralSystemAppend: buildAudiobookSegmentTtsRewriteEphemeralInstructions({
            episodeId:
              activeEpisode && activeEpisode.id !== NOVEL_OUTLINE_EPISODE_ID ?
                activeEpisode.id
              : undefined,
            segmentIndex: selectedAudiobookSegIndex,
          }),
        };
      }
      return { message: msg };
    },
    [activeEpisode, selectedAudiobookSegIndex],
  );

  useEffect(() => {
    if (!aiOpen || !activeEpisode) return;

    const episodeNavLabel = formatNovelEpisodeNavLabel(activeEpisode);
    const episodeItem: RefIndicatorType = {
      key: AUDIOBOOK_REF_EPISODE,
      description: '选中的集：%f',
      icon: <OrderedListOutlined />,
      content: episodeNavLabel,
      aiSummary: `${episodeNavLabel}（episode_id="${activeEpisode.id}"）`,
    };

    let segmentItem: RefIndicatorType | undefined;
    if (
      activeEpisode.id !== NOVEL_OUTLINE_EPISODE_ID &&
      selectedAudiobookSegIndex !== null &&
      selectedAudiobookSegIndex >= 0
    ) {
      const segments = activeEpisode.episodeAudiobook?.segments;
      if (segments && selectedAudiobookSegIndex < segments.length) {
        const seg = segments[selectedAudiobookSegIndex]!;
        const segmentLabel = formatAudiobookSegmentRefIndicator(
          selectedAudiobookSegIndex,
          seg,
          workspace?.novelScript ?? null,
        );
        segmentItem = {
          key: AUDIOBOOK_REF_SEGMENT,
          description: '选中的有声书片段：%f',
          icon: <FileTextOutlined />,
          content: segmentLabel,
          aiSummary: `${segmentLabel}（segment_index=${selectedAudiobookSegIndex}，episode_id="${activeEpisode.id}"）`,
        };
      }
    }

    const items = segmentItem ? [episodeItem, segmentItem] : [episodeItem];

    const apply = (): boolean => {
      const chat = chatRef.current;
      if (!chat) return false;
      chat.setRefIndicator(items);
      return true;
    };

    if (apply()) return;

    let cancelled = false;
    const deferred = window.setTimeout(() => {
      if (!cancelled) apply();
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(deferred);
    };
  }, [activeEpisode, activeEpisodeTitleForTags, aiOpen, selectedAudiobookSegIndex]);

  useEffect(() => {
    if (audiobookGenTrigger === 0) return;
    const msg = pendingAudiobookGenMsgRef.current;
    if (!msg || !aiOpen) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    let tid: number | undefined;

    const tick = () => {
      if (cancelled) return;
      if (chatRef.current) {
        pendingAudiobookGenMsgRef.current = null;
        chatRef.current.emitUserMessage(msg);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        pendingAudiobookGenMsgRef.current = null;
        clearAudiobookGenPending();
        message.warning('AI 面板未就绪，请打开右侧「AI 对话」后重试');
        return;
      }
      tid = window.setTimeout(tick, 50);
    };

    tid = window.setTimeout(tick, 80);
    return () => {
      cancelled = true;
      if (tid !== undefined) window.clearTimeout(tid);
    };
  }, [audiobookGenTrigger, aiOpen, message, clearAudiobookGenPending]);

  useEffect(() => {
    if (outlineVoiceAiTrigger === 0) return;
    const msg = pendingOutlineVoicePromptRef.current;
    if (!msg || !aiOpen) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    let tid: number | undefined;

    const tick = () => {
      if (cancelled) return;
      if (chatRef.current) {
        pendingOutlineVoicePromptRef.current = null;
        chatRef.current.emitUserMessage({
          displayContent: msg.displayContent,
          ephemeralSystemInstructions: msg.ephemeralSystemInstructions,
        });
        setOutlineVoiceAiPending(false);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        pendingOutlineVoicePromptRef.current = null;
        setOutlineVoiceAiPending(false);
        message.warning('AI 面板未就绪，请打开右侧「AI 对话」后重试');
        return;
      }
      tid = window.setTimeout(tick, 50);
    };

    tid = window.setTimeout(tick, 80);
    return () => {
      cancelled = true;
      if (tid !== undefined) window.clearTimeout(tid);
    };
  }, [outlineVoiceAiTrigger, aiOpen, message]);

  useEffect(() => {
    if (segmentAiPromptTrigger === 0) return;
    const payload = pendingSegmentAiPromptRef.current;
    if (!payload || !aiOpen) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    let tid: number | undefined;

    const tick = () => {
      if (cancelled) return;
      if (chatRef.current) {
        pendingSegmentAiPromptRef.current = null;
        chatRef.current.emitUserMessage(payload);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        pendingSegmentAiPromptRef.current = null;
        message.warning('AI 面板未就绪，请打开右侧「AI 对话」后重试');
        return;
      }
      tid = window.setTimeout(tick, 50);
    };

    tid = window.setTimeout(tick, 80);
    return () => {
      cancelled = true;
      if (tid !== undefined) window.clearTimeout(tid);
    };
  }, [segmentAiPromptTrigger, aiOpen, message]);

  const enqueueOutlineVoiceAi = useCallback((parts: AudiobookOutlineVoiceAiEmitParts) => {
    pendingOutlineVoicePromptRef.current = parts;
    setOutlineVoiceAiPending(true);
    setChatAgentKey('novel-to-audiobook');
    setAiOpen(true);
    setOutlineVoiceAiTrigger((n) => n + 1);
  }, []);

  const runSegmentAiPrompt = useCallback(
    (segmentIndex: number, promptKey: string) => {
      const ep = activeEpisode;
      if (!ep || ep.id === NOVEL_OUTLINE_EPISODE_ID) return;
      const userMsg = getAudiobookSegmentQuickPromptMessage(promptKey);
      if (!userMsg) return;
      setSelectedAudiobookSegIndex(segmentIndex);
      pendingSegmentAiPromptRef.current = {
        displayContent: userMsg,
        ephemeralSystemInstructions: buildAudiobookSegmentTtsRewriteEphemeralInstructions({
          episodeId: ep.id,
          segmentIndex,
        }),
      };
      setChatAgentKey('novel-to-audiobook');
      setAiOpen(true);
      setSegmentAiPromptTrigger((n) => n + 1);
    },
    [activeEpisode],
  );

  const onGenerateAudiobookClick = useCallback(() => {
    if (audiobookGenPending || audiobookGenEpisodeIdRef.current) return;
    if (!workspace || !activeEpisode || activeEpisode.id === NOVEL_OUTLINE_EPISODE_ID) return;
    const nav = formatNovelEpisodeNavLabel(activeEpisode);
    const msg = [
      `请根据小说《${workspace.title}》将当前集正文改编为有声书结构化片段（novel_audiobook_* 工具写入，勿改小说正文）。`,
      `目标集：${nav}，episode_id="${activeEpisode.id}"。`,
      `请先 novel_audiobook_set_middle_view({ mode: "audiobook" })，再 novel_audiobook_list_characters，然后按正文顺序 novel_audiobook_add_segment。`,
      `类型约定：叙述/场景描写用 narration（旁白）；说出口用 dialogue；仅角色心里未出口的台词用 innerVoice，且 characterId 须指向大纲音色表「{名}画外音（{id}-画外音）」专用行——无则先 novel_script_upsert_character 新建再写 innerVoice；禁止把旁白叙述标成 innerVoice。首段 chapterTitle 格式「第{中文序数}集、{本集纯标题}」。`,
      AUDIOBOOK_TTS_READABILITY_RULE_ZH,
    ].join('\n');
    pendingAudiobookGenMsgRef.current = msg;
    audiobookGenEpisodeIdRef.current = activeEpisode.id;
    audiobookGenUserMsgRef.current = msg;
    audiobookGenPrevRequestingRef.current = false;
    setAudiobookGenPending(true);
    setChatAgentKey('novel-to-audiobook');
    setAiOpen(true);
    setAudiobookGenTrigger((n) => n + 1);
  }, [workspace, activeEpisode, audiobookGenPending]);

  const extraFunctionCalls = useMemo(() => {
    if (!novelId) return [];
    const editor = buildNovelEditorFunctionCalls({
      getSnapshot: () => workspaceRef.current,
      setSnapshot: setWorkspace,
      novelId,
      requestDeleteEpisodeConfirm: async () => false,
      requestDeleteEpisodesConfirm: async () => false,
    }).filter((d) => READ_ONLY_EDITOR_TOOL_NAMES.has(d.name));
    const audiobook = buildNovelAudiobookFunctionCalls({
      getSnapshot: () => workspaceRef.current,
      setSnapshot: setWorkspace,
      novelId,
      setMiddleViewMode,
    });
    const outlineScriptDefs = buildNovelScriptFunctionCalls({
      getSnapshot: () => workspaceRef.current,
      setSnapshot: setWorkspace,
      novelId,
    }).filter((d) => AUDIOBOOK_SCRIPT_TOOL_NAMES.has(d.name));
    return mergeFunctionCallDefs(editor, audiobook, outlineScriptDefs);
  }, [novelId, setWorkspace]);

  const projectPrompt = useMemo(() => {
    if (!workspace) return null;
    const eps = [...workspace.episodes]
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        id: e.id,
        editor_title: e.title,
        nav_label: formatNovelEpisodeNavLabel(e),
        episode: e.id === NOVEL_OUTLINE_EPISODE_ID ? null : (e.episode ?? null),
        isOutline: e.id === NOVEL_OUTLINE_EPISODE_ID,
      }));
    return buildNovelAudiobookProjectPromptParts(eps, {
      innerMonologue: workspace?.innerMonologueEnabled,
      spaceEcho: workspace?.spaceEchoEnabled,
      telephone: workspace?.telephoneEnabled,
      muffler: workspace?.mufflerEnabled,
    });
  }, [workspace]);

  const renderNovelPane = () => {
    if (!activeEpisode) return <Empty description="未选择集" />;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <NovelCrepeEditor
          providerKey={remountKey}
          initialMarkdown={activeEpisode.contentMarkdown}
          readOnly
        />
      </div>
    );
  };

  const renderAudiobookPane = () => {
    if (!activeEpisode || !workspace) return <Empty description="未选择集" />;
    if (activeEpisode.id === NOVEL_OUTLINE_EPISODE_ID) {
      return (
        <AudiobookOutlineVoicePanel
          workspace={workspace}
          setWorkspace={setWorkspace}
          outlineVoiceAiPending={outlineVoiceAiPending}
          onFillMainCharactersFromOutlineAi={() =>
            enqueueOutlineVoiceAi(buildAudiobookOutlineFillMainCharactersEmit(workspace.title))
          }
          onAddCharacterToVoiceListAi={() =>
            enqueueOutlineVoiceAi(buildAudiobookOutlineAddCharacterEmit(workspace.title))
          }
        />
      );
    }
    return (
      <AudiobookEpisodePanel
        episodeAudiobook={activeEpisode.episodeAudiobook}
        playback={audiobookPlayback}
        episodeTitle={formatNovelEpisodeNavLabel(activeEpisode)}
        exportNovelEpisode={activeEpisode}
        workspace={workspace ?? undefined}
        novelListItem={novelListItem}
        onGenerateAudiobook={onGenerateAudiobookClick}
        generateAudiobookPending={
          audiobookGenPending && activeEpisode.id === audiobookGenEpisodeIdRef.current
        }
        selectedSegmentIndex={selectedAudiobookSegIndex}
        onSegmentSelect={onAudiobookSegmentSelect}
        onSegmentTextChange={onAudiobookSegmentTextChange}
        onSegmentToneBlurSave={onAudiobookSegmentToneBlurSave}
        onSegmentVoiceEffectChange={onAudiobookSegmentVoiceEffectChange}
        onSegmentAiPrompt={runSegmentAiPrompt}
        onSegmentDelete={onAudiobookSegmentDelete}
        onInsertSegment={onAudiobookInsertSegment}
        onAttachedAudioSave={onAudiobookAttachedAudioSave}
        onAttachedAudioDelete={onAudiobookAttachedAudioDelete}
        activeAttachedAudioKeys={audiobookPlayback.activeAttachedAudioKeys}
        novelScript={workspace?.novelScript ?? null}
        outlineVoice={workspace?.audiobookOutlineVoiceSamples}
      />
    );
  };

  const renderEditorColumn = () => (
    <Flex vertical style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {middleViewMode === 'both' ?
        <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
          <Splitter.Panel defaultSize="50%" min="32%">
            <Flex vertical style={{ height: '100%', minHeight: 0 }}>{renderNovelPane()}</Flex>
          </Splitter.Panel>
          <Splitter.Panel defaultSize="50%" min="32%">
            <Flex vertical style={{ height: '100%', minHeight: 0 }}>{renderAudiobookPane()}</Flex>
          </Splitter.Panel>
        </Splitter>
      : middleViewMode === 'audiobook' ?
        <Flex vertical style={{ flex: 1, minHeight: 0 }}>{renderAudiobookPane()}</Flex>
      : <Flex vertical style={{ flex: 1, minHeight: 0 }}>{renderNovelPane()}</Flex>}
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
          <Tooltip title="返回有声书列表">
            <Button type="text" icon={<i className="iconfont">&#xe930;</i>} onClick={() => navigate('/audiobook')}>
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
          <Radio.Group
            size="small"
            optionType="button"
            value={middleViewMode}
            onChange={(e) => setMiddleViewMode(e.target.value as MiddleViewMode)}
            options={[
              { label: '小说', value: 'novel' },
              { label: '小说/有声书', value: 'both' },
              { label: '有声书', value: 'audiobook' },
            ]}
          />
          <Flex align="center" gap={8}>
            <MenuUnfoldOutlined style={{ opacity: episodeNavOpen ? 1 : 0.55 }} />
            <Text style={{ whiteSpace: 'nowrap' }}>集导航</Text>
            <Switch checked={episodeNavOpen} size="small" onChange={setEpisodeNavOpen} />
          </Flex>
          <Flex align="center" gap={8}>
            <CommentOutlined style={{ opacity: aiOpen ? 1 : 0.55 }} />
            <Text style={{ whiteSpace: 'nowrap' }}>AI 对话</Text>
            <Switch checked={aiOpen} size="small" onChange={setAiOpen} />
          </Flex>
          <Button
            type="default"
            onClick={() => {
              const w = workspace;
              setEffectsDraft({
                innerMonologue: w?.innerMonologueEnabled === true,
                spaceEcho: w?.spaceEchoEnabled === true,
                telephone: w?.telephoneEnabled === true,
                muffler: w?.mufflerEnabled === true,
              });
              setProjectSettingsOpen(true);
            }}
          >
            项目设置
          </Button>
          <Tooltip title="将各集有声书合并导出为 WAV，保存到项目目录 audioBookFiles（每集一个文件）">
            <Button
              type="default"
              icon={<DownloadOutlined />}
              loading={audiobookPlayback.exportingAllEpisodes}
              disabled={!workspace}
              onClick={() => {
                if (!workspace) return;
                void audiobookPlayback.exportAllEpisodesAsAudio(workspace, novelListItem);
              }}
            >
              导出全部集音频
            </Button>
          </Tooltip>
        </Space>
      </header>

      <div className="screenwriter-novel-body">
        {episodeNavOpen && aiOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel defaultSize={240} min={180} max={420} className="novel-episode-pane">
              <NovelEpisodeNavReadonly
                episodes={sortedEpisodes}
                activeEpisodeId={workspace.activeEpisodeId}
                navQuery={navQuery}
                onNavQueryChange={setNavQuery}
                onSelectEpisode={selectEpisode}
              />
            </Splitter.Panel>
            <Splitter.Panel defaultSize="58%" min="40%">
              {renderEditorColumn()}
            </Splitter.Panel>
            <Splitter.Panel defaultSize={360} min={280} max={560} className="novel-ai-pane">
              <AIChat
                ref={chatRef}
                mode="SidePanel"
                agentKey={chatAgentKey}
                onAgentChange={setChatAgentKey}
                allowAgentSwitch
                disableAttachmentsHeader
                models={models}
                projectPrompt={projectPrompt}
                extraFunctionCalls={extraFunctionCalls}
                storageKeySuffix={`audiobook-workspace:${novelId}`}
                senderPlaceholder="输入有声书改编需求"
                suppressAgentSenderWelcome
                suppressSenderAgentSkill
                onSubmit={audiobookAiOnSubmit}
                onAssistStream={wrappedOnAssistStream}
              />
            </Splitter.Panel>
          </Splitter>
        : episodeNavOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel defaultSize={260} min={180} max={440} className="novel-episode-pane">
              <NovelEpisodeNavReadonly
                episodes={sortedEpisodes}
                activeEpisodeId={workspace.activeEpisodeId}
                navQuery={navQuery}
                onNavQueryChange={setNavQuery}
                onSelectEpisode={selectEpisode}
              />
            </Splitter.Panel>
            <Splitter.Panel min={320}>{renderEditorColumn()}</Splitter.Panel>
          </Splitter>
        : aiOpen ?
          <Splitter style={{ flex: 1, minHeight: 0, height: '100%' }} orientation="horizontal">
            <Splitter.Panel min={320}>{renderEditorColumn()}</Splitter.Panel>
            <Splitter.Panel defaultSize={380} min={280} className="novel-ai-pane">
              <AIChat
                ref={chatRef}
                mode="SidePanel"
                agentKey={chatAgentKey}
                onAgentChange={setChatAgentKey}
                allowAgentSwitch
                disableAttachmentsHeader
                models={models}
                projectPrompt={projectPrompt}
                extraFunctionCalls={extraFunctionCalls}
                storageKeySuffix={`audiobook-workspace:${novelId}`}
                senderPlaceholder="输入有声书改编需求"
                suppressAgentSenderWelcome
                suppressSenderAgentSkill
                onSubmit={audiobookAiOnSubmit}
                onAssistStream={wrappedOnAssistStream}
              />
            </Splitter.Panel>
          </Splitter>
        : <div className="novel-editor-full">{renderEditorColumn()}</div>}
      </div>

      <Modal
        title="项目设置 — 声音效果"
        open={projectSettingsOpen}
        onCancel={() => setProjectSettingsOpen(false)}
        onOk={() => {
          if (workspace) {
            updateWorkspace((prev) => prev ? {
              ...prev,
              innerMonologueEnabled: effectsDraft.innerMonologue,
              spaceEchoEnabled: effectsDraft.spaceEcho,
              telephoneEnabled: effectsDraft.telephone,
              mufflerEnabled: effectsDraft.muffler,
            } : prev);
          }
          setProjectSettingsOpen(false);
        }}
        width={520}
      >
        {([
          ['innerMonologue', '使用本地内心独白音效', '开启后，AI 生成有声书时会将内心独白片段标记 tag，"内心独白" 片段仍使用角色音色进行 TTS，但会在 TTS 音频基础上叠加低通滤波 + 中频 EQ + 小混响 + 前置回声 + 音量压低，模拟「颅内回响」的内心声音效果。整集播放和下载都会使用经过特效处理的音频。'],
          ['spaceEcho', '空间回音', '开启后，AI 会在对应片段标记 `[空间回音]` tag。播放时叠加大量延时混响与回声，模拟在空旷大空间（礼堂、山洞）中的声音效果。'],
          ['telephone', '电话中的声音', '开启后，AI 会在对应片段标记 `[电话音]` tag。播放时叠加带通滤波（300-3400Hz）+ 轻微失真，模拟电话听筒中的声音效果。'],
          ['muffler', '闷罐 Muffler', '开启后，AI 会在对应片段标记 `[闷罐]` tag。播放时叠加低通滤波 + 低频提升 + 压缩，模拟隔墙/闷罐/捂住嘴说话的声音效果。'],
        ] as const).map(([key, label, desc]) => (
          <div key={key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>
              {label}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Switch
                checked={effectsDraft[key as VoiceEffectKey]}
                onChange={(v) => setEffectsDraft((prev) => ({ ...prev, [key]: v }))}
                checkedChildren="开启"
                unCheckedChildren="关闭"
              />
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              {desc}
            </Text>
          </div>
        ))}
      </Modal>
    </div>
  );
}
