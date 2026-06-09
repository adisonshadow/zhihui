/**
 * Sender refIndicator / 片段卡片：有声书单段摘要与说话人展示名
 */
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';

const TYPE_ZH: Record<SegmentType, string> = {
  [SegmentType.Narration]: '旁白',
  [SegmentType.Dialogue]: '对白',
  [SegmentType.InnerVoice]: '画外音',
  [SegmentType.ChapterTitle]: '章标题',
  [SegmentType.SoundEffect]: '音效',
  [SegmentType.BackgroundMusic]: 'BGM',
};

const INNER_VOICE_ID_SUFFIX = '-画外音';
const INNER_VOICE_NAME_SUFFIX = '画外音';

/** 大纲音色表中的「画外音专用行」（id 后缀或 name 含画外音） */
export function isOutlineInnerVoiceCharacterEntry(character: { id: string; name?: string }): boolean {
  const id = character.id.trim();
  if (id.endsWith(INNER_VOICE_ID_SUFFIX)) return true;
  const name = character.name?.trim() ?? '';
  return name.endsWith(INNER_VOICE_NAME_SUFFIX);
}

function findScriptCharacter(script: Script | null | undefined, id: string) {
  const t = id.trim();
  if (!t || !script) return null;
  return script.characters.find((c) => c.id === t) ?? null;
}

function stripInnerVoiceDisplaySuffix(name: string): string {
  const n = name.trim();
  if (n.endsWith(INNER_VOICE_NAME_SUFFIX)) {
    const base = n.slice(0, -INNER_VOICE_NAME_SUFFIX.length).trim();
    return base || n;
  }
  return n;
}

/** 对白 speakerId / 画外音 characterId → 界面展示用角色中文名 */
export function resolveAudiobookSegmentSpeakerDisplayName(
  seg: AudioSegment,
  script?: Script | null,
): string | null {
  if (seg.type === SegmentType.Dialogue && 'speakerId' in seg) {
    const id = String(seg.speakerId ?? '').trim();
    if (!id) return null;
    const ch = findScriptCharacter(script, id);
    return ch?.name.trim() || id;
  }
  if (seg.type === SegmentType.InnerVoice && 'characterId' in seg) {
    const id = String(seg.characterId ?? '').trim();
    if (!id) return null;
    const ch = findScriptCharacter(script, id);
    if (ch?.name.trim()) {
      return stripInnerVoiceDisplaySuffix(ch.name);
    }
    if (id.endsWith(INNER_VOICE_ID_SUFFIX)) {
      const baseId = id.slice(0, -INNER_VOICE_ID_SUFFIX.length);
      const base = findScriptCharacter(script, baseId);
      if (base?.name.trim()) return base.name.trim();
    }
    return id;
  }
  return null;
}

function speakerSnippet(seg: AudioSegment, script?: Script | null): string {
  const display = resolveAudiobookSegmentSpeakerDisplayName(seg, script);
  if (display) return display;
  if (seg.type === SegmentType.Dialogue && 'speakerId' in seg) {
    const s = String(seg.speakerId ?? '').trim();
    return s || '?';
  }
  if (seg.type === SegmentType.InnerVoice && 'characterId' in seg) {
    const s = String(seg.characterId ?? '').trim();
    return s || '?';
  }
  return '';
}

/** 形如 `#3 对白 沈管家` */
export function formatAudiobookSegmentRefIndicator(
  segIndexZeroBased: number,
  seg: AudioSegment,
  script?: Script | null,
): string {
  const ord = segIndexZeroBased + 1;
  const zh = TYPE_ZH[seg.type];
  if (seg.type === SegmentType.Dialogue) {
    return `#${ord} ${zh} ${speakerSnippet(seg, script)}`;
  }
  if (seg.type === SegmentType.InnerVoice) {
    return `#${ord} ${zh} ${speakerSnippet(seg, script)}`;
  }
  return `#${ord} ${zh}`;
}
