/**
 * novel-body-json 解析器：从 AI 对话答复中提取 novel_write_payload。
 * 纯函数，零外部依赖，可单元测试。
 */

export interface NovelWriteJsonPayload {
  n?: number;
  mode?: 'replace' | 'append';
  title?: string;
  content_markdown?: string;
}

export interface ParsedNovelWritePayload {
  payload: NovelWriteJsonPayload | null;
  displayText: string;
  preMarkerContent: string;
  postMarkerContent: string;
  hasMarker: boolean;
  /** 宽松提取的 content_markdown（流式预览用） */
  streamContentMarkdown: string;
  /** 宽松提取的集序号 n */
  streamTargetN: number | null;
}

const NOVEL_BODY_JSON_FENCE_RE = /```(?:novel-body-json|json)\s*([\s\S]*?)```/gi;

/**
 * 从 AI 回复原文中解析 novel-body-json 代码块。
 *
 * 两条路径：
 * 1. 严格模式 — 从 ```novel-body-json 或 ```json fence 内 JSON.parse
 * 2. 宽松模式 — 直接在原文中搜索 "novel_write_payload" 后的 content_markdown 值（流式预览降级用）
 */
export function extractNovelWritePayload(raw: string): ParsedNovelWritePayload {
  const markerIdx = raw.indexOf('"novel_write_payload"');
  const hasMarker = markerIdx >= 0;

  let payload: NovelWriteJsonPayload | null = null;
  let fenceStart = -1;
  let fenceEnd = -1;
  const replaced = raw.replace(NOVEL_BODY_JSON_FENCE_RE, (_all, jsonText: string, offset: number) => {
    if (/"novel_write_payload"\s*:/.test(jsonText)) {
      try {
        const parsed = JSON.parse(jsonText) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          const candidate = obj.novel_write_payload;
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            payload = candidate as NovelWriteJsonPayload;
            fenceStart = offset;
            fenceEnd = offset + _all.length;
            return '';
          }
        }
      } catch {
        return _all;
      }
    }
    return _all;
  });

  const extractStreamTargetN = (): number | null => {
    if (markerIdx < 0) return null;
    const m = raw.slice(markerIdx).match(/"n"\s*:\s*(\d{1,3})/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
  };

  const extractStreamContentMarkdown = (): string => {
    if (markerIdx < 0) return '';
    const cIdx = raw.indexOf('"content_markdown"', markerIdx);
    if (cIdx < 0) return '';
    const colonIdx = raw.indexOf(':', cIdx);
    if (colonIdx < 0) return '';
    const quoteIdx = raw.indexOf('"', colonIdx);
    if (quoteIdx < 0) return '';

    let i = quoteIdx + 1;
    let escaped = false;
    let closed = false;
    let buf = '';
    for (; i < raw.length; i++) {
      const ch = raw[i]!;
      if (escaped) {
        buf += `\\${ch}`;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        closed = true;
        break;
      }
      buf += ch;
    }

    const decodeLoose = (s: string): string => {
      try {
        return JSON.parse(`"${s}"`) as string;
      } catch {
        return s
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    };

    if (closed) return decodeLoose(buf);
    const loose = buf.endsWith('\\') ? buf.slice(0, -1) : buf;
    return decodeLoose(loose);
  };

  let displayText = replaced.trim();
  let preMarkerContent = '';
  let postMarkerContent = '';
  if (fenceStart >= 0 && fenceEnd > fenceStart) {
    preMarkerContent = raw.slice(0, fenceStart).trim();
    postMarkerContent = raw.slice(fenceEnd).trim();
  } else if (hasMarker && markerIdx >= 0) {
    const preFence = raw.lastIndexOf('```novel-body-json', markerIdx);
    const rawFence = preFence >= 0 ? preFence : raw.lastIndexOf('```json', markerIdx);
    const keepUntil = rawFence >= 0 ? rawFence : markerIdx;
    preMarkerContent = raw.slice(0, keepUntil).trim();
  }

  if (!payload && hasMarker && markerIdx >= 0) {
    let rawFence = raw.lastIndexOf('```novel-body-json', markerIdx);
    if (rawFence < 0) rawFence = raw.lastIndexOf('```json', markerIdx);
    const keepUntil = rawFence >= 0 ? rawFence : markerIdx;
    displayText = raw.slice(0, keepUntil).trim();
  }

  return {
    payload,
    displayText,
    preMarkerContent,
    postMarkerContent,
    hasMarker,
    streamContentMarkdown: extractStreamContentMarkdown(),
    streamTargetN: extractStreamTargetN(),
  };
}

/**
 * 从解析结果中获取最佳可用的正文内容：优先严格解析的 content_markdown，
 * 宽松模式作为降级。
 */
export function getBestBodyContent(parsed: ParsedNovelWritePayload): string {
  return (parsed.payload?.content_markdown?.trim() || parsed.streamContentMarkdown.trim());
}

/**
 * 从解析结果中获取最佳可用的集序号：优先严格解析的 n，
 * 宽松模式作为降级。
 */
export function getBestTargetN(parsed: ParsedNovelWritePayload): number | null {
  if (parsed.payload && Number.isFinite(Number(parsed.payload.n))) {
    return Math.floor(Number(parsed.payload.n));
  }
  return parsed.streamTargetN;
}

export function truncateUnicodeChars(s: string, maxChars: number): string {
  const arr = [...s];
  if (arr.length <= maxChars) return s;
  return `${arr.slice(0, maxChars).join('')}…`;
}
