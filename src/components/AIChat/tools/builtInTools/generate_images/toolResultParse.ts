import { findBalancedJsonSlice } from '@/components/AIChat/utils/balancedJsonSlice';

function urlsFromImagesField(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { images?: unknown }).images)) {
    return [];
  }
  const arr = (parsed as { images: Array<string | { url?: string }> }).images;
  return arr
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter((u): u is string => !!u && typeof u === 'string');
}

/** 解析 tool 消息中的 JSON（整段或内嵌），得到 `images` URL 列表 */
export function extractImageUrlsFromToolMessageContent(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  try {
    const p = JSON.parse(t) as unknown;
    const urls = urlsFromImagesField(p);
    if (urls.length) return urls;
  } catch {
    /* continue */
  }
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    const hit = findBalancedJsonSlice(t, i);
    if (!hit) continue;
    try {
      const p = JSON.parse(hit.slice) as unknown;
      const urls = urlsFromImagesField(p);
      if (urls.length) return urls;
    } catch {
      /* skip */
    }
  }
  return [];
}
