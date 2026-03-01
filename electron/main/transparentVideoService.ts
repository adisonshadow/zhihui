/**
 * 透明视频处理：使用 ffmpeg colorkey 将指定颜色转为透明通道，输出 WebM VP9（yuva420p）
 * 支持自动检测背景色：随机取 2 帧，四角 4x4px 采样，剔除异常后取平均，加容差（见功能文档 5、技术文档 4.1）
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { extractVideoFrame } from './videoCoverService';

export type ChromaKeyColor = 'black' | 'green' | 'purple' | 'auto';

const CHROMA_COLORS: Record<Exclude<ChromaKeyColor, 'auto'>, string> = {
  black: '0x000000',
  green: '0x00ff00',
  purple: '0x800080',
};

const CORNER_SAMPLE_SIZE = 4;
const OUTLIER_THRESHOLD = 80;

/** 欧氏颜色距离 (0–255) */
function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** 从单张图片四角 4x4px 采样，返回 RGB 样本数组 */
async function sampleCornersFromImage(
  imagePath: string
): Promise<{ r: number; g: number; b: number }[]> {
  const meta = await sharp(imagePath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.min(CORNER_SAMPLE_SIZE, Math.floor(w / 4), Math.floor(h / 4), 4);
  if (size <= 0) return [];

  const corners: [number, number][] = [
    [0, 0],
    [w - size, 0],
    [0, h - size],
    [w - size, h - size],
  ];
  const samples: { r: number; g: number; b: number }[] = [];

  for (const [cx, cy] of corners) {
    const left = Math.max(0, cx);
    const top = Math.max(0, cy);
    const { data, info } = await sharp(imagePath)
      .extract({ left, top, width: size, height: size })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    for (let i = 0; i < data.length; i += ch) {
      samples.push({
        r: data[i] ?? 0,
        g: data[i + 1] ?? 0,
        b: data[i + 2] ?? 0,
      });
    }
  }
  return samples;
}

/** 从样本中剔除异常值，返回平均背景色 */
function filterOutliersAndAverage(
  samples: { r: number; g: number; b: number }[]
): { r: number; g: number; b: number } {
  if (samples.length === 0) return { r: 128, g: 128, b: 128 };
  const medianR = samples.map((s) => s.r).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const medianG = samples.map((s) => s.g).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const medianB = samples.map((s) => s.b).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const filtered = samples.filter(
    (s) => colorDistance(s.r, s.g, s.b, medianR, medianG, medianB) <= OUTLIER_THRESHOLD
  );
  const use = filtered.length > 0 ? filtered : samples;
  return {
    r: Math.round(use.reduce((a, s) => a + s.r, 0) / use.length),
    g: Math.round(use.reduce((a, s) => a + s.g, 0) / use.length),
    b: Math.round(use.reduce((a, s) => a + s.b, 0) / use.length),
  };
}

/** 获取视频时长（秒） */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const dur = metadata.format?.duration;
      resolve(typeof dur === 'number' && dur > 0 ? dur : 1);
    });
  });
}

/** 自动检测视频背景色：随机取 2 帧，四角 4x4px 采样，剔除异常后取平均 */
export async function detectVideoBackgroundColor(
  videoPath: string
): Promise<{ ok: boolean; r?: number; g?: number; b?: number; error?: string }> {
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: '视频文件不存在' };
  }
  try {
    const duration = await getVideoDuration(videoPath);
    const t1 = Math.max(0.05, duration * 0.25);
    const t2 = Math.min(duration - 0.05, duration * 0.75);
    const times = t1 === t2 ? [t1] : [t1, t2];

    const allSamples: { r: number; g: number; b: number }[] = [];
    const tmpDir = fs.realpathSync(os.tmpdir());

    for (let i = 0; i < times.length; i++) {
      const tmpPath = path.join(tmpDir, `yiman_video_sample_${Date.now()}_${i}.png`);
      try {
        const res = await extractVideoFrame(videoPath, tmpPath, times[i]);
        if (res.ok && res.path && fs.existsSync(res.path)) {
          const samples = await sampleCornersFromImage(res.path);
          allSamples.push(...samples);
        }
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }

    if (allSamples.length === 0) {
      return { ok: false, error: '无法从视频帧采样' };
    }
    const bg = filterOutliersAndAverage(allSamples);
    return { ok: true, r: bg.r, g: bg.g, b: bg.b };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** RGB 转 ffmpeg colorkey 十六进制格式 */
function rgbToHex(r: number, g: number, b: number): string {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  return `0x${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/** 将指定颜色抠除并输出带透明通道的 WebM；返回临时文件路径。color 为 'auto' 时自动检测背景色 */
export async function processTransparentVideo(
  inputPath: string,
  color: ChromaKeyColor | { r: number; g: number; b: number },
  options?: { similarity?: number; blend?: number }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: '输入文件不存在' };
  }

  let hexColor: string;
  if (typeof color === 'object' && 'r' in color) {
    hexColor = rgbToHex(color.r, color.g, color.b);
  } else if (color === 'auto') {
    const detected = await detectVideoBackgroundColor(inputPath);
    if (!detected.ok || detected.r == null || detected.g == null || detected.b == null) {
      return { ok: false, error: detected.error ?? '自动检测背景色失败' };
    }
    hexColor = rgbToHex(detected.r, detected.g, detected.b);
  } else {
    hexColor = CHROMA_COLORS[color];
  }

  const similarity = options?.similarity ?? 0.3;
  const blend = options?.blend ?? 0.12;

  const tmpDir = fs.realpathSync(os.tmpdir());
  const outputPath = path.join(tmpDir, `yiman_transparent_${Date.now()}.webm`);

  try {
    try {
      const mod = await import('ffmpeg-static');
      const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
      if (p && typeof p === 'string') ffmpeg.setFfmpegPath(p);
    } catch {
      /* 使用系统 ffmpeg */
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-y',
          '-vf',
          `colorkey=${hexColor}:${similarity}:${blend},format=yuva420p`,
          '-c:v',
          'libvpx-vp9',
          '-pix_fmt',
          'yuva420p',
          '-auto-alt-ref',
          '0',
          '-lag-in-frames',
          '0',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    if (fs.existsSync(outputPath)) {
      return { ok: true, path: outputPath };
    }
    return { ok: false, error: '处理失败' };
  } catch (e) {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      /* ignore */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
