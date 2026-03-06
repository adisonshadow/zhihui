/**
 * 视频封面提取：从视频中提取一帧作为封面图（见功能文档 5、素材上传）
 * 元数据宽高：提取 2 帧图片，直接读取帧图片的宽高（ffmpeg 解码时已应用旋转，得到正确显示尺寸）
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';

const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXT.includes(ext);
}

/** 获取视频元数据：时长用 ffprobe，宽高从提取的帧图片读取（正确反映旋转后的显示尺寸） */
export async function getVideoMetadata(
  videoPath: string
): Promise<{ ok: boolean; duration?: number; width?: number; height?: number; error?: string }> {
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: '视频文件不存在' };
  }
  if (!isVideoFile(videoPath)) {
    return { ok: false, error: '非视频格式' };
  }
  try {
    try {
      const mod = await import('ffmpeg-static');
      const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
      if (p && typeof p === 'string') ffmpeg.setFfmpegPath(p);
    } catch {
      /* 使用系统 ffmpeg */
    }

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        const dur = metadata.format?.duration;
        resolve(typeof dur === 'number' && dur > 0 ? dur : 1);
      });
    });

    const tmpDir = fs.realpathSync(os.tmpdir());
    const t1 = Math.max(0.05, duration * 0.25);
    const t2 = Math.min(duration - 0.05, duration * 0.75);
    const times = t1 === t2 ? [t1] : [t1, t2];

    let width: number | undefined;
    let height: number | undefined;

    for (let i = 0; i < times.length; i++) {
      const tmpPath = path.join(tmpDir, `yiman_meta_frame_${Date.now()}_${i}.png`);
      try {
        const frameRes = await extractVideoFrame(videoPath, tmpPath, times[i]);
        if (frameRes.ok && frameRes.path && fs.existsSync(frameRes.path)) {
          const meta = await sharp(frameRes.path).metadata();
          if (meta.width != null && meta.height != null && meta.width > 0 && meta.height > 0) {
            width = meta.width;
            height = meta.height;
            break;
          }
        }
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }

    return {
      ok: true,
      duration,
      width,
      height,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 从视频提取一帧为 PNG，默认取 0.5 秒处；返回临时文件路径
 * 使用 spawn 直接调用 ffmpeg（与 scripts/test-extract-frame.mjs 一致），避免 fluent-ffmpeg 兼容性问题。
 * preserveAlpha：透明视频（WebM VP9 with alpha）需指定 rgba 输出格式以保留透明通道。 */
export async function extractVideoFrame(
  videoPath: string,
  outputPath: string,
  timeSeconds: number = 0.5,
  preserveAlpha?: boolean
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: '视频文件不存在' };
  }
  if (!isVideoFile(videoPath)) {
    return { ok: false, error: '非视频格式' };
  }

  let ffmpegPath: string | null = null;
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
    if (p && typeof p === 'string' && fs.existsSync(p)) ffmpegPath = p;
  } catch {
    /* 使用系统 ffmpeg */
  }

  const runSpawn = (args: string[]): Promise<{ ok: boolean; stderr: string }> =>
    new Promise((resolve) => {
      let stderr = '';
      const proc = spawn(ffmpegPath || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number) => resolve({ ok: code === 0, stderr }));
      proc.on('error', (err: Error) => resolve({ ok: false, stderr: err.message }));
    });

  const tryExtract = async (args: string[]): Promise<boolean> => {
    const r = await runSpawn(args);
    if (r.ok && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return true;
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
    return false;
  };

  // 方法1：输入 seeking（与测试脚本一致），-y 覆盖已存在文件
  const args1 = ['-y', '-ss', String(timeSeconds), '-i', videoPath, '-vframes', '1', '-f', 'image2'];
  if (preserveAlpha) args1.push('-pix_fmt', 'rgba');
  args1.push(outputPath);
  if (await tryExtract(args1)) return { ok: true, path: outputPath };

  // 方法2：输出 seeking
  const args2 = ['-y', '-i', videoPath, '-ss', String(timeSeconds), '-vframes', '1', '-f', 'image2', outputPath];
  if (await tryExtract(args2)) return { ok: true, path: outputPath };

  return { ok: false, error: '提取失败' };
}
