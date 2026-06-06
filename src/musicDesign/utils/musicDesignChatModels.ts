import type { AIModelConfig } from '@/types/settings';
import { MODEL_PRESETS } from '@/components/AIChat/constants/modelPresets';
import { resolveRecommendedVariant } from '@/utils/recommendedModal';

/** 通用智能 Agent 可用模型 */
const GENERAL_CAPABILITY_KEY = 'agent_orchestration';

/** 文本创作 / 对话类能力 tag */
const TEXT_CAPABILITY_KEYS = ['novel', 'script', 'action_script', 'exec_script'] as const;

/** 纯多模态 / 非文本 Chat 能力（仅有这些 tag 时不展示） */
const MEDIA_ONLY_CAPABILITY_KEYS = new Set([
  'draw',
  'matting',
  'sprite',
  'skeleton_skinning',
  'voice_over',
  'music',
  'sound_effect',
  'video',
  'video_edit',
  'image_edit',
  'remove_watermark',
  'image_outpaint',
  'image_clarity',
  'extract_image_elements',
  'image_camera_angle',
  'multi_image_fusion',
  'interactive_image_edit',
]);

function hasCallableApi(m: AIModelConfig): boolean {
  const urlOk = (m.apiUrl?.trim()?.length ?? 0) > 0;
  if (!urlOk) return false;
  if (m.isLocal === true) return true;
  return (m.apiKey?.trim()?.length ?? 0) > 0;
}

function modelOutputsText(m: AIModelConfig): boolean {
  if (!m.presetKey) return false;
  const preset = MODEL_PRESETS.find((p) => p.presetKey === m.presetKey);
  if (!preset) return false;
  const md = (m.modelDisplayName ?? m.model ?? '').trim();
  const pv = (m.primaryVersion ?? '').trim();
  const variant = resolveRecommendedVariant(preset, md, pv);
  return variant?.io?.output?.includes('text') ?? false;
}

/**
 * 音乐工作台 AIChat 可用模型：仅「通用智能」+ 文本输出类（含 novel/script 等 tag 或 preset io.output 含 text）。
 * 排除纯绘图 / 视频 / TTS 等模型。
 */
export function filterMusicDesignChatModels(models: AIModelConfig[] | undefined): AIModelConfig[] {
  return (models ?? []).filter((m) => {
    if (!hasCallableApi(m)) return false;
    const caps = m.capabilityKeys ?? [];

    if (caps.includes(GENERAL_CAPABILITY_KEY)) return true;

    if (TEXT_CAPABILITY_KEYS.some((k) => caps.includes(k))) return true;

    if (modelOutputsText(m)) return true;

    // 自定义模型未打 tag：默认视为文本 Chat
    if (caps.length === 0) return true;

    // 仅有媒体类 tag、且无文本输出 → 排除
    if (caps.length > 0 && caps.every((k) => MEDIA_ONLY_CAPABILITY_KEYS.has(k))) return false;

    return false;
  });
}
