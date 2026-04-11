/**
 * 火山方舟 doubao-seedream 文生图扩展 Provider。
 * - 比例 → 固定像素 size（见 volcSeedreamConfig）
 * - response_format: b64_json，避免 TOS 预签名 URL 的浏览器 CORS
 * - watermark: false
 */
import type { AIModelConfig } from '@/types/settings';
import type { ImagesApiParams } from './imagesGenerationTypes';
import OpenAIImagesProvider from './OpenAIImagesProvider';
import { volcSeedreamPixelSizeForAspectRatio } from './volcSeedreamConfig';

export default class VolcArkSeedreamImagesProvider extends OpenAIImagesProvider {
  constructor(modelConfig: AIModelConfig | null) {
    super(modelConfig);
  }

  override transformParams(
    requestParams: Partial<{
      messages: Array<{ role?: string; content?: string }>;
      attachmentImages?: string[];
      drawerOptions?: { imageCount?: number; aspectRatio?: string; canvasAspectRatio?: string };
    }>,
    options: { params?: ImagesApiParams }
  ): ImagesApiParams {
    const base = super.transformParams(requestParams, options);
    const ar = String(base.aspect_ratio ?? '1:1');
    const size = volcSeedreamPixelSizeForAspectRatio(ar);
    return {
      ...base,
      size,
      watermark: false,
      response_format: 'b64_json',
    };
  }
}
