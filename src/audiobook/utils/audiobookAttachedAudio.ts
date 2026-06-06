import {
  SegmentType,
  type AttachedAudioKind,
  type AudioSegment,
  type SegmentAttachedAudio,
} from '@/constants/Audiobook';
import { defaultAttachedAudioVolume, ATTACHED_AUDIO_DEFAULT_DELAY_SEC } from './audiobookAttachedAudioDefaults';

const TEXT_SEGMENT_TYPES = new Set<SegmentType>([
  SegmentType.Narration,
  SegmentType.Dialogue,
  SegmentType.InnerVoice,
  SegmentType.ChapterTitle,
]);

export function isTextTtsAudiobookSegment(seg: AudioSegment): boolean {
  return TEXT_SEGMENT_TYPES.has(seg.type);
}

export function getSegmentAttachedAudio(seg: AudioSegment): SegmentAttachedAudio[] {
  if (!isTextTtsAudiobookSegment(seg)) return [];
  return seg.attachedAudio ?? [];
}

export function makeAttachedAudioKey(segmentIndex: number, id: string): string {
  return `${segmentIndex}:${id}`;
}

function pickAttachedKind(raw: unknown): AttachedAudioKind | null {
  const t = String(raw ?? '').trim();
  if (t === 'soundEffect' || t === 'sound_effect' || t === 'sfx') return 'soundEffect';
  if (t === 'backgroundMusic' || t === 'background_music' || t === 'bgm') return 'backgroundMusic';
  return null;
}

function clampVolume(v: number, kind: AttachedAudioKind): number {
  const n = Number.isFinite(v) ? v : defaultAttachedAudioVolume(kind);
  return Math.min(1, Math.max(0.1, n));
}

/** AI 输入：strip audioSrc；用户 UI 可保留 audioSrc */
export function coerceAttachedAudioItem(raw: unknown, opts?: { preserveAudioSrc?: boolean }): SegmentAttachedAudio | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = pickAttachedKind(o.kind ?? o.type);
  if (!kind) return null;
  const description = String(o.description ?? o.label ?? o.name ?? '').trim();
  if (!description) return null;

  const delayRaw = o.delay_sec ?? o.delaySec;
  let delaySec = ATTACHED_AUDIO_DEFAULT_DELAY_SEC;
  if (typeof delayRaw === 'number' && delayRaw >= 0) {
    delaySec = delayRaw;
  } else if (typeof delayRaw === 'string' && delayRaw.trim()) {
    const n = Number(delayRaw);
    if (Number.isFinite(n) && n >= 0) delaySec = n;
  }

  const volRaw = typeof o.volume === 'number' ? o.volume : undefined;
  const volume = clampVolume(volRaw ?? defaultAttachedAudioVolume(kind), kind);

  const id = String(o.id ?? '').trim() || crypto.randomUUID();

  let audioSrc: string | undefined;
  if (opts?.preserveAudioSrc) {
    const src = String(o.audio_src ?? o.audioSrc ?? o.src ?? '').trim();
    audioSrc = src || undefined;
  }

  return { id, kind, description, delaySec, volume, audioSrc };
}

export function coerceAttachedAudioList(
  raw: unknown,
  opts?: { preserveAudioSrc?: boolean },
): SegmentAttachedAudio[] {
  if (!Array.isArray(raw)) return [];
  const out: SegmentAttachedAudio[] = [];
  for (const item of raw) {
    const coerced = coerceAttachedAudioItem(item, opts);
    if (coerced) out.push(coerced);
  }
  return out;
}

export function attachedAudioLabel(item: SegmentAttachedAudio): string {
  return item.description.trim() || (item.kind === 'backgroundMusic' ? '背景音乐' : '音效');
}

/** AI patch 合并：按 id 保留用户已绑定的 audioSrc */
export function mergeAttachedAudioLists(
  existing: SegmentAttachedAudio[] | undefined,
  incoming: SegmentAttachedAudio[],
): SegmentAttachedAudio[] {
  const byId = new Map((existing ?? []).map((a) => [a.id, a]));
  return incoming.map((item) => {
    const prev = byId.get(item.id);
    if (prev?.audioSrc?.trim() && !item.audioSrc?.trim()) {
      return { ...item, audioSrc: prev.audioSrc };
    }
    return item;
  });
}
