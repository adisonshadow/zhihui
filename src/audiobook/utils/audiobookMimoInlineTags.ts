import { SegmentType, type AudioSegment } from '@/constants/Audiobook';

/** 从 AI 片段入参提取 text（校验用，不做 normalize） */
export function extractAudiobookSegmentInputText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  for (const key of ['text', 'line', 'content', 'dialogue', '台词']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** MiMo 句内演法 `[…]` 标签数量（程序合成的整体风格前缀不计入） */
export function countMimoInlineBracketTags(text: string): number {
  return (text.match(/\[[^\[\]]+?\]/g) ?? []).length;
}

export function segmentNeedsMimoInlineBracketTags(seg: AudioSegment): boolean {
  return (
    seg.type === SegmentType.Narration ||
    seg.type === SegmentType.Dialogue ||
    seg.type === SegmentType.InnerVoice
  );
}

export function patchTouchesAudiobookTtsVoice(patch: Record<string, unknown>): boolean {
  const v = patch.voice;
  if (!v || typeof v !== 'object') return false;
  const vo = v as Record<string, unknown>;
  return ['tone', 'emotion', 'personaTag', 'persona_tag', 'voiceId', 'voice_id'].some((k) => k in vo);
}

export const MIMO_INLINE_TAG_REQUIRED_ERROR =
  '更新 TTS/voice 时 text 须含至少 1 处 MiMo 句内方括号演法标签（如 [紧张]呼……[语速加快,碎碎念]……）。voice.tone 只写整体风格指令；句内 […] 优先语速/音量/呼吸类，且不得与 tone 重复或同义（合成时 tone 会自动拼 […] 前缀）。';
