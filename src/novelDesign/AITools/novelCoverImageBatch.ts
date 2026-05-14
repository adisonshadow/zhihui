/**
 * 小说封面 Popover：用已配置的「绘图」模型批量文生图（不走完整 Chat Provider，仅 HTTP）。
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import { looksLikeVolcArkSeedream } from '@/components/AIChat/providers/imagesProviderFactory';
import { mergeImageUrlsFromStream } from '@/components/AIChat/providers/imagesGenerationSseMerge';
import { volcSeedreamPixelSizeForAspectRatio } from '@/components/AIChat/providers/volcSeedreamConfig';

function authHeaders(model: AIModelConfig): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!model.isLocal && model.apiKey?.trim()) {
    h.Authorization = `Bearer ${model.apiKey.trim()}`;
  }
  return h;
}

function imagesUrl(model: AIModelConfig): string {
  const base = (model.apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  return `${base}/images/generations`;
}

function pickFirstImageUrl(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as { data?: Array<{ url?: string; b64_json?: string }> };
  const first = d.data?.[0];
  if (first?.url) return first.url;
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  return '';
}

async function postNonStream(model: AIModelConfig, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(imagesUrl(model), {
    method: 'POST',
    headers: authHeaders(model),
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message || res.statusText || 'images/generations 失败');
  }
  const url = pickFirstImageUrl(json);
  if (!url) throw new Error('响应中无图片 URL 或 b64_json');
  return url;
}

async function generateOpenAiLike(model: AIModelConfig, prompt: string): Promise<string> {
  const mid = resolveRequestModelId(model) || 'dall-e-2';
  try {
    return await postNonStream(model, {
      model: mid,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
      stream: false,
    });
  } catch {
    return await postNonStream(model, {
      model: mid,
      prompt,
      n: 1,
      size: '1024x1024',
      stream: false,
    });
  }
}

async function generateVolcStream(model: AIModelConfig, prompt: string): Promise<string> {
  const mid = resolveRequestModelId(model) || '';
  const body = {
    model: mid,
    prompt,
    n: 1,
    stream: true,
    response_format: 'b64_json',
    watermark: false,
    size: volcSeedreamPixelSizeForAspectRatio('1:1'),
    aspect_ratio: '1:1',
  };
  const res = await fetch(imagesUrl(model), {
    method: 'POST',
    headers: authHeaders(model),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200) || res.statusText);
  }
  const text = await res.text();
  const chunks: unknown[] = [];
  for (const block of text.split(/\n\n+/)) {
    for (const line of block.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      chunks.push({ data: payload });
    }
  }
  const urls = mergeImageUrlsFromStream(undefined, chunks);
  if (!urls.length) throw new Error('流式出图未解析到图片');
  return urls[urls.length - 1]!;
}

/** 单条提示词生成一张图（data URL 或 https URL） */
export async function generateCoverImageDataUrl(model: AIModelConfig | null, prompt: string): Promise<string> {
  if (!model || !prompt.trim()) throw new Error('未配置绘图模型或提示词为空');
  if (looksLikeVolcArkSeedream(model)) {
    return generateVolcStream(model, prompt.trim());
  }
  return generateOpenAiLike(model, prompt.trim());
}

/** 依次生成 4 张（串行，避免部分厂商限流） */
export async function generateFourCoverImages(
  model: AIModelConfig | null,
  prompts: string[]
): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < prompts.length; i++) {
    const p = (prompts[i] ?? '').trim();
    if (!p) {
      errors.push(`第 ${i + 1} 条提示词为空`);
      urls.push('');
      continue;
    }
    try {
      urls.push(await generateCoverImageDataUrl(model, p));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`第 ${i + 1} 张：${msg}`);
      urls.push('');
    }
  }
  return { urls, errors };
}
