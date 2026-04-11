/**
 * 文生图流式 SSE：解析 data 帧并合并出最终图片 URL 列表。
 * OpenAI 风格 `data: [{ url }]` 与火山方舟 `image_generation.partial_succeeded` 共用。
 */

/** SSE 经 XStream 解析后的单帧：{ event?, data: string }，data 为 JSON 字符串或 [DONE] */
export function parseSseFramePayload(rawChunk: unknown): Record<string, unknown> | null {
  if (!rawChunk || typeof rawChunk !== 'object') return null;
  const wrap = rawChunk as Record<string, unknown>;
  const d = wrap.data;
  if (typeof d === 'string') {
    const s = d.trim();
    if (!s || s === '[DONE]') return null;
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    return d as Record<string, unknown>;
  }
  return wrap;
}

/**
 * 合并流式图片 URL：兼容 OpenAI `{ data: [{ url }] }` 与火山方舟
 * `image_generation.partial_succeeded`（顶层 url + image_index）。
 * onUpdate 仅传入当前 chunk；originMessage 中已累积的 JSON 需参与合并。
 */
export function mergeImageUrlsFromStream(originContent: string | undefined, streamChunks: unknown[]): string[] {
  const byIndex = new Map<number, string>();
  const tail: string[] = [];
  const seen = new Set<string>();

  try {
    const prev = originContent ? JSON.parse(originContent) : null;
    const imgs = prev && typeof prev === 'object' ? (prev as { images?: unknown }).images : null;
    if (Array.isArray(imgs)) {
      imgs.forEach((u: unknown, i: number) => {
        if (typeof u === 'string' && u) {
          byIndex.set(i, u);
          seen.add(u);
        }
      });
    }
  } catch {
    /* ignore */
  }

  for (const raw of streamChunks) {
    const inner = parseSseFramePayload(raw);
    if (!inner) continue;

    if (inner.type === 'image_generation.partial_succeeded') {
      const idx =
        typeof inner.image_index === 'number' && inner.image_index >= 0
          ? inner.image_index
          : byIndex.size
            ? Math.max(...byIndex.keys()) + 1
            : 0;

      if (typeof inner.url === 'string' && inner.url) {
        byIndex.set(idx, inner.url);
        seen.add(inner.url);
        continue;
      }

      const rawB64 =
        (typeof inner.b64_json === 'string' && inner.b64_json) ||
        (typeof inner.image_base64 === 'string' && inner.image_base64) ||
        (typeof inner.base64 === 'string' && inner.base64) ||
        '';
      if (rawB64) {
        const mime =
          typeof inner.mime_type === 'string' && inner.mime_type.includes('/')
            ? inner.mime_type.split(';')[0].trim()
            : 'image/png';
        const dataUrl = rawB64.startsWith('data:') ? rawB64 : `data:${mime};base64,${rawB64}`;
        byIndex.set(idx, dataUrl);
        seen.add(dataUrl);
      }
      continue;
    }

    const rowData = inner.data;
    if (Array.isArray(rowData)) {
      for (const item of rowData) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { url?: string; b64_json?: string };
        if (row.url && !seen.has(row.url)) {
          tail.push(row.url);
          seen.add(row.url);
        } else if (row.b64_json) {
          const b64 = `data:image/png;base64,${row.b64_json}`;
          if (!seen.has(b64)) {
            tail.push(b64);
            seen.add(b64);
          }
        }
      }
    }
  }

  const indexed = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, u]) => u);
  return [...indexed, ...tail];
}
