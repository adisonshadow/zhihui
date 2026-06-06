/**
 * audioRecorder API 薄封装：window.yiman.audioRecorder.*
 */

export interface RecordingEntry {
  name: string;
  path: string;
  mtime: string;
  size: number;
}

const api = window.yiman?.audioRecorder;

export function listRecordings(): Promise<RecordingEntry[]> {
  return api?.list() ?? Promise.resolve([]);
}

export function saveRecording(base64: string, ext: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  return api?.save(base64, ext) ?? Promise.resolve({ ok: false, error: 'Electron API 不可用' });
}

export function getDuration(filePath: string): Promise<number | null> {
  return api?.getDuration(filePath) ?? Promise.resolve(null);
}

export function processRecording(
  filePath: string,
  options: { trimStart?: number; trimEnd?: number; denoise?: boolean },
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  return api?.process(filePath, options) ?? Promise.resolve({ ok: false, error: 'Electron API 不可用' });
}

export function exportRecording(
  filePath: string,
  outPath: string,
  options: { format: 'mp3' | 'wav'; trimStart?: number; trimEnd?: number; denoise?: boolean },
): Promise<{ ok: true; outputPath: string } | { ok: false; error: string }> {
  return api?.export(filePath, outPath, options) ?? Promise.resolve({ ok: false, error: 'Electron API 不可用' });
}

export function deleteRecording(filePath: string): Promise<{ ok: boolean; error?: string }> {
  return api?.delete(filePath) ?? Promise.resolve({ ok: false, error: 'Electron API 不可用' });
}

export function renameRecording(filePath: string, name: string): Promise<{ ok: boolean; error?: string; newPath?: string }> {
  return api?.rename(filePath, name) ?? Promise.resolve({ ok: false, error: 'Electron API 不可用' });
}

export function demucsCheck(): Promise<{ installed: boolean; message?: string }> {
  return api?.demucsCheck() ?? Promise.resolve({ installed: false, message: 'Electron API 不可用' });
}
