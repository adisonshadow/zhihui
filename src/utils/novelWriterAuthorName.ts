/** 小说编剧设置：作者署名（写入封面助手提示）；与 electron/main/settings 归一逻辑保持一致 */
export const NOVEL_WRITER_AUTHOR_NAME_MAX = 64;

export function normalizeNovelWriterAuthorName(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw)
    .replace(/[\r\n\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOVEL_WRITER_AUTHOR_NAME_MAX);
  return s || undefined;
}
