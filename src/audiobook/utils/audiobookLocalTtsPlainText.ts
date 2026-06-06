/**
 * 本地 TTS（LongCat / MOSS / Nano）不识别 MiMo 语气标记与风格指令，提交前剥除演法标记。
 */

/** 句内演法 `[…]`、整体语气 `（…）` / `(...)` */
const INLINE_SQUARE_BRACKET_RE = /\[[^\[\]]*?\]/g;
const FULL_WIDTH_PAREN_RE = /（[^（）]*?）/gu;
const HALF_WIDTH_PAREN_RE = /\([^()]*?\)/g;
/** 行内或独立行的「风格指令：…」 */
const STYLE_INSTRUCTION_LINE_RE = /^\s*风格指令\s*[：:]\s*.*$/gmu;
const STYLE_INSTRUCTION_LEADING_RE = /^\s*风格指令\s*[：:]\s*[^\n]*/u;

function collapseSpeechWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 从有声书片段正文提取可供本地 TTS 朗读的纯文本（不合并 voice.tone）。
 */
export function stripAudiobookTextForLocalTts(text: string): string {
  let out = (text ?? '').trim();
  if (!out) return '';

  out = out.replace(STYLE_INSTRUCTION_LINE_RE, '');
  out = out.replace(STYLE_INSTRUCTION_LEADING_RE, '');
  out = out.replace(INLINE_SQUARE_BRACKET_RE, '');
  out = out.replace(FULL_WIDTH_PAREN_RE, '');
  out = out.replace(HALF_WIDTH_PAREN_RE, '');

  return collapseSpeechWhitespace(out);
}
