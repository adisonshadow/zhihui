/**
 * next-suggestion-json 解析器：从 AI 对话答复中提取下一步操作建议。
 * 支持 ```next-suggestion-json``` 代码块，以及模型未加 fence 时裸露的 {"next_suggestions":[...]}（可带「下一步…：」标题）。
 */

export interface ParsedNextSuggestion {
  suggestions: string[];
  hasSuggestions: boolean;
  displayText: string;
  /** 已从正文中去掉建议块（fence 或裸露 JSON） */
  fenceRemoved: boolean;
}

const NEXT_SUGGESTION_FENCE_RE = /```next-suggestion-json\s*([\s\S]*?)```/gi;

/** 从 openIdx（指向 `{`）起匹配与之成对的 `}`，忽略字符串内的括号 */
function findMatchingObjectEnd(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseNextSuggestionsArray(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const arr = (parsed as Record<string, unknown>).next_suggestions;
      if (Array.isArray(arr)) {
        return arr
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((s) => s.length > 0 && s.length < 30);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * 去掉未加 fence、单独出现的 next_suggestions JSON 对象（及紧前一行「下一步…：」类标题）。
 */
function stripLooseNextSuggestionsObject(text: string): { text: string; suggestions: string[] } {
  const key = '"next_suggestions"';
  const idx = text.indexOf(key);
  if (idx < 0) return { text, suggestions: [] };
  const objStart = text.lastIndexOf('{', idx);
  if (objStart < 0) return { text, suggestions: [] };
  const objEnd = findMatchingObjectEnd(text, objStart);
  if (objEnd < 0) return { text, suggestions: [] };
  const jsonSlice = text.slice(objStart, objEnd + 1);
  const items = parseNextSuggestionsArray(jsonSlice);
  if (items.length === 0) return { text, suggestions: [] };

  let before = text.slice(0, objStart);
  const after = text.slice(objEnd + 1);
  before = before.replace(/(?:\n|^)\s*下一步[^\n]{0,48}?[：:]\s*$/u, '').trimEnd();
  before = before.replace(/\s+$/u, '');
  const gap = after.trim() && before.trim() ? '\n\n' : '';
  const merged = `${before}${gap}${after}`.replace(/^\n+/, '').replace(/\n+$/, '').trim();
  return { text: merged, suggestions: items };
}

/** 多次剥离，防止重复输出两段 JSON */
function stripAllLooseNextSuggestions(text: string): { text: string; suggestions: string[] } {
  const acc: string[] = [];
  let cur = text;
  for (let i = 0; i < 6; i++) {
    const { text: next, suggestions } = stripLooseNextSuggestionsObject(cur);
    if (suggestions.length === 0) break;
    acc.push(...suggestions);
    cur = next;
  }
  const seen = new Set<string>();
  const deduped = acc.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
  return { text: cur, suggestions: deduped };
}

export function extractNextSuggestions(raw: string): ParsedNextSuggestion {
  let suggestions: string[] = [];
  let fenceRemoved = false;

  let displayText = raw.replace(NEXT_SUGGESTION_FENCE_RE, (_all, jsonText: string) => {
    const arr = parseNextSuggestionsArray(jsonText);
    if (arr.length > 0) {
      suggestions = arr;
      fenceRemoved = true;
      return '';
    }
    return _all;
  });

  const loose = stripAllLooseNextSuggestions(displayText);
  if (loose.suggestions.length > 0) {
    if (suggestions.length === 0) {
      suggestions = loose.suggestions;
    } else {
      const seen = new Set(suggestions);
      for (const s of loose.suggestions) {
        if (!seen.has(s)) {
          suggestions.push(s);
          seen.add(s);
        }
      }
    }
    displayText = loose.text;
    fenceRemoved = true;
  }

  return {
    suggestions,
    hasSuggestions: suggestions.length > 0,
    displayText: displayText.trim(),
    fenceRemoved,
  };
}
