/**
 * 故事大纲音色绑定展示摘要
 */
import type { AIModelConfig } from '@/types/settings';
import type { AudioSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import { capitalizeAudiobookModelIdLabel } from '@/audiobook/utils/audiobookTtsModelOptions';
import { formatVoiceSampleDisplayName } from '@/audiobook/utils/embeddedPresetVoiceId';

function dialogueCharacterKeys(seg: AudioSegment & { speakerId: string; voice: { characterId: string } }): string[] {
  const keys = [seg.speakerId, seg.voice?.characterId].filter(Boolean) as string[];
  return [...new Set(keys)];
}

export function pickOutlineCloudVoiceForSegment(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): { engineId?: string; voiceId?: string } {
  if (!outline) return {};
  switch (seg.type) {
    case SegmentType.Narration:
    case SegmentType.ChapterTitle:
      return {
        engineId: outline.narratorCloudEngineId?.trim(),
        voiceId: outline.narratorCloudVoiceId?.trim(),
      };
    case SegmentType.Dialogue: {
      const byE = outline.byCharacterCloudEngineId;
      const byV = outline.byCharacterCloudVoiceId;
      if (!byE || !byV) return {};
      for (const k of dialogueCharacterKeys(seg as AudioSegment & { speakerId: string; voice: { characterId: string } })) {
        const voiceId = byV[k]?.trim();
        const engineId = byE[k]?.trim();
        if (voiceId && engineId) return { engineId, voiceId };
      }
      return {};
    }
    case SegmentType.InnerVoice: {
      const byE = outline.byCharacterCloudEngineId;
      const byV = outline.byCharacterCloudVoiceId;
      if (!byE || !byV) return {};
      const keys = [seg.characterId, seg.voice?.characterId].filter(Boolean) as string[];
      for (const k of [...new Set(keys)]) {
        const voiceId = byV[k]?.trim();
        const engineId = byE[k]?.trim();
        if (voiceId && engineId) return { engineId, voiceId };
      }
      return {};
    }
    default:
      return {};
  }
}

export function outlineCloudVoiceForTarget(
  binding: AudiobookOutlineVoiceSamples | undefined,
  target: { kind: 'narrator' } | { kind: 'character'; characterId: string },
): { engineId?: string; voiceId?: string } {
  if (!binding) return {};
  if (target.kind === 'narrator') {
    return {
      engineId: binding.narratorCloudEngineId?.trim(),
      voiceId: binding.narratorCloudVoiceId?.trim(),
    };
  }
  return {
    engineId: binding.byCharacterCloudEngineId?.[target.characterId]?.trim(),
    voiceId: binding.byCharacterCloudVoiceId?.[target.characterId]?.trim(),
  };
}

export function formatOutlineVoiceBindingSummary(
  binding: AudiobookOutlineVoiceSamples | undefined,
  target: { kind: 'narrator' } | { kind: 'character'; characterId: string },
  models: AIModelConfig[],
): string {
  const rel =
    target.kind === 'narrator' ?
      binding?.narratorRelPath?.trim()
    : binding?.byCharacterId?.[target.characterId]?.trim();
  const cloud = outlineCloudVoiceForTarget(binding, target);
  const parts: string[] = [];
  if (rel) parts.push(formatVoiceSampleDisplayName(rel));
  if (cloud.engineId && cloud.voiceId) {
    const m = models.find((x) => x.id === cloud.engineId);
    const slug = m ? resolveRequestModelId(m) ?? m.id : cloud.engineId;
    parts.push(`${capitalizeAudiobookModelIdLabel(slug)} / ${cloud.voiceId}`);
  }
  return parts.length ? parts.join(' · ') : '';
}
