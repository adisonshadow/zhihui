import { evaluate, hush } from '@strudel/web';
import { computePlaybackDurationSec } from '@/musicDesign/utils/formatPlaybackTime';
import { prepareStrudelBody } from '@/musicDesign/strudelPlayback/prepareStrudelBody';
import { audioBufferToWav, audioBufferToWavBlob } from './audioBufferToWav';
import { ensureStrudelEngine, resetStrudelEngineCache } from './ensureStrudelEngine';
import { renderStrudelPatternOffline } from './renderStrudelPatternOffline';

export type StrudelAudioExportFormat = 'wav' | 'mp3';

export interface ExportStrudelAudioOptions {
  code: string;
  cps?: number;
  cycleCount?: number;
  format: StrudelAudioExportFormat;
  sampleRate?: number;
  /** 主音量 0–1（默认 1） */
  volume?: number;
  /** evaluate 前先 hush（默认 true） */
  hushBeforeRender?: boolean;
  /** 跳过 ensureStrudelEngine（调用方已初始化时） */
  engineReady?: boolean;
  /** Electron：目标文件完整路径（含扩展名） */
  outputPath?: string;
  /** 浏览器下载 / 对话框默认名（无扩展名） */
  downloadBaseName?: string;
}

export type ExportStrudelAudioResult =
  | {
      ok: true;
      format: StrudelAudioExportFormat;
      durationSec: number;
      arrayBuffer: ArrayBuffer;
      blob: Blob;
      outputPath?: string;
      /** 离线渲染后实时引擎可能需重建 */
      engineNeedsReinit: boolean;
    }
  | { ok: false; error: string };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveViaElectron(
  format: StrudelAudioExportFormat,
  wavArrayBuffer: ArrayBuffer,
  options: Pick<ExportStrudelAudioOptions, 'outputPath' | 'downloadBaseName'>,
): Promise<{ outputPath?: string; error?: string }> {
  const api = typeof window !== 'undefined' ? window.yiman : undefined;
  if (!api?.fs?.writeBase64File) {
    return { error: '当前环境不支持写入文件' };
  }

  let targetPath = options.outputPath?.trim();
  if (!targetPath && api.dialog?.saveFile) {
    const defaultName = options.downloadBaseName?.trim() || `strudel-${Date.now()}`;
    targetPath =
      (await api.dialog.saveFile({
        defaultPath: `${defaultName}.${format}`,
        filters: [
          format === 'mp3' ?
            { name: 'MP3', extensions: ['mp3'] }
          : { name: 'WAV', extensions: ['wav'] },
        ],
      })) ?? undefined;
  }

  if (!targetPath) return {};

  if (format === 'wav') {
    const res = await api.fs.writeBase64File(targetPath, arrayBufferToBase64(wavArrayBuffer));
    return res.ok ? { outputPath: targetPath } : { error: res.error ?? '写入 WAV 失败' };
  }

  if (!api.audio?.convertWavToMp3) {
    return { error: 'MP3 导出需要 Electron 主进程 ffmpeg 支持' };
  }

  const wavBase64 = arrayBufferToBase64(wavArrayBuffer);
  const res = await api.audio.convertWavToMp3(wavBase64, targetPath);
  return res.ok ? { outputPath: res.outputPath ?? targetPath } : { error: res.error ?? 'MP3 转换失败' };
}

/**
 * 将 Strudel 代码离线渲染并导出 WAV / MP3。
 * 有声书等工作台可直接调用，无需依赖 MusicDesignPage UI。
 */
export async function exportStrudelAudio(
  opts: ExportStrudelAudioOptions,
): Promise<ExportStrudelAudioResult> {
  const code = opts.code.trim();
  if (!code) return { ok: false, error: '代码为空' };

  const cps = opts.cps ?? 0.9;
  const cycleCount = Math.max(1, opts.cycleCount ?? 1);
  const durationSec = computePlaybackDurationSec(cycleCount, cps);
  const body = prepareStrudelBody(code, cps);
  if (!body) return { ok: false, error: '代码为空' };

  let engineNeedsReinit = false;

  try {
    if (!opts.engineReady) {
      await ensureStrudelEngine();
    }

    if (opts.hushBeforeRender !== false) {
      try {
        hush();
      } catch {
        /* ignore */
      }
    }

    const pattern = await evaluate(body, false);
    if (!pattern || typeof (pattern as { queryArc?: unknown }).queryArc !== 'function') {
      return { ok: false, error: 'Strudel evaluate 未返回有效 pattern' };
    }

    engineNeedsReinit = true;
    const audioBuffer = await renderStrudelPatternOffline({
      pattern: pattern as Parameters<typeof renderStrudelPatternOffline>[0]['pattern'],
      cps,
      end: cycleCount,
      sampleRate: opts.sampleRate,
      volume: opts.volume,
    });

    const wavArrayBuffer = audioBufferToWav(audioBuffer);
    const wavBlob = audioBufferToWavBlob(audioBuffer);

    const electronSave = await saveViaElectron(opts.format, wavArrayBuffer, opts);
    if (electronSave.error) {
      return { ok: false, error: electronSave.error };
    }

    if (electronSave.outputPath) {
      return {
        ok: true,
        format: opts.format,
        durationSec,
        arrayBuffer: opts.format === 'wav' ? wavArrayBuffer : wavArrayBuffer,
        blob: opts.format === 'wav' ? wavBlob : wavBlob,
        outputPath: electronSave.outputPath,
        engineNeedsReinit,
      };
    }

    if (opts.format === 'mp3') {
      return { ok: false, error: 'MP3 导出请在桌面版使用「另存为」，或传入 outputPath' };
    }

    const base = opts.downloadBaseName?.trim() || `strudel-${Date.now()}`;
    triggerBrowserDownload(wavBlob, `${base}.wav`);

    return {
      ok: true,
      format: 'wav',
      durationSec,
      arrayBuffer: wavArrayBuffer,
      blob: wavBlob,
      engineNeedsReinit,
    };
  } catch (e) {
    engineNeedsReinit = true;
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (engineNeedsReinit) {
      resetStrudelEngineCache();
    }
  }
}

export { audioBufferToWav, audioBufferToWavBlob } from './audioBufferToWav';
export { ensureStrudelEngine, resetStrudelEngineCache, getLastStrudelInitOptions, runStrudelSamplePrebake, type StrudelEngineInitOptions } from './ensureStrudelEngine';
export { renderStrudelPatternOffline } from './renderStrudelPatternOffline';
