/** 解析抽卡页的 JSON 故事载荷与展示（用户气泡只发简短偏好，JSON 规范在系统侧） */

export type AssistantSegment = {
  type: 'text' | 'story';
  key: string;
  content: string;
};

/** 小说雏形结构化字段（供 A2UI 等结构化展示） */
export type StorySeedFields = {
  index: number;
  title: string;
  sellingPoint?: string;
  worldview?: string;
  characters?: string[];
  summary?: string;
  /** 与收藏/大纲一致的完整正文块 */
  fullContent: string;
  /** 模型须在 JSON 中输出的 UUID（RFC，小写canonical 存盘） */
  seedUuid?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const STORY_SEED_KIND = 'yiman_story_seed' as const;
const OUTLINE_KIND = 'yiman_screenwriter_outline' as const;

function escapeFenceForLineRegex(fence: string): string {
  return fence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 在「围栏开篇之后」的正文中，查找「独占一行」的闭合围栏行起始偏移；未找到则返回 -1 */
function findClosingFenceLineStart(afterOpen: string, fence: string): number {
  const onlyFenceLine = new RegExp(`^\\s*${escapeFenceForLineRegex(fence)}\\s*$`);
  let ls = 0;
  while (ls < afterOpen.length) {
    const nlIdx = afterOpen.indexOf('\n', ls);
    const lineSegment = nlIdx === -1 ? afterOpen.slice(ls) : afterOpen.slice(ls, nlIdx).replace(/\r$/, '');
    if (onlyFenceLine.test(lineSegment)) return ls;
    if (nlIdx === -1) break;
    ls = nlIdx + 1;
  }
  return -1;
}

/** 从 lineStartAbs 起跳过整行（含行尾 `\n`，若有） */
function advancePastFullLineStartingAt(text: string, lineStartAbs: number): number {
  const nl = text.indexOf('\n', lineStartAbs);
  return nl === -1 ? text.length : nl + 1;
}

/**
 * 已闭合 ``` / ~~~ 围栏。
 * **勿**再用「在非字符串上下文里非贪婪匹配到首个 `\1`」：JSON 字符串里如出现 ```（常见），会误判为围栏结束，
 * JSON.parse 整段失败，表现为「本应 N 条只渲染 N−1 条」。
 *
 * **闭合**：与常见 Markdown 一致——独占一行、与开篇同宽的 ``` / ~~~（行前可空格）。
 *
 * **开篇**：行首或非行首 `\n`/文本开头，`json`/`{` 可同一行相接（流式）。
 */
function splitClosedMarkdownFences(full: string): { closedInners: string[]; remainder: string } {
  const closedInners: string[] = [];
  const t = full;
  let scan = 0;
  const OPEN = /(^|\r?\n)(\s*)(```|~~~)(?:json)?[ \t]*(?:\r?\n|(?=\{)|$)/gim;

  while (scan < t.length) {
    OPEN.lastIndex = scan;
    const om = OPEN.exec(t);
    if (!om) break;

    const openHeadAbs = om.index;
    const innerStartAbs = om.index + om[0].length;
    const fence = om[3] as string;

    const afterOpen = t.slice(innerStartAbs);
    const closeLineStartRel = findClosingFenceLineStart(afterOpen, fence);
    if (closeLineStartRel < 0) {
      return { closedInners, remainder: t.slice(openHeadAbs) };
    }

    closedInners.push(afterOpen.slice(0, closeLineStartRel).trim());
    scan = innerStartAbs + advancePastFullLineStartingAt(afterOpen, closeLineStartRel);
  }

  return { closedInners, remainder: t.slice(scan) };
}

/**
 * 去掉助手回复里「整段」已闭合的 Markdown 代码围栏（留白与换行保留），便于取围栏外 prose（会话标题推导等）。
 * 与 {@link splitClosedMarkdownFences} 同行首独占 ``` / ~~~ 的规则，JSON 正文内 ``` 不误截围栏。
 *
 * **未闭合**围栏：从其开篇起保留后半段并入结果。
 */
export function stripMarkdownCodeFenceRegions(full: string): string {
  const chunks: string[] = [];
  let scan = 0;
  const t = full;
  const OPEN = /(^|\r?\n)(\s*)(```|~~~)(?:json)?[ \t]*(?:\r?\n|(?=\{)|$)/gim;

  while (scan < t.length) {
    OPEN.lastIndex = scan;
    const om = OPEN.exec(t);
    if (!om) {
      chunks.push(t.slice(scan));
      break;
    }

    chunks.push(t.slice(scan, om.index));

    const innerStartAbs = om.index + om[0].length;
    const fence = om[3] as string;
    const afterOpen = t.slice(innerStartAbs);
    const closeLineStartRel = findClosingFenceLineStart(afterOpen, fence);
    if (closeLineStartRel < 0) {
      chunks.push('\n');
      chunks.push(afterOpen);
      break;
    }

    chunks.push('\n');
    scan = innerStartAbs + advancePastFullLineStartingAt(afterOpen, closeLineStartRel);
  }

  return chunks.join('');
}

/**
 * ```json 后起算的内部 JSON（不要求 ``` 与 `{` 之间必须有换行，便于 SSE 半截也能解析）。
 */
function extractJsonInsideOpenMarkdownFenceTrimmed(t: string): string | null {
  const idx = t.search(/```(?:json)?\s*/i);
  if (idx < 0) return null;
  const tail = t.slice(idx);
  const hm = tail.match(/^```(?:json)?\s*/i);
  if (!hm) return null;
  let inner = tail.slice(hm[0].length).trim();
  if (/```\s*$/.test(inner)) {
    inner = inner.slice(0, inner.lastIndexOf('```')).trim();
  }
  if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  return null;
}

/** 将根 JSON 展开为故事对象列表（略过大纲 / 支持旧式 stories 数组与单块 kind） */
function expandRootToStoryRecords(obj: unknown): Record<string, unknown>[] {
  if (obj == null) return [];
  if (Array.isArray(obj)) {
    return obj.filter(isRecord);
  }
  if (!isRecord(obj)) return [];
  if (obj.kind === OUTLINE_KIND) return [];
  if (obj.kind === STORY_SEED_KIND) return [obj];
  if (Array.isArray(obj.stories)) {
    return obj.stories.filter(isRecord);
  }
  if (typeof obj.index === 'number' && typeof obj.title === 'string') {
    return [obj];
  }
  return [];
}

/** 未闭合围栏内：旧式 stories 数组增量 或 已平衡的单对象（新式单块雏形） */
function storyRecordsFromOpenFencePartial(open: string): Record<string, unknown>[] {
  const t = open.trim();
  if (!t) return [];
  if (/"stories"\s*:\s*\[/m.test(t)) {
    const inc = tryParseStoryRecordsFromIncompleteJson(t);
    if (inc.length > 0) return inc;
  }
  const ij = t.indexOf('{');
  if (ij < 0) return [];
  const bal = extractBalancedObjectAt(t, ij);
  if (!bal) return [];
  try {
    return expandRootToStoryRecords(JSON.parse(bal));
  } catch {
    return [];
  }
}

function extractBareJsonCandidate(t: string): string | null {
  const s = t.trim();
  if (s.startsWith('{') || s.startsWith('[')) return s;
  return extractFirstBalancedObject(s);
}

/**
 * 从助手全文收集小说雏形记录：多块已闭合围栏、末尾未闭合围栏、无外围栏裸 JSON。
 */
function collectRawStoryRecords(content: string): Record<string, unknown>[] {
  const t = content.trim();
  const { closedInners, remainder } = splitClosedMarkdownFences(t);
  const records: Record<string, unknown>[] = [];

  for (const inner of closedInners) {
    if (!inner) continue;
    try {
      records.push(...expandRootToStoryRecords(JSON.parse(inner) as unknown));
    } catch {
      /* 流式中块可能暂不合法 */
    }
  }

  const open = extractJsonInsideOpenMarkdownFenceTrimmed(remainder);
  if (open) {
    records.push(...storyRecordsFromOpenFencePartial(open));
  }

  if (records.length > 0) return records;

  const bare = extractBareJsonCandidate(t);
  if (bare) {
    try {
      return expandRootToStoryRecords(JSON.parse(bare) as unknown);
    } catch {
      /* 保留 legacy 【小说雏形】回溯 */
    }
  }
  return [];
}

/** 从模型回复中提取「当前」可供增量解析的一段 JSON（优先末尾未闭合围栏，否则最后一次闭合块，否则裸括号对象） */
export function extractJsonCandidateString(content: string): string | null {
  const t = content.trim();
  const { closedInners, remainder } = splitClosedMarkdownFences(t);
  const open = extractJsonInsideOpenMarkdownFenceTrimmed(remainder);
  if (open) return open;
  if (closedInners.length > 0) return closedInners[closedInners.length - 1] ?? null;
  return extractBareJsonCandidate(t);
}

/** 括号平衡提取第一个 `{` … `}` 子串（考虑字符串内的引号与转义） */
function extractFirstBalancedObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** 从 `start` 处的 `{` 起提取平衡闭合对象（用于流式 JSON 中逐项解析 stories） */
function extractBalancedObjectAt(s: string, start: number): string | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** 未完成整段 JSON 时，从 `"stories":[` 或根数组 `[` 已闭合的故事对象逐项解析（流式渐进展示用） */
export function tryParseStoryRecordsFromIncompleteJson(candidate: string): Record<string, unknown>[] {
  const s = candidate.trim();
  if (!s) return [];

  let arrayBody: string | null = null;

  const storiesKw = /"stories"\s*:\s*\[/m.exec(s);
  if (storiesKw) {
    arrayBody = s.slice(storiesKw.index + storiesKw[0].length - 1);
  } else if (s.startsWith('[')) {
    arrayBody = s;
  }

  if (!arrayBody || arrayBody[0] !== '[') return [];

  let i = 1;
  const out: Record<string, unknown>[] = [];
  while (i < arrayBody.length) {
    const c = arrayBody[i];
    if (c === ']' || c === ',') {
      i += 1;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i += 1;
      continue;
    }
    if (c !== '{') {
      i += 1;
      continue;
    }
    const objStr = extractBalancedObjectAt(arrayBody, i);
    if (!objStr) break;
    try {
      const obj = JSON.parse(objStr) as unknown;
      if (isRecord(obj)) out.push(obj);
    } catch {
      break;
    }
    i += objStr.length;
  }

  return out;
}

/** 能对齐则格式化；流式未完成时可能返回 null，则展示原始片段 */
export function prettifyJsonIfPossible(snippet: string): string | null {
  const t = snippet.trim();
  if (!t) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    const balanced = extractFirstBalancedObject(t);
    if (!balanced) return null;
    try {
      return JSON.stringify(JSON.parse(balanced), null, 2);
    } catch {
      return null;
    }
  }
}

/** 流式/多段：每一段围栏或末尾未闭合围栏尽量排版，用于等宽备选展示 */
export function prettifyAssistantJsonFenceDump(raw: string): string {
  const t = raw.trim();
  const { closedInners, remainder } = splitClosedMarkdownFences(t);
  const open = extractJsonInsideOpenMarkdownFenceTrimmed(remainder);
  const chunks: string[] = [];
  for (const inner of closedInners) {
    chunks.push(prettifyJsonIfPossible(inner) ?? inner);
  }
  if (open) {
    chunks.push(prettifyJsonIfPossible(open) ?? open.trim());
  }
  if (chunks.length > 0) return chunks.join('\n\n---\n\n');
  const one = extractJsonCandidateString(t) ?? t;
  return prettifyJsonIfPossible(one.trim()) ?? one;
}

/** 松散 UUID（接受 v4 及兼容形态，避免误判非 UUID 字符串 id） */
const STORY_SEED_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalUuidOrUndefined(v: string): string | undefined {
  const t = v.trim();
  if (!t || !STORY_SEED_UUID.test(t)) return undefined;
  return t.toLowerCase();
}

/** 每条 JSON 雏形 story 记录的 uuid（仅接受规范 UUID；兼容误填在 id） */
export function parseStorySeedUuidFromRecord(story: Record<string, unknown>): string | undefined {
  return (
    canonicalUuidOrUndefined(asText(story.uuid)) ??
    canonicalUuidOrUndefined(asText(story.UUID)) ??
    (typeof story.id === 'string' ? canonicalUuidOrUndefined(story.id) : undefined)
  );
}

function formatStoryFromJson(story: Record<string, unknown>, fallbackIndex: number): string {
  const index = Number(story.index) || fallbackIndex + 1;
  const title = asText(story.title) || '未命名故事';
  const sellingPoint = asText(story.sellingPoint) || asText(story.selling_point);
  const worldview = asText(story.worldview) || asText(story.worldView);
  const summary = asText(story.summary);
  const characters = Array.isArray(story.characters)
    ? story.characters.map((x) => asText(x)).filter(Boolean)
    : [];

  return [
    `【小说雏形 ${index}】`,
    `1. 故事/小说标题：${title}`,
    sellingPoint ? `2. 一句话卖点：${sellingPoint}` : '',
    worldview ? `3. 世界观简述：${worldview}` : '',
    characters.length > 0 ? `4. 主要角色：\n${characters.map((x) => `   - ${x}`).join('\n')}` : '',
    summary ? `5. 故事概要：${summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function jsonStoryToFields(story: Record<string, unknown>, fallbackIndex: number): StorySeedFields {
  const index = Number(story.index) || fallbackIndex + 1;
  const title = asText(story.title) || '未命名故事';
  const sellingPoint = asText(story.sellingPoint) || asText(story.selling_point) || undefined;
  const worldview = asText(story.worldview) || asText(story.worldView) || undefined;
  const summary = asText(story.summary) || undefined;
  const characters = Array.isArray(story.characters)
    ? story.characters.map((x) => asText(x)).filter(Boolean)
    : undefined;
  const seedUuid = parseStorySeedUuidFromRecord(story);
  const fullContent = formatStoryFromJson(story, fallbackIndex);
  return {
    index,
    title,
    sellingPoint,
    worldview,
    characters,
    summary,
    seedUuid,
    fullContent,
  };
}

function splitJsonStorySegments(content: string): AssistantSegment[] {
  const rows = collectRawStoryRecords(content);
  if (!rows.length) return [];
  return rows
    .map((story, idx) => ({
      type: 'story' as const,
      key: `json_story_${Number(story.index) || idx + 1}`,
      content: formatStoryFromJson(story, idx),
    }))
    .filter((seg) => seg.content.trim());
}

function splitLegacyHeaderStorySegments(content: string): AssistantSegment[] {
  const re = /(?:^|\n)\s*(?:#{1,6}\s*)?【小说雏形\s*\d+】/g;
  const matches = Array.from(content.matchAll(re));
  if (matches.length === 0) return [];

  const segments: AssistantSegment[] = [];
  let cursor = 0;
  matches.forEach((match, idx) => {
    const rawStart = match.index ?? 0;
    const start = content[rawStart] === '\n' ? rawStart + 1 : rawStart;
    if (start > cursor) {
      const text = content.slice(cursor, start).trim();
      if (text) segments.push({ type: 'text', key: `text_${idx}`, content: text });
    }
    const nextRawStart = matches[idx + 1]?.index;
    const end = nextRawStart == null ? content.length : nextRawStart;
    const story = content.slice(start, end).trim();
    if (story) segments.push({ type: 'story', key: `story_${idx}`, content: story });
    cursor = end;
  });
  return segments;
}

/** 解析 `formatStoryFromJson` 样式的纯文本故事块（非 JSON 流程） */
function parseFormattedStoryBlock(raw: string, orderIdx: number): StorySeedFields | null {
  const t = raw.trim();
  if (!t) return null;
  const idxMatch = t.match(/【小说雏形\s*(\d+)】/);
  const index = idxMatch ? Number(idxMatch[1]) : orderIdx + 1;

  const title = t.match(/1\.\s*故事\/小说标题：\s*(.+)/)?.[1]?.trim() || '未命名故事';
  const sellingMatch = t.match(/2\.\s*一句话卖点：\s*([\s\S]*?)(?=\n\d+\.|$)/);
  const sellingPoint = sellingMatch?.[1]?.trim() || undefined;

  const worldviewMatch = t.match(/3\.\s*世界观简述：\s*([\s\S]*?)(?=\n\d+\.|$)/);
  const worldview = worldviewMatch?.[1]?.trim() || undefined;

  const charBlockMatch = t.match(/4\.\s*主要角色：\s*([\s\S]*?)(?=\n\d+\.|$)/);
  let characters: string[] | undefined;
  if (charBlockMatch?.[1]) {
    characters = charBlockMatch[1]
      .split('\n')
      .map((x) => x.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }

  const summaryMatch = t.match(/5\.\s*故事概要：\s*([\s\S]*)$/);
  const summary = summaryMatch?.[1]?.trim() || undefined;

  const fullContent = raw.trim();
  return {
    index,
    title,
    sellingPoint,
    worldview,
    characters,
    summary,
    fullContent,
  };
}

/** 根据助手回复正文解析结构化小说雏形（优先多块 JSON），用于 A2UI 等 */
export function parseStorySeedFields(content: string): StorySeedFields[] {
  const raw = collectRawStoryRecords(content);
  if (raw.length > 0) {
    return raw
      .map((story, idx) => jsonStoryToFields(story, idx))
      .filter((f) => f.fullContent.trim());
  }

  const legacy = splitLegacyHeaderStorySegments(content)
    .filter((seg) => seg.type === 'story')
    .map((seg, idx) => parseFormattedStoryBlock(seg.content, idx));
  return legacy.filter(Boolean) as StorySeedFields[];
}

/** 流式 SSE：多块闭合 + 末块未闭合时与终局一致；半截 stories 数组仍渐进拆条（见 collectRawStoryRecords） */
export function parseStorySeedFieldsStreaming(content: string): StorySeedFields[] {
  return parseStorySeedFields(content);
}

export function splitStorySegments(content: string): AssistantSegment[] {
  const jsonSegments = splitJsonStorySegments(content);
  if (jsonSegments.length > 0) return jsonSegments;
  return splitLegacyHeaderStorySegments(content);
}

export function looksLikeJsonStoryOutput(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/```(?:json)?/i.test(t) || /~~~(?:json)?/i.test(t)) return true;
  if (/"kind"\s*:\s*"yiman_story_seed"/.test(t)) return true;
  if (/"stories"\s*:/.test(t) && t.includes('{')) return true;
  if (t.startsWith('{')) return true;
  return false;
}
