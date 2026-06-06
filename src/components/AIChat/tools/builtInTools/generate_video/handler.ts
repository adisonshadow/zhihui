/**
 * 原子 Tool：generate_video — 单次仅生成 **1** 段视频（见参数说明）
 */
import type { FunctionCallDef } from '../../../utils/functionRegistry';
import { registerFunctionCall } from '../../../utils/functionRegistry';
import type { AIModelConfig } from '@/types/settings';
import { authHeaders, videosGenerationsUrl, pickFirstVideoUrl } from '../_apiHelpers';

async function getVideoModel() {
  const { getAISettings } = await import('@/utils/settingsStorage');
  const settings = await getAISettings();
  if (!settings?.models?.length) return null;
  return (
    settings.models.find(
      (m) =>
        m.capabilityKeys?.includes('video') &&
        m.apiUrl?.trim() &&
        (m.isLocal || m.apiKey?.trim()),
    ) ?? null
  );
}

function resolveVideoRequestModel(model: AIModelConfig) {
  return model.modelDisplayName
    ? [model.modelDisplayName, model.primaryVersion].filter(Boolean).join('-')
    : model.model;
}

async function handler(raw: Record<string, unknown>): Promise<{
  ok: boolean;
  video?: string;
  summary?: string;
  error?: string;
}> {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (!prompt) return { ok: false, error: 'prompt 不能为空' };

  let duration_seconds: number | undefined;
  if (raw.durationSeconds != null && raw.durationSeconds !== '') {
    const n = Number(raw.durationSeconds);
    if (Number.isFinite(n) && n > 0) {
      duration_seconds = Math.min(60, Math.max(2, Math.floor(n)));
    }
  }

  const model = await getVideoModel();
  if (!model) {
    return {
      ok: false,
      error: '未找到可用的「生视频」模型，请在设置中为某条模型勾选「生视频」能力（capabilityKeys: video）',
    };
  }

  const modelId = resolveVideoRequestModel(model)?.trim();
  const body: Record<string, unknown> = {
    model: modelId || 'video-gen',
    prompt,
    /* 明示单条（若网关读取该字段）；未实现的网关会忽略 */
    n: 1,
  };
  if (duration_seconds != null) body.duration_seconds = duration_seconds;

  const url = videosGenerationsUrl(model.apiUrl ?? '');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(model.apiKey, model.isLocal),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    return { ok: false, error: t.slice(0, 480) };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: '响应解析失败（非 JSON）' };
  }

  const videoUrl = pickFirstVideoUrl(json);
  if (!videoUrl) return { ok: false, error: '响应中无可播放视频 URL（请确认网关已实现 OpenAI 兼容 POST /videos/generations）' };

  return {
    ok: true,
    video: videoUrl,
    summary: '已生成 1 段视频，播放器见对话区。',
  };
}

export function registerGenerateVideoTool(): void {
  const def: FunctionCallDef = {
    name: 'generate_video',
    description:
      '根据文本描述生成视频，**单次固定只生成 1 段**（不支持批量）。需在设置中配置具备「生视频」能力的模型，且网关提供 OpenAI 兼容 `POST .../videos/generations`（返回体含视频 URL）。可选用 durationSeconds（秒，大约 2–60）。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '视频内容描述（中文或英文）。',
        },
        durationSeconds: {
          type: 'number',
          description: '可选。目标时长（秒），网关支持时生效；不传则由模型默认。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    scope: { type: 'orchestrator' },
    handler,
  };

  registerFunctionCall(def);
}
