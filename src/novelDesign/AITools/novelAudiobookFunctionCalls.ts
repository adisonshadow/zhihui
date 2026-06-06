/**
 * 有声书工作台 Function Calls（Audiobook.ts）
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Script } from '@/constants/Script';
import type { AudiobookEpisode, AudioSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';
import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  updateEpisodeAudiobook,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  createEmptyEpisodeAudiobook,
  normalizeSegmentInput,
  normalizeSegments,
  pickSegmentsArg,
  segmentSummary,
  audiobookSegmentOutlineForTool,
  mergeAudiobookSegmentPatch,
} from '@/audiobook/utils/audiobookModel';
import {
  countMimoInlineBracketTags,
  extractAudiobookSegmentInputText,
  MIMO_INLINE_TAG_REQUIRED_ERROR,
  patchTouchesAudiobookTtsVoice,
  segmentNeedsMimoInlineBracketTags,
} from '@/audiobook/utils/audiobookMimoInlineTags';
import {
  normalizeMimoOverallStyleInstruction,
  validateMimoOverallStyleInstruction,
  validateMimoInlineStyleTagsInText,
  validateMimoToneNotDuplicatedInInlineTags,
} from '@/components/tts/mimoV25StyleTags';
import { extractNovelCornerQuoteSpans } from '@/audiobook/utils/audiobookNovelCornerQuotes';

export type AudiobookMiddleViewMode = 'novel' | 'both' | 'audiobook';

export interface NovelAudiobookFunctionCallDeps {
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  setSnapshot: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  novelId: string;
  setMiddleViewMode?: (mode: AudiobookMiddleViewMode) => void;
}

function ok(extra: Record<string, unknown> = {}) {
  return { ok: true as const, ...extra };
}

function err(message: string) {
  return { ok: false as const, error: message };
}

function getBodyEpisode(ws: NovelWorkspaceSnapshot, episodeId: string) {
  const ep = ws.episodes.find((e) => e.id === episodeId);
  if (!ep || ep.id === NOVEL_OUTLINE_EPISODE_ID) return null;
  return ep;
}

function ensureEpisodeAudiobookShell(ws: NovelWorkspaceSnapshot, episodeId: string) {
  const ep = getBodyEpisode(ws, episodeId)!;
  let ab = ep.episodeAudiobook ?? createEmptyEpisodeAudiobook(ep);
  if (!ep.episodeAudiobook) {
    const episodes = ws.episodes.map((e) => (e.id === episodeId ? { ...e, episodeAudiobook: ab } : e));
    ws = { ...ws, episodes };
  }
  return { ws, epAudiobook: ab };
}

function resolveVoiceCharacterId(script: Script | undefined, ref: string): string {
  const t = ref.trim();
  if (!t || !script) return t;
  const byId = script.characters.find((c) => c.id === t);
  if (byId) return byId.id;
  const byName = script.characters.find((c) => c.name === t || c.aliases?.includes(t));
  return byName?.id ?? t;
}

function resolveSegmentVoices(script: Script | undefined, seg: AudioSegment): AudioSegment {
  if (!script) return seg;
  if (seg.type === 'dialogue') {
    const speakerId = resolveVoiceCharacterId(script, seg.speakerId);
    return {
      ...seg,
      speakerId,
      voice: { ...seg.voice, characterId: resolveVoiceCharacterId(script, seg.voice.characterId || speakerId) },
    };
  }
  if (seg.type === 'innerVoice') {
    const characterId = resolveVoiceCharacterId(script, seg.characterId);
    return {
      ...seg,
      characterId,
      voice: { ...seg.voice, characterId: resolveVoiceCharacterId(script, seg.voice.characterId || characterId) },
    };
  }
  if ('voice' in seg) {
    return {
      ...seg,
      voice: {
        ...seg.voice,
        characterId: resolveVoiceCharacterId(script, seg.voice.characterId),
      },
    } as AudioSegment;
  }
  return seg;
}

export function buildNovelAudiobookFunctionCalls(deps: NovelAudiobookFunctionCallDeps): FunctionCallDef[] {
  const commonScope = { type: 'agent' as const, agentKey: 'novel' };

  const applyMutation = (
    updater: (ws: NovelWorkspaceSnapshot) =>
      | NovelWorkspaceSnapshot
      | null
      | { snapshot: NovelWorkspaceSnapshot; extras?: Record<string, unknown> }
      | Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const ws = deps.getSnapshot();
    if (!ws || ws.novelId !== deps.novelId) return Promise.resolve(err('工作区未就绪'));
    const out = updater(ws);
    if (out != null && typeof out === 'object' && 'ok' in out && (out as { ok: boolean }).ok === false) {
      return Promise.resolve(out as Record<string, unknown>);
    }
    let snap: NovelWorkspaceSnapshot | null = null;
    let extras: Record<string, unknown> = {};
    if (out != null && typeof out === 'object' && 'snapshot' in out) {
      snap = (out as { snapshot: NovelWorkspaceSnapshot }).snapshot;
      extras = { ...((out as { extras?: Record<string, unknown> }).extras ?? {}) };
    } else if (out && typeof out === 'object' && 'novelId' in out) {
      snap = out as NovelWorkspaceSnapshot;
    }
    if (!snap) return Promise.resolve(err('操作失败'));
    deps.setSnapshot(snap);
    return Promise.resolve(ok(extras));
  };

  const defs: FunctionCallDef[] = [];
  const push = (def: Omit<FunctionCallDef, 'scope'>) => {
    defs.push({ ...def, scope: commonScope });
  };

  push({
    name: 'novel_audiobook_set_middle_view',
    senderLabel: '切换编辑区',
    description: '切换中间编辑区：novel=仅小说正文，both=小说+有声书并排，audiobook=仅有声书。',
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['novel', 'both', 'audiobook'] } },
      required: ['mode'],
    },
    handler: async (args) => {
      const mode = String((args as { mode?: string }).mode ?? '') as AudiobookMiddleViewMode;
      if (!['novel', 'both', 'audiobook'].includes(mode)) return err('mode 无效');
      deps.setMiddleViewMode?.(mode);
      return ok({ mode });
    },
  });

  push({
    name: 'novel_audiobook_list_characters',
    senderLabel: '角色列表',
    description:
      '列出全书剧本角色及有声书大纲 wav 绑定；未绑定的次要配角由改编时在 voice.personaTag 填写人设腔调。返回：characters（含 audiobook_outline_sample_bound、voice_characteristic）、audiobook_outline.narrator_sample_bound。**画外音**：innerVoice 须用 name 为「{名}画外音」、id 如「{原id}-画外音」的独立角色行绑 wav，与对白行、旁白行分开。',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const ws = deps.getSnapshot();
      const binding = ws?.audiobookOutlineVoiceSamples ?? {};
      const narratorBound = Boolean(binding.narratorRelPath?.trim());

      if (!ws?.novelScript) {
        return ok({
          characters: [],
          audiobook_outline: { narrator_sample_bound: narratorBound },
          notice:
            narratorBound ?
              '尚未初始化剧本角色，可用角色名作为 id；对白写 speakerId/voice.characterId；若无法在工具中判断是否已绑大纲 wav，旁白/说话人 voice.tone 写整体风格指令，句内演法写 text 的 […]。'
            : '尚未初始化剧本角色且旁白未绑大纲 wav；生成片段时请为旁白/说话人写明 voice.tone（风格指令）与 text 内 […] 句内标签。',
        });
      }

      const characters = ws.novelScript.characters.map((c) => ({
        id: c.id,
        name: c.name,
        importance: c.importance,
        voice_characteristic:
          typeof c.voiceCharacteristic === 'string' && c.voiceCharacteristic.trim() ?
            c.voiceCharacteristic.trim()
          : undefined,
        /** 有声书故事中该角色大纲是否选了 wav「当前样本」 */
        audiobook_outline_sample_bound: Boolean(binding.byCharacterId?.[c.id]?.trim()),
      }));

      const anyCharUnbound = characters.some((c) => !c.audiobook_outline_sample_bound);
      return ok({
        audiobook_outline: {
          narrator_sample_bound: narratorBound,
        },
        characters,
        notice:
          !narratorBound || anyCharUnbound ?
            '若 audiobook_outline_sample_bound=false 或 narrator_sample_bound=false：为主要角色可督促用户在大纲绑 wav；**次要角色无绑定是常态**，须在 voice 写 personaTag + tone（风格指令），句内演法写 text 的 […]。'
          : undefined,
      });
    },
  });

  push({
    name: 'novel_audiobook_get_episode',
    senderLabel: '读取本集有声书',
    description:
      '读取指定正文集的 episodeAudiobook：默认返回 segment_outline（每段含 segment_index、type、对白有 speaker_id 与 text_preview），可核对顺序再插入/重排；include_full_segments=true 时额外返回完整 segments 数组。小说正文含「」对白时附带 source_corner_quote_spans（与 novel_get_episode.corner_quote_spans 同形）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        include_full_segments: {
          type: 'boolean',
          description: 'true 时附带完整 segments JSON（片段多时可不传，用 segment_outline 即可）',
        },
      },
      required: ['episode_id'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const includeFull = (args as { include_full_segments?: boolean }).include_full_segments === true;
      const ws = deps.getSnapshot();
      if (!ws) return err('工作区未就绪');
      const ep = getBodyEpisode(ws, episode_id);
      if (!ep) return err('找不到正文集');
      const ab = ep.episodeAudiobook;
      const sourceCornerQuotesEarly = extractNovelCornerQuoteSpans(ep.contentMarkdown ?? '');
      if (!ab?.segments?.length) {
        return ok({
          episode_id,
          segment_count: 0,
          summary: null,
          segment_outline: [],
          ...(sourceCornerQuotesEarly.length ? { source_corner_quote_spans: sourceCornerQuotesEarly } : {}),
        });
      }
      const segs = ab.segments;
      const sourceCornerQuotes = extractNovelCornerQuoteSpans(ep.contentMarkdown ?? '');
      const payload: Record<string, unknown> = {
        episode_id,
        segment_count: segs.length,
        summary: segmentSummary(segs),
        segment_outline: audiobookSegmentOutlineForTool(segs),
        ...(sourceCornerQuotes.length ? { source_corner_quote_spans: sourceCornerQuotes } : {}),
      };
      if (includeFull) payload.segments = segs;
      return ok(payload);
    },
  });

  push({
    name: 'novel_audiobook_replace_episode',
    senderLabel: '替换本集有声书',
    description:
      '整集替换 AudiobookEpisode（含 segments 数组）。segments[0] 须为 chapterTitle，text 格式「第{中文序数}集、{本集纯标题}」（见 Agent 规则）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        episode_audiobook: { type: 'object' },
      },
      required: ['episode_id', 'episode_audiobook'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const raw = (args as { episode_audiobook?: AudiobookEpisode }).episode_audiobook;
      if (!raw || !Array.isArray(raw.segments)) return err('episode_audiobook 须含 segments');
      return applyMutation((ws) => {
        if (!getBodyEpisode(ws, episode_id)) return err('找不到正文集');
        const segments = normalizeSegments(raw.segments).map((s) =>
          resolveSegmentVoices(ws.novelScript, s),
        );
        const epAudiobook: AudiobookEpisode = {
          ...raw,
          id: episode_id,
          segments,
        };
        return {
          snapshot: updateEpisodeAudiobook(ws, episode_id, epAudiobook, false),
          extras: { segment_count: segments.length },
        };
      });
    },
  });

  push({
    name: 'novel_audiobook_add_segment',
    senderLabel: '添加片段',
    description:
      '追加一条或多条片段。可传 **segment**（单个对象）或 **segments**（数组），二者填其一即可。默认追加到集末；若要在指定位置插入，传 **insert_at_index**（从 0 起，插入到该下标之前；等于当前片段数时与追加点末等效）。type: narration|dialogue|innerVoice|chapterTitle；文本类须 text + voice（**voice.tone=本段整体风格指令**；句内演法写在 text 的 `[…]`；次要角色带 personaTag）。**音效/BGM 禁止独立 segment**，须写在文本段的 **attached_audio** 数组：`[{ kind: soundEffect|backgroundMusic, description, delay_sec, volume? }]`，**不得**写 audio_src。**narration**=旁白叙述；**innerVoice**=仅角色未说出口的内心台词，characterId 须为「{原id}-画外音」画外音专用行，禁止把旁白叙述标为 innerVoice。**chapterTitle** 的 text 须「第{中文序数}集、{本集纯标题}」，且通常作为该集首段（insert_at_index=0）。合成时程序会把 tone 拼成 `[风格指令]` 前缀，text 勿重复写该前缀。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        segment: { type: 'object', description: '单条片段，与 segments 二选一' },
        segments: {
          type: 'array',
          items: { type: 'object' },
          description: '多条片段依次插入；与 segment 二选一',
        },
        insert_at_index: {
          type: 'integer',
          description: '插入位置：新片段占据该下标，原该位及之后顺延。省略则追加到末尾。',
        },
      },
      required: ['episode_id'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const insertRaw = a.insert_at_index;
      const insertAt =
        insertRaw === undefined || insertRaw === null ? null : Math.floor(Number(insertRaw));
      return applyMutation((ws) => {
        let { ws: w2, epAudiobook } = ensureEpisodeAudiobookShell(ws, episode_id);
        const rawList = pickSegmentsArg(a);
        const single = a.segment;
        const inputs = Array.isArray(rawList) ? rawList : single ? [single] : [];
        if (!inputs.length) return err('须传 segment 或 segments');
        const added: AudioSegment[] = [];
        for (const item of inputs) {
          if (item && typeof item === 'object') {
            const t = String((item as Record<string, unknown>).type ?? '').trim();
            if (
              t === SegmentType.SoundEffect ||
              t === SegmentType.BackgroundMusic ||
              t === 'sound_effect' ||
              t === 'background_music' ||
              t === 'sfx' ||
              t === 'bgm'
            ) {
              return err(
                '禁止将 soundEffect/backgroundMusic 作为独立 segment。请在 narration/dialogue/innerVoice/chapterTitle 片段的 attached_audio 数组内写 { kind, description, delay_sec }，不要写 audio_src。',
              );
            }
          }
          const rawText = extractAudiobookSegmentInputText(item);
          if (rawText && countMimoInlineBracketTags(rawText) > 0) {
            const inlineErr = validateMimoInlineStyleTagsInText(rawText);
            if (inlineErr) return err(inlineErr);
          }
          const seg = normalizeSegmentInput(item);
          if (seg && 'text' in seg && seg.voice?.tone) {
            const dupErr = validateMimoToneNotDuplicatedInInlineTags(
              seg.voice.tone,
              seg.voice.emotion,
              seg.text,
            );
            if (dupErr) return err(dupErr);
          }
          if (seg) added.push(resolveSegmentVoices(w2.novelScript, seg));
        }
        if (!added.length) return err('无有效片段');

        const base = epAudiobook.segments;
        let nextSegments: AudioSegment[];
        if (insertAt === null || Number.isNaN(insertAt)) {
          nextSegments = [...base, ...added];
        } else {
          if (insertAt < 0 || insertAt > base.length) {
            return err(`insert_at_index 须在 0..${base.length} 之间（当前 ${base.length} 段）`);
          }
          nextSegments = [...base.slice(0, insertAt), ...added, ...base.slice(insertAt)];
        }

        const next: AudiobookEpisode = {
          ...epAudiobook,
          segments: nextSegments,
        };
        return {
          snapshot: updateEpisodeAudiobook(w2, episode_id, next, false),
          extras: {
            added_count: added.length,
            segment_count: nextSegments.length,
            inserted_at: insertAt ?? base.length,
          },
        };
      });
    },
  });

  push({
    name: 'novel_audiobook_rewrite_segment_tts',
    senderLabel: '润色片段TTS',
    description:
      '**润色/重写单段 TTS 的首选工具**。text 须含至少 2 处 `[…]`（每标签一般 1 词、最多 2 词逗号分隔，优先语速/音量/呼吸类）；tone 为风格指令（同上）；**句内 […] 不得与 tone 重复或同义**（tone 合成时自动拼前缀）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        segment_index: { type: 'integer', description: '从 0 起，与 refIndicator 中 segment_index 一致' },
        text: { type: 'string', description: '润色后全文；句内 […] 每标签 1～2 个短关键词' },
        tone: { type: 'string', description: 'voice.tone 风格指令：一般 1 个关键词，最多 2 个逗号分隔（如「压低」或「紧张,急切」）' },
        persona_tag: { type: 'string', description: '可选 voice.personaTag' },
        emotion: { type: 'string', description: '可选 voice.emotion，并入合成前缀' },
      },
      required: ['episode_id', 'segment_index', 'text', 'tone'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const ix = Math.floor(Number(a.segment_index ?? -1));
      const text = String(a.text ?? '').trim();
      const toneRaw = String(a.tone ?? '').trim();
      const emotionRaw = typeof a.emotion === 'string' ? a.emotion.trim() : '';
      if (!text || !toneRaw) return err('text 与 tone 必填');
      const toneErr = validateMimoOverallStyleInstruction(toneRaw, emotionRaw || undefined);
      if (toneErr) return err(toneErr);
      const tone = normalizeMimoOverallStyleInstruction(toneRaw, emotionRaw || undefined);
      if (countMimoInlineBracketTags(text) < 2) {
        return err('text 须含至少 2 处 MiMo 句内 […] 演法标签');
      }
      const inlineErr = validateMimoInlineStyleTagsInText(text);
      if (inlineErr) return err(inlineErr);
      const dupErr = validateMimoToneNotDuplicatedInInlineTags(toneRaw, emotionRaw || undefined, text);
      if (dupErr) return err(dupErr);
      const patch: Record<string, unknown> = {
        text,
        voice: {
          tone,
          ...(typeof a.persona_tag === 'string' && a.persona_tag.trim() ?
            { personaTag: a.persona_tag.trim() }
          : typeof a.personaTag === 'string' && a.personaTag.trim() ?
            { personaTag: String(a.personaTag).trim() }
          : {}),
        },
      };
      return applyMutation((ws) => {
        let { ws: w2, epAudiobook } = ensureEpisodeAudiobookShell(ws, episode_id);
        if (ix < 0 || ix >= epAudiobook.segments.length) return err('segment_index 越界');
        const existing = epAudiobook.segments[ix]!;
        const seg = mergeAudiobookSegmentPatch(existing, patch);
        if (!seg) return err('segment 无效');
        const segments = [...epAudiobook.segments];
        segments[ix] = resolveSegmentVoices(w2.novelScript, seg);
        return {
          snapshot: updateEpisodeAudiobook(w2, episode_id, { ...epAudiobook, segments }, false),
          extras: {
            segment_index: ix,
            mimo_inline_bracket_tag_count: countMimoInlineBracketTags(text),
          },
        };
      });
    },
  });

  push({
    name: 'novel_audiobook_update_segment',
    senderLabel: '更新片段',
    description:
      '按 segment_index（从 0 开始）更新片段。改写 TTS 时须**同时**提交完整 segment：**voice.tone=整体风格指令**；**text 内至少 2 处 `[…]`**（每标签 1～2 个短关键词，例 `[紧张]呼……[语速加快,碎碎念]……`）。禁止只改 voice 而 text 仍为无方括号纯文本。更新前先 novel_audiobook_get_episode + include_full_segments=true 读取现段。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        segment_index: { type: 'integer' },
        segment: {
          type: 'object',
          description:
            '完整或部分片段；会合并现有字段。text 类须 text + voice.tone；TTS 改写时 text 必须含 […] 句内标签',
        },
      },
      required: ['episode_id', 'segment_index', 'segment'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const ix = Math.floor(Number(a.segment_index ?? -1));
      const patchRaw = a.segment;
      return applyMutation((ws) => {
        let { ws: w2, epAudiobook } = ensureEpisodeAudiobookShell(ws, episode_id);
        if (ix < 0 || ix >= epAudiobook.segments.length) return err('segment_index 越界');
        const existing = epAudiobook.segments[ix]!;
        const patchObj =
          patchRaw && typeof patchRaw === 'object' ? (patchRaw as Record<string, unknown>) : null;
        const seg =
          patchObj ? mergeAudiobookSegmentPatch(existing, patchObj) : normalizeSegmentInput(patchRaw);
        if (!seg) return err('segment 无效');
        if (patchObj && patchTouchesAudiobookTtsVoice(patchObj)) {
          const vp =
            patchObj.voice && typeof patchObj.voice === 'object' ?
              (patchObj.voice as Record<string, unknown>)
            : {};
          const toneErr = validateMimoOverallStyleInstruction(
            String(vp.tone ?? ('voice' in seg ? seg.voice.tone : '')),
            typeof vp.emotion === 'string' ? vp.emotion : ('voice' in seg ? seg.voice.emotion : undefined),
          );
          if (toneErr) return err(toneErr);
        }
        if (
          patchObj &&
          patchTouchesAudiobookTtsVoice(patchObj) &&
          segmentNeedsMimoInlineBracketTags(seg) &&
          countMimoInlineBracketTags(seg.text) === 0
        ) {
          return err(MIMO_INLINE_TAG_REQUIRED_ERROR);
        }
        if ('text' in seg && countMimoInlineBracketTags(seg.text) > 0) {
          const inlineErr = validateMimoInlineStyleTagsInText(seg.text);
          if (inlineErr) return err(inlineErr);
          if ('voice' in seg && seg.voice.tone) {
            const dupErr = validateMimoToneNotDuplicatedInInlineTags(
              seg.voice.tone,
              seg.voice.emotion,
              seg.text,
            );
            if (dupErr) return err(dupErr);
          }
        }
        const segments = [...epAudiobook.segments];
        segments[ix] = resolveSegmentVoices(w2.novelScript, seg);
        return {
          snapshot: updateEpisodeAudiobook(w2, episode_id, { ...epAudiobook, segments }, false),
          extras: {
            mimo_inline_bracket_tag_count: countMimoInlineBracketTags(
              'text' in seg ? seg.text : '',
            ),
          },
        };
      });
    },
  });

  push({
    name: 'novel_audiobook_delete_segment',
    senderLabel: '删除片段',
    description: '按 segment_index 删除片段。',
    parameters: {
      type: 'object',
      properties: { episode_id: { type: 'string' }, segment_index: { type: 'integer' } },
      required: ['episode_id', 'segment_index'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const ix = Math.floor(Number((args as { segment_index?: number }).segment_index ?? -1));
      return applyMutation((ws) => {
        const { ws: w2, epAudiobook } = ensureEpisodeAudiobookShell(ws, episode_id);
        if (ix < 0 || ix >= epAudiobook.segments.length) return err('segment_index 越界');
        const segments = epAudiobook.segments.filter((_, i) => i !== ix);
        return {
          snapshot: updateEpisodeAudiobook(w2, episode_id, { ...epAudiobook, segments }, false),
        };
      });
    },
  });

  push({
    name: 'novel_audiobook_reorder_segments',
    senderLabel: '重排片段',
    description:
      '按现有下标重排整条时间线。**不传 id**：数组 `order_indices` 长度为当前集段数，表示各段的新次序（元素为旧的 segment_index）。例：三段时 [2,0,1] 表示原下标2的段排到最前。调用前先用 novel_audiobook_get_episode 读 segment_outline 核对顺序。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        order_indices: {
          type: 'array',
          items: { type: 'integer' },
          description: '新的下标顺序，如 [2,0,1]',
        },
      },
      required: ['episode_id', 'order_indices'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const order = (args as { order_indices?: number[] }).order_indices;
      if (!Array.isArray(order)) return err('order_indices 须为数组');
      return applyMutation((ws) => {
        const { ws: w2, epAudiobook } = ensureEpisodeAudiobookShell(ws, episode_id);
        const segs = epAudiobook.segments;
        if (order.length !== segs.length) return err('order_indices 长度须与片段数一致');
        const next = order.map((i) => segs[Math.floor(i)]).filter(Boolean);
        if (next.length !== segs.length) return err('order_indices 无效');
        return {
          snapshot: updateEpisodeAudiobook(w2, episode_id, { ...epAudiobook, segments: next }, false),
        };
      });
    },
  });

  return defs;
}
