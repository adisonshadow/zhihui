/** 编剧抽卡会话：从历史气泡序列解析收藏附言所需上下文 */

export type ScreenwriterBubbleMessage = {
  role: string;
  content: string;
};

/** 在 beforeBubbleIndex（当前助手气泡序号）之前的最近一条抽卡偏好用户消息全文 */
export function findLatestDrawBriefBeforeBubble(
  messages: ScreenwriterBubbleMessage[],
  beforeBubbleIndex: number
): string {
  const end = Math.min(beforeBubbleIndex, messages.length);
  for (let i = end - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const c = m.content ?? '';
    if (/^生成数量（N）：/m.test(c)) return c.trim();
  }
  return '';
}

/** 大纲助手气泡：从上一轮「生成大纲」类用户气泡中取出小说雏形正文 */
export function extractStorySeedFromOutlineUserMessage(userOutlineRequestBody: string): string {
  const marker = '【小说雏形】';
  const ix = userOutlineRequestBody.indexOf(marker);
  if (ix < 0) return '';
  return userOutlineRequestBody.slice(ix + marker.length).trim();
}

/**
 * 大纲消息收藏附言：
 * - 小说雏形块：取自紧挨着的上一轮用户消息中含【小说雏形】一段
 * - 原始抽卡需求：再往前最近一次「生成数量（N）：」用户消息全文
 */
export function resolveOutlineFavoriteAppendixSources(
  messages: ScreenwriterBubbleMessage[],
  outlineAssistantBubbleIndex: number
): { drawBrief: string; storySeedBlock: string } {
  for (let i = outlineAssistantBubbleIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const c = m.content ?? '';
    if (!c.includes('请基于下面这个小说雏形')) continue;
    const storySeedBlock = extractStorySeedFromOutlineUserMessage(c);
    let drawBrief = '';
    for (let j = i - 1; j >= 0; j--) {
      const u = messages[j];
      if (!u || u.role !== 'user') continue;
      if (/^生成数量（N）：/m.test(u.content ?? '')) {
        drawBrief = (u.content ?? '').trim();
        break;
      }
    }
    return { drawBrief, storySeedBlock };
  }
  return { drawBrief: '', storySeedBlock: '' };
}
