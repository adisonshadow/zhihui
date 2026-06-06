/**
 * 声音录制服务：基于 ffmpeg + ffprobe 的录音文件管理
 *
 * 录制：渲染进程 getUserMedia + MediaRecorder → webm Blob → base64 IPC → 落盘
 * 处理：裁剪 / 降噪 / 导出全部由主进程 ffmpeg 完成
 * 存储：userData/yiman/audio-recorder/
 *
 * 复用 strudelAudioConvertService 的 getFfmpegBinPath / runFfmpeg 模式
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

/** userData/yiman/audio-recorder/ */
function getRecordingsDir(): string {
  const dir = path.join(app.getPath('userData'), 'yiman', 'audio-recorder');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 安全的文件名（仅保留字母数字汉字 -_. ） */
function safeBaseName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff\-_.]/g, '_').slice(0, 200) || 'untitled';
}

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

/** 录音文件条目 */
export interface RecordingEntry {
  name: string;
  path: string;
  mtime: string;
  size: number;
}

/** 列出所有录音文件（.webm / .wav / .mp3 / .ogg） */
export function listRecordings(): RecordingEntry[] {
  const dir = getRecordingsDir();
  try {
    const files = fs.readdirSync(dir);
    const audioExts = new Set(['.webm', '.wav', '.mp3', '.ogg', '.m4a']);
    const entries: RecordingEntry[] = [];
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (!audioExts.has(ext)) continue;
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        entries.push({
          name: f,
          path: full,
          mtime: stat.mtime.toISOString(),
          size: stat.size,
        });
      } catch {
        /* 跳过无法 stat 的文件 */
      }
    }
    entries.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    return entries;
  } catch {
    return [];
  }
}

/** 保存录音（base64 → 文件） */
export function saveRecording(base64: string, ext: string): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const safeExt = ext === 'webm' || ext === 'wav' || ext === 'ogg' || ext === 'mp3' || ext === 'm4a' ? ext : 'webm';
    const dir = getRecordingsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fname = `recording_${timestamp}.${safeExt}`;
    const fullPath = path.join(dir, fname);
    fs.writeFileSync(fullPath, Buffer.from(String(base64), 'base64'));
    return { ok: true, path: fullPath };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ffprobe 取音频时长（秒） */
export async function getDuration(filePath: string): Promise<number | null> {
  try {
    const bin = await getFfmpegBinPath();
    // 用 ffprobe
    return new Promise((resolve) => {
      let output = '';
      const proc = spawn(bin.replace('ffmpeg', 'ffprobe') || 'ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
      proc.on('close', () => {
        const n = parseFloat(output.trim());
        resolve(Number.isFinite(n) ? n : null);
      });
      proc.on('error', () => resolve(null));
    });
  } catch {
    return null;
  }
}

/** 处理录音：裁剪 + 可选降噪，生成新工作文件 */
export async function processRecording(
  filePath: string,
  options: { trimStart?: number; trimEnd?: number; denoise?: boolean },
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  try {
    const bin = await getFfmpegBinPath();
    const dir = getRecordingsDir();
    const base = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(dir, `${base}_processed.webm`);

    const args: string[] = ['-y'];
    if (options.trimStart != null && options.trimStart > 0) {
      args.push('-ss', String(options.trimStart));
    }
    args.push('-i', filePath);
    if (options.trimEnd != null && options.trimEnd > 0 && options.trimStart != null) {
      const dur = options.trimEnd - (options.trimStart ?? 0);
      if (dur > 0) {
        args.push('-t', String(dur));
      }
    } else if (options.trimEnd != null && options.trimEnd > 0) {
      args.push('-to', String(options.trimEnd));
    }
    if (options.denoise) {
      args.push('-af', 'afftdn');
    }
    args.push(outputPath);

    const { ok, stderr } = await runFfmpeg(bin, args);
    if (!ok) return { ok: false, error: stderr.trim() || 'ffmpeg 处理失败' };
    return { ok: true, outputPath };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 导出录音（编码 mp3 或 wav，可选裁剪+降噪） */
export async function exportRecording(
  filePath: string,
  outPath: string,
  options: { format: 'mp3' | 'wav'; trimStart?: number; trimEnd?: number; denoise?: boolean },
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  try {
    const bin = await getFfmpegBinPath();
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const args: string[] = ['-y'];
    if (options.trimStart != null && options.trimStart > 0) {
      args.push('-ss', String(options.trimStart));
    }
    args.push('-i', filePath);
    if (options.trimEnd != null && options.trimEnd > 0 && options.trimStart != null) {
      const dur = options.trimEnd - (options.trimStart ?? 0);
      if (dur > 0) args.push('-t', String(dur));
    } else if (options.trimEnd != null && options.trimEnd > 0) {
      args.push('-to', String(options.trimEnd));
    }
    if (options.denoise) {
      args.push('-af', 'afftdn');
    }
    if (options.format === 'mp3') {
      args.push('-codec:a', 'libmp3lame', '-q:a', '2');
    } else {
      args.push('-codec:a', 'pcm_s16le');
    }
    args.push(outPath);

    const { ok, stderr } = await runFfmpeg(bin, args);
    if (!ok) return { ok: false, error: stderr.trim() || 'ffmpeg 导出失败' };
    return { ok: true, outputPath: outPath };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 删除录音文件 */
export function deleteRecording(filePath: string): { ok: boolean; error?: string } {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 重命名录音文件 */
export function renameRecording(filePath: string, name: string): { ok: boolean; error?: string; newPath?: string } {
  try {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const safe = safeBaseName(name);
    if (!safe) return { ok: false, error: '文件名无效' };
    const newPath = path.join(dir, `${safe}${ext}`);
    if (fs.existsSync(newPath) && newPath !== filePath) {
      return { ok: false, error: '目标文件名已存在' };
    }
    fs.renameSync(filePath, newPath);
    return { ok: true, newPath };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** demucs 占位：返回「需安装」提示（参考 lamaCleaner 范式） */
export function checkDemucsInstalled(): { installed: boolean; message?: string } {
  return { installed: false, message: '去背景音(demucs)需要安装，后续版本支持' };
}
