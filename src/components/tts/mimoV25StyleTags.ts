/**
 * MiMo V2.5 风格词与音频标签探测（文档：整体风格前缀、括号内标签、[标签]）
 */

/** 开头已有整体 `(风格)` / `（风格）` 或 `(唱歌)`，避免叠加（不含 text 内联 `[…]`） */
export function detectExistingLeadingStyleTags(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (/^\(\s*(唱歌|sing|singing)\s*\)/i.test(t)) return true;
  /** 半角括号整体风格：(xxx)后跟正文 — 不匹配未闭合括号 */
  if (/^\([^)]*\)\s*\S/.test(t)) return true;
  /** 全角开头（xxx）后跟正文（首段闭合） */
  if (/^（[^（）]{1,32}）\s*\S/u.test(t)) return true;
  return false;
}

export function detectBracketAudioTagsChinese(text: string): boolean {
  return /\[停顿\]|\[长停顿\]|\[急促\]|\[拖音\]|\[语速加快\]|\[语速放缓\]|\[轻声\]|\[低语\]|\[叹气\]|\[吸气\]|\[哽咽\]|\[强调\]|\[笑\]|\[爽朗大笑\]|\[欲言又止\]|\[碎碎念\]|\[沉默片刻\]/.test(
    text ?? '',
  );
}

export function detectSingIntent(tone?: string, emotion?: string, text?: string): boolean {
  const a = `${tone ?? ''} ${emotion ?? ''}`.toLowerCase();
  if (/唱歌|演唱|独唱|吟唱|童谣|山歌/.test(a)) return true;
  const t = (text ?? '').trim();
  return /^\(\s*(唱歌|sing|singing)\s*\)/i.test(t);
}

const DIALECT_WORDS_CN = ['东北话', '四川话', '河南话', '粤语', '台湾腔'] as const;

export function dialectTokenFromTone(tone?: string): string | undefined {
  const t = (tone ?? '').trim();
  if (!t) return undefined;
  for (const d of DIALECT_WORDS_CN) {
    if (t.includes(d)) return d;
  }
  return undefined;
}

/** 风格指令：一般 1 个关键词，最多 2 个（逗号/顿号分隔） */
export const MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS = 2;
export const MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS = 8;

export function parseMimoStyleKeywords(raw: string): string[] {
  return (raw ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 合成用整体风格指令：合并 tone+emotion，最多 2 个短关键词 */
export function normalizeMimoOverallStyleInstruction(tone?: string, emotion?: string): string {
  const words: string[] = [];
  for (const src of [tone ?? '', emotion ?? '']) {
    for (const part of parseMimoStyleKeywords(src)) {
      if (words.length >= MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS) break;
      const w = part.replace(/\s+/g, '').slice(0, MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS);
      if (w && !words.includes(w)) words.push(w);
    }
    if (words.length >= MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS) break;
  }
  return words.join('，');
}

/** 写入校验；通过返回 null */
export function validateMimoOverallStyleInstruction(tone?: string, emotion?: string): string | null {
  const merged: string[] = [];
  for (const p of [...parseMimoStyleKeywords(tone ?? ''), ...parseMimoStyleKeywords(emotion ?? '')]) {
    if (!merged.includes(p)) merged.push(p);
  }
  if (!merged.length) {
    return '风格指令 voice.tone 必填：一般 1 个关键词，最多 2 个并用逗号分隔（如「紧张」或「紧张,压低」）';
  }
  if (merged.length > MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS) {
    return `风格指令最多 ${MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS} 个关键词（当前 ${merged.length} 个）；请改为 1～2 个短关键词`;
  }
  for (const w of merged) {
    if (w.replace(/\s+/g, '').length > MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS) {
      return `风格指令关键词「${w}」过长，请改为 2～${MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS} 字短词`;
    }
  }
  return null;
}

export const MIMO_STYLE_INSTRUCTION_RULE_ZH =
  'voice.tone=风格指令：一般 1 个关键词（如「紧张」「温柔」），最多 2 个并用逗号分隔（如「紧张,压低」）；禁止长句。';

export const MIMO_INLINE_STYLE_TAG_RULE_ZH =
  'text 内每个 […] 句内演法标签：一般 1 个关键词，最多 2 个逗号分隔；**优先**语速/音量/呼吸/停顿类（如「快速」「轻声」「语速加快,碎碎念」「画外音」），**禁止**与 voice.tone 同义或重复（tone 合成时会自动拼 `[风格指令]` 前缀，句内勿再写相同态度词）。';

/** 写入/润色时须遵守：tone 与 text 内 […] 分层，禁止关键词重复 */
export const MIMO_STYLE_VS_INLINE_NO_OVERLAP_RULE_ZH =
  '**tone 与句内 […] 禁止重复（硬性）**：voice.tone 写本段整体态度/情绪（如「打圆场，温和」「审视，平淡」），合成时程序自动拼 `[tone]` 前缀；text 的 […] 只写**句内演法切换**（语速、音量、呼吸、画外音等），**不得**再写与 tone 相同或同义的词（反例：tone=`打圆场，温和` + text=`[圆场]…`；tone=`审视，平淡` + text=`[审视]…`）。正例：tone=`打圆场，温和`，text=`[快速]楚瑶，这是林小棠…[轻声]小棠，这是楚瑶…`。';

/** 两风格关键词是否语义重复（完全一致或互为子串，至少 2 字） */
export function mimoStyleKeywordsOverlap(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, '');
  const nb = b.replace(/\s+/g, '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/** tone + emotion 合并后的风格关键词（去重） */
export function mimoOverallStyleKeywordSet(tone?: string, emotion?: string): string[] {
  const words: string[] = [];
  for (const src of [tone ?? '', emotion ?? '']) {
    for (const part of parseMimoStyleKeywords(src)) {
      if (!words.some((w) => mimoStyleKeywordsOverlap(w, part))) words.push(part);
    }
  }
  return words;
}

/** 校验 text 句内 […] 是否与 tone/emotion 重复；通过返回 null */
export function validateMimoToneNotDuplicatedInInlineTags(
  tone?: string,
  emotion?: string,
  text?: string,
): string | null {
  const overall = mimoOverallStyleKeywordSet(tone, emotion);
  if (!overall.length || !(text ?? '').trim()) return null;
  const prefix = normalizeMimoOverallStyleInstruction(tone, emotion);
  for (const inner of extractMimoInlineBracketTagContents(text ?? '')) {
    for (const inlineKw of parseMimoStyleKeywords(inner)) {
      for (const overallKw of overall) {
        if (mimoStyleKeywordsOverlap(inlineKw, overallKw)) {
          return `句内 […] 标签「${inlineKw}」与风格指令「${overallKw}」重复（合成时会自动拼前缀 [${prefix}]）；整体态度只写在 voice.tone，句内 […] 请改用语速/音量/呼吸等演法词（如「快速」「轻声」「语速加快」），勿重复 tone 关键词。`;
        }
      }
    }
  }
  return null;
}

/** 单个 […] 内标签内容（与 voice.tone 同源：1～2 个短关键词） */
export function normalizeMimoInlineStyleTagContent(raw: string): string {
  return normalizeMimoOverallStyleInstruction(raw);
}

/** 写入校验；通过返回 null */
export function validateMimoInlineStyleTagContent(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return '句内 […] 标签内容不能为空';
  }
  const merged: string[] = [];
  for (const p of parseMimoStyleKeywords(trimmed)) {
    if (!merged.includes(p)) merged.push(p);
  }
  if (merged.length > MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS) {
    const preview = trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
    return `句内 […] 标签「${preview}」关键词过多：一般 1 个，最多 ${MIMO_STYLE_INSTRUCTION_MAX_KEYWORDS} 个逗号分隔（如「紧张」或「紧张,压低」）；禁止动作/神态长句`;
  }
  for (const w of merged) {
    if (w.replace(/\s+/g, '').length > MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS) {
      return `句内 […] 标签关键词「${w}」过长，请改为 2～${MIMO_STYLE_INSTRUCTION_MAX_KEYWORD_CHARS} 字短词`;
    }
  }
  return null;
}

const INLINE_BRACKET_TAG_RE = /\[[^\[\]]+?\]/g;

/** 提取 text 中所有 […] 内文（不含括号） */
export function extractMimoInlineBracketTagContents(text: string): string[] {
  return (text.match(INLINE_BRACKET_TAG_RE) ?? []).map((m) => m.slice(1, -1));
}

/** 校验 text 中全部句内 […] 标签；无标签时返回 null */
export function validateMimoInlineStyleTagsInText(text: string): string | null {
  const contents = extractMimoInlineBracketTagContents(text);
  for (const inner of contents) {
    const err = validateMimoInlineStyleTagContent(inner);
    if (err) return err;
  }
  return null;
}

/** 将 text 内每个 […] 规范为 1～2 个短关键词 */
export function normalizeMimoInlineStyleTagsInText(text: string): string {
  return text.replace(INLINE_BRACKET_TAG_RE, (match) => {
    const inner = match.slice(1, -1);
    const normalized = normalizeMimoInlineStyleTagContent(inner);
    return normalized ? `[${normalized}]` : match;
  });
}

/** voice.tone（+ 可选 emotion）→ 本段整体「风格指令」，合成时置于 text 最前为 […] */
export function buildOverallStyleInstruction(toneRaw?: string, emotionRaw?: string): string {
  return normalizeMimoOverallStyleInstruction(toneRaw, emotionRaw);
}

/** @deprecated 短词抽取；有声书请用 buildOverallStyleInstruction 全量拼接 */
export function keywordsForOverallStylePrefix(toneRaw?: string, emotionRaw?: string): string[] {
  const emotion = (emotionRaw ?? '').trim();
  const tone = (toneRaw ?? '').trim();
  const dialect = dialectTokenFromTone(tone) || dialectTokenFromTone(emotion);

  /** 已从 tone 抽到方言则不重复整串 tone（避免前缀过长）；否则保留简短 tone/emotion */
  const parts: string[] = [];
  if (emotion && (!dialect || !emotion.includes(dialect))) {
    /** 情绪化短词直接使用 */
    if (emotion.length <= 16) parts.push(emotion.replace(/\s+/g, ''));
  }
  if (dialect) {
    parts.push(dialect);
  } else if (tone.length && tone.length <= 16) {
    parts.push(tone.replace(/\s+/g, ''));
  }
  return [...new Set(parts.filter(Boolean))].slice(0, 4);
}

export function wrapOverallCnStyle(styles: string[], bodyNoSing: string, needsSingPrefix: boolean): string {
  const s = styles.filter(Boolean);
  const inner = s.length ? `(${s.join(' ')})` : '';
  const withStyle = s.length ? `${inner}${bodyNoSing.trim()}` : bodyNoSing.trim();
  if (needsSingPrefix) return `(唱歌)${withStyle}`;
  return withStyle.trim() ? withStyle.trim() : bodyNoSing.trim();
}

/** MiMo 中文：整体风格指令 `[…]` + 正文（正文内可含句级 `[…]` 标签） */
export function wrapOverallCnStyleBracket(
  styleInstruction: string,
  bodyNoSing: string,
  needsSingPrefix: boolean,
): string {
  const body = bodyNoSing.trim();
  const style = styleInstruction.trim();
  const core = style ? `[${style}]${body}` : body;
  if (needsSingPrefix) return `(唱歌)${core}`;
  return core;
}
