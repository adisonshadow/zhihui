/**
 * 内心独白音效服务：ffmpeg 将 TTS 音频处理为「内心独白」风格
 *
 * ffmpeg 滤镜链：
 *   1. 切掉超低轰鸣 + 切掉刺耳高频 → 变闷沉内心
 *   2. EQ 抬升人声中频，削减尖锐齿音
 *   3. 小房间贴身混响（脑袋里发声）
 *   4. 极短前置回声（颅内回响）
 *   5. 整体压低音量
 *
 * 输出：userData/yiman/inner-monologue/{hash}.wav
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

/** 内心独白 ffmpeg 滤镜字符串 */
const INNER_MONOLOGUE_FILTER = [
  // ① 切掉超低轰鸣 + 切掉刺耳高频，变闷沉内心
  'highpass=120,lowpass=7500',
  // ② EQ 抬升人声中频（胸腔内心），削减尖锐齿音
  'equalizer=f=320:w=200:g=3,equalizer=f=2800:w=1200:g=-6',
  // ③ 小房间贴身混响（脑袋里发声）
  'areverb=reverb_time=0.7:pre_delay=12:wet_gain=-7:dry_gain=-1',
  // ④ 极短前置回声，模拟颅内回响
  'aecho=0.75:0.82:22:0.12',
  // ⑤ 整体压低音量，轻声低语
  'volume=-3dB',
].join(',');

function getCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'yiman', 'inner-monologue');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 文件 hash（用于缓存去重） */
function fileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return createHash('md5').update(buf).digest('hex').slice(0, 16);
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
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }));
    proc.on('error', (err: Error) => resolve({ ok: false, stderr: err.message }));
  });
}

/**
 * 对音频文件应用内心独白音效
 * @param inputPath 原始 TTS WAV 文件路径
 * @param force 是否强制重新处理（忽略缓存）
 * @returns 处理后 WAV 文件路径
 */
export async function applyInnerMonologueEffect(
  inputPath: string,
  force = false,
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  try {
    if (!inputPath?.trim() || !fs.existsSync(inputPath)) {
      return { ok: false, error: '输入文件不存在' };
    }

    const hash = fileHash(inputPath);
    const cacheDir = getCacheDir();
    const outputPath = path.join(cacheDir, `${hash}.wav`);

    // 缓存命中
    if (!force && fs.existsSync(outputPath)) {
      return { ok: true, outputPath };
    }

    const bin = await getFfmpegBinPath();
    // 先用 ffprobe 探测实际格式，避免扩展名误导
    const probeArgs = ['-v', 'quiet', '-show_entries', 'stream=codec_name', '-of', 'default=nokey=1:noprint_wrappers=1', inputPath];
    const probeResult = await new Promise<string>((resolve) => {
      let out = '';
      const p = spawn(bin.replace('ffmpeg', 'ffprobe') || 'ffprobe', probeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      p.on('close', () => resolve(out.trim()));
      p.on('error', () => resolve(''));
    });
    console.log('[InnerMonologue] ffprobe codec:', probeResult);

    const args = [
      '-y',
      '-i', inputPath,
      '-af', INNER_MONOLOGUE_FILTER,
      '-codec:a', 'pcm_s16le',
      outputPath,
    ];

    const { ok, stderr } = await runFfmpeg(bin, args);
    if (!ok) return { ok: false, error: stderr.trim() || 'ffmpeg 内心独白处理失败' };

    // 校验输出文件是否有效
    try {
      const stat = fs.statSync(outputPath);
      if (stat.size === 0) {
        return { ok: false, error: `ffmpeg 输出为空文件。stderr: ${stderr.trim()}` };
      }
    } catch (e) {
      return { ok: false, error: `无法访问 ffmpeg 输出: ${e instanceof Error ? e.message : String(e)}。stderr: ${stderr.trim()}` };
    }
    return { ok: true, outputPath, stderr: stderr.trim() };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 批量处理多个音频（内心独白），返回映射 { inputPath → outputPath }
 */
export async function applyInnerMonologueBatch(
  inputs: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const input of inputs) {
    const res = await applyInnerMonologueEffect(input);
    if (res.ok) results[input] = res.outputPath;
  }
  return results;
}

/** 清除缓存 */
export function clearInnerMonologueCache(): void {
  const dir = getCacheDir();
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.wav')) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}
