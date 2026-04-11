/**
 * 火山方舟 doubao-seedream：宽高比 → 请求体 `size`（宽x高像素）。
 * 见产品侧「图比例」与官方推荐分辨率对齐。
 */
const PRESETS: Array<{ aspect: string; w: number; h: number }> = [
  { aspect: '21:9', w: 3136, h: 1344 },
  { aspect: '16:9', w: 2848, h: 1600 },
  { aspect: '3:2', w: 2496, h: 1664 },
  { aspect: '4:3', w: 2304, h: 1728 },
  { aspect: '1:1', w: 2048, h: 2048 },
  { aspect: '3:4', w: 1728, h: 2304 },
  { aspect: '2:3', w: 1664, h: 2496 },
  { aspect: '9:16', w: 1600, h: 2848 },
];

/** 固定比例 → `2048x2048` 形式 */
export const VOLC_SEEDREAM_SIZE_BY_ASPECT: Record<string, string> = Object.fromEntries(
  PRESETS.map((p) => [p.aspect, `${p.w}x${p.h}`])
) as Record<string, string>;

function normalizeAspectKey(raw: string): string {
  return raw.trim().replace(/：/g, ':').replace(/\s+/g, '');
}

/**
 * 根据 `aspect_ratio` 字符串（如 16:9、画布推导出的 1920:1080）得到 Seedream `size`。
 */
export function volcSeedreamPixelSizeForAspectRatio(aspectRatio: string): string {
  const key = normalizeAspectKey(aspectRatio);
  const direct = VOLC_SEEDREAM_SIZE_BY_ASPECT[key];
  if (direct) return direct;

  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(key);
  if (!m) return '2048x2048';
  const rw = parseFloat(m[1]);
  const rh = parseFloat(m[2]);
  if (!(rh > 0) || !(rw > 0)) return '2048x2048';
  const r = rw / rh;

  let best = PRESETS[4];
  let bestDiff = Infinity;
  for (const p of PRESETS) {
    const diff = Math.abs(p.w / p.h - r);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return `${best.w}x${best.h}`;
}
