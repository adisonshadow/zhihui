/**
 * 火山方舟 doubao-seedream 文生图扩展 Provider。
 * - 比例 → 固定像素 size（见 volcSeedreamConfig）
 * - response_format: b64_json，避免 TOS 预签名 URL 的浏览器 CORS
 * - watermark: false
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import type { ImagesApiParams } from './imagesGenerationTypes';
import OpenAIImagesProvider from './OpenAIImagesProvider';
import {
  classifyDoubaoSeedreamImageApiTier,
  volcSeedreamPixelSizeForAspectRatio,
} from './volcSeedreamConfig';

export default class VolcArkSeedreamImagesProvider extends OpenAIImagesProvider {
  private readonly seedreamModelConfig: AIModelConfig | null;

  constructor(modelConfig: AIModelConfig | null) {
    super(modelConfig);
    this.seedreamModelConfig = modelConfig;
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
    const mid = resolveRequestModelId(this.seedreamModelConfig ?? null) ?? '';
    const tier = classifyDoubaoSeedreamImageApiTier(mid) ?? '5.0';
    const size = volcSeedreamPixelSizeForAspectRatio(ar, tier);
    const { aspect_ratio: _omit, ...rest } = base;
    return {
      ...rest,
      size,
      watermark: false,
      response_format: 'b64_json',
    };
  }
}
