/**
 * 绘图师 Images API Provider（/images/generations）
 * 支持火山方舟 Seedream 协议：文生图、图文生图、流式、size/output_format/watermark
 */
import { AbstractChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModelConfig } from '@/types/settings';
import { resolveAspectRatio } from '../types/drawerOptions';

/** Images API 请求参数（兼容 OpenAI + 火山方舟 Seedream） */
interface ImagesApiParams {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  output_format?: string;
  stream?: boolean;
  image?: string;
  image2?: string;
  [key: string]: unknown;
}

/** Images API 响应 */
interface ImagesApiResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
}

function buildImagesRequest(modelConfig: AIModelConfig | null) {
  const baseURL = (modelConfig?.apiUrl?.trim() || 'https://api.openai.com/v1')
    .replace(/\/$/, '')
    + '/images/generations';
  return XRequest(baseURL, {
    manual: true,
    params: {
      model: modelConfig?.model?.trim() || 'dall-e-2',
      n: 1,
      size: '2K',
      output_format: 'png',
      stream: true,
      aspect_ratio: '1:1',
    },
    headers: modelConfig?.apiKey ? { Authorization: `Bearer ${modelConfig.apiKey}` } : undefined,
  });
}

/**
 * 将 chat 格式的 messages 转为 images API 的 prompt
 */
function getPromptFromMessages(messages: Array<{ role?: string; content?: string }> | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const content = lastUser?.content;
  return typeof content === 'string' ? content.trim() : '';
}

export default class OpenAIImagesProvider extends AbstractChatProvider<
  { role: string; content: string },
  ImagesApiParams,
  ImagesApiResponse
> {
  constructor(modelConfig: AIModelConfig | null) {
    super({ request: buildImagesRequest(modelConfig) });
  }

  transformParams(
    requestParams: Partial<{
      messages: Array<{ role?: string; content?: string }>;
      attachmentImages?: string[];
      drawerOptions?: { imageCount?: number; aspectRatio?: string; canvasAspectRatio?: string };
    }>,
    options: { params?: ImagesApiParams }
  ) {
    const messages = requestParams?.messages;
    const prompt = getPromptFromMessages(messages);
    const attachmentImages = requestParams?.attachmentImages as string[] | undefined;
    const drawerOptions = requestParams?.drawerOptions as
      | { imageCount?: number; aspectRatio?: string; canvasAspectRatio?: string }
      | undefined;
    const n = Math.min(4, Math.max(1, drawerOptions?.imageCount ?? 1));
    const aspectRatio = resolveAspectRatio(
      (drawerOptions?.aspectRatio as 'canvas' | '16:9' | '9:16' | '4:3' | '3:4' | '1:1') ?? '1:1',
      drawerOptions?.canvasAspectRatio
    );
    const base: ImagesApiParams = {
      ...(options?.params || {}),
      prompt: prompt || 'a beautiful image',
      n,
      size: '2K',
      output_format: 'png',
      stream: true,
      aspect_ratio: aspectRatio,
      extra_body: { watermark: false } as Record<string, unknown>,
    };
    if (attachmentImages?.length) {
      base.image = attachmentImages[0];
      if (attachmentImages.length > 1) base.image2 = attachmentImages[1];
    }
    return base;
  }

  transformLocalMessage(requestParams: Partial<{ messages: Array<{ role?: string; content?: string }> }>) {
    const messages = requestParams?.messages ?? [];
    return messages.filter((m) => m.role === 'user').map((m) => ({ role: 'user', content: String(m?.content ?? '') }));
  }

  transformMessage(info: {
    originMessage?: { role: string; content: string };
    chunk: ImagesApiResponse;
    chunks: ImagesApiResponse[];
    status: string;
    responseHeaders: Headers;
  }) {
    const { originMessage, chunk, chunks } = info;
    const existingUrls: string[] = [];
    try {
      const prev = originMessage?.content ? JSON.parse(originMessage.content) : null;
      if (prev?.images) existingUrls.push(...prev.images);
    } catch {
      /* ignore */
    }
    const allChunks = chunks?.length ? chunks : (chunk ? [chunk] : []);
    for (const c of allChunks) {
      const data = c?.data;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.url && !existingUrls.includes(item.url)) existingUrls.push(item.url);
          else if (item?.b64_json) {
            const b64 = `data:image/png;base64,${item.b64_json}`;
            if (!existingUrls.includes(b64)) existingUrls.push(b64);
          }
        }
      }
    }
    const urls = existingUrls.length > 0 ? existingUrls : [];
    const content =
      urls.length > 0 ? JSON.stringify({ images: urls }) : (chunk?.error?.message ?? '生成图片失败');
    return { content, role: 'assistant' };
  }
}
