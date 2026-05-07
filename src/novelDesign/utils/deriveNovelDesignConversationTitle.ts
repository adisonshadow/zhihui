import { isToolCardContent } from '@/components/AIChat/utils/toolCardMarkers';
import { parseScreenwriterOutlineFromAssistant } from '@/novelDesign/utils/screenwriterOutlinePayload';
import {
  parseStorySeedFields,
  stripMarkdownCodeFenceRegions,
} from '@/novelDesign/utils/screenwriterStoryPayload';

function normalizeHeadingLine(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t.slice(0, 56) : null;
}

/** 在非围栏正文中查找首个 # / ## 标题行 */
export function extractFirstMarkdownH1OrH2(full: string): string | null {
  const prose = stripMarkdownCodeFenceRegions(full);
  const m = prose.match(/^#{1,2}\s+([^\r\n]+)/m);
  if (!m?.[1]) return null;
  return normalizeHeadingLine(
    m[1].replace(/^#+\s*/, '').replace(/^表：\s*/, '').trim()
  );
}

/** A2UI 卡片：雏形取首卡 title；大纲面板取 storyName */
export function deriveTitleFromStructuredAssistantContent(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const seeds = parseStorySeedFields(t);
    if (seeds.length > 0 && seeds[0]?.title?.trim()) {
      return normalizeHeadingLine(seeds[0].title);
    }
  } catch {
    /* ignore */
  }
  try {
    const outline = parseScreenwriterOutlineFromAssistant(t);
    if (outline?.panel?.storyName?.trim()) return normalizeHeadingLine(outline.panel.storyName);
  } catch {
    /* ignore */
  }
  return null;
}

/** 围栏外纯文本截取约 30 字（中英混排不按字素切分） */
export function excerptPlainTextRough30(full: string): string | null {
  const prose = stripMarkdownCodeFenceRegions(full);
  const plain = prose
    .replace(/^#{1,6}\s+.+$/gm, '')
    .replace(/^\|.+\|$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return null;
  return plain.slice(0, 30);
}

/**
 * 编剧抽卡侧边栏会话标题：结构化(JSON 雏形 title / 大纲 storyName) → Markdown H1/H2 → 围栏外正文前约 30 字
 *
 * （抽卡回复多以代码围栏包住 JSON：须先结构化取 title，再给 Markdown/摘要；围栏剥离必须与 JSON 解析同规则。）
 *
 * @param stored 已由 AIChatCore 持久化过滤（无 loading）、role+content
 */
export function deriveNovelDesignConversationTitle(
  stored: Array<{ role: string; content: string }>
): string | null {
  let assistantPayload = '';
  for (let i = stored.length - 1; i >= 0; i--) {
    const row = stored[i];
    if (row.role !== 'assistant') continue;
    const c = row.content ?? '';
    if (!c.trim()) continue;
    if (isToolCardContent(c)) continue;
    assistantPayload = c;
    break;
  }
  if (!assistantPayload.trim()) return null;

  const cardTitle = deriveTitleFromStructuredAssistantContent(assistantPayload);
  if (cardTitle) return cardTitle;

  const heading = extractFirstMarkdownH1OrH2(assistantPayload);
  if (heading) return heading;

  return excerptPlainTextRough30(assistantPayload);
}
