import type { ScreenwriterOutlinePanelPayload } from '@/novelDesign/utils/screenwriterOutlinePayload';

export interface ScreenwriterFavoriteOutline {
  id: string;
  /** AI JSON uuid */
  outlineUuid?: string | null;
  title: string;
  prose: string;
  /** 快照（旧收藏可能仅有 source/summary） */
  panel: {
    storyName?: string;
    source: string;
    summary: string;
  };
  /** 收藏时的完整助手原文（可选，便于再次展开） */
  fullContent?: string;
  /** 跟在正文之后的附言（原始抽卡需求、小说雏形），仅用于存档与回看 */
  favoriteAppendix?: string;
  sourceConversationKey?: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'yiman:novel-design:screenwriter-outline-favorites-v1';

function safeParse(raw: string | null): ScreenwriterFavoriteOutline[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x.id === 'string' && typeof x.prose === 'string');
  } catch {
    return [];
  }
}

export function loadScreenwriterOutlineFavorites(): ScreenwriterFavoriteOutline[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY)).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

function api() {
  return window.yiman?.novel?.outlineFavorites;
}

export function saveScreenwriterOutlineFavorites(items: ScreenwriterFavoriteOutline[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
  // 异步同步到 SQLite（fire-and-forget）
  const a = api();
  if (a) {
    for (const item of items) {
      a.insert({
        id: item.id,
        outlineUuid: item.outlineUuid ?? null,
        title: item.title,
        prose: item.prose,
        panelStoryName: item.panel?.storyName ?? null,
        panelSource: item.panel?.source ?? '',
        panelSummary: item.panel?.summary ?? '',
        fullContent: item.fullContent ?? null,
        favoriteAppendix: item.favoriteAppendix ?? null,
        sourceConversationKey: item.sourceConversationKey ?? null,
        createdAt: item.createdAt,
      }).catch(() => {});
    }
  }
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

export function removeScreenwriterOutlineFavorite(id: string): ScreenwriterFavoriteOutline[] {
  const next = loadScreenwriterOutlineFavorites().filter((item) => item.id !== id);
  saveScreenwriterOutlineFavorites(next);
  return next;
}

/** 大纲收藏附言（放在展示与存档最后） */
export function composeOutlineFavoriteAppendix(drawBrief: string, storySeedBlock: string): string {
  const parts: string[] = [];
  if (drawBrief.trim()) parts.push(`【原始抽卡需求】\n${drawBrief.trim()}`);
  if (storySeedBlock.trim()) parts.push(`【小说雏形】\n${storySeedBlock.trim()}`);
  return parts.join('\n\n').trimEnd();
}

export function searchScreenwriterOutlineFavorites(query: string): ScreenwriterFavoriteOutline[] {
  const q = normalizeText(query);
  const list = loadScreenwriterOutlineFavorites();
  if (!q) return list;
  return list.filter((item) => {
    const haystack = normalizeText(
      `${item.title}\n${item.panel.storyName ?? ''}\n${item.prose}\n${item.panel.source}\n${item.panel.summary}\n${item.favoriteAppendix ?? ''}`
    );
    return haystack.includes(q);
  });
}

export function removeFavoriteOutlineByOutlineUuid(outlineUuid: string): ScreenwriterFavoriteOutline[] {
  const u = outlineUuid.trim().toLowerCase();
  const next = loadScreenwriterOutlineFavorites().filter(
    (x) => !(x.outlineUuid && x.outlineUuid.toLowerCase() === u)
  );
  saveScreenwriterOutlineFavorites(next);
  return next;
}

export function getFavoriteOutlineByOutlineUuid(outlineUuid: string): ScreenwriterFavoriteOutline | undefined {
  const u = outlineUuid.trim().toLowerCase();
  return loadScreenwriterOutlineFavorites().find(
    (x) => x.outlineUuid && x.outlineUuid.toLowerCase() === u
  );
}

/** 有 outlineUuid：已收藏则移除；否则添加。无 uuid：仅追加一条（星标不双向绑定） */
export function toggleScreenwriterOutlineFavorite(input: {
  prose: string;
  panel: ScreenwriterOutlinePanelPayload;
  fullContent?: string;
  favoriteAppendix?: string;
  sourceConversationKey?: string | null;
}): { favorited: boolean } {
  const uid = input.panel.outlineUuid?.trim() ?? '';
  if (uid) {
    if (getFavoriteOutlineByOutlineUuid(uid)) {
      removeFavoriteOutlineByOutlineUuid(uid);
      return { favorited: false };
    }
    addScreenwriterOutlineFavorite({
      ...input,
      outlineUuid: uid,
    });
    return { favorited: true };
  }
  addScreenwriterOutlineFavorite(input);
  return { favorited: true };
}

export function addScreenwriterOutlineFavorite(input: {
  prose: string;
  panel: ScreenwriterOutlinePanelPayload;
  fullContent?: string;
  favoriteAppendix?: string;
  sourceConversationKey?: string | null;
  outlineUuid?: string | null;
}): ScreenwriterFavoriteOutline {
  const now = new Date().toISOString();
  const title =
    input.panel.storyName.replace(/\s+/g, ' ').trim().slice(0, 48) ||
    input.panel.summary.replace(/\s+/g, ' ').trim().slice(0, 48) ||
    input.prose.replace(/\s+/g, ' ').trim().slice(0, 24) ||
    '未命名大纲';
  const item: ScreenwriterFavoriteOutline = {
    id: `ofav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title,
    prose: input.prose,
    panel: {
      storyName: input.panel.storyName,
      source: input.panel.source,
      summary: input.panel.summary,
    },
    fullContent: input.fullContent,
    ...(input.outlineUuid?.trim() ? { outlineUuid: input.outlineUuid.trim() } : {}),
    ...(input.favoriteAppendix?.trim() ? { favoriteAppendix: input.favoriteAppendix.trim() } : {}),
    sourceConversationKey: input.sourceConversationKey ?? null,
    createdAt: now,
  };
  saveScreenwriterOutlineFavorites([item, ...loadScreenwriterOutlineFavorites()]);
  return item;
}
