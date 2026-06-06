/**
 * 原子 Tool 公用的 API 辅助函数
 */
export function authHeaders(
  apiKey?: string,
  isLocal?: boolean,
): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocal && apiKey?.trim()) {
    h.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return h;
}

export function imagesUrl(apiUrl: string): string {
  const base = (apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  return `${base}/images/generations`;
}

/** OpenAI 兼容视频接口（各家网关若已实现则路径一致）；与 `images/generations` 同属 v1 REST */
export function videosGenerationsUrl(apiUrl: string): string {
  const base = (apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  return `${base}/videos/generations`;
}

/** 兼容多种网关返回：`data[0].url`｜顶层 `url`/`video_url`｜`output.url` */
export function pickFirstVideoUrl(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  const dataArr = d.data;
  if (Array.isArray(dataArr) && dataArr.length > 0) {
    const first = dataArr[0];
    if (first && typeof first === 'object') {
      const u = (first as { url?: string }).url;
      if (typeof u === 'string' && u.trim()) return u.trim();
    }
  }

  if (typeof d.url === 'string' && d.url.trim()) return d.url.trim();
  if (typeof d.video_url === 'string' && d.video_url.trim()) return d.video_url.trim();

  const out = d.output;
  if (out && typeof out === 'object') {
    const o = out as { url?: string; video_url?: string };
    if (typeof o.url === 'string' && o.url.trim()) return o.url.trim();
    if (typeof o.video_url === 'string' && o.video_url.trim()) return o.video_url.trim();
  }

  return '';
}

export function pickFirstImageUrl(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as { data?: Array<{ url?: string; b64_json?: string }> };
  const first = d.data?.[0];
  if (first?.url) return first.url;
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  return '';
}
