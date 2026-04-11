/**
 * 视频转精灵图：FFmpeg scene 滤镜提取关键帧，再裁剪 alpha 通道并拼接精灵图
 * 见功能文档 - 视频转精灵图
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const SPRITE_SPACING = 50;

async function getFfmpegBinPath(): Promise<string> {
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
    if (p && typeof p === 'string' && fs.existsSync(p)) return p;
  } catch { /* ignore */ }
  return 'ffmpeg';
}

function runFfmpeg(bin: string, args: string[]): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    let stdout = '';
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number) => resolve({ ok: code === 0, stderr, stdout }));
    proc.on('error', (err: Error) => resolve({ ok: false, stderr: err.message, stdout: '' }));
  });
}

/** WebM VP9 alpha 需要 libvpx-vp9 解码器才能正确读取 alpha 通道 */
function buildInputArgs(videoPath: string): string[] {
  const isWebm = videoPath.toLowerCase().endsWith('.webm');
  return isWebm ? ['-c:v', 'libvpx-vp9'] : [];
}

/**
 * 场景检测模式：FFmpeg scene 滤镜提取关键帧为 PNG 序列。
 * 适合多镜头/大变化视频。
 */
export async function extractKeyFrames(
  videoPath: string,
  sceneThreshold: number = 0.3
): Promise<{ ok: boolean; frames?: string[]; tmpDir?: string; error?: string }> {
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: '视频文件不存在' };
  }

  const tmpDir = path.join(fs.realpathSync(os.tmpdir()), `yiman_v2s_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const bin = await getFfmpegBinPath();
  const outputPattern = path.join(tmpDir, 'frame_%04d.png');
  const threshold = Math.max(0, Math.min(1, sceneThreshold));
  const vf = `select='gt(scene\\,${threshold})',setpts=N/FRAME_RATE/TB,format=rgba`;

  const args = [
    '-y',
    ...buildInputArgs(videoPath),
    '-i', videoPath,
    '-vf', vf,
    '-pix_fmt', 'rgba',
    '-vsync', 'vfr',
    outputPattern,
  ];

  const result = await runFfmpeg(bin, args);

  const files = fs.readdirSync(tmpDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(tmpDir, f));

  if (files.length === 0) {
    cleanupDir(tmpDir);
    return { ok: false, error: result.ok ? '未提取到关键帧，尝试降低变化分数阈值' : `FFmpeg 错误: ${result.stderr.slice(-300)}` };
  }

  return { ok: true, frames: files, tmpDir };
}

/** 通过 FFmpeg 探测视频时长（秒），从 stderr 中解析 Duration 行 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const bin = await getFfmpegBinPath();
  const result = await runFfmpeg(bin, ['-i', videoPath, '-f', 'null', '-']);
  const match = result.stderr.match(/Duration:\s+(\d+):(\d+):(\d+)\.(\d+)/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
  }
  return 1;
}

// /**
//  * 均匀抽帧模式（每秒帧数）：按指定 fps 均匀提取帧为 PNG 序列。
//  * 适合动作循环、局部运动等场景检测难以捕获的视频。
//  */
// export async function extractFramesUniformFps(
//   videoPath: string,
//   fps: number = 4
// ): Promise<{ ok: boolean; frames?: string[]; tmpDir?: string; error?: string }> {
//   if (!fs.existsSync(videoPath)) {
//     return { ok: false, error: '视频文件不存在' };
//   }
//   const tmpDir = path.join(fs.realpathSync(os.tmpdir()), `yiman_v2s_${Date.now()}`);
//   fs.mkdirSync(tmpDir, { recursive: true });
//   const bin = await getFfmpegBinPath();
//   const outputPattern = path.join(tmpDir, 'frame_%04d.png');
//   const clampedFps = Math.max(1, Math.min(30, fps));
//   const vf = `fps=${clampedFps},format=rgba`;
//   const args = [
//     '-y',
//     ...buildInputArgs(videoPath),
//     '-i', videoPath,
//     '-vf', vf,
//     '-pix_fmt', 'rgba',
//     outputPattern,
//   ];
//   const result = await runFfmpeg(bin, args);
//   const files = fs.readdirSync(tmpDir)
//     .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
//     .sort()
//     .map((f) => path.join(tmpDir, f));
//   if (files.length === 0) {
//     cleanupDir(tmpDir);
//     return { ok: false, error: result.ok ? '未提取到帧' : `FFmpeg 错误: ${result.stderr.slice(-300)}` };
//   }
//   return { ok: true, frames: files, tmpDir };
// }

/**
 * 均匀抽帧模式（总帧数）：从视频中均匀提取指定数量的帧。
 * 先获取视频时长，计算 fps = totalFrames / duration，再用 FFmpeg fps 滤镜提取。
 */
export async function extractFramesUniform(
  videoPath: string,
  totalFrames: number = 8
): Promise<{ ok: boolean; frames?: string[]; tmpDir?: string; error?: string }> {
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: '视频文件不存在' };
  }

  const duration = await getVideoDuration(videoPath);
  const clamped = Math.max(2, Math.min(50, totalFrames));
  const fps = Math.max(0.5, clamped / duration);

  const tmpDir = path.join(fs.realpathSync(os.tmpdir()), `yiman_v2s_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const bin = await getFfmpegBinPath();
  const outputPattern = path.join(tmpDir, 'frame_%04d.png');
  const vf = `fps=${fps},format=rgba`;

  const args = [
    '-y',
    ...buildInputArgs(videoPath),
    '-i', videoPath,
    '-vf', vf,
    '-pix_fmt', 'rgba',
    outputPattern,
  ];

  const result = await runFfmpeg(bin, args);

  const files = fs.readdirSync(tmpDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(tmpDir, f));

  if (files.length === 0) {
    cleanupDir(tmpDir);
    return { ok: false, error: result.ok ? '未提取到帧' : `FFmpeg 错误: ${result.stderr.slice(-300)}` };
  }

  return { ok: true, frames: files, tmpDir };
}

/** 将关键帧路径列表转为 data URL 数组，供前端预览 */
export async function keyFramesToDataUrls(
  framePaths: string[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const fp of framePaths) {
    if (!fs.existsSync(fp)) continue;
    const buf = fs.readFileSync(fp);
    urls.push(`data:image/png;base64,${buf.toString('base64')}`);
  }
  return urls;
}

interface TrimRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 对单帧做 alpha 通道 trim，返回有色值内容的边界 */
async function getAlphaTrimRect(framePath: string): Promise<TrimRect | null> {
  const { data, info } = await sharp(framePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const a = data[offset + 3] ?? 0;
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * 从关键帧生成精灵图：
 * 1. 每帧裁剪到 alpha 有色值区域
 * 2. 以所有帧的最大宽高为单元格尺寸
 * 3. 所有帧在一行排列，间隔 50px，y 值统一
 */
export async function generateSpriteSheet(
  framePaths: string[],
  outputPath: string
): Promise<{ ok: boolean; path?: string; frameCount?: number; frames?: { x: number; y: number; width: number; height: number }[]; error?: string }> {
  if (framePaths.length === 0) {
    return { ok: false, error: '无帧可处理' };
  }

  const trimRects: (TrimRect | null)[] = [];
  const trimmedBuffers: (Buffer | null)[] = [];

  for (const fp of framePaths) {
    const rect = await getAlphaTrimRect(fp);
    trimRects.push(rect);
    if (rect) {
      const buf = await sharp(fp)
        .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        .png()
        .toBuffer();
      trimmedBuffers.push(buf);
    } else {
      trimmedBuffers.push(null);
    }
  }

  const validIndices = trimRects.map((r, i) => r ? i : -1).filter((i) => i >= 0);
  if (validIndices.length === 0) {
    return { ok: false, error: '所有帧均无有效内容' };
  }

  let maxW = 0;
  let maxH = 0;
  for (const i of validIndices) {
    const r = trimRects[i]!;
    if (r.width > maxW) maxW = r.width;
    if (r.height > maxH) maxH = r.height;
  }

  const count = validIndices.length;
  const totalWidth = maxW * count + SPRITE_SPACING * (count - 1);
  const totalHeight = maxH;

  const composites: sharp.OverlayOptions[] = [];
  const frameRects: { x: number; y: number; width: number; height: number }[] = [];

  for (let idx = 0; idx < validIndices.length; idx++) {
    const i = validIndices[idx];
    const buf = trimmedBuffers[i];
    const rect = trimRects[i]!;
    if (!buf) continue;

    const cellX = idx * (maxW + SPRITE_SPACING);
    const offsetX = cellX + Math.floor((maxW - rect.width) / 2);
    const offsetY = Math.floor((maxH - rect.height) / 2);

    composites.push({
      input: buf,
      left: offsetX,
      top: offsetY,
    });

    frameRects.push({ x: cellX, y: 0, width: maxW, height: maxH });
  }

  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);

  return {
    ok: true,
    path: outputPath,
    frameCount: count,
    frames: frameRects,
  };
}

/** 清理临时目录 */
export function cleanupDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}
