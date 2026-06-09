/**
 * 故事大纲音色样本：旁白/角色的「风格指令」（纯文字人声描述，用于音色设计与无样本 TTS 兜底）
 */
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { segmentSpeakerHasOutlineVoiceBinding } from '@/audiobook/utils/audiobookSegmentReference';

function dialogueCharacterKeys(seg: AudioSegment & { speakerId: string; voice: { characterId: string } }): string[] {
  const keys = [seg.speakerId, seg.voice?.characterId].filter(Boolean) as string[];
  return [...new Set(keys)];
}

export function pickOutlineStyleInstructionForTarget(
  binding: AudiobookOutlineVoiceSamples | undefined,
  target: { kind: 'narrator' } | { kind: 'character'; characterId: string },
): string | undefined {
  if (!binding) return undefined;
  if (target.kind === 'narrator') {
    return binding.narratorStyleInstruction?.trim() || undefined;
  }
  return binding.byCharacterStyleInstruction?.[target.characterId]?.trim() || undefined;
}

export function pickOutlineStyleInstructionForSegment(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): string | undefined {
  if (!outline) return undefined;
  switch (seg.type) {
    case SegmentType.Narration:
    case SegmentType.ChapterTitle:
      return outline.narratorStyleInstruction?.trim() || undefined;
    case SegmentType.Dialogue: {
      const by = outline.byCharacterStyleInstruction;
      if (!by) return undefined;
      for (const k of dialogueCharacterKeys(seg as AudioSegment & { speakerId: string; voice: { characterId: string } })) {
        const t = by[k]?.trim();
        if (t) return t;
      }
      return undefined;
    }
    case SegmentType.InnerVoice: {
      const by = outline.byCharacterStyleInstruction;
      if (!by) return undefined;
      const keys = [seg.characterId, seg.voice?.characterId].filter(Boolean) as string[];
      for (const k of [...new Set(keys)]) {
        const t = by[k]?.trim();
        if (t) return t;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** 片段 Tag 蓝点：未绑 wav 且有大纲风格指令 */
export function outlineStyleInstructionHintForSegment(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): { show: boolean; text: string } {
  const text = pickOutlineStyleInstructionForSegment(seg, outline)?.trim() ?? '';
  if (!text) return { show: false, text: '' };
  if (segmentSpeakerHasOutlineVoiceBinding(seg, outline)) return { show: false, text: '' };
  return { show: true, text };
}
