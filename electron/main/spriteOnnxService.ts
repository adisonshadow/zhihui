/**
 * 精灵图抠图服务：所有抠图模型由 ai-model-service 托管
 * 帧边界检测复用 spriteService（背景列）以正确切割每帧
 * Chroma Key 为纯像素运算，保留在此
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import sharp from 'sharp';
import {
  getSpriteBackgroundColor,
  getSpriteFrames,
} from './spriteService';
import { callMattingApi } from '../ai-model-service/client';

export interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 基于背景色的 chroma key 抠图，使用软过渡保留抗锯齿边缘
 */
function chromaKeyFrame(
  data: Buffer,
  w: number,
  h: number,
  channels: number,
  bg: { r: number; g: number; b: number }
): Buffer {
  const rgba = Buffer.alloc(w * h * 4);
  const LO = 25;
  const HI = 70;
  for (let i = 0; i < w * h; i++) {
    const si = i * channels;
    const r = data[si] ?? 0;
    const g = data[si + 1] ?? 0;
    const b = data[si + 2] ?? 0;
    const dist = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
    let a: number;
    if (dist <= LO) a = 0;
    else if (dist >= HI) a = 255;
    else a = Math.round((255 * (dist - LO)) / (HI - LO));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
}

/** 单帧抠图：模型类走 ai-model-service；RVM 有背景色且非强制时走 Chroma Key */
async function matteFrame(
  image: sharp.Sharp,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  useChromaKey: boolean,
  bgColor: { r: number; g: number; b: number } | null,
  downsampleRatio: number,
  model: MattingModel,
  u2netpAlphaMatting?: boolean
): Promise<Buffer> {
  const { data, info } = await image
    .clone()
    .extract({ left: frameX, top: frameY, width: frameW, height: frameH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  if (useChromaKey && bgColor) {
    return chromaKeyFrame(data, w, h, ch, bgColor);
  }

  const apiModels: MattingModel[] = ['rvm', 'birefnet', 'mvanet', 'u2netp', 'rmbg2'];
  if (apiModels.includes(model)) {
    const options: Record<string, unknown> = {};
    if (model === 'rvm') options.downsampleRatio = downsampleRatio;
    if (model === 'u2netp') options.u2netpAlphaMatting = u2netpAlphaMatting ?? false;
    const res = await callMattingApi(model, data, w, h, ch, Object.keys(options).length > 0 ? options : undefined);
    if (!res.ok) throw new Error(res.message);
    return res.rgba;
  }

  throw new Error(`未知抠图模型: ${model}`);
}

export type MattingModel = 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2';

export interface ProcessSpriteOptions {
  frameCount?: number;
  cellSize?: number;
  spacing?: number;
  downsampleRatio?: number;
  forceRvm?: boolean;
  mattingModel?: MattingModel;
  u2netpAlphaMatting?: boolean;
  debugDir?: string;
}

export async function processSpriteWithOnnx(
  projectDir: string,
  relativePath: string,
  options?: ProcessSpriteOptions
): Promise<{ ok: boolean; path?: string; frames?: SpriteFrameRect[]; error?: string }> {
  const spacing = options?.spacing ?? 0;
  const mattingModel = options?.mattingModel ?? 'rvm';

  try {
    const fullPath = path.join(path.normalize(projectDir), relativePath);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, error: '图片不存在' };
    }

    const background = await getSpriteBackgroundColor(projectDir, relativePath);
    const { raw, normalized } = await getSpriteFrames(projectDir, relativePath, background, { minGapPixels: 6 });
    if (raw.length === 0) {
      return { ok: false, error: '未能识别到帧，请确认图片有背景分隔' };
    }

    const normalizedInput = await sharp(fullPath)
      .ensureAlpha()
      .toFormat('png')
      .toBuffer();
    const meta = await sharp(normalizedInput).metadata();
    const imgWidth = meta.width ?? 0;
    const imgHeight = meta.height ?? 0;
    if (imgWidth <= 0 || imgHeight <= 0) {
      return { ok: false, error: '无法读取图片尺寸' };
    }

    const { data: imgData, info: imgInfo } = await sharp(normalizedInput)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bgThreshold = 80;
    const br = background?.r ?? 0;
    const bg = background?.g ?? 255;
    const bb = background?.b ?? 0;
    const isBg = (idx: number) => {
      const d =
        Math.abs((imgData[idx] ?? 0) - br) +
        Math.abs((imgData[idx + 1] ?? 0) - bg) +
        Math.abs((imgData[idx + 2] ?? 0) - bb);
      return d < bgThreshold;
    };
    const getContentRatio = (r: { x: number; y: number; width: number; height: number }) => {
      let fg = 0;
      const x0 = Math.round(r.x);
      const y0 = Math.round(r.y);
      const rw = Math.max(1, Math.round(r.width));
      const rh = Math.max(1, Math.round(r.height));
      const total = rw * rh;
      const ch = imgInfo.channels;
      const w = imgInfo.width;
      for (let y = y0; y < y0 + rh && y < imgInfo.height; y++) {
        for (let x = x0; x < x0 + rw && x < w; x++) {
          if (!isBg((y * w + x) * ch)) fg++;
        }
      }
      return total > 0 ? fg / total : 0;
    };

    const MIN_FRAME_WIDTH = 40;
    const MIN_CONTENT_RATIO = 0.08;
    const filtered = normalized.filter((r) => {
      if (r.width < MIN_FRAME_WIDTH) return false;
      const ratio = getContentRatio(r);
      return ratio >= MIN_CONTENT_RATIO;
    });
    if (filtered.length === 0) {
      return { ok: false, error: '过滤后无有效帧，疑似误识别过多' };
    }

    const maxW = Math.max(...filtered.map((r) => r.width));
    const maxH = Math.max(...filtered.map((r) => r.height));
    const cellSize = options?.cellSize ?? Math.max(maxW, maxH);

    const frameCount = filtered.length;
    const outCols = frameCount;
    const outRows = 1;
    const outWidth = outCols * cellSize + (outCols - 1) * spacing;
    const outHeight = outRows * cellSize + (outRows - 1) * spacing;

    const composite: sharp.OverlayOptions[] = [];
    const frames: SpriteFrameRect[] = [];
    const image = sharp(normalizedInput);

    const debugDir = options?.debugDir;
    const testDir = debugDir ? path.join(debugDir, 'test') : null;
    if (testDir) {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, '1_原图.png'), normalizedInput);
    }

    const apiModels: MattingModel[] = ['birefnet', 'mvanet', 'u2netp', 'rmbg2'];
    for (let i = 0; i < frameCount; i++) {
      if (i > 0 && (mattingModel === 'rvm' || apiModels.includes(mattingModel))) {
        await new Promise((r) => setImmediate(r));
      }
      const r = filtered[i]!;
      const sx = Math.round(r.x);
      const sy = Math.round(r.y);
      const frameW = Math.round(r.width);
      const frameH = Math.round(r.height);

      const downsampleRatio = options?.downsampleRatio ?? 0.5;
      const useChromaKey = (mattingModel === 'rvm') && !!background && !options?.forceRvm;

      if (testDir) {
        const preprocessBuf = await image
          .clone()
          .extract({ left: sx, top: sy, width: frameW, height: frameH })
          .png()
          .toBuffer();
        fs.writeFileSync(path.join(testDir, `2_frame_${i}_预处理.png`), preprocessBuf);
      }

      const rgba = await matteFrame(
        image,
        sx,
        sy,
        frameW,
        frameH,
        useChromaKey,
        useChromaKey && background ? { r: background.r, g: background.g, b: background.b } : null,
        downsampleRatio,
        mattingModel,
        options?.u2netpAlphaMatting
      );

      const x = i * (cellSize + spacing);
      const y = 0;

      frames.push({ x, y, width: cellSize, height: cellSize });

      const buf = await sharp(rgba, {
        raw: { width: frameW, height: frameH, channels: 4, premultiplied: false },
      })
        .resize(cellSize, cellSize, { fit: 'contain', position: 'center', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      if (testDir) {
        const mattedPng = await sharp(rgba, {
          raw: { width: frameW, height: frameH, channels: 4, premultiplied: false },
        })
          .png()
          .toBuffer();
        fs.writeFileSync(path.join(testDir, `3_frame_${i}_抠图.png`), mattedPng);
      }

      composite.push({
        input: buf,
        left: x,
        top: y,
      });
    }

    const outputPng = await sharp({
      create: {
        width: outWidth,
        height: outHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composite)
      .png()
      .toBuffer();

    if (testDir) {
      fs.writeFileSync(path.join(testDir, '4_精灵图.png'), outputPng);
    }

    const ts = Date.now();
    const tempPath = path.join(os.tmpdir(), `yiman_sprite_${ts}.png`);
    fs.writeFileSync(tempPath, outputPng);

    let coverPath: string | undefined;
    if (frames.length > 1 && composite.length > 0) {
      const coverBuf = composite[0]!.input;
      const coverTemp = path.join(os.tmpdir(), `yiman_sprite_cover_${ts}.png`);
      fs.writeFileSync(coverTemp, coverBuf);
      coverPath = coverTemp;
    }

    return { ok: true, path: tempPath, frames, coverPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
