/**
 * MiMo V2.5 官方预置音色（见 docs/AI-demo/MiMo-V2.5-TTS.md）
 */

export const MIMO_V25_PRESET_VOICE_IDS = [
  '冰糖',
  '茉莉',
  '苏打',
  '白桦',
  'Mia',
  'Chloe',
  'Milo',
  'Dean',
  'mimo_default',
] as const;

export type MimoV25PresetVoiceId = (typeof MIMO_V25_PRESET_VOICE_IDS)[number];

const PRESET_SET = new Set<string>(MIMO_V25_PRESET_VOICE_IDS);

export function isMimoV25PresetVoice(id: string | undefined | null): id is string {
  const t = (id ?? '').trim();
  return t.length > 0 && PRESET_SET.has(t);
}

/** legacy / 错误配置回退映射 */
export function normalizeMimoUserVoicePreset(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim();
  if (!t) return undefined;
  if (t === 'default_zh' || t === 'default_en') return undefined;
  if (PRESET_SET.has(t)) return t;
  return t;
}

/** 简体中文启发式兜底（旁白/中性） */
export function mimoFallbackPresetChinese(): string {
  return '茉莉';
}

export function mimoFallbackPresetEnglish(): string {
  return 'Chloe';
}

/** 粗略检测正文语种：含少量拉丁字母且无汉字则偏英文 */
export function inferTextLanguageHint(text: string): 'zh' | 'en' {
  const t = text.trim();
  if (!t) return 'zh';
  if (/[\u4e00-\u9fff]/.test(t)) return 'zh';
  /** 短时纯 ASCII 占位，仍按中文 TTS 标签处理（与有声书标点习惯一致） */
  if (/^[a-zA-Z0-9]+$/u.test(t) && t.length <= 12) return 'zh';
  if (/[a-zA-Z]{4,}/.test(t)) return 'en';
  return 'zh';
}

export function resolveFallbackPresetVoiceByText(text: string): string {
  return inferTextLanguageHint(text) === 'en' ? mimoFallbackPresetEnglish() : mimoFallbackPresetChinese();
}
