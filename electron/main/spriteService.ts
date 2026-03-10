/**
 * 精灵图服务：借助 sharp 读取背景色（左上 2x2 平均）与自动解析帧边界
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import sharp from 'sharp';

export interface SpriteBackgroundColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getFullPath(projectDir: string, relativePath: string): string {
  return path.join(path.normalize(projectDir), relativePath);
}

/** 提取左上角 2x2 像素区域，计算平均 RGBA，作为背景色用于抠图 */
export async function getSpriteBackgroundColor(
  projectDir: string,
  relativePath: string
): Promise<SpriteBackgroundColor | null> {
  try {
    const fullPath = getFullPath(projectDir, relativePath);
    const meta = await sharp(fullPath).metadata();
    const w0 = Math.min(2, meta.width ?? 2);
    const h0 = Math.min(2, meta.height ?? 2);
    const { data, info } = await sharp(fullPath)
      .ensureAlpha()
      .extract({ left: 0, top: 0, width: w0, height: h0 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const channels = info.channels;
    let r = 0, g = 0, b = 0, a = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * channels;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        a += channels >= 4 ? data[i + 3] : 255;
        n++;
      }
    }
    if (n === 0) return null;
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
      a: Math.round(a / n),
    };
  } catch {
    return null;
  }
}

/** 分隔列判定：列中背景像素占比超过此值才视为分隔。0.97 较严格，避免角色内绿色/抗锯齿被误判导致原始帧过窄。 */
const SEPARATOR_BACKGROUND_RATIO = 0.99;

/** 帧边界扩展像素，避免裁剪到内容边缘 */
const FRAME_PADDING = 5;

/** 用 IQR 排除异常值，返回在 [Q1 - 1.5*IQR, Q3 + 1.5*IQR] 内的数 */
function filterOutliers(values: number[]): number[] {
  if (values.length <= 2) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values.filter((v) => v >= lo && v <= hi);
}

/**
 * 过滤并合并过窄的列范围（由帧内透明间隙引起的误识别）。
 * 将宽度小于中位数 40% 的列范围合并到相邻列范围，反复迭代直至稳定。
 */
function mergeNarrowColRanges(
  colRanges: { left: number; right: number }[]
): { left: number; right: number }[] {
  if (colRanges.length <= 1) return colRanges;
  const ranges = colRanges.map((r) => ({ ...r }));
  for (let pass = 0; pass < 20; pass++) {
    const widths = ranges.map((r) => r.right - r.left);
    const sorted = [...widths].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const minWidth = Math.max(1, Math.floor(median * 0.4));
    let changed = false;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i]!.right - ranges[i]!.left < minWidth) {
        if (i === 0 && ranges.length > 1) {
          ranges[1]!.left = ranges[0]!.left;
          ranges.splice(0, 1);
          i--;
        } else if (i > 0) {
          ranges[i - 1]!.right = ranges[i]!.right;
          ranges.splice(i, 1);
          i--;
        }
        changed = true;
      }
    }
    if (!changed || ranges.length <= 1) break;
  }
  return ranges;
}

/**
 * 过滤并合并过窄的行范围（由帧内透明间隙引起的误识别）。
 * 将高度小于中位数 40% 的行范围合并到相邻行范围，反复迭代直至稳定。
 */
function mergeNarrowRowRanges(
  rowRanges: { top: number; bottom: number }[]
): { top: number; bottom: number }[] {
  if (rowRanges.length <= 1) return rowRanges;
  const ranges = rowRanges.map((r) => ({ ...r }));
  for (let pass = 0; pass < 20; pass++) {
    const heights = ranges.map((r) => r.bottom - r.top);
    const sorted = [...heights].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const minHeight = Math.max(1, Math.floor(median * 0.4));
    let changed = false;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i]!.bottom - ranges[i]!.top < minHeight) {
        if (i === 0 && ranges.length > 1) {
          ranges[1]!.top = ranges[0]!.top;
          ranges.splice(0, 1);
          i--;
        } else if (i > 0) {
          ranges[i - 1]!.bottom = ranges[i]!.bottom;
          ranges.splice(i, 1);
          i--;
        }
        changed = true;
      }
    }
    if (!changed || ranges.length <= 1) break;
  }
  return ranges;
}

/**
 * 宽高归一化：宽度取所有帧的最大值（避免裁剪）；高度排除异常值后取最大，用于过滤描述文字（如底部）。
 * x/y 计算：利用原始 xy、宽高 与 归一化宽高，按帧中心对齐得到新坐标（水平非等分网格）。
 */
function normalizeUniformFrames(
  frames: SpriteFrameRect[],
  imgWidth: number,
  imgHeight: number
): SpriteFrameRect[] {
  if (frames.length === 0) return frames;
  console.log('[getSpriteFrames] 原始帧宽高:', frames.map((f, i) => ({ i, x: f.x, y: f.y, width: f.width, height: f.height })));
  const widths = frames.map((f) => f.width);
  const heights = frames.map((f) => f.height);
  const heightsFiltered = filterOutliers(heights);
  const maxW = Math.max(0, ...widths);
  const maxH = Math.max(0, ...(heightsFiltered.length > 0 ? heightsFiltered : heights));
  const w = Math.min(maxW, imgWidth);
  const h = Math.min(maxH, imgHeight);
  const result = frames.map((f) => {
    const centerX = f.x + f.width / 2;
    const centerY = f.y + f.height / 2;
    const newX = Math.max(0, Math.min(centerX - w / 2, imgWidth - w));
    const newY = Math.max(0, Math.min(centerY - h / 2, imgHeight - h));
    return {
      x: newX,
      y: newY,
      width: w,
      height: h,
    };
  });
  console.log('[getSpriteFrames] 归一化后帧宽高:', result.map((f, i) => ({ i, x: f.x, y: f.y, width: f.width, height: f.height })), '归一化 w=', w, 'h=', h);
  return result;
}

/** 自动识别每个帧的 x、y、宽、高，基于背景色检测分隔列与分隔行。支持多行多列，帧顺序先行后列（第1行第1列、第1行第2列…第2行第1列…）。返回原始帧与归一化帧。 */
export async function getSpriteFrames(
  projectDir: string,
  relativePath: string,
  background: SpriteBackgroundColor | null,
  options?: { backgroundThreshold?: number; minGapPixels?: number; useTransparentBackground?: boolean }
): Promise<{ raw: SpriteFrameRect[]; normalized: SpriteFrameRect[] }> {
  const threshold = options?.backgroundThreshold ?? 120;
  const minGapPixels = options?.minGapPixels ?? 6;
  const useTransparent = options?.useTransparentBackground ?? false;
  try {
    const fullPath = getFullPath(projectDir, relativePath);
    const meta = await sharp(fullPath).metadata();
    const imgWidth = meta.width ?? 0;
    const imgHeight = meta.height ?? 0;
    if (imgWidth <= 0 || imgHeight <= 0) return { raw: [], normalized: [] };

    const { data, info } = await sharp(fullPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const ch = info.channels;
    const tr = background?.r ?? 0;
    const tg = background?.g ?? 255;
    const tb = background?.b ?? 0;

    const isBackground = (i: number): boolean => {
      if (useTransparent && ch >= 4) {
        const a = data[i + 3] ?? 255;
        return a < 20;
      }
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const dist = Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb);
      return dist < threshold;
    };

    /** 列中（在 scanTop..scanBottom 范围内）背景像素占比 */
    const columnBackgroundRatio = (x: number, scanTop: number, scanBottom: number): number => {
      const scanH = scanBottom - scanTop;
      if (scanH <= 0) return 1;
      let bg = 0;
      for (let y = scanTop; y < scanBottom; y++) {
        const i = (y * width + x) * ch;
        if (isBackground(i)) bg++;
      }
      return bg / scanH;
    };

    /** 行中（在 scanLeft..scanRight 范围内）背景像素占比（用于按行识别） */
    const rowBackgroundRatio = (y: number, scanLeft: number, scanRight: number): number => {
      const scanW = scanRight - scanLeft;
      if (scanW <= 0) return 1;
      let bg = 0;
      for (let x = scanLeft; x < scanRight; x++) {
        const i = (y * width + x) * ch;
        if (isBackground(i)) bg++;
      }
      return bg / scanW;
    };

    /** 在横向区域 [frameX, frameX+frameW) 内找有内容的行范围，返回 { contentTop, contentBottom } */
    const getContentVerticalRange = (frameX: number, frameW: number): { contentTop: number; contentBottom: number } => {
      let contentTop = height;
      let contentBottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = frameX; x < frameX + frameW && x < width; x++) {
          const i = (y * width + x) * ch;
          if (!isBackground(i)) {
            if (y < contentTop) contentTop = y;
            if (y > contentBottom) contentBottom = y;
            break;
          }
        }
      }
      if (contentTop > contentBottom) return { contentTop: 0, contentBottom: height - 1 };
      return { contentTop, contentBottom };
    };

    /** 计算内容包围盒（全图扫描所有非背景像素），避免将边缘透明区域误判为分隔 */
    let bboxLeft = width, bboxRight = -1, bboxTop = height, bboxBottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * ch;
        if (!isBackground(i)) {
          if (x < bboxLeft) bboxLeft = x;
          if (x > bboxRight) bboxRight = x;
          if (y < bboxTop) bboxTop = y;
          if (y > bboxBottom) bboxBottom = y;
        }
      }
    }
    if (bboxLeft > bboxRight || bboxTop > bboxBottom) return { raw: [], normalized: [] };
    /** 内容区域（exclusive 右/下边界） */
    const contentL = bboxLeft;
    const contentR = bboxRight + 1;
    const contentT = bboxTop;
    const contentB = bboxBottom + 1;

    /** 只在内容区域内扫描分隔列，避免将边缘空白列误判为分隔 */
    const separatorColumns: number[] = [];
    for (let x = contentL; x < contentR; x++) {
      if (columnBackgroundRatio(x, contentT, contentB) >= SEPARATOR_BACKGROUND_RATIO) separatorColumns.push(x);
    }

    const gaps: { start: number; end: number }[] = [];
    for (let i = 0; i < separatorColumns.length; i++) {
      const start = separatorColumns[i]!;
      let end = start;
      while (i + 1 < separatorColumns.length && separatorColumns[i + 1] === end + 1) {
        i++;
        end = separatorColumns[i]!;
      }
      if (end - start + 1 >= minGapPixels) gaps.push({ start, end: end + 1 });
    }

    /** 只在内容区域内扫描分隔行 */
    const separatorRows: number[] = [];
    for (let y = contentT; y < contentB; y++) {
      if (rowBackgroundRatio(y, contentL, contentR) >= SEPARATOR_BACKGROUND_RATIO) separatorRows.push(y);
    }

    const rowGaps: { start: number; end: number }[] = [];
    for (let i = 0; i < separatorRows.length; i++) {
      const start = separatorRows[i]!;
      let end = start;
      while (i + 1 < separatorRows.length && separatorRows[i + 1] === end + 1) {
        i++;
        end = separatorRows[i]!;
      }
      if (end - start + 1 >= minGapPixels) rowGaps.push({ start, end: end + 1 });
    }

    const applyPadding = (x: number, y: number, w: number, h: number) => {
      const pad = FRAME_PADDING;
      const nx = Math.max(0, x - pad);
      const ny = Math.max(0, y - pad);
      const nw = Math.min(w + pad * 2, width - nx);
      const nh = Math.min(h + pad * 2, height - ny);
      return { x: nx, y: ny, width: nw, height: nh };
    };

    /** 构建列范围：每列 [left, right)；以内容区域为边界，无列分隔时按 8 列均分内容区域 */
    const rawColRanges: { left: number; right: number }[] = [];
    if (gaps.length === 0) {
      const count = 8;
      const fw = Math.floor((contentR - contentL) / count);
      for (let i = 0; i < count; i++) {
        rawColRanges.push({ left: contentL + i * fw, right: i < count - 1 ? contentL + (i + 1) * fw : contentR });
      }
    } else {
      if (gaps[0]!.start > contentL) rawColRanges.push({ left: contentL, right: gaps[0]!.start });
      for (let i = 0; i < gaps.length; i++) {
        const next = gaps[i + 1];
        const right = next ? next.start : contentR;
        if (gaps[i]!.end < right) rawColRanges.push({ left: gaps[i]!.end, right });
      }
    }
    /** 合并因帧内透明间隙（如角色腿部之间）误分割出的过窄列范围 */
    const colRanges = mergeNarrowColRanges(rawColRanges.filter((c) => c.right > c.left));
    if (colRanges.length !== rawColRanges.length) {
      console.log(`[getSpriteFrames] 列合并：${rawColRanges.length} → ${colRanges.length} 列`);
    }

    /** 构建行范围：每行 [top, bottom)；以内容区域为边界，无行分隔时整图内容区一行 */
    const rawRowRanges: { top: number; bottom: number }[] = [];
    if (rowGaps.length === 0) {
      rawRowRanges.push({ top: contentT, bottom: contentB });
    } else {
      if (rowGaps[0]!.start > contentT) rawRowRanges.push({ top: contentT, bottom: rowGaps[0]!.start });
      for (let i = 0; i < rowGaps.length; i++) {
        const next = rowGaps[i + 1];
        const bottom = next ? next.start : contentB;
        if (rowGaps[i]!.end < bottom) rawRowRanges.push({ top: rowGaps[i]!.end, bottom });
      }
    }
    /** 合并因帧内透明间隙误分割出的过窄行范围 */
    const rowRanges = mergeNarrowRowRanges(rawRowRanges.filter((r) => r.bottom > r.top));
    if (rowRanges.length !== rawRowRanges.length) {
      console.log(`[getSpriteFrames] 行合并：${rawRowRanges.length} → ${rowRanges.length} 行`);
    }

    const frames: SpriteFrameRect[] = [];
    if (rowRanges.length === 1 && colRanges.length >= 1) {
      /** 单行：按列从左到右，用 getContentVerticalRange 裁剪垂直内容 */
      for (const col of colRanges) {
        const fw = col.right - col.left;
        const { contentTop, contentBottom } = getContentVerticalRange(col.left, fw);
        const r = applyPadding(col.left, contentTop, fw, contentBottom - contentTop + 1);
        frames.push(r);
      }
    } else if (rowRanges.length >= 1 && colRanges.length >= 1) {
      /** 多行多列：顺序先行后列（第1行第1列、第1行第2列…第2行第1列…） */
      for (let rowIdx = 0; rowIdx < rowRanges.length; rowIdx++) {
        const row = rowRanges[rowIdx]!;
        const fh = row.bottom - row.top;
        for (let colIdx = 0; colIdx < colRanges.length; colIdx++) {
          const col = colRanges[colIdx]!;
          const fw = col.right - col.left;
          const r = applyPadding(col.left, row.top, fw, fh);
          frames.push(r);
        }
      }
    }

    if (frames.length === 0) {
      /** 回退：未检测到任何分隔，按 8 列单行均分 */
      const count = 8;
      const fw = Math.floor(width / count);
      for (let i = 0; i < count; i++) {
        const fx = i * fw;
        const { contentTop, contentBottom } = getContentVerticalRange(fx, fw);
        const pad = FRAME_PADDING;
        frames.push({
          x: Math.max(0, fx - pad),
          y: Math.max(0, contentTop - pad),
          width: Math.min(fw + pad * 2, width - Math.max(0, fx - pad)),
          height: Math.min(contentBottom - contentTop + 1 + pad * 2, height - Math.max(0, contentTop - pad)),
        });
      }
    }

    /** 帧级兜底过滤：移除宽度或高度明显偏小的异常帧（相对阈值：中位数的 30%，绝对最小：FRAME_PADDING*2） */
    if (frames.length > 1) {
      const fws = frames.map((f) => f.width);
      const fhs = frames.map((f) => f.height);
      const sortedW = [...fws].sort((a, b) => a - b);
      const sortedH = [...fhs].sort((a, b) => a - b);
      const medW = sortedW[Math.floor(sortedW.length / 2)] ?? 1;
      const medH = sortedH[Math.floor(sortedH.length / 2)] ?? 1;
      const minW = Math.max(FRAME_PADDING * 2, medW * 0.3);
      const minH = Math.max(FRAME_PADDING * 2, medH * 0.3);
      const kept = frames.filter((f) => f.width >= minW && f.height >= minH);
      if (kept.length > 0 && kept.length !== frames.length) {
        console.log(`[getSpriteFrames] 帧级过滤：${frames.length} → ${kept.length} 帧（移除了 ${frames.length - kept.length} 个异常帧）`);
        frames.length = 0;
        frames.push(...kept);
      }
    }

    const normalized = normalizeUniformFrames(frames, imgWidth, imgHeight);
    return { raw: frames, normalized };
  } catch {
    return { raw: [], normalized: [] };
  }
}

/** 从精灵图中提取指定区域到临时文件，返回临时文件路径（由调用方保存后删除） */
export async function extractSpriteCoverToTemp(
  projectDir: string,
  relativePath: string,
  frame: SpriteFrameRect
): Promise<{ ok: boolean; tempPath?: string; error?: string }> {
  try {
    const fullPath = getFullPath(projectDir, relativePath);
    if (!fs.existsSync(fullPath)) return { ok: false, error: '精灵图文件不存在' };
    const meta = await sharp(fullPath).metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (imgW <= 0 || imgH <= 0) return { ok: false, error: '无法读取图片尺寸' };
    let left = Math.round(frame.x);
    let top = Math.round(frame.y);
    let w = Math.round(frame.width);
    let h = Math.round(frame.height);
    if (w <= 0 || h <= 0) return { ok: false, error: '帧尺寸无效' };
    left = Math.max(0, Math.min(left, imgW - 1));
    top = Math.max(0, Math.min(top, imgH - 1));
    w = Math.min(w, imgW - left);
    h = Math.min(h, imgH - top);
    if (w <= 0 || h <= 0) return { ok: false, error: '裁剪区域无效' };
    const buf = await sharp(fullPath)
      .extract({ left, top, width: w, height: h })
      .png()
      .toBuffer();
    const tempPath = path.join(os.tmpdir(), `yiman_sprite_cover_${Date.now()}.png`);
    fs.writeFileSync(tempPath, buf);
    return { ok: true, tempPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
