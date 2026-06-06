import { findBalancedJsonSlice } from '@/components/AIChat/utils/balancedJsonSlice';

function videoUrlFromToolJson(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const o = parsed as Record<string, unknown>;
  if (o.ok === true && typeof o.video === 'string' && o.video.trim()) return o.video.trim();
  if (typeof o.video_url === 'string' && o.video_url.trim()) return o.video_url.trim();
  return '';
}

/** 解析 tool 消息中的 JSON，`generate_video` 成功体 `video`/`video_url` */
export function extractVideoUrlFromToolMessageContent(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    const p = JSON.parse(t) as unknown;
    const url = videoUrlFromToolJson(p);
    if (url) return url;
  } catch {
    /* continue */
  }
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    const hit = findBalancedJsonSlice(t, i);
    if (!hit) continue;
    try {
      const p = JSON.parse(hit.slice) as unknown;
      const url = videoUrlFromToolJson(p);
      if (url) return url;
    } catch {
      /* skip */
    }
  }
  return '';
}
