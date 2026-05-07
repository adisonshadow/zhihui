/**
 * 抠图来源：具备 matting 能力的 AIModelConfig（如 Qwen-Image-Edit）。
 * 火山引擎独立抠图（AIMattingConfig）已从设置与抠图下拉中移除，主进程仍可按 mat_* 兼容旧数据。
 */
import type { AISettings, AIModelConfig } from '@/types/settings';

export type MattingSource = { kind: 'model'; model: AIModelConfig } | null;

export function pickMattingSource(cfg: AISettings | null | undefined): MattingSource {
  if (!cfg) return null;
  const modelB = (cfg.models ?? []).find((m) => (m.capabilityKeys ?? []).includes('matting'));
  if (modelB) return { kind: 'model', model: modelB };
  return null;
}
