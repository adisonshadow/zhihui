/**
 * 有声书音色样本目录：内置 PresetVoice/、外置（用户配置）、自定义（.yiman-voices）
 */
import type { AudiobookSettings } from '@/types/settings';

export interface AudiobookVoiceSampleRoots {
  /** 内置 PresetVoice/（应用资源，只读） */
  builtin: string;
  /** 用户配置的外置目录（设置项 presetVoiceSamplesRootDir） */
  external: string;
  /** AI 自定义样本根目录 */
  custom: string;
}

/** @deprecated 兼容旧字段名 */
export type AudiobookVoiceSampleRootsLegacy = AudiobookVoiceSampleRoots & {
  preset?: string;
};

/** 读取设置；旧版 voiceSamplesRootDir 作为外置/自定义回退 */
export function resolveAudiobookVoiceSampleRoots(
  audiobook?: AudiobookSettings | null,
): AudiobookVoiceSampleRoots {
  const legacy = audiobook?.voiceSamplesRootDir?.trim() ?? '';
  return {
    builtin: '',
    external: audiobook?.presetVoiceSamplesRootDir?.trim() || legacy,
    custom: audiobook?.customVoiceSamplesRootDir?.trim() || legacy,
  };
}

/** 外置 + 内置样本根（去重、过滤空路径） */
export function presetVoiceSampleScanRoots(roots: AudiobookVoiceSampleRoots): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of [roots.builtin, roots.external]) {
    const t = dir.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 是否至少有一个可浏览的预制/外置样本目录 */
export function hasPresetVoiceSampleDirs(roots: AudiobookVoiceSampleRoots): boolean {
  return presetVoiceSampleScanRoots(roots).length > 0 || roots.custom.trim().length > 0;
}

/** AI 落盘路径以 `.yiman-voices/` 开头 → 自定义目录；其余在 builtin / external 中解析 */
export function voiceSampleRootForRelativePath(
  relPath: string,
  roots: AudiobookVoiceSampleRoots,
): string {
  const p = relPath.trim().replace(/\\/g, '/');
  if (p.startsWith('.yiman-voices/')) return roots.custom;
  return roots.external || roots.builtin;
}

/** 非 .yiman-voices 样本：按 builtin → external 顺序尝试的根目录 */
export function presetVoiceResolveRoots(roots: AudiobookVoiceSampleRoots): string[] {
  return presetVoiceSampleScanRoots(roots);
}
