/** 本地绝对路径 → Electron 可播放的 file:// URL */
export function resolveLocalAudioPlayUrl(src: string): string {
  const raw = src.trim();
  if (!raw) return '';
  if (raw.startsWith('file://') || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `file://${raw}`;
}
