/**
 * 绘图师 Images API 基础 Provider（/images/generations，OpenAI 兼容）
 * 流式合并逻辑见 imagesGenerationSseMerge；方舟 Seedream 见 VolcArkSeedreamImagesProvider。
 */
import { AbstractChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModelConfig } from '@/types/settings';
import { resolveAspectRatio, type DrawerAspectRatio } from '../types/drawerOptions';
import type { ImagesApiParams, ImagesApiResponse } from './imagesGenerationTypes';
import { mergeImageUrlsFromStream, parseSseFramePayload } from './imagesGenerationSseMerge';

export { type ImagesApiParams, type ImagesApiResponse } from './imagesGenerationTypes';
export { mergeImageUrlsFromStream, parseSseFramePayload } from './imagesGenerationSseMerge';

type ImagesAssistantMessage = { role: string; content: string };

function buildImagesRequest(modelConfig: AIModelConfig | null) {
  const baseURL = (modelConfig?.apiUrl?.trim() || 'https://api.openai.com/v1')
    .replace(/\/$/, '')
    + '/images/generations';
  return XRequest<ImagesApiParams, ImagesApiResponse, ImagesAssistantMessage>(baseURL, {
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

function getPromptFromMessages(messages: Array<{ role?: string; content?: string }> | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const content = lastUser?.content;
  return typeof content === 'string' ? content.trim() : '';
}

export default class OpenAIImagesProvider extends AbstractChatProvider<
  ImagesAssistantMessage,
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
  ): ImagesApiParams {
    const messages = requestParams?.messages;
    const prompt = getPromptFromMessages(messages);
    const attachmentImages = requestParams?.attachmentImages as string[] | undefined;
    const drawerOptions = requestParams?.drawerOptions as
      | { imageCount?: number; aspectRatio?: string; canvasAspectRatio?: string }
      | undefined;
    const n = Math.min(4, Math.max(1, drawerOptions?.imageCount ?? 1));
    const aspectRatio = resolveAspectRatio(
      (drawerOptions?.aspectRatio as DrawerAspectRatio) ?? '1:1',
      drawerOptions?.canvasAspectRatio
    );
    const mergedParams = (options?.params || {}) as ImagesApiParams;

    const base: ImagesApiParams = {
      ...mergedParams,
      prompt: prompt || 'a beautiful image',
      n,
      size: '2K',
      output_format: 'png',
      stream: true,
      aspect_ratio: aspectRatio,
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
    const allChunks = chunks?.length ? chunks : chunk ? [chunk] : [];
    const urls = mergeImageUrlsFromStream(originMessage?.content, allChunks);

    const innerLast = chunk ? parseSseFramePayload(chunk) : null;
    const innerFinal =
      chunks?.length && chunks.length > 0 ? parseSseFramePayload(chunks[chunks.length - 1]) : null;
    const errObj = (innerLast?.error ?? innerFinal?.error) as { message?: string } | undefined;
    const errMsg = typeof errObj?.message === 'string' ? errObj.message : undefined;

    const content = urls.length > 0 ? JSON.stringify({ images: urls }) : errMsg ?? '生成图片失败';
    return { content, role: 'assistant' };
  }
}
