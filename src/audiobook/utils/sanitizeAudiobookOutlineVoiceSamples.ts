/**
 * 故事大纲云端音色绑定：清理已删除/无效的 engineId 与不完整配对
 */
import type { AIModelConfig } from '@/types/settings';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { getEngineById } from '@/components/tts/ttsModelAdapters';

function isValidVoiceOverEngineId(engineId: string | undefined, models: AIModelConfig[]): boolean {
  const id = engineId?.trim();
  if (!id) return false;
  return Boolean(getEngineById(models, id));
}

function pruneCharacterCloudMaps(
  binding: AudiobookOutlineVoiceSamples,
  models: AIModelConfig[],
): { binding: AudiobookOutlineVoiceSamples; changed: boolean } {
  const byE = { ...(binding.byCharacterCloudEngineId ?? {}) };
  const byV = { ...(binding.byCharacterCloudVoiceId ?? {}) };
  const charIds = new Set([...Object.keys(byE), ...Object.keys(byV)]);
  let changed = false;

  for (const cid of charIds) {
    const engineId = byE[cid]?.trim();
    const voiceId = byV[cid]?.trim();
    const engineOk = isValidVoiceOverEngineId(engineId, models);
    if (!engineOk || !engineId || !voiceId) {
      if (byE[cid] !== undefined || byV[cid] !== undefined) changed = true;
      delete byE[cid];
      delete byV[cid];
    }
  }

  return {
    binding: {
      ...binding,
      byCharacterCloudEngineId: Object.keys(byE).length ? byE : undefined,
      byCharacterCloudVoiceId: Object.keys(byV).length ? byV : undefined,
    },
    changed,
  };
}

export function sanitizeAudiobookOutlineVoiceSamples(
  binding: AudiobookOutlineVoiceSamples | undefined,
  models: AIModelConfig[],
): { binding: AudiobookOutlineVoiceSamples | undefined; changed: boolean } {
  if (!binding) return { binding: undefined, changed: false };

  let changed = false;
  let next: AudiobookOutlineVoiceSamples = { ...binding };

  const narratorEngine = next.narratorCloudEngineId?.trim();
  const narratorVoice = next.narratorCloudVoiceId?.trim();
  if (narratorEngine || narratorVoice) {
    const engineOk = isValidVoiceOverEngineId(narratorEngine, models);
    if (!engineOk || !narratorEngine || !narratorVoice) {
      if (next.narratorCloudEngineId || next.narratorCloudVoiceId) changed = true;
      delete next.narratorCloudEngineId;
      delete next.narratorCloudVoiceId;
    }
  }

  const charResult = pruneCharacterCloudMaps(next, models);
  next = charResult.binding;
  if (charResult.changed) changed = true;

  const stillHasData =
    next.narratorRelPath?.trim() ||
    next.narratorRefText?.trim() ||
    next.narratorCloudEngineId?.trim() ||
    next.narratorCloudVoiceId?.trim() ||
    (next.byCharacterId && Object.keys(next.byCharacterId).length > 0) ||
    (next.byCharacterRefText && Object.keys(next.byCharacterRefText).length > 0) ||
    (next.byCharacterCloudEngineId && Object.keys(next.byCharacterCloudEngineId).length > 0) ||
    (next.byCharacterCloudVoiceId && Object.keys(next.byCharacterCloudVoiceId).length > 0);

  return {
    binding: stillHasData ? next : undefined,
    changed,
  };
}
