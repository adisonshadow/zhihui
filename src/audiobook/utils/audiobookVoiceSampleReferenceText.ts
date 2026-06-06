/**
 * LongCat（mlx-audio）语音克隆需参考音频对应文稿（ref_text）。
 * 优先读 WAV 同目录同名 .txt / .transcript.txt（UTF-8）。
 */

const SIDECAR_SUFFIXES = ['.txt', '.transcript.txt'] as const;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 由绝对路径推导可能的 sidecar 文稿路径 */
export function voiceSampleTranscriptSidecarPaths(audioAbsPath: string): string[] {
  const p = audioAbsPath.trim();
  if (!p) return [];
  const dot = p.lastIndexOf('.');
  const base = dot > 0 ? p.slice(0, dot) : p;
  return SIDECAR_SUFFIXES.map((suf) => `${base}${suf}`);
}

/**
 * 读取参考音色样本的克隆文稿（Electron 主进程读盘）。
 * 无 sidecar 或读失败时返回 undefined。
 */
export async function resolveVoiceSampleReferenceText(
  audioAbsPath: string | undefined,
): Promise<string | undefined> {
  const audio = audioAbsPath?.trim();
  if (!audio) return undefined;
  const read = window.yiman?.fs?.readUtf8File;
  if (!read) return undefined;
  for (const sidecar of voiceSampleTranscriptSidecarPaths(audio)) {
    try {
      const raw = await read(sidecar);
      if (!raw) continue;
      const t = stripBom(raw).trim();
      if (t) return t;
    } catch {
      continue;
    }
  }
  return undefined;
}
