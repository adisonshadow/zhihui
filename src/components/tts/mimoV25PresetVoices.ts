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
  if (!t) return false;
  if (PRESET_SET.has(t)) return true;
  // 尝试从标签中提取
  const extracted = extractPresetName(t);
  return extracted !== undefined;
}

/** 从完整标签中提取预设音色名（如 "男-少年-苏打[小米---苏打]" → "苏打"） */
function extractPresetName(label: string): string | undefined {
  // 先尝试从 [xxx---名称] 格式提取
  const bracketMatch = /\[[^\]]*---([^\]]+)\]/.exec(label);
  if (bracketMatch) {
    const extracted = bracketMatch[1].trim();
    if (PRESET_SET.has(extracted)) return extracted;
  }
  // 再尝试取最后一段（"男-少年-苏打" → "苏打"）
  const lastSegment = label.split('-').pop()?.trim();
  if (lastSegment && PRESET_SET.has(lastSegment)) return lastSegment;
  return undefined;
}

/** legacy / 错误配置回退映射 */
export function normalizeMimoUserVoicePreset(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim();
  if (!t) return undefined;
  if (t === 'default_zh' || t === 'default_en') return undefined;
  if (PRESET_SET.has(t)) return t;
  // 尝试从标签中提取预设名
  const extracted = extractPresetName(t);
  return extracted ?? t;
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
