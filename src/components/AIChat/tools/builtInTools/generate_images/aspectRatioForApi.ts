/** Tool schema 与 Images API 共用的宽高比枚举（缺省一律按 1:1） */
export const GENERATE_IMAGES_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export type GenerateImagesAspectRatioKey = (typeof GENERATE_IMAGES_ASPECT_RATIOS)[number];

/** Tool 传入的合法枚举宽高比；未传或非枚举时为 null（Seedream 将走默认 2K，其它模型再走 1:1） */
export function explicitGenerateImagesAspect(raw: unknown): GenerateImagesAspectRatioKey | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return (GENERATE_IMAGES_ASPECT_RATIOS as readonly string[]).includes(s)
    ? (s as GenerateImagesAspectRatioKey)
    : null;
}

export function normalizeGenerateImagesAspect(raw: unknown): GenerateImagesAspectRatioKey {
  return explicitGenerateImagesAspect(raw) ?? '1:1';
}

/**
 * OpenAI 兼容 `size`（DALL-E 3 常用档位）+ 部分网关消费的 `aspect_ratio`（冒号格式）。
 * doubao Seedream 请走 handler 内分支，勿用本函数。
 */
export function imagesGenerationFieldsForAspect(
  ar: GenerateImagesAspectRatioKey,
): { size: string; aspect_ratio: string } {
  const sizeMap: Record<GenerateImagesAspectRatioKey, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    /** 部分后端不支持精确 4:3，降级为方图；方舟等可走 aspect_ratio */
    '4:3': '1024x1024',
    '3:4': '1024x1024',
  };
  return { size: sizeMap[ar], aspect_ratio: ar };
}
