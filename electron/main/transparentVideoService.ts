/**
 * 透明视频处理：使用 ffmpeg colorkey 将指定颜色转为透明通道，输出 WebM VP9（yuva420p）
 * 见功能文档 5、技术文档 4.1
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';

export type ChromaKeyColor = 'black' | 'green' | 'purple';

const CHROMA_COLORS: Record<ChromaKeyColor, string> = {
  black: '0x000000',
  green: '0x00ff00',
  purple: '0x800080',
};

/** 将指定颜色抠除并输出带透明通道的 WebM；返回临时文件路径 */
export async function processTransparentVideo(
  inputPath: string,
  color: ChromaKeyColor,
  options?: { similarity?: number; blend?: number }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: '输入文件不存在' };
  }

  const hexColor = CHROMA_COLORS[color];
  const similarity = options?.similarity ?? 0.2;
  const blend = options?.blend ?? 0.1;

  const outputPath = path.join(os.tmpdir(), `yiman_transparent_${Date.now()}.webm`);

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
