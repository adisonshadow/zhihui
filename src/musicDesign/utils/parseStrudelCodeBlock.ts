const FENCE_OPEN = /(?:^|\n)```(?:strudel|tidal)\s*(?:\r?\n|$)/gi;

/**
 * 从助手正文中提取 **最后一个闭合** 的 strudel/tidal 围栏内容。
 * 流式阶段若无闭合围栏则返回 null。
 */
export function extractLastClosedStrudelBlock(text: string): string | null {
  if (!text || !text.includes('```')) return null;
  const matches = [...text.matchAll(FENCE_OPEN)];
  if (matches.length === 0) return null;
  const lastOpen = matches[matches.length - 1];
  const startIdx = lastOpen.index! + lastOpen[0].length;
  const tail = text.slice(startIdx);
  const close = tail.search(/\n```(?:\s|$)/);
  if (close < 0) return null;
  return tail.slice(0, close).replace(/\r\n/g, '\n').trim();
}

/**
 * 流式中间态：若存在未闭合的 strudel 围栏，返回从开围栏到文本末尾的候选（供预览，可能不完整）。
 */
export function extractStreamingStrudelCandidate(text: string): string | null {
  if (!text) return null;
  const matches = [...text.matchAll(FENCE_OPEN)];
  if (matches.length === 0) return null;
  const lastOpen = matches[matches.length - 1];
  const startIdx = lastOpen.index! + lastOpen[0].length;
  const body = text.slice(startIdx);
  const close = body.indexOf('\n```');
  if (close >= 0) return body.slice(0, close).replace(/\r\n/g, '\n').trim();
  return body.replace(/\r\n/g, '\n').trim();
}
