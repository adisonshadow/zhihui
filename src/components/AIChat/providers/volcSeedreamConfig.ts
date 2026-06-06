/**
 * 火山方舟 doubao-seedream：宽高比 → 请求体 `size`（方式二：宽x高）或默认方式一：`2K`。
 *
 * API 仅用 `size`：方式一为 1K/2K/3K/4K（各模型版本取值不同）；方式二为 WxH 像素，
 * **不可混用**；请求体不要使用 `aspect_ratio`。
 *
 * 文档对齐：
 * - 4.0 方式一：1K｜2K｜4K；方式二：总像素 [921600, 16777216]
 * - 4.5 方式一：2K｜4K；方式二：[3686400, 16777216]
 * - 5.0 方式一：2K｜3K｜4K；方式二：[3686400, 16777216]
 *
 * doubao Seedream 当前仅 4.0 / 4.5 / 5.x 这一条产品线；枚举中的 `'5.0'` 表示 **「5.0 文档档位」**，并约定：
 * 日后若出现 5.5、6 等尚无独立文档的版本，**在未新增单独档位前**，一律与该档（方式一 2K/3K/4K、方式二下限 3686400）对齐。
 */

const SEEDREAM_ID_RE = /seedream/i;

/** `'5.0'`：含字面 5.0 与未来更高版本占位，与新版本文档对齐前应共用 5.0 档位参数 */
export type DoubaoSeedreamImagesApiTier = '4.0' | '4.5' | '5.0';

export const DOUBAO_SEEDREAM_MAX_PIXEL_PRODUCT = 16_777_216;

/** 方式二下单张图宽高乘积下限（按文档档位） */
export function doubaoSeedreamMinPixelProduct(tier: DoubaoSeedreamImagesApiTier): number {
  return tier === '4.0' ? 921_600 : 3_686_400;
}

/** 各档可选方式一取值（不参与默认逻辑默认值，仅占位文档与后续扩展） */
export function doubaoSeedreamMode1Labels(tier: DoubaoSeedreamImagesApiTier): readonly string[] {
  switch (tier) {
    case '4.0':
      return ['1K', '2K', '4K'];
    case '4.5':
      return ['2K', '4K'];
    case '5.0':
    default:
      return ['2K', '3K', '4K'];
  }
}

/**
 * 用户未指定 aspectRatio（走方式一）时统一使用 2K；各档位文档均包含 2K。
 */
export function defaultDoubaoSeedreamMode1Size(): '2K' {
  return '2K';
}

/**
 * 从 model id（如 `doubao-seedream-5-0`）推断文档档位。
 * 仅 **`seedream-4-0`（含 `4.0`）**与 **`seedream-4-5`** 单列；其余所有带 `seedream` 的 id（含 5.x、日后的 5.5/6.x 等）
 * **在未另开档位前** 一律映射为 `'5.0'`（与上文 5.0 文档对齐策略一致）。
 */
export function classifyDoubaoSeedreamImageApiTier(modelId: string): DoubaoSeedreamImagesApiTier | null {
  const id = (modelId ?? '').toLowerCase().replace(/\s+/g, '');
  if (!SEEDREAM_ID_RE.test(id)) return null;

  if (id.includes('seedream-4-5')) return '4.5';
  if (id.includes('seedream-4-0') || id.includes('seedream-4.0')) return '4.0';
  return '5.0'; // seedream-5-*、5.5、6-*、及其它 seedream-* 占位 id
}

function parseWxH(sizeWxH: string): { w: number; h: number } | null {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(sizeWxH.trim());
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) return null;
  return { w, h };
}

/**
 * 将方式二的 WxH 限制在档位允许的总像素区间（文档 [min, max]），保持宽高比尽量不变。
 */
export function clampDoubaoSeedreamPixelWxH(
  sizeWxH: string,
  tier: DoubaoSeedreamImagesApiTier,
): string {
  const parsed = parseWxH(sizeWxH);
  if (!parsed) return sizeWxH;
  const minP = doubaoSeedreamMinPixelProduct(tier);
  const maxP = DOUBAO_SEEDREAM_MAX_PIXEL_PRODUCT;
  let { w, h } = parsed;
  let p = w * h;
  if (p < minP && p > 0) {
    const scale = Math.sqrt(minP / p);
    w = Math.max(1, Math.ceil(w * scale));
    h = Math.max(1, Math.ceil(h * scale));
    while (w * h < minP) {
      if (w <= h) w += 1;
      else h += 1;
    }
    p = w * h;
  }
  if (p > maxP && p > 0) {
    const scale = Math.sqrt(maxP / p);
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    while (w > 1 && h > 1 && w * h > maxP) {
      if (w >= h) w -= 1;
      else h -= 1;
    }
  }
  return `${w}x${h}`;
}

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

/** 固定比例 → `2048x2048` 形式（方式二） */
export const VOLC_SEEDREAM_SIZE_BY_ASPECT: Record<string, string> = Object.fromEntries(
  PRESETS.map((p) => [p.aspect, `${p.w}x${p.h}`]),
) as Record<string, string>;

function normalizeAspectKey(raw: string): string {
  return raw.trim().replace(/：/g, ':').replace(/\s+/g, '');
}

/**
 * 由比例字符串得到 Seedream 方式二的 `WxH`，并按档位夹紧总像素（见文档）。
 * `tier === null` 时不夹紧（非 Seedream 调用方）。
 */
export function volcSeedreamPixelSizeForAspectRatio(
  aspectRatio: string,
  tier?: DoubaoSeedreamImagesApiTier | null,
): string {
  const key = normalizeAspectKey(aspectRatio);
  let raw = VOLC_SEEDREAM_SIZE_BY_ASPECT[key];
  if (!raw) {
    const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(key);
    if (!m) raw = '2048x2048';
    else {
      const rw = parseFloat(m[1]);
      const rh = parseFloat(m[2]);
      if (!(rh > 0) || !(rw > 0)) raw = '2048x2048';
      else {
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
        raw = `${best.w}x${best.h}`;
      }
    }
  }
  return tier ? clampDoubaoSeedreamPixelWxH(raw, tier) : raw;
}
