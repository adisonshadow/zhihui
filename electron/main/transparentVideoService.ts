/**
 * 透明视频处理：使用 ffmpeg colorkey 将指定颜色转为透明通道，输出 WebM VP9（yuva420p）
 * 支持自动检测背景色：随机取 2 帧，四角 4x4px 采样，剔除异常后取平均，加容差（见功能文档 5、技术文档 4.1）
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
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

/** 连续模式：从视频帧四角 BFS 漫水填充，返回背景遮罩 PNG 路径（白=背景，黑=前景） */
async function createContiguousMask(
  framePath: string,
  bgColor: { r: number; g: number; b: number },
  tolerance: number
): Promise<{ ok: boolean; maskPath?: string; error?: string }> {
  try {
    const { data, info } = await sharp(framePath)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const total = width * height;
    const mask = new Uint8Array(total); // 0=前景, 255=背景
    const visited = new Uint8Array(total);

    // 使用索引栈代替数组 shift（避免 O(n²) 复杂度）
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = y * width + x;
      if (visited[idx]) return;
      visited[idx] = 1;
      stack.push(idx);
    };
    push(0, 0);
    push(width - 1, 0);
    push(0, height - 1);
    push(width - 1, height - 1);

    const tolSq = tolerance * tolerance * 3;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const off = idx * channels;
      const dr = (data[off] ?? 0) - bgColor.r;
      const dg = (data[off + 1] ?? 0) - bgColor.g;
      const db = (data[off + 2] ?? 0) - bgColor.b;

      if (dr * dr + dg * dg + db * db <= tolSq) {
        mask[idx] = 255;
        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);
      }
    }

    const maskPath = path.join(fs.realpathSync(os.tmpdir()), `yiman_mask_${Date.now()}.png`);
    await sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } }).png().toFile(maskPath);
    return { ok: true, maskPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 设置 ffmpeg 路径（复用） */
async function ensureFfmpegPath(): Promise<void> {
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
    if (p && typeof p === 'string') ffmpeg.setFfmpegPath(p);
  } catch {
    /* 使用系统 ffmpeg */
  }
}

/** 获取 ffmpeg 二进制路径（优先 ffmpeg-static） */
async function getFfmpegBinPath(): Promise<string> {
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
    if (p && typeof p === 'string' && fs.existsSync(p)) return p;
  } catch { /* ignore */ }
  return 'ffmpeg';
}

/** spawn 运行 ffmpeg 并捕获 stderr */
function runFfmpeg(bin: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number) => resolve({ ok: code === 0, stderr }));
    proc.on('error', (err: Error) => resolve({ ok: false, stderr: err.message }));
  });
}

/** 将指定颜色抠除并输出带透明通道的 WebM；返回临时文件路径。
 * color='auto' 时自动检测背景色；tolerance 0-255 对应抠色容差；contiguous=true 使用漫水填充仅去除与边缘相连的背景色 */
export async function processTransparentVideo(
  inputPath: string,
  color: ChromaKeyColor | { r: number; g: number; b: number },
  options?: {
    similarity?: number;
    blend?: number;
    tolerance?: number;
    contiguous?: boolean;
    /** 去溢色类型，'green'|'blue' 时在 colorkey 后应用 despill 滤镜（见 docs/10） */
    despill?: 'green' | 'blue';
  }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: '输入文件不存在' };
  }

  // tolerance 0-255 → similarity 0-1；未传 tolerance 时沿用旧 similarity 参数以保持向后兼容
  const tolerance = options?.tolerance ?? Math.round((options?.similarity ?? 0.3) * 255);
  const similarity = Math.max(0, Math.min(1, tolerance / 255));
  const blend = options?.blend ?? 0.12;
  const contiguous = options?.contiguous ?? false;
  const despill = options?.despill;

  // 解析背景色
  let bgColorRgb: { r: number; g: number; b: number };
  let hexColor: string;
  if (typeof color === 'object' && 'r' in color) {
    bgColorRgb = color;
    hexColor = rgbToHex(color.r, color.g, color.b);
  } else if (color === 'auto') {
    const detected = await detectVideoBackgroundColor(inputPath);
    if (!detected.ok || detected.r == null || detected.g == null || detected.b == null) {
      return { ok: false, error: detected.error ?? '自动检测背景色失败' };
    }
    bgColorRgb = { r: detected.r, g: detected.g, b: detected.b };
    hexColor = rgbToHex(detected.r, detected.g, detected.b);
  } else {
    hexColor = CHROMA_COLORS[color];
    // 解析 hexColor 为 RGB（用于 flood fill）
    const hex = hexColor.replace('0x', '');
    bgColorRgb = {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const tmpDir = fs.realpathSync(os.tmpdir());
  const outputPath = path.join(tmpDir, `yiman_transparent_${Date.now()}.webm`);

  await ensureFfmpegPath();

  // 连续模式：提取一帧生成漫水填充遮罩，结合 colorkey 过滤链
  if (contiguous) {
    const framePath = path.join(tmpDir, `yiman_frame_${Date.now()}.png`);
    let maskPath: string | null = null;
    try {
      const duration = await getVideoDuration(inputPath);
      const frameRes = await extractVideoFrame(inputPath, framePath, duration * 0.2);
      if (!frameRes.ok || !frameRes.path) {
        return { ok: false, error: '无法提取视频帧用于连续模式' };
      }
      const maskRes = await createContiguousMask(framePath, bgColorRgb, tolerance);
      if (!maskRes.ok || !maskRes.maskPath) {
        return { ok: false, error: maskRes.error ?? '生成遮罩失败' };
      }
      maskPath = maskRes.maskPath;

      // colorkey 生成 alpha；alpha 与遮罩取交集：防止误删内部同色区域
      // 可选 despill 对主画面去溢色后再转 YUV
      const mainChain = despill
        ? `[main]format=rgba,despill=type=${despill}:mix=0:expand=0,format=yuv444p[main_yuv]`
        : `[main]format=yuv444p[main_yuv]`;
      const filterComplex = [
        `[0:v]split=2[main][ck_in]`,
        mainChain,
        `[ck_in]colorkey=${hexColor}:${similarity}:${blend},format=rgba,alphaextract,format=gray[alpha_key]`,
        `[1:v]format=gray,negate[inv_mask]`,
        `[alpha_key][inv_mask]blend=all_mode=lighten,format=gray[final_alpha]`,
        `[main_yuv][final_alpha]mergeplanes=0x00010210:yuva444p,format=yuva420p[out]`,
      ].join(';');

      const bin = await getFfmpegBinPath();
      const args = [
        '-y',
        '-i', inputPath,
        '-loop', '1', '-i', maskPath!,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        '-shortest',
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-auto-alt-ref', '0',
        '-lag-in-frames', '0',
        '-an',
        outputPath,
      ];
      const result = await runFfmpeg(bin, args);
      if (!result.ok) {
        throw new Error(`ffmpeg exited with code 1: ${result.stderr.slice(-500)}`);
      }
    } finally {
      try { if (fs.existsSync(framePath)) fs.unlinkSync(framePath); } catch { /* ignore */ }
      try { if (maskPath && fs.existsSync(maskPath)) fs.unlinkSync(maskPath); } catch { /* ignore */ }
    }
  } else {
    // 标准模式：colorkey，可选 despill 去溢色
    const vfParts = [`colorkey=${hexColor}:${similarity}:${blend}`];
    if (despill) {
      vfParts.push(`format=rgba`, `despill=type=${despill}:mix=0:expand=0`, `format=yuva420p`);
    } else {
      vfParts.push('format=yuva420p');
    }
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-y',
          '-vf', vfParts.join(','),
          '-c:v', 'libvpx-vp9',
          '-pix_fmt', 'yuva420p',
          '-auto-alt-ref', '0',
          '-lag-in-frames', '0',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }

  if (fs.existsSync(outputPath)) {
    return { ok: true, path: outputPath };
  }
  try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
  return { ok: false, error: '处理失败' };
}

/** 从单张图片四角采样检测背景色（与 detectVideoBackgroundColor 逻辑一致） */
async function detectImageBackgroundColor(
  imagePath: string
): Promise<{ ok: boolean; r?: number; g?: number; b?: number; error?: string }> {
  if (!fs.existsSync(imagePath)) {
    return { ok: false, error: '图片不存在' };
  }
  try {
    const samples = await sampleCornersFromImage(imagePath);
    if (samples.length === 0) return { ok: false, error: '无法从图片采样' };
    const bg = filterOutliersAndAverage(samples);
    return { ok: true, r: bg.r, g: bg.g, b: bg.b };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 单帧 colorkey：对单张图片执行 ffmpeg colorkey，与 processTransparentVideo 算法一致（见 docs/10）
 * 返回输出 PNG 路径 */
export async function processSingleFrameColorkey(
  inputPath: string,
  color: ChromaKeyColor | { r: number; g: number; b: number },
  options?: {
    tolerance?: number;
    blend?: number;
    contiguous?: boolean;
    despill?: 'green' | 'blue';
  }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: '输入文件不存在' };
  }

  const tolerance = options?.tolerance ?? 80;
  const similarity = Math.max(0, Math.min(1, tolerance / 255));
  const blend = options?.blend ?? 0.12;
  const contiguous = options?.contiguous ?? false;
  const despill = options?.despill;

  let bgColorRgb: { r: number; g: number; b: number };
  let hexColor: string;
  if (typeof color === 'object' && 'r' in color) {
    bgColorRgb = color;
    hexColor = rgbToHex(color.r, color.g, color.b);
  } else if (color === 'auto') {
    const detected = await detectImageBackgroundColor(inputPath);
    if (!detected.ok || detected.r == null || detected.g == null || detected.b == null) {
      return { ok: false, error: detected.error ?? '自动检测背景色失败' };
    }
    bgColorRgb = { r: detected.r, g: detected.g, b: detected.b };
    hexColor = rgbToHex(detected.r, detected.g, detected.b);
  } else {
    hexColor = CHROMA_COLORS[color];
    const hex = hexColor.replace('0x', '');
    bgColorRgb = {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const tmpDir = fs.realpathSync(os.tmpdir());
  const outputPath = path.join(tmpDir, `yiman_single_frame_colorkey_${Date.now()}.png`);
  await ensureFfmpegPath();
  const bin = await getFfmpegBinPath();

  if (contiguous) {
    const maskRes = await createContiguousMask(inputPath, bgColorRgb, tolerance);
    if (!maskRes.ok || !maskRes.maskPath) {
      return { ok: false, error: maskRes.error ?? '生成遮罩失败' };
    }
    const maskPath = maskRes.maskPath;
    try {
      const mainChain = despill
        ? `[main]format=rgba,despill=type=${despill}:mix=0:expand=0[main_rgba]`
        : `[main]format=rgba[main_rgba]`;
      const filterComplex = [
        `[0:v]split=2[main][ck_in]`,
        mainChain,
        `[ck_in]colorkey=${hexColor}:${similarity}:${blend},format=rgba,alphaextract,format=gray[alpha_key]`,
        `[1:v]format=gray,negate[inv_mask]`,
        `[alpha_key][inv_mask]blend=all_mode=lighten[final_alpha]`,
        `[main_rgba]format=rgb24[main_rgb]`,
        `[main_rgb][final_alpha]alphamerge[out]`,
      ].join(';');
      const args = [
        '-y',
        '-i', inputPath,
        '-i', maskPath,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        outputPath,
      ];
      const result = await runFfmpeg(bin, args);
      if (!result.ok) {
        throw new Error(`ffmpeg exited: ${result.stderr.slice(-500)}`);
      }
    } finally {
      try { if (fs.existsSync(maskPath)) fs.unlinkSync(maskPath); } catch { /* ignore */ }
    }
  } else {
    const vfParts = [`colorkey=${hexColor}:${similarity}:${blend}`];
    if (despill) {
      vfParts.push(`format=rgba`, `despill=type=${despill}:mix=0:expand=0`);
    }
    vfParts.push(`format=rgba`);
    const args = ['-y', '-i', inputPath, '-vf', vfParts.join(','), outputPath];
    const result = await runFfmpeg(bin, args);
    if (!result.ok) {
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
      return { ok: false, error: result.stderr.slice(-300) };
    }
  }

  if (fs.existsSync(outputPath)) {
    return { ok: true, path: outputPath };
  }
  return { ok: false, error: '处理失败' };
}
