import { normalizeGenerateImagesAspect } from './aspectRatioForApi';

export type GenerateImagesToolCallRow = {
  id?: string;
  name?: string;
  arguments?: string;
};

/**
 * Bubble `extraInfo`：`generate_images` 已下发、尚未写入 `role:tool` 结果时的占位张数 / 宽高比。
 */
export function computePendingGenerateImagesBubbleExtra(args: {
  role: string;
  toolCallsRaw: GenerateImagesToolCallRow[];
  answeredToolCallIds: Set<string>;
}): {
  pendingGenerateImagesCount?: number;
  pendingGenerateImagesAspect?: string;
} {
  const { role, toolCallsRaw, answeredToolCallIds } = args;
  if (role !== 'assistant' || !toolCallsRaw.length) return {};

  const pend = toolCallsRaw.filter(
    (t) =>
      t?.name === 'generate_images' &&
      String(t?.id ?? '').trim() !== '' &&
      !answeredToolCallIds.has(String(t.id).trim()),
  );
  if (!pend.length) return {};

  let pendingGenerateImagesCount = Math.min(6, Math.max(1, pend.length));
  let aspectRaw: unknown;
  try {
    const raw = pend[0]?.arguments?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as { prompts?: unknown; aspectRatio?: unknown };
      aspectRaw = parsed.aspectRatio;
      if (Array.isArray(parsed.prompts)) {
        const pl = parsed.prompts.filter((x) => x != null && String(x).trim()).length;
        if (pl > 0) pendingGenerateImagesCount = Math.min(6, Math.max(1, pl));
      }
    }
  } catch {
    /* keep defaults */
  }

  const pendingGenerateImagesAspect = normalizeGenerateImagesAspect(aspectRaw);

  return { pendingGenerateImagesCount, pendingGenerateImagesAspect };
}
