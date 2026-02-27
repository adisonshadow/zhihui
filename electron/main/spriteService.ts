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

/** 自动识别每个帧的 x、y、宽、高，基于背景色列检测分隔列。返回原始帧与归一化帧。 */
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

    const columnBackgroundRatio = (x: number): number => {
      let bg = 0;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * ch;
        if (isBackground(i)) bg++;
      }
      return bg / height;
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

    const separatorColumns: number[] = [];
    for (let x = 0; x < width; x++) {
      if (columnBackgroundRatio(x) >= SEPARATOR_BACKGROUND_RATIO) separatorColumns.push(x);
    }

    const gaps: { start: number; end: number }[] = [];
    for (let i = 0; i < separatorColumns.length; i++) {
      const start = separatorColumns[i];
      let end = start;
      while (i + 1 < separatorColumns.length && separatorColumns[i + 1] === end + 1) {
        i++;
        end = separatorColumns[i];
      }
      if (end - start + 1 >= minGapPixels) gaps.push({ start, end: end + 1 });
    }

    const frames: SpriteFrameRect[] = [];
    if (gaps.length === 0) {
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
      const normalized = normalizeUniformFrames(frames, imgWidth, imgHeight);
      return { raw: frames, normalized };
    }

    const applyPadding = (x: number, y: number, w: number, h: number) => {
      const pad = FRAME_PADDING;
      const nx = Math.max(0, x - pad);
      const ny = Math.max(0, y - pad);
      const nw = Math.min(w + pad * 2, width - nx);
      const nh = Math.min(h + pad * 2, height - ny);
      return { x: nx, y: ny, width: nw, height: nh };
    };
    let prevEnd = 0;
    for (const gap of gaps) {
      if (gap.start > prevEnd) {
        const fw = gap.start - prevEnd;
        const { contentTop, contentBottom } = getContentVerticalRange(prevEnd, fw);
        const r = applyPadding(prevEnd, contentTop, fw, contentBottom - contentTop + 1);
        frames.push(r);
      }
      prevEnd = gap.end;
    }
    if (prevEnd < width) {
      const fw = width - prevEnd;
      const { contentTop, contentBottom } = getContentVerticalRange(prevEnd, fw);
      const r = applyPadding(prevEnd, contentTop, fw, contentBottom - contentTop + 1);
      frames.push(r);
    }
    if (frames.length === 0) {
      const count = 8;
      const fw = Math.floor(width / count);
      for (let i = 0; i < count; i++) {
        const fx = i * fw;
        const { contentTop, contentBottom } = getContentVerticalRange(fx, fw);
        const r = applyPadding(fx, contentTop, fw, contentBottom - contentTop + 1);
        frames.push(r);
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
