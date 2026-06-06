/**
 * 有声书附加音效：本地生成 wav 落盘至 customVoiceSamplesRootDir/.yiman-sfx/
 */

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function sanitizeSfxBaseName(name: string): string {
  const s = name
    .trim()
    .replace(/[/\\:?*"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
  return s || 'sfx';
}

async function uniquifySfxBaseName(dir: string, baseName: string): Promise<string> {
  const fs = window.yiman?.fs;
  if (!fs?.pathExists || !fs.pathJoin) return baseName;
  let stem = sanitizeSfxBaseName(baseName);
  let candidate = stem;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wav = await fs.pathJoin(dir, `${candidate}.wav`);
    if (!(await fs.pathExists(wav))) return candidate;
    n += 1;
    candidate = `${stem}_${n}`;
  }
}

export interface SaveAttachedSfxWavResult {
  ok: true;
  absolutePath: string;
}

export interface SaveAttachedSfxWavError {
  ok: false;
  error: string;
}

export async function saveAttachedSfxWav(opts: {
  voiceSamplesRootDir: string;
  description: string;
  wavArrayBuffer: ArrayBuffer;
}): Promise<SaveAttachedSfxWavResult | SaveAttachedSfxWavError> {
  const write = window.yiman?.fs?.writeBase64File;
  const pathJoin = window.yiman?.fs?.pathJoin;
  if (!write || !pathJoin) {
    return { ok: false, error: '当前环境无法写入文件（请使用桌面版）' };
  }

  const root = opts.voiceSamplesRootDir.trim();
  if (!root) {
    return { ok: false, error: '请先在「有声书」设置中配置自定义音色样本目录（用于存放生成音效）' };
  }

  const subDir = await pathJoin(root, '.yiman-sfx');
  const stem = await uniquifySfxBaseName(subDir, opts.description);
  const wavPath = await pathJoin(subDir, `${stem}.wav`);

  const wav64 = arrayBufferToBase64(opts.wavArrayBuffer);
  const w1 = await write(wavPath, wav64);
  if (!w1.ok) return { ok: false, error: w1.error || '写入 wav 失败' };

  return { ok: true, absolutePath: wavPath };
}
