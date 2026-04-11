/**
 * 图片编辑器内「AI 生成」：复用绘图师 Images Provider 工厂（与 AI 对话绘图师一致）
 */
import type { AIModelConfig } from '@/types/settings';
import { createImagesGenerationProvider } from '@/components/AIChat/providers/imagesProviderFactory';
import type { ImagesApiResponse } from '@/components/AIChat/providers/imagesGenerationTypes';
import { resolveAspectRatio } from '@/components/AIChat/types/drawerOptions';
import type { DrawerAspectRatio } from '@/components/AIChat/types/drawerOptions';

function parseImagesFromAssistantContent(content: string): string[] {
  try {
    const j = JSON.parse(content) as { images?: string[] };
    if (j?.images?.length) return j.images;
  } catch {
    /* 非 JSON 则为错误文案 */
  }
  return [];
}

/**
 * 文生图，返回首张可用 data URL 或 https URL（Konva 均可用 Image 加载）
 */
export async function generateDrawerImageForEditor(
  model: AIModelConfig,
  prompt: string,
  opts: { docWidth: number; docHeight: number; aspectRatio?: DrawerAspectRatio }
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: '请输入描述' };

  const provider = createImagesGenerationProvider(model);
  const req = provider.request;
  const canvasAspectRatio = `${opts.docWidth}:${opts.docHeight}`;
  const input = provider.transformParams(
    {
      messages: [{ role: 'user', content: trimmed }],
      drawerOptions: {
        imageCount: 1,
        aspectRatio: opts.aspectRatio ?? 'canvas',
        canvasAspectRatio,
      },
    },
    { params: (req.options?.params ?? {}) as Record<string, unknown> }
  );

  const chunks: ImagesApiResponse[] = [];

  return new Promise((resolve) => {
    provider.injectGetMessages(() => []);
    provider.injectRequest({
      onUpdate: (data) => {
        chunks.push(data);
      },
      onSuccess: (data, _headers) => {
        const all = data?.length ? data : chunks;
        const last = all[all.length - 1];
        const msg = provider.transformMessage({
          originMessage: undefined,
          chunk: last,
          chunks: all,
          status: 'success',
          responseHeaders: new Headers(),
        });
        const urls = parseImagesFromAssistantContent(String(msg.content ?? ''));
        const first = urls[0];
        if (first) resolve({ ok: true, url: first });
        else resolve({ ok: false, error: String(msg.content ?? '未收到图片') });
      },
      onError: (err) => {
        resolve({ ok: false, error: err?.message ?? '请求失败' });
      },
    });
    req.run(input);
  });
}

export { resolveAspectRatio };
export type { DrawerAspectRatio };
