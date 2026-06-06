/**
 * 有声书整集：合并各段 TTS 缓存为单个 WAV
 */
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';
import { segmentHasPlayableText } from '@/audiobook/utils/audiobookModel';
import { formatNovelEpisodeNavLabel } from '@/novelDesign/utils/novelEpisodeDisplay';
import type { NovelEpisode } from '@/novelDesign/storage/novelWorkspaceStorage';

function makeSilence(sampleRate: number, durationSec: number): AudioBuffer {
  const len = Math.max(0, Math.ceil(durationSec * sampleRate));
  const ctx = new OfflineAudioContext(1, Math.max(1, len), sampleRate);
  return ctx.createBuffer(1, len, sampleRate);
}

async function decodeBlob(ctx: AudioContext, blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  return ctx.decodeAudioData(ab.slice(0));
}

/** 将多声道 AudioBuffer 混为 mono */
function toMono(sampleRate: number, buf: AudioBuffer): AudioBuffer {
  if (buf.numberOfChannels === 1) return buf;
  const ctx = new OfflineAudioContext(1, buf.length, sampleRate);
  const out = ctx.createBuffer(1, buf.length, sampleRate);
  const dst = out.getChannelData(0);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    for (let i = 0; i < buf.length; i++) dst[i] = (dst[i] ?? 0) + src[i]! / buf.numberOfChannels;
  }
  return out;
}

function encodeWavMono(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** 按播放顺序拼接片段（仅文本类 TTS；跳过无缓存的段） */
export async function concatAudiobookEpisodeBuffers(params: {
  segments: AudioSegment[];
  getSegmentBlob: (index: number) => Promise<Blob | undefined>;
}): Promise<AudioBuffer> {
  const { segments, getSegmentBlob } = params;
  const decodeCtx = new AudioContext();
  const parts: AudioBuffer[] = [];

  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const preSec = (seg.preDelayMs ?? 0) / 1000;

      if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
        continue;
      }
      if (!segmentHasPlayableText(seg)) continue;

      const blob = await getSegmentBlob(i);
      if (!blob) continue;
      const decoded = await decodeBlob(decodeCtx, blob);
      const sampleRate = decoded.sampleRate;

      if (preSec > 0) parts.push(makeSilence(sampleRate, preSec));
      parts.push(toMono(sampleRate, decoded));

      const postSec = (seg.postDelayMs ?? 0) / 1000;
      if (postSec > 0) parts.push(makeSilence(sampleRate, postSec));
    }
  } finally {
    await decodeCtx.close();
  }

  if (!parts.length) {
    throw new Error('没有可导出的 TTS 音频，请先生成各段配音');
  }

  const sampleRate = parts[0]!.sampleRate;
  const totalSamples = parts.reduce((n, b) => n + b.length, 0);
  const offline = new OfflineAudioContext(1, totalSamples, sampleRate);
  let offset = 0;
  for (const buf of parts) {
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start(offset / sampleRate);
    offset += buf.length;
  }
  return offline.startRendering();
}

export function audiobookEpisodeExportWavBlob(buffer: AudioBuffer): Blob {
  return encodeWavMono(buffer);
}

export function downloadBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/** Electron：保存对话框 + 写文件；否则浏览器下载 */
export async function saveAudiobookWavWithDialog(blob: Blob, defaultFileName: string): Promise<boolean> {
  const api = window.yiman;
  if (api?.dialog?.saveFile && api?.fs?.writeBase64File) {
    const chosen = await api.dialog.saveFile({
      defaultPath: defaultFileName,
      filters: [{ name: 'WAV 音频', extensions: ['wav'] }],
    });
    if (!chosen) return false;
    const base64 = await blobToBase64(blob);
    const res = await api.fs.writeBase64File(chosen, base64);
    if (!res?.ok) throw new Error(res?.error ?? '保存失败');
    return true;
  }
  downloadBlobAsFile(blob, defaultFileName);
  return true;
}

export function defaultAudiobookExportFileName(episodeTitle?: string): string {
  const base = (episodeTitle ?? '有声书').replace(/[\\/:*?"<>|]/g, '_').slice(0, 48);
  return `${base || 'audiobook'}.wav`;
}

/** 导出文件名：与集导航一致，如「1、开篇」 */
export function audiobookExportWavFileName(ep: NovelEpisode): string {
  const label = formatNovelEpisodeNavLabel(ep);
  const safe = label.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  return `${safe || 'audiobook'}.wav`;
}

async function blobToBase64ForFs(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/** 写入指定路径（Electron）；目录不存在时由主进程创建 */
export async function saveAudiobookWavToPath(blob: Blob, fullPath: string): Promise<boolean> {
  const api = window.yiman?.fs?.writeBase64File;
  if (!api) return false;
  const base64 = await blobToBase64ForFs(blob);
  const res = await api(fullPath, base64);
  if (!res?.ok) throw new Error(res?.error ?? '保存失败');
  return true;
}

/** 在系统文件管理器中打开所在目录并选中该文件（仅 Electron 客户端） */
export function revealAudiobookExportInFolder(fullPath: string): void {
  const p = fullPath.trim();
  if (!p) return;
  window.yiman?.shell?.showItemInFolder?.(p);
}
