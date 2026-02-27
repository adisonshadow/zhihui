/**
 * 视频封面提取：从视频中提取一帧作为封面图（见功能文档 5、素材上传）
 */
import path from 'node:path';
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';

const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXT.includes(ext);
}

/** 从视频提取一帧为 PNG，默认取 0.5 秒处；返回临时文件路径 */
export async function extractVideoFrame(
  videoPath: string,
  outputPath: string,
  timeSeconds: number = 0.5
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

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeSeconds)
        .outputOptions(['-vframes 1', '-f image2'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    if (fs.existsSync(outputPath)) {
      return { ok: true, path: outputPath };
    }
    return { ok: false, error: '提取失败' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
