import { parseStorySeedUuidFromRecord } from '@/novelDesign/utils/screenwriterStoryPayload';

/** 故事大纲末尾 JSON 契约解析（与抽卡小说雏形 JSON 区分：以 kind 标识） */

export const SCREENWRITER_OUTLINE_PANEL_KIND = 'yiman_screenwriter_outline' as const;

export type ScreenwriterOutlinePanelPayload = {
  kind: typeof SCREENWRITER_OUTLINE_PANEL_KIND;
  /** 故事/小说题名，创建项目默认值 */
  storyName: string;
  /** 大纲来源说明（如：某小说雏形 / 用户指定方向） */
  source: string;
  /** 大纲一句话简介，供列表展示 */
  summary: string;
  /** 模型输出的唯一 UUID（收藏 / 红心状态） */
  outlineUuid?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

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

function normalizePanel(obj: Record<string, unknown>): ScreenwriterOutlinePanelPayload | null {
  if (obj.kind !== SCREENWRITER_OUTLINE_PANEL_KIND) return null;
  const storyNameRaw =
    (typeof obj.storyName === 'string' ? obj.storyName.trim() : '') ||
    (typeof obj.storyTitle === 'string' ? obj.storyTitle.trim() : '') ||
    (typeof obj.novelTitle === 'string' ? obj.novelTitle.trim() : '') ||
    (typeof obj.title === 'string' ? obj.title.trim() : '') ||
    (typeof obj.name === 'string' ? obj.name.trim() : '');
  const source = typeof obj.source === 'string' ? obj.source.trim() : '';
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const sourceQuotedName =
    source.match(/《([^》]{1,80})》/)?.[1]?.trim() ||
    source.match(/「([^」]{1,80})」/)?.[1]?.trim() ||
    '';
  /* 兼容旧 JSON：只从标题字段或来源书名推断，不再拿简介截断冒充书名。 */
  const storyName = storyNameRaw || sourceQuotedName;
  if (!source && !summary && !storyName) return null;
  const outlineUuid = parseStorySeedUuidFromRecord(obj);
  return {
    kind: SCREENWRITER_OUTLINE_PANEL_KIND,
    storyName,
    source,
    summary,
    ...(outlineUuid ? { outlineUuid } : {}),
  };
}

/**
 * 从助手全文提取「最后一个」合法的大纲 JSON 围栏块（避免与仅含 stories 的 JSON 混淆）。
 * 成功时返回正文（不含该 JSON 块）与面板载荷。
 */
export function parseScreenwriterOutlineFromAssistant(content: string): {
  prose: string;
  panel: ScreenwriterOutlinePanelPayload;
} | null {
  const t = content;
  const re = /(```|~~~)(?:json)?\s*([\s\S]*?)\1/gi;
  let m: RegExpExecArray | null;
  let best: { start: number; end: number; panel: ScreenwriterOutlinePanelPayload } | null = null;
  while ((m = re.exec(t)) !== null) {
    const inner = m[2]?.trim() ?? '';
    if (!inner) continue;
    try {
      const raw = JSON.parse(inner) as unknown;
      if (!isRecord(raw)) continue;
      const panel = normalizePanel(raw);
      if (panel) {
        best = { start: m.index, end: m.index + m[0].length, panel };
      }
    } catch {
      /* 流式未完成 */
    }
  }
  if (!best) {
    const kindIndex = t.lastIndexOf(SCREENWRITER_OUTLINE_PANEL_KIND);
    const objectStart = kindIndex >= 0 ? t.lastIndexOf('{', kindIndex) : -1;
    const objectText = objectStart >= 0 ? extractBalancedObjectAt(t, objectStart) : null;
    if (objectText) {
      try {
        const raw = JSON.parse(objectText) as unknown;
        if (isRecord(raw)) {
          const panel = normalizePanel(raw);
          if (panel) {
            const fenceStart = Math.max(t.lastIndexOf('```', objectStart), t.lastIndexOf('~~~', objectStart));
            best = {
              start: fenceStart >= 0 ? fenceStart : objectStart,
              end: objectStart + objectText.length,
              panel,
            };
          }
        }
      } catch {
        /* not a valid outline object */
      }
    }
  }
  if (!best) return null;
  const prose = `${t.slice(0, best.start).trimEnd()}\n${t.slice(best.end).trim()}`.trim();
  return { prose: prose || t.slice(0, best.start).trim(), panel: best.panel };
}

/** 流式阶段：判断是否可能正在输出大纲末尾 JSON（用于占位，避免误判为其它 JSON） */
export function looksLikeOutlineJsonStreaming(content: string): boolean {
  const tail = content.slice(Math.max(0, content.length - 4000));
  if (/(?:```|~~~)(?:json)?/i.test(tail) && /yiman_screenwriter_outline/.test(content)) return true;
  return false;
}

/** 流式阶段：截断最后一个 ```json 围栏起点之前，作为正文预览 */
export function proseBeforeLastJsonFenceOpening(content: string): string {
  const lower = content.toLowerCase();
  let cut = lower.lastIndexOf('\n```json');
  if (cut < 0) cut = lower.lastIndexOf('\n~~~json');
  if (cut < 0) cut = lower.indexOf('```json');
  if (cut < 0) cut = lower.indexOf('~~~json');
  if (cut < 0) return content.trim();
  return content.slice(0, cut).trim();
}
