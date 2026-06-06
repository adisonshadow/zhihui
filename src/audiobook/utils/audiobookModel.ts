/**
 * 有声书数据工具（基于 @/constants/Audiobook.ts）
 */
import {
  SegmentType,
  type AudioSegment,
  type AudiobookEpisode,
  type BackgroundMusicSegment,
  type DialogueSegment,
  type InnerVoiceSegment,
  type ChapterTitleSegment,
  type NarrationSegment,
  type SoundEffectSegment,
  type VoiceConfig,
} from '@/constants/Audiobook';
import { normalizeMimoOverallStyleInstruction, normalizeMimoInlineStyleTagsInText } from '@/components/tts/mimoV25StyleTags';
import { normalizeAudiobookSegmentSpeechText } from '@/audiobook/utils/audiobookNovelCornerQuotes';
import { coerceAttachedAudioList, mergeAttachedAudioLists } from '@/audiobook/utils/audiobookAttachedAudio';

export type { AudiobookEpisode };

export interface NovelEpisodeLike {
  id: string;
  title: string;
  episode?: number;
}

const TEXT_SEGMENT_TYPES = new Set<SegmentType>([
  SegmentType.Narration,
  SegmentType.Dialogue,
  SegmentType.InnerVoice,
  SegmentType.ChapterTitle,
]);

export function createEmptyEpisodeAudiobook(ep: NovelEpisodeLike): AudiobookEpisode {
  return {
    id: ep.id,
    title: ep.title,
    segments: [],
  };
}

export function episodeAudiobookHasContent(ep: AudiobookEpisode | undefined): boolean {
  return Array.isArray(ep?.segments) && ep.segments.length > 0;
}

export function segmentHasPlayableText(seg: AudioSegment): boolean {
  if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
    return Boolean(seg.audioSrc?.trim());
  }
  return Boolean('text' in seg && seg.text?.trim());
}

export function parseEpisodeAudiobookJson(raw: string | null | undefined): AudiobookEpisode | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const v = JSON.parse(raw) as Partial<AudiobookEpisode>;
    if (!v || typeof v !== 'object' || !Array.isArray(v.segments)) return undefined;
    return {
      id: String(v.id ?? ''),
      title: v.title,
      segments: normalizeSegments(v.segments as AudioSegment[]),
    };
  } catch {
    return undefined;
  }
}

export function serializeEpisodeAudiobook(ep: AudiobookEpisode | undefined): string {
  if (!ep) return '';
  return JSON.stringify({ ...ep, segments: normalizeSegments(ep.segments ?? []) });
}

function defaultVoice(characterId: string): VoiceConfig {
  return { characterId, tone: '自然' };
}

function coerceVoice(raw: unknown, fallbackCharacterId: string): VoiceConfig {
  if (!raw || typeof raw !== 'object') return defaultVoice(fallbackCharacterId);
  const o = raw as Record<string, unknown>;
  const characterId = String(
    o.character_id ?? o.characterId ?? o.speaker_id ?? o.speakerId ?? fallbackCharacterId,
  ).trim();
  const rawPersona =
    typeof o.persona_tag === 'string' ? o.persona_tag
    : typeof o.personaTag === 'string' ? o.personaTag
    : typeof o['人设腔调'] === 'string' ? o['人设腔调']
    : undefined;
  const personaTag = typeof rawPersona === 'string' && rawPersona.trim() ? rawPersona.trim() : undefined;
  const rawTone = String(o.tone ?? '').trim();
  const rawEmotion = typeof o.emotion === 'string' ? o.emotion.trim() : '';
  const toneNorm =
    normalizeMimoOverallStyleInstruction(rawTone || rawEmotion || '自然', rawTone && rawEmotion ? rawEmotion : undefined) ||
    '自然';

  return {
    characterId: characterId || fallbackCharacterId,
    voiceId: typeof o.voice_id === 'string' ? o.voice_id : typeof o.voiceId === 'string' ? o.voiceId : undefined,
    tone: toneNorm,
    emotion: undefined,
    personaTag,
    speed: typeof o.speed === 'number' ? o.speed : undefined,
    pitch: typeof o.pitch === 'number' ? o.pitch : undefined,
  };
}

function coercePauses(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const position = o.position;
      if (position !== 'before' && position !== 'after' && position !== 'inline') return null;
      const durationMs = typeof o.duration_ms === 'number' ? o.duration_ms : o.durationMs;
      if (typeof durationMs !== 'number') return null;
      return {
        position,
        durationMs,
        charOffset: typeof o.char_offset === 'number' ? o.char_offset : o.charOffset,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

function pickText(o: Record<string, unknown>): string {
  for (const key of ['text', 'line', 'content', 'dialogue', '台词']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) {
      return normalizeAudiobookSegmentSpeechText(normalizeMimoInlineStyleTagsInText(v.trim()));
    }
  }
  return '';
}

function pickType(raw: unknown): SegmentType | null {
  const t = String(raw ?? '').trim();
  const map: Record<string, SegmentType> = {
    narration: SegmentType.Narration,
    dialogue: SegmentType.Dialogue,
    innerVoice: SegmentType.InnerVoice,
    inner_voice: SegmentType.InnerVoice,
    chapterTitle: SegmentType.ChapterTitle,
    chapter_title: SegmentType.ChapterTitle,
    soundEffect: SegmentType.SoundEffect,
    sound_effect: SegmentType.SoundEffect,
    sfx: SegmentType.SoundEffect,
    backgroundMusic: SegmentType.BackgroundMusic,
    background_music: SegmentType.BackgroundMusic,
    bgm: SegmentType.BackgroundMusic,
  };
  return map[t] ?? null;
}

function pickAttachedAudio(o: Record<string, unknown>, preserveAudioSrc: boolean) {
  const raw = o.attached_audio ?? o.attachedAudio;
  if (raw === undefined) return undefined;
  const list = coerceAttachedAudioList(raw, { preserveAudioSrc });
  return list;
}

function withAttachedIfPresent<T extends Record<string, unknown>>(
  seg: T,
  attached: ReturnType<typeof pickAttachedAudio>,
): T & { attachedAudio?: ReturnType<typeof coerceAttachedAudioList> } {
  if (attached === undefined) return seg;
  if (!attached.length) return { ...seg, attachedAudio: undefined };
  return { ...seg, attachedAudio: attached };
}

/** 规范化 AI 传入的单条片段 */
export function normalizeSegmentInput(
  raw: unknown,
  opts?: { preserveAttachedAudioSrc?: boolean },
): AudioSegment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = pickType(o.type);
  if (!type) return null;

  const preDelayMs = typeof o.pre_delay_ms === 'number' ? o.pre_delay_ms : o.preDelayMs;
  const postDelayMs = typeof o.post_delay_ms === 'number' ? o.post_delay_ms : o.postDelayMs;
  const pauses = coercePauses(o.pauses);
  const attachedFromInput = pickAttachedAudio(o, opts?.preserveAttachedAudioSrc ?? false);
  const voiceEffect = typeof o.voiceEffect === 'string' && o.voiceEffect.trim() ? o.voiceEffect.trim() : undefined;
  const base = {
    preDelayMs: typeof preDelayMs === 'number' ? preDelayMs : undefined,
    postDelayMs: typeof postDelayMs === 'number' ? postDelayMs : undefined,
    pauses: pauses?.length ? pauses : undefined,
    voiceEffect,
  };

  if (type === SegmentType.SoundEffect) {
    const audioSrc = String(o.audio_src ?? o.audioSrc ?? o.src ?? '').trim();
    if (!audioSrc) return null;
    const seg: SoundEffectSegment = {
      type,
      audioSrc,
      startMs: typeof o.start_ms === 'number' ? o.start_ms : o.startMs,
      endMs: typeof o.end_ms === 'number' ? o.end_ms : o.endMs,
      volume: typeof o.volume === 'number' ? o.volume : undefined,
      loop: o.loop === true,
      ...base,
    };
    return seg;
  }

  if (type === SegmentType.BackgroundMusic) {
    const audioSrc = String(o.audio_src ?? o.audioSrc ?? o.src ?? '').trim();
    if (!audioSrc) return null;
    const seg: BackgroundMusicSegment = {
      type,
      audioSrc,
      startMs: typeof o.start_ms === 'number' ? o.start_ms : o.startMs,
      endMs: typeof o.end_ms === 'number' ? o.end_ms : o.endMs,
      volume: typeof o.volume === 'number' ? o.volume : undefined,
      fadeInMs: typeof o.fade_in_ms === 'number' ? o.fade_in_ms : o.fadeInMs,
      fadeOutMs: typeof o.fade_out_ms === 'number' ? o.fade_out_ms : o.fadeOutMs,
      loop: o.loop === true,
      ...base,
    };
    return seg;
  }

  const text = pickText(o);
  if (!text) return null;
  const speaker = String(
    o.speaker_id ?? o.speakerId ?? o.speaker ?? o.character_id ?? o.characterId ?? o.character ?? '',
  ).trim();

  if (type === SegmentType.Dialogue) {
    const seg: DialogueSegment = withAttachedIfPresent(
      {
        type,
        text,
        speakerId: speaker,
        voice: coerceVoice(o.voice, speaker),
        ...base,
      },
      attachedFromInput,
    );
    return seg;
  }

  if (type === SegmentType.InnerVoice) {
    const cid = speaker || String(o.character_id ?? o.characterId ?? '').trim();
    const seg: InnerVoiceSegment = withAttachedIfPresent(
      {
        type,
        text,
        characterId: cid,
        voice: coerceVoice(o.voice, cid),
        ...base,
      },
      attachedFromInput,
    );
    return seg;
  }

  if (type === SegmentType.ChapterTitle) {
    const seg: ChapterTitleSegment = withAttachedIfPresent(
      {
        type,
        text,
        voice: coerceVoice(o.voice, speaker || 'narrator'),
        ...base,
      },
      attachedFromInput,
    );
    return seg;
  }

  const seg: NarrationSegment = withAttachedIfPresent(
    {
      type: SegmentType.Narration,
      text,
      voice: coerceVoice(o.voice, speaker || 'narrator'),
      ...base,
    },
    attachedFromInput,
  );
  return seg;
}

/** update_segment：在现有片段上合并 patch，避免 AI 只传 voice 时丢 speakerId 等字段 */
export function mergeAudiobookSegmentPatch(existing: AudioSegment, patch: unknown): AudioSegment | null {
  if (!patch || typeof patch !== 'object') return null;
  const p = patch as Record<string, unknown>;
  const type = pickType(p.type) ?? existing.type;
  const text = pickText(p) || ('text' in existing ? existing.text : '');
  if (!text.trim()) return null;

  const voiceExisting =
    'voice' in existing ?
      existing.voice
    : { characterId: 'narrator', tone: '自然' };
  const voicePatch = p.voice && typeof p.voice === 'object' ? (p.voice as Record<string, unknown>) : {};
  const mergedVoice = { ...voiceExisting, ...voicePatch };

  const speakerFromPatch = String(
    p.speaker_id ?? p.speakerId ?? p.character_id ?? p.characterId ?? p.speaker ?? p.character ?? '',
  ).trim();

  const raw: Record<string, unknown> = {
    type,
    text,
    voice: mergedVoice,
    pre_delay_ms: p.pre_delay_ms ?? p.preDelayMs ?? ('preDelayMs' in existing ? existing.preDelayMs : undefined),
    post_delay_ms: p.post_delay_ms ?? p.postDelayMs ?? ('postDelayMs' in existing ? existing.postDelayMs : undefined),
    pauses: p.pauses ?? ('pauses' in existing ? existing.pauses : undefined),
  };

  if (p.attached_audio !== undefined || p.attachedAudio !== undefined) {
    const incoming = coerceAttachedAudioList(p.attached_audio ?? p.attachedAudio, { preserveAudioSrc: false });
    const existingAttached = 'attachedAudio' in existing ? existing.attachedAudio : undefined;
    const merged = mergeAttachedAudioLists(existingAttached, incoming);
    raw.attached_audio = merged.map((a) => ({
      id: a.id,
      kind: a.kind,
      description: a.description,
      delay_sec: a.delaySec,
      volume: a.volume,
      ...(a.audioSrc ? { audio_src: a.audioSrc } : {}),
    }));
  } else if ('attachedAudio' in existing && existing.attachedAudio?.length) {
    raw.attached_audio = existing.attachedAudio.map((a) => ({
      id: a.id,
      kind: a.kind,
      description: a.description,
      delay_sec: a.delaySec,
      volume: a.volume,
      ...(a.audioSrc ? { audio_src: a.audioSrc } : {}),
    }));
  }

  if (type === SegmentType.Dialogue) {
    raw.speaker_id =
      speakerFromPatch ||
      (existing.type === SegmentType.Dialogue ? existing.speakerId : '');
  } else if (type === SegmentType.InnerVoice) {
    raw.character_id =
      speakerFromPatch ||
      (existing.type === SegmentType.InnerVoice ? existing.characterId : '');
  } else if (type === SegmentType.SoundEffect || type === SegmentType.BackgroundMusic) {
    raw.audio_src =
      String(p.audio_src ?? p.audioSrc ?? p.src ?? '').trim() ||
      (existing.type === type ? existing.audioSrc : '');
  }

  return normalizeSegmentInput(raw, { preserveAttachedAudioSrc: true });
}

export function normalizeSegments(raw: unknown): AudioSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: AudioSegment[] = [];
  for (const item of raw) {
    const seg = normalizeSegmentInput(item, { preserveAttachedAudioSrc: true });
    if (seg) out.push(seg);
  }
  return out;
}

export function pickSegmentsArg(args: Record<string, unknown>): unknown {
  return args.segments ?? args.segment_list ?? args.items;
}

export function segmentSummary(segments: AudioSegment[]) {
  const counts: Partial<Record<SegmentType, number>> = {};
  for (const s of segments) {
    counts[s.type] = (counts[s.type] ?? 0) + 1;
  }
  return {
    total: segments.length,
    by_type: counts,
    text_segment_count: segments.filter((s) => TEXT_SEGMENT_TYPES.has(s.type)).length,
  };
}

const OUTLINE_PREVIEW_CHARS = 220;

/** 供 novel_audiobook_get_episode 返回：带 segment_index 的顺序清单，便于 AI 插入/重排前核对 */
export function audiobookSegmentOutlineForTool(segments: AudioSegment[]): Record<string, unknown>[] {
  return segments.map((seg, segment_index) => {
    const row: Record<string, unknown> = { segment_index };
    row.type = seg.type;
    const prev = (t: string) => (t.length > OUTLINE_PREVIEW_CHARS ? `${t.slice(0, OUTLINE_PREVIEW_CHARS)}…` : t);
    if (seg.type === SegmentType.Dialogue) {
      row.speaker_id = seg.speakerId;
      row.text_preview = prev(seg.text);
      if (seg.voice.personaTag?.trim()) row.persona_tag = seg.voice.personaTag.trim();
    } else if (seg.type === SegmentType.InnerVoice) {
      row.character_id = seg.characterId;
      row.text_preview = prev(seg.text);
      if (seg.voice.personaTag?.trim()) row.persona_tag = seg.voice.personaTag.trim();
    } else if (seg.type === SegmentType.Narration || seg.type === SegmentType.ChapterTitle) {
      row.text_preview = prev(seg.text);
      if (seg.attachedAudio?.length) {
        row.attached_audio_preview = seg.attachedAudio.map((a) => ({
          kind: a.kind,
          description: a.description,
          delay_sec: a.delaySec,
          has_file: Boolean(a.audioSrc?.trim()),
        }));
      }
    } else if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
      row.audio_src = seg.audioSrc;
      row.deprecated = true;
    }
    if (
      (seg.type === SegmentType.Dialogue || seg.type === SegmentType.InnerVoice) &&
      seg.attachedAudio?.length
    ) {
      row.attached_audio_preview = seg.attachedAudio.map((a) => ({
        kind: a.kind,
        description: a.description,
        delay_sec: a.delaySec,
        has_file: Boolean(a.audioSrc?.trim()),
      }));
    }
    return row;
  });
}
