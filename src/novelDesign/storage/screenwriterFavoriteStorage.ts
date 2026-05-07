export interface ScreenwriterFavoriteStory {
  id: string;
  /** 模型在小说雏形 JSON 中输出的 UUID，收藏去重 / 红心状态以此为准 */
  seedUuid?: string | null;
  title: string;
  content: string;
  sourceConversationKey?: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'yiman:novel-design:screenwriter-favorites-v1';

function safeParse(raw: string | null): ScreenwriterFavoriteStory[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x) => x && typeof x.id === 'string' && typeof x.content === 'string'
    );
  } catch {
    return [];
  }
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

export function extractFavoriteTitle(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine =
    lines.find((line) => /故事\/小说标题|小说标题|故事标题|标题/.test(line)) ??
    lines.find((line) => !/^【小说雏形\s*\d+】$/.test(line)) ??
    '';
  const cleaned = titleLine
    .replace(/^#+\s*/, '')
    .replace(/^\d+[.、]\s*/, '')
    .replace(/^故事\/小说标题[:：]\s*/, '')
    .replace(/^小说标题[:：]\s*/, '')
    .replace(/^故事标题[:：]\s*/, '')
    .replace(/^标题[:：]\s*/, '')
    .trim();
  return cleaned || content.replace(/\s+/g, ' ').trim().slice(0, 24) || '未命名雏形';
}

export function loadScreenwriterFavorites(): ScreenwriterFavoriteStory[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY)).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export function saveScreenwriterFavorites(items: ScreenwriterFavoriteStory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

/** 从收藏正文中剥离末尾「原始抽卡需求」段，便于「生成大纲」等仅用雏形正文 */
export function stripTrailingDrawBriefAppendix(content: string): string {
  const sep = '\n\n【原始抽卡需求】';
  const ix = content.indexOf(sep);
  return ix >= 0 ? content.slice(0, ix).trimEnd() : content.trimEnd();
}

/** 雏形正文后跟「原始抽卡需求」（放在最后），用于收藏存档 */
export function composeStoryFavoriteContent(storyBody: string, rawDrawBrief?: string | null): string {
  const base = storyBody.trimEnd();
  const brief = rawDrawBrief?.trim();
  if (!brief) return base;
  return `${base}\n\n【原始抽卡需求】\n${brief}`;
}

export function getFavoriteStoryBySeedUuid(seedUuid: string): ScreenwriterFavoriteStory | undefined {
  const u = seedUuid.trim().toLowerCase();
  return loadScreenwriterFavorites().find((x) => x.seedUuid && x.seedUuid.toLowerCase() === u);
}

export function removeFavoriteBySeedUuid(seedUuid: string): ScreenwriterFavoriteStory[] {
  const u = seedUuid.trim().toLowerCase();
  const next = loadScreenwriterFavorites().filter(
    (x) => !(x.seedUuid && x.seedUuid.toLowerCase() === u)
  );
  saveScreenwriterFavorites(next);
  return next;
}

/** 有 seedUuid：已收藏则取消并返回 favorited:false；否则添加。无 seedUuid：仅追加一条（不进行星标双向绑定） */
export function toggleStorySeedFavorite(input: {
  seedUuid?: string | null;
  storyBodyContent: string;
  sourceConversationKey?: string | null;
  rawDrawBrief?: string | null;
}): { favorited: boolean; item?: ScreenwriterFavoriteStory } {
  const seedUuid = input.seedUuid?.trim() ?? '';
  const storedBody = composeStoryFavoriteContent(input.storyBodyContent, input.rawDrawBrief ?? undefined);

  if (seedUuid) {
    const existing = getFavoriteStoryBySeedUuid(seedUuid);
    if (existing) {
      removeFavoriteBySeedUuid(seedUuid);
      return { favorited: false };
    }
    const now = new Date().toISOString();
    const item: ScreenwriterFavoriteStory = {
      id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      seedUuid,
      title: extractFavoriteTitle(input.storyBodyContent),
      content: storedBody,
      sourceConversationKey: input.sourceConversationKey ?? null,
      createdAt: now,
    };
    saveScreenwriterFavorites([item, ...loadScreenwriterFavorites()]);
    return { favorited: true, item };
  }

  const item = addScreenwriterFavorite({
    titleSourceBody: input.storyBodyContent,
    content: storedBody,
    sourceConversationKey: input.sourceConversationKey,
  });
  return { favorited: true, item };
}

export function addScreenwriterFavorite(input: {
  content: string;
  /** 未传时使用 content 参与标题推导 */
  titleSourceBody?: string;
  sourceConversationKey?: string | null;
  seedUuid?: string | null;
}): ScreenwriterFavoriteStory {
  const now = new Date().toISOString();
  const titleBase = input.titleSourceBody ?? input.content;
  const item: ScreenwriterFavoriteStory = {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ...(input.seedUuid?.trim() ? { seedUuid: input.seedUuid.trim() } : {}),
    title: extractFavoriteTitle(titleBase),
    content: input.content,
    sourceConversationKey: input.sourceConversationKey ?? null,
    createdAt: now,
  };
  saveScreenwriterFavorites([item, ...loadScreenwriterFavorites()]);
  return item;
}

export function removeScreenwriterFavorite(id: string): ScreenwriterFavoriteStory[] {
  const next = loadScreenwriterFavorites().filter((item) => item.id !== id);
  saveScreenwriterFavorites(next);
  return next;
}

export function searchScreenwriterFavorites(query: string): ScreenwriterFavoriteStory[] {
  const q = normalizeText(query);
  const list = loadScreenwriterFavorites();
  if (!q) return list;
  return list.filter((item) => {
    const haystack = normalizeText(`${item.title}\n${item.content}`);
    return haystack.includes(q);
  });
}
