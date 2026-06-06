/**
 * 有声书「音色设计库」音色样本条目：增删与按创建时间排序
 */
import type { AISettings, AudiobookSavedVoiceSample } from '@/types/settings';

/** 新条目 id 与 createdAt */
export function newSavedVoiceSamplePartial(name: string): Pick<AudiobookSavedVoiceSample, 'id' | 'createdAt'> {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ?
      crypto.randomUUID()
    : `sv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  return { id, createdAt: new Date().toISOString() };
}

export function sortSavedVoiceSamplesByCreatedAtDesc(
  list: AudiobookSavedVoiceSample[] | undefined,
): AudiobookSavedVoiceSample[] {
  const arr = [...(list ?? [])];
  arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return arr;
}

export function appendSavedVoiceSample(
  settings: AISettings,
  entry: AudiobookSavedVoiceSample,
): AISettings {
  const prev = settings.audiobook?.savedVoiceSamples ?? [];
  const next = sortSavedVoiceSamplesByCreatedAtDesc([...prev.filter((x) => x.id !== entry.id), entry]);
  return {
    ...settings,
    audiobook: {
      ...(settings.audiobook ?? {}),
      savedVoiceSamples: next,
    },
  };
}

export function removeSavedVoiceSample(settings: AISettings, id: string): AISettings {
  const prev = settings.audiobook?.savedVoiceSamples ?? [];
  const next = prev.filter((x) => x.id !== id);
  return {
    ...settings,
    audiobook: {
      ...(settings.audiobook ?? {}),
      savedVoiceSamples: next.length ? next : undefined,
    },
  };
}

export function normalizedAudiobookVoiceRelKey(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^[/\\]/, '').toLowerCase();
}

export function savedVoiceRelativePathSet(samples: AudiobookSavedVoiceSample[] | undefined): Set<string> {
  const s = new Set<string>();
  for (const x of samples ?? []) {
    s.add(normalizedAudiobookVoiceRelKey(x.relativePath));
  }
  return s;
}
