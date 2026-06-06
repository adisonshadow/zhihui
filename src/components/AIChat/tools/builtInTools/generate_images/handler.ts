/**
 * 原子 Tool：generate_images — API 请求与注册
 * 气泡内「生成中 / 结果展示」见同目录 `generateImagesChatUi.tsx`；模块入口见 `index.ts`
 *
 * 图片生成后自动通过 window.yiman.images.cache 缓存到磁盘（{userData}/yiman/image-cache/）
 */
import type { FunctionCallDef } from '../../../utils/functionRegistry';
import { registerFunctionCall } from '../../../utils/functionRegistry';
import { pickFirstImageUrl, authHeaders, imagesUrl } from '../_apiHelpers';
import {
  classifyDoubaoSeedreamImageApiTier,
  defaultDoubaoSeedreamMode1Size,
  volcSeedreamPixelSizeForAspectRatio,
} from '../../../providers/volcSeedreamConfig';
import {
  explicitGenerateImagesAspect,
  imagesGenerationFieldsForAspect,
  type GenerateImagesAspectRatioKey,
} from './aspectRatioForApi';

async function generateSingleImage(
  model: { apiUrl: string; apiKey?: string; isLocal?: boolean; modelId?: string },
  prompt: string,
  explicitAspect: GenerateImagesAspectRatioKey | null,
): Promise<string> {
  const modelIdStr = model.modelId || 'dall-e-2';
  const seedreamTier = classifyDoubaoSeedreamImageApiTier(modelIdStr);

  const body: Record<string, unknown> = {
    model: modelIdStr,
    prompt,
    n: 1,
    response_format: 'url',
  };

  if (seedreamTier != null) {
    Object.assign(body, {
      watermark: false,
      size:
        explicitAspect == null
          ? defaultDoubaoSeedreamMode1Size()
          : volcSeedreamPixelSizeForAspectRatio(explicitAspect, seedreamTier),
    });
  } else {
    const aspect = explicitAspect ?? '1:1';
    const { size, aspect_ratio } = imagesGenerationFieldsForAspect(aspect);
    Object.assign(body, { size, aspect_ratio });
  }
  const res = await fetch(imagesUrl(model.apiUrl), {
    method: 'POST',
    headers: authHeaders(model.apiKey, model.isLocal),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(t.slice(0, 300));
  }
  const json = (await res.json()) as { data?: unknown };
  const url = pickFirstImageUrl(json);
  if (!url) throw new Error('响应中无图片 URL');
  return url;
}

async function getDrawModel() {
  const { getAISettings } = await import('@/utils/settingsStorage');
  const settings = await getAISettings();
  if (!settings?.models?.length) return null;
  return (
    settings.models.find(
      (m) =>
        m.capabilityKeys?.includes('draw') &&
        m.apiUrl?.trim() &&
        (m.isLocal || m.apiKey?.trim()),
    ) ?? null
  );
}

async function handler(raw: Record<string, unknown>): Promise<{
  ok: boolean;
  images?: string[];
  errors?: string[];
  summary?: string;
  error?: string;
}> {
  const prompts = Array.isArray(raw.prompts)
    ? raw.prompts.map((s) => String(s ?? '').trim()).filter(Boolean)
    : [];
  if (prompts.length === 0) {
    return { ok: false, error: 'prompts 不能为空' };
  }

  const explicitAspect = explicitGenerateImagesAspect(raw.aspectRatio);

  const model = await getDrawModel();
  if (!model) {
    return { ok: false, error: '未找到可用的绘图模型，请在设置中添加具备「绘图」能力的模型' };
  }

  const resolvedModel = {
    apiUrl: model.apiUrl ?? '',
    apiKey: model.apiKey,
    isLocal: model.isLocal,
    modelId: model.modelDisplayName
      ? [model.modelDisplayName, model.primaryVersion].filter(Boolean).join('-')
      : model.model,
  };

  const images: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    try {
      const url = await generateSingleImage(resolvedModel, prompts[i]!, explicitAspect);
      images.push(url);
    } catch (e) {
      errors.push(`第 ${i + 1} 张：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 生成后立即异步缓存到本地磁盘（不阻塞返回）
  if (images.length > 0) {
    const imgCache = typeof window !== 'undefined' ? (window as any).yiman?.images?.cache : undefined;
    if (imgCache?.saveBatch) {
      imgCache.saveBatch(images).catch(() => {});
    } else if (imgCache?.save) {
      for (const url of images) {
        imgCache.save(url).catch(() => {});
      }
    }
  }

  const summary = `已生成 ${images.length} 张图片${errors.length ? `，${errors.length} 张失败` : ''}。图片数据在前端展示，请据此与用户沟通。`;

  return { ok: true, images, errors: errors.length ? errors : undefined, summary };
}

export function registerGenerateImagesTool(): void {
  const def: FunctionCallDef = {
    name: 'generate_images',
    description:
      '生成图片。传入 1–6 条中文或英文提示词（prompts）。可选用 aspectRatio 指定宽高比（1:1 | 16:9 | 9:16 | 4:3 | 3:4）。若为 doubao Seedream：仅 seedream-4-0｜seedream-4-5 与「其它任意 seedream model id」（含 5.x 及日后更高版本占位）分列两档下限；其中非 4-0/4-5 者一律按 5.0 档位规则处理。不传 aspectRatio 时方式一默认 size=2K；传入时方式二用 WxH（4.0 总像素下限约 921600，其余约 3686400）。不传 aspectRatio 时构图请在 prompt 中描述。其它 OpenAI 兼容模型不传 aspectRatio 时按 1:1。',
    parameters: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 6,
          description: '1–6 条图片描述提示词。',
        },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description:
            '可选。Seedream 不传则方式一默认 2K；其它兼容模型不传则按 1:1。指定时用方式二 WxH。',
        },
      },
      required: ['prompts'],
      additionalProperties: false,
    },
    scope: { type: 'orchestrator' },
    handler,
  };

  registerFunctionCall(def);
}
