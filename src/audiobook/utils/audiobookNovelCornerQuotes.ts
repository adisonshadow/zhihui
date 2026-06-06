/**
 * 小说正文直角引号「」对白解析（有声书改编：工具回包标注 + 片段 TTS 文本规范化）
 */

export const NOVEL_CORNER_QUOTE_OPEN = '「';
export const NOVEL_CORNER_QUOTE_CLOSE = '」';

/** 与 novel_get_episode / novel_audiobook_get_episode 回包字段一致 */
export interface NovelCornerQuoteSpan {
  index: number;
  /** 在 content_markdown 中的起始下标（含开引号） */
  start: number;
  /** 在 content_markdown 中的结束下标（不含，与 String.slice 一致） */
  end: number;
  /** 引号内对白正文（不含「」） */
  quoted_text: string;
  /** 同一段落内紧接在该对引号之后的叙述片段（若有，最多约 120 字） */
  narration_after?: string;
}

const CORNER_QUOTE_PAIR_RE = /「([^」\n]*)」/g;

/** 从小说 Markdown 正文中提取「」包裹的对白区间 */
export function extractNovelCornerQuoteSpans(source: string): NovelCornerQuoteSpan[] {
  const md = source ?? '';
  if (!md.includes(NOVEL_CORNER_QUOTE_OPEN)) return [];

  const spans: NovelCornerQuoteSpan[] = [];
  let m: RegExpExecArray | null;
  let index = 0;
  CORNER_QUOTE_PAIR_RE.lastIndex = 0;
  while ((m = CORNER_QUOTE_PAIR_RE.exec(md)) !== null) {
    const quoted_text = m[1]!.trim();
    if (!quoted_text) continue;
    const end = m.index + m[0].length;
    const lineRest = md.slice(end).split('\n')[0] ?? '';
    const after = lineRest.trim();
    spans.push({
      index: index++,
      start: m.index,
      end,
      quoted_text,
      ...(after ? { narration_after: after.slice(0, 120) } : {}),
    });
  }
  return spans;
}

/** 去掉成对「」保留对白；孤立开/闭引号亦移除，避免 TTS 朗读标点 */
export function stripCornerQuotesFromAudiobookSpeechText(text: string): string {
  const t = (text ?? '').trim();
  if (!t.includes(NOVEL_CORNER_QUOTE_OPEN) && !t.includes(NOVEL_CORNER_QUOTE_CLOSE)) return t;
  let out = t.replace(CORNER_QUOTE_PAIR_RE, '$1');
  out = out.split(NOVEL_CORNER_QUOTE_OPEN).join('');
  out = out.split(NOVEL_CORNER_QUOTE_CLOSE).join('');
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function normalizeAudiobookSegmentSpeechText(text: string): string {
  return stripCornerQuotesFromAudiobookSpeechText(text);
}
