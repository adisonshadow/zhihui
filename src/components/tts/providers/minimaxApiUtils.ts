/**
 * MiniMax 语音 API 公共工具（TTS / 音色设计 / 音色复刻）
 */
import type { AIModelConfig } from '@/types/settings';

export function normalizeMinimaxApiKey(raw: string): string {
  let k = (raw ?? '').trim();
  if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, '').trim();
  return k;
}

export function minimaxApiBase(model: AIModelConfig): string {
  const base = (model.apiUrl ?? 'https://api.minimaxi.com/v1').trim().replace(/\/$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

export function minimaxGroupIdFromModel(model: AIModelConfig): string {
  const g = (model.minimaxGroupId ?? '').trim();
  if (g) return g;
  throw new Error('MiniMax 需在设置 → AI 模型 → MiniMax Speech 填写 GroupId（控制台「账户信息」）');
}

/** 音色设计 trial_audio：hex 编码 */
export function decodeMinimaxHexAudio(hex: string): ArrayBuffer | null {
  const raw = hex.trim().replace(/^0x/i, '');
  if (!raw || raw.length % 2 !== 0) return null;
  try {
    const bytes = new Uint8Array(raw.length / 2);
    for (let i = 0; i < raw.length; i += 2) {
      const n = parseInt(raw.slice(i, i + 2), 16);
      if (Number.isNaN(n)) return null;
      bytes[i / 2] = n;
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}
