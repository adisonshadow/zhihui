import {
  resolveAudiobookVoiceSampleRoots,
  type AudiobookVoiceSampleRoots,
} from '@/audiobook/utils/audiobookVoiceSampleRoots';
import type { AudiobookSettings } from '@/types/settings';

let cachedBuiltinDir: string | null = null;

/** 应用内置 PresetVoice/ 绝对路径（主进程解析） */
export async function getBuiltinPresetVoiceDir(): Promise<string> {
  if (cachedBuiltinDir !== null) return cachedBuiltinDir;
  const api = window.yiman?.fs?.getBuiltinPresetVoiceDir;
  if (!api) {
    cachedBuiltinDir = '';
    return '';
  }
  try {
    cachedBuiltinDir = (await api()).trim();
  } catch {
    cachedBuiltinDir = '';
  }
  return cachedBuiltinDir;
}

/** 合并设置中的外置/自定义目录与内置 PresetVoice/ */
export async function resolveAudiobookVoiceSampleRootsResolved(
  audiobook?: AudiobookSettings | null,
): Promise<AudiobookVoiceSampleRoots> {
  const roots = resolveAudiobookVoiceSampleRoots(audiobook);
  roots.builtin = await getBuiltinPresetVoiceDir();
  return roots;
}
