import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

async function getFfmpegBinPath(): Promise<string> {
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
    if (p && typeof p === 'string' && fs.existsSync(p)) return p;
  } catch {
    /* 使用系统 ffmpeg */
  }
  return 'ffmpeg';
}

function runFfmpeg(bin: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }));
    proc.on('error', (err: Error) => resolve({ ok: false, stderr: err.message }));
  });
}

/** WAV base64 → MP3 文件（Strudel / 有声书音频导出复用） */
export async function convertWavBase64ToMp3File(
  wavBase64: string,
  outputPath: string,
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  try {
    const normalized = path.normalize(outputPath.trim());
    if (!normalized.toLowerCase().endsWith('.mp3')) {
      return { ok: false, error: '输出路径须为 .mp3' };
    }
    fs.mkdirSync(path.dirname(normalized), { recursive: true });

    const tmpWav = path.join(os.tmpdir(), `yiman-strudel-${Date.now()}.wav`);
    fs.writeFileSync(tmpWav, Buffer.from(wavBase64, 'base64'));

    const ffmpeg = await getFfmpegBinPath();
    const { ok, stderr } = await runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      tmpWav,
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '2',
      normalized,
    ]);

    try {
      fs.unlinkSync(tmpWav);
    } catch {
      /* ignore */
    }

    if (!ok) {
      return { ok: false, error: stderr.trim() || 'ffmpeg MP3 编码失败' };
    }
    return { ok: true, outputPath: normalized };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
