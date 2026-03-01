/**
 * 视频封面提取：从视频中提取一帧作为封面图（见功能文档 5、素材上传）
 * 元数据宽高：提取 2 帧图片，直接读取帧图片的宽高（ffmpeg 解码时已应用旋转，得到正确显示尺寸）
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
 * preserveAlpha：WebM VP9 透明视频需显式指定 libvpx-vp9 解码器与 rgba 输出，否则 alpha 丢失或提取失败。
 * 若 libvpx-vp9 不可用（如系统 ffmpeg 未编译该解码器），会回退到默认解码器以保证导出不中断。 */
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

  try {
    // 若安装 ffmpeg-static 则使用内置二进制
    try {
      const mod = await import('ffmpeg-static');
      const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
      if (p && typeof p === 'string') ffmpeg.setFfmpegPath(p);
    } catch {
      /* 使用系统 ffmpeg */
    }

    const runExtract = (useVp9: boolean) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(videoPath).seekInput(timeSeconds);
        if (useVp9) {
          cmd.inputOptions(['-c:v', 'libvpx-vp9']);
          cmd.outputOptions(['-vframes', '1', '-f', 'image2', '-pix_fmt', 'rgba']);
        } else {
          cmd.outputOptions(['-vframes', '1', '-f', 'image2']);
        }
        cmd
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

    if (preserveAlpha) {
      try {
        await runExtract(true);
      } catch {
        await runExtract(false);
      }
    } else {
      await runExtract(false);
    }

    if (fs.existsSync(outputPath)) {
      return { ok: true, path: outputPath };
    }
    return { ok: false, error: '提取失败' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
