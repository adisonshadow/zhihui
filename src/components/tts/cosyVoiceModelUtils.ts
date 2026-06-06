/**
 * CosyVoice 模型 / 音色兼容（v3.5 无系统音色，见官方 WebSocket 文档）
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';

/** cosyvoice-v3.5-plus / cosyvoice-v3.5-flash：仅支持声音设计/复刻得到的 voice_id */
export function isCosyVoiceV35ModelId(modelId: string): boolean {
  return modelId.toLowerCase().includes('v3.5');
}

/** cosyvoice-v3-plus / cosyvoice-v3-flash 等旧版，可使用 longanyang 等系统音色 */
export function isCosyVoiceV3SystemVoiceModelId(modelId: string): boolean {
  const s = modelId.toLowerCase();
  if (isCosyVoiceV35ModelId(s)) return false;
  return s.includes('cosyvoice') && s.includes('v3');
}

export function resolveCosyVoiceModelSlug(model: AIModelConfig | null | undefined): string {
  return (model ? resolveRequestModelId(model) : undefined)?.trim().toLowerCase() ?? '';
}

/** 规范化 target_model（声音设计 / 复刻 / 合成须一致） */
export function normalizeCosyVoiceTargetModel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/^cosyvoice-v3\.5-(plus|flash)$/.test(s)) return s;
  if (s.includes('v3.5') && s.includes('plus')) return 'cosyvoice-v3.5-plus';
  if (s.includes('v3.5') && s.includes('flash')) return 'cosyvoice-v3.5-flash';
  return raw.trim();
}

const LEGACY_SYSTEM_VOICES = new Set(['longanyang', 'longxiaochun', 'longwan', 'longfei', 'longjiao']);

/** v3.5 上使用 v3 系统音色名会触发 Engine 418 */
export function isInvalidCosyVoiceV35PresetVoice(modelId: string, voiceId: string): boolean {
  if (!isCosyVoiceV35ModelId(modelId)) return false;
  const v = voiceId.trim().toLowerCase();
  if (!v) return true;
  if (LEGACY_SYSTEM_VOICES.has(v)) return true;
  return false;
}

export function formatCosyVoice418Hint(
  rawError: string,
  ctx?: { modelId?: string; voiceId?: string },
): string {
  const base = rawError.trim();
  const modelId = ctx?.modelId?.trim() ?? '';
  const voiceId = ctx?.voiceId?.trim() ?? '';
  const is418 = base.includes('418');
  if (!is418) return base;

  const lines = [
    base,
    'CosyVoice 418：voice 与 model 版本不匹配，或 voice 无效。',
  ];
  if (isCosyVoiceV35ModelId(modelId)) {
    lines.push(
      'CosyVoice v3.5（Plus/Flash）无系统预置音色，不能直接使用 longanyang 等 v3 音色。',
      '请先在「音色设计」或「音色复制」创建 voice_id，合成时选择「已复刻 voice_id」并填入。',
    );
  } else if (modelId) {
    lines.push('请确认 voice 与 target_model 一致（复刻/设计时的模型须与合成模型相同）。');
  }
  if (voiceId) lines.push(`当前 model=${modelId || '?'}，voice=${voiceId}`);
  return lines.join('\n');
}

/** CosyVoice v3.5 合法 prefix：仅英文字母与数字 */
export function sanitizeCosyVoiceDesignPrefix(raw: string | undefined): string {
  const cleaned = (raw ?? 'yiman').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  return cleaned || 'yiman';
}
