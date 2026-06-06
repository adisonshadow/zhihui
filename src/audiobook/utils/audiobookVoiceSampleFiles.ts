/**
 * 音色样本 wav + 同名 UTF-8 文稿落盘（相对 customVoiceSamplesRootDir/.yiman-voices/）
 */

/** 文件名基础段：去非法字符、控制长度 */
export function sanitizeVoiceSampleBaseName(name: string): string {
  const s = name
    .trim()
    .replace(/[/\\:?*"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return s || 'voice-sample';
}

function utf8TextToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uniquifyVoiceSampleBaseName(dir: string, baseName: string): Promise<string> {
  const fs = window.yiman?.fs;
  if (!fs?.pathExists || !fs.pathJoin) return baseName;
  let stem = sanitizeVoiceSampleBaseName(baseName);
  let candidate = stem;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wav = await fs.pathJoin(dir, `${candidate}.wav`);
    const txt = await fs.pathJoin(dir, `${candidate}.txt`);
    const e1 = await fs.pathExists(wav);
    const e2 = await fs.pathExists(txt);
    if (!e1 && !e2) return candidate;
    n += 1;
    candidate = `${stem}_${n}`;
  }
}

export interface SaveVoiceSampleWavResult {
  ok: true;
  /** 相对 customVoiceSamplesRootDir，统一正斜杠 */
  relativePath: string;
  absoluteDir: string;
}
export interface SaveVoiceSampleWavError {
  ok: false;
  error: string;
}

/**
 * 在 `<root>/.yiman-voices/` 下写入 wav 与同名 txt（txt 内容为音色描述，供 LongCat sidecar）
 */
export async function saveVoiceSampleWav(opts: {
  voiceSamplesRootDir: string;
  /** 不含路径与扩展的用户期望名 */
  desiredBaseName: string;
  wavArrayBuffer: ArrayBuffer;
  voiceDescription: string;
  /** 若缺省则从 desiredBaseName 推导并 uniquify */
  baseNameStem?: string;
}): Promise<SaveVoiceSampleWavResult | SaveVoiceSampleWavError> {
  const write = window.yiman?.fs?.writeBase64File;
  const pathJoin = window.yiman?.fs?.pathJoin;
  if (!write || !pathJoin) {
    return { ok: false, error: '当前环境无法写入文件（请使用桌面版）' };
  }

  const root = opts.voiceSamplesRootDir.trim();
  if (!root) return { ok: false, error: '未配置自定义音色样本目录' };

  const subDir = await pathJoin(root, '.yiman-voices');
  const stem = await uniquifyVoiceSampleBaseName(subDir, opts.baseNameStem ?? opts.desiredBaseName);
  const wavPath = await pathJoin(subDir, `${stem}.wav`);
  const txtPath = await pathJoin(subDir, `${stem}.txt`);

  const wav64 = arrayBufferToBase64(opts.wavArrayBuffer);
  const txt64 = utf8TextToBase64(opts.voiceDescription.trim() || '(无描述)');
  const w1 = await write(wavPath, wav64);
  if (!w1.ok) return { ok: false, error: w1.error || '写入 wav 失败' };
  const w2 = await write(txtPath, txt64);
  if (!w2.ok) return { ok: false, error: w2.error || '写入 txt 失败' };

  const rel = `.yiman-voices/${stem}.wav`.replace(/\\/g, '/');
  return { ok: true, relativePath: rel, absoluteDir: subDir };
}

/** 从本地绝对路径复制音频到 `.yiman-voices/`（保留原扩展名） */
export async function saveVoiceSampleFromAbsolutePath(opts: {
  voiceSamplesRootDir: string;
  sourceAbsolutePath: string;
  desiredBaseName: string;
  sidecarText?: string;
}): Promise<SaveVoiceSampleWavResult | SaveVoiceSampleWavError> {
  const read = window.yiman?.fs?.readFileAsDataUrl;
  const write = window.yiman?.fs?.writeBase64File;
  const pathJoin = window.yiman?.fs?.pathJoin;
  if (!read || !write || !pathJoin) {
    return { ok: false, error: '当前环境无法读写文件（请使用桌面版）' };
  }
  const root = opts.voiceSamplesRootDir.trim();
  if (!root) return { ok: false, error: '未配置自定义音色样本目录' };
  const src = opts.sourceAbsolutePath.trim();
  if (!src) return { ok: false, error: '未选择参考音频' };

  const dataUrl = await read(src);
  if (!dataUrl?.startsWith('data:')) return { ok: false, error: '读取参考音频失败' };

  const extMatch = /\.(wav|mp3|m4a|aac|flac|ogg)$/i.exec(src);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'wav';
  const subDir = await pathJoin(root, '.yiman-voices');
  const stem = await uniquifyVoiceSampleBaseName(subDir, opts.desiredBaseName);
  const audioPath = await pathJoin(subDir, `${stem}.${ext}`);
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const w1 = await write(audioPath, b64);
  if (!w1.ok) return { ok: false, error: w1.error || '写入音频失败' };

  const sidecar = (opts.sidecarText ?? '').trim();
  if (sidecar) {
    const txtPath = await pathJoin(subDir, `${stem}.txt`);
    const w2 = await write(txtPath, utf8TextToBase64(sidecar));
    if (!w2.ok) return { ok: false, error: w2.error || '写入 txt 失败' };
  }

  const rel = `.yiman-voices/${stem}.${ext}`.replace(/\\/g, '/');
  return { ok: true, relativePath: rel, absoluteDir: subDir };
}
