/**
 * 小说编写工作台：章节 + 故事大纲（置顶）本地持久化。
 * 键：小说 id（与 novelListStorage 一致，如 novel_*）
 */
import { loadNovelList } from '@/novelDesign/storage/novelListStorage';
export const NOVEL_OUTLINE_EPISODE_ID = '__story_outline__';

export interface NovelEpisode {
  id: string;
  /** 编辑器内与正文语境下的标题（**不含**「1、」等序号前缀）；故事大纲固定为「故事大纲」且不可改名 */
  title: string;
  /**
   * 正文集在人类顺序中的序号，从 1 递增（与侧边栏「n、标题」中的 n 一致）。
   * 故事大纲无章序号，可为 undefined。
   */
  episode?: number;
  contentMarkdown: string;
  order: number;
  updatedAt: string;
}

export interface NovelWorkspaceSnapshot {
  novelId: string;
  title: string;
  /** 从抽卡创建时关联的 Electron 漫剧项目 id（可选） */
  electronProjectId?: string | null;
  episodes: NovelEpisode[];
  activeEpisodeId: string;
  /** 外部写入（如 AI）后用于强制刷新 Milkdown */
  remountVersionByEpisode: Record<string, number>;
  updatedAt: string;
}

const STORAGE_KEY = 'yiman:novel-design:workspace-v2';

function safeParse(raw: string | null): Record<string, NovelWorkspaceSnapshot> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, NovelWorkspaceSnapshot>) : {};
  } catch {
    return {};
  }
}

function loadAll(): Record<string, NovelWorkspaceSnapshot> {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, NovelWorkspaceSnapshot>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function stripNumericTitlePrefix(title: string): string {
  return title.trim().replace(/^\d+[、.．:：]\s*/, '').trim() || title.trim();
}

/** 迁移旧数据：大纲标题锁定；正文标题去掉可选的「n、」前缀 */
export function migrateNovelWorkspaceEpisodeTitles(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  let changed = false;
  const episodes = snapshot.episodes.map((e) => {
    if (e.id === NOVEL_OUTLINE_EPISODE_ID) {
      if (e.title !== '故事大纲') {
        changed = true;
        return { ...e, title: '故事大纲' };
      }
      return e;
    }
    const nextTitle = stripNumericTitlePrefix(e.title);
    if (nextTitle !== e.title) {
      changed = true;
      return { ...e, title: nextTitle || e.title };
    }
    return e;
  });
  return changed ? { ...snapshot, episodes, updatedAt: nowIso() } : snapshot;
}

/** 按当前顺序重算正文集的 order（1..n）与 episode（1..n）；大纲 order=0、标题锁定。无结构变化时返回原 snapshot。 */
export function reindexBodyEpisodes(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  const t = nowIso();
  const outlineEp = snapshot.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
  const body = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);

  let changed = false;
  const outline =
    outlineEp ?
      (() => {
        if (outlineEp.title !== '故事大纲' || outlineEp.order !== 0) changed = true;
        return {
          ...outlineEp,
          title: '故事大纲',
          order: 0,
          updatedAt:
            outlineEp.title !== '故事大纲' || outlineEp.order !== 0 ? t : outlineEp.updatedAt,
        };
      })()
    : null;

  const bodyNext = body.map((e, i) => {
    const n = i + 1;
    if (e.order === n && e.episode === n) return e;
    changed = true;
    return { ...e, order: n, episode: n, updatedAt: t };
  });
  const episodes =
    outline ? [outline, ...bodyNext].sort((a, b) => a.order - b.order) : [...bodyNext];
  if (!changed) return snapshot;
  return { ...snapshot, episodes, updatedAt: t };
}

export function getBodyEpisodesSorted(snapshot: NovelWorkspaceSnapshot): NovelEpisode[] {
  return snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);
}

/** 按集序号 n（≥1）查找正文集；无则 null */
export function findBodyEpisodeByEpisodeNumber(
  snapshot: NovelWorkspaceSnapshot,
  n: number
): NovelEpisode | null {
  if (!Number.isFinite(n) || n < 1) return null;
  const body = getBodyEpisodesSorted(snapshot);
  return body.find((e) => e.episode === n) ?? null;
}

/** 确保第 n 集正文存在；若 n 超过当前集数，会补齐中间空集以保持侧栏编号连续。 */
export function ensureBodyEpisodeByEpisodeNumber(
  snapshot: NovelWorkspaceSnapshot,
  n: number,
  targetTitle?: string
): { snapshot: NovelWorkspaceSnapshot; episode: NovelEpisode } | null {
  const targetN = Math.floor(n);
  if (!Number.isFinite(targetN) || targetN < 1) return null;
  const existing = findBodyEpisodeByEpisodeNumber(snapshot, targetN);
  if (existing) return { snapshot, episode: existing };

  let next = snapshot;
  let created: NovelEpisode | null = null;
  const existingCount = getBodyEpisodesSorted(next).length;
  for (let i = existingCount + 1; i <= targetN; i += 1) {
    const result = upsertEpisode(next, {
      title: i === targetN ? (targetTitle?.trim() || `第${i}集`) : `第${i}集`,
    });
    next = result.snapshot;
    created = result.episode;
  }
  return created ? { snapshot: next, episode: created } : null;
}

export function bumpEpisodeRemount(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string
): NovelWorkspaceSnapshot {
  const next = {
    ...(snapshot.remountVersionByEpisode ?? {}),
    [episodeId]: (snapshot.remountVersionByEpisode?.[episodeId] ?? 0) + 1,
  };
  return { ...snapshot, remountVersionByEpisode: next, updatedAt: nowIso() };
}

export function loadNovelWorkspace(novelId: string): NovelWorkspaceSnapshot | null {
  const map = loadAll();
  const s = map[novelId];
  return s ?? null;
}

export function saveNovelWorkspace(snapshot: NovelWorkspaceSnapshot): void {
  const map = loadAll();
  map[snapshot.novelId] = { ...snapshot, updatedAt: nowIso() };
  saveAll(map);
}

/** 占位工作台：置顶故事大纲空文档 + 无分集 */
export function createBlankWorkspace(novelId: string, title: string): NovelWorkspaceSnapshot {
  const t = nowIso();
  const outline: NovelEpisode = {
    id: NOVEL_OUTLINE_EPISODE_ID,
    title: '故事大纲',
    contentMarkdown: '',
    order: 0,
    updatedAt: t,
  };
  return {
    novelId,
    title: title.trim() || '未命名小说',
    episodes: [outline],
    activeEpisodeId: NOVEL_OUTLINE_EPISODE_ID,
    remountVersionByEpisode: {},
    updatedAt: t,
  };
}

/** 从抽卡大纲初始化：置顶页写入大纲正文 prose */
export function initWorkspaceFromOutline(input: {
  novelId: string;
  novelTitle: string;
  outlineMarkdown: string;
  electronProjectId?: string | null;
}): NovelWorkspaceSnapshot {
  const base = createBlankWorkspace(input.novelId, input.novelTitle);
  const t = nowIso();
  const outline = base.episodes[0];
  return saveAndReturn({
    ...base,
    electronProjectId: input.electronProjectId ?? undefined,
    episodes: [{ ...outline, contentMarkdown: input.outlineMarkdown, updatedAt: t }],
    updatedAt: t,
  });
}

function saveAndReturn(s: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  saveNovelWorkspace(s);
  return s;
}

export function upsertEpisode(
  snapshot: NovelWorkspaceSnapshot,
  input: Partial<Pick<NovelEpisode, 'title' | 'contentMarkdown'>> & { id?: string }
): { snapshot: NovelWorkspaceSnapshot; episode: NovelEpisode } {
  const id = input.id ?? makeId('ep');
  const t = nowIso();
  const maxOrder = snapshot.episodes.reduce((m, e) => Math.max(m, e.order), 0);
  const existing = snapshot.episodes.find((e) => e.id === id);
  let episode: NovelEpisode;
  if (existing) {
    if (existing.id === NOVEL_OUTLINE_EPISODE_ID) {
      episode = {
        ...existing,
        title: '故事大纲',
        contentMarkdown: input.contentMarkdown ?? existing.contentMarkdown,
        updatedAt: t,
      };
    } else {
      const rawTitle =
        input.title !== undefined ? input.title.trim() : existing.title;
      const nextTitle =
        rawTitle ? stripNumericTitlePrefix(rawTitle) || rawTitle.trim() : existing.title;
      episode = {
        ...existing,
        title: nextTitle || existing.title,
        contentMarkdown: input.contentMarkdown ?? existing.contentMarkdown,
        updatedAt: t,
      };
    }
    const episodes = snapshot.episodes.map((e) => (e.id === id ? episode : e));
    const next = { ...snapshot, episodes, updatedAt: t };
    return { snapshot: saveAndReturn(reindexBodyEpisodes(next)), episode };
  }
  const bodyCount = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).length;
  const rawTitle = input.title?.trim() || `第${bodyCount + 1}集`;
  episode = {
    id,
    title: stripNumericTitlePrefix(rawTitle) || rawTitle,
    contentMarkdown: input.contentMarkdown ?? '',
    order: maxOrder + 1,
    updatedAt: t,
  };
  const episodes = [...snapshot.episodes, episode].sort((a, b) => a.order - b.order);
  const withNew = { ...snapshot, episodes, activeEpisodeId: id, updatedAt: t };
  const reindexed = reindexBodyEpisodes(withNew);
  const finalEp = reindexed.episodes.find((e) => e.id === id)!;
  return { snapshot: saveAndReturn(reindexed), episode: finalEp };
}

export function updateEpisodeMarkdown(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  contentMarkdown: string,
  bumpRemount: boolean
): NovelWorkspaceSnapshot {
  const t = nowIso();
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, contentMarkdown, updatedAt: t } : e
  );
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes, updatedAt: t };
  if (bumpRemount) next = bumpEpisodeRemount(next, episodeId);
  return saveAndReturn(next);
}

export function setActiveEpisode(snapshot: NovelWorkspaceSnapshot, episodeId: string): NovelWorkspaceSnapshot {
  if (!snapshot.episodes.some((e) => e.id === episodeId)) return snapshot;
  return saveAndReturn({ ...snapshot, activeEpisodeId: episodeId });
}

export function renameWorkspaceTitle(snapshot: NovelWorkspaceSnapshot, title: string): NovelWorkspaceSnapshot {
  return saveAndReturn({ ...snapshot, title: title.trim() || snapshot.title });
}

/** 删除一集（不可删除故事大纲） */
export function deleteEpisode(snapshot: NovelWorkspaceSnapshot, episodeId: string): NovelWorkspaceSnapshot | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID) return null;
  const eps = snapshot.episodes.filter((e) => e.id !== episodeId);
  if (eps.length === snapshot.episodes.length) return null;
  const t = nowIso();
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (!eps.some((e) => e.id === activeEpisodeId)) {
    activeEpisodeId = eps.sort((a, b) => a.order - b.order)[0]?.id ?? NOVEL_OUTLINE_EPISODE_ID;
  }
  const nextRaw = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  return saveAndReturn(reindexBodyEpisodes(nextRaw));
}

/** 一次删除多集（不可删除故事大纲） */
export function deleteEpisodes(snapshot: NovelWorkspaceSnapshot, episodeIds: string[]): NovelWorkspaceSnapshot | null {
  const idSet = new Set(episodeIds.filter((id) => id && id !== NOVEL_OUTLINE_EPISODE_ID));
  if (idSet.size === 0) return null;
  const eps = snapshot.episodes.filter((e) => !idSet.has(e.id));
  if (eps.length === snapshot.episodes.length) return null;
  const t = nowIso();
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (!eps.some((e) => e.id === activeEpisodeId)) {
    activeEpisodeId = [...eps].sort((a, b) => a.order - b.order)[0]?.id ?? NOVEL_OUTLINE_EPISODE_ID;
  }
  const nextRaw = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  return saveAndReturn(reindexBodyEpisodes(nextRaw));
}

/**
 * 将正文集移到大纲之后的第 newBodyIndex 位（1-based，1=紧接大纲后的第一篇正文）
 */
export function reorderEpisodeByBodyIndex(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  newBodyIndex: number
): NovelWorkspaceSnapshot | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID) return null;
  const outlineEp = snapshot.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
  const body = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);
  const ix = body.findIndex((e) => e.id === episodeId);
  if (ix < 0) return null;
  const target0 = Math.max(0, Math.min(body.length - 1, Math.floor(newBodyIndex) - 1));
  const arr = [...body];
  const [item] = arr.splice(ix, 1);
  const insertAt = target0 > ix ? target0 - 1 : target0;
  arr.splice(insertAt, 0, item);
  const t = nowIso();
  const bodyOrdered = arr.map((e, i) => ({ ...e, order: i + 1, updatedAt: t }));
  const outline = outlineEp ? [{ ...outlineEp, order: 0, updatedAt: t }] : [];
  const episodes = [...outline, ...bodyOrdered];
  return saveAndReturn(reindexBodyEpisodes({ ...snapshot, episodes, updatedAt: t }));
}

/** 合并两集正文到 keepId，移除 mergeInId */
export function mergeEpisodesContent(
  snapshot: NovelWorkspaceSnapshot,
  episodeIdKeep: string,
  episodeIdMergeIn: string,
  separator = '\n\n'
): NovelWorkspaceSnapshot | null {
  if (
    episodeIdKeep === NOVEL_OUTLINE_EPISODE_ID ||
    episodeIdMergeIn === NOVEL_OUTLINE_EPISODE_ID ||
    episodeIdKeep === episodeIdMergeIn
  ) {
    return null;
  }
  const keep = snapshot.episodes.find((e) => e.id === episodeIdKeep);
  const mergeIn = snapshot.episodes.find((e) => e.id === episodeIdMergeIn);
  if (!keep || !mergeIn) return null;
  const t = nowIso();
  const newMd = `${keep.contentMarkdown.trim()}${separator}${mergeIn.contentMarkdown.trim()}`.trim();
  const eps = snapshot.episodes.filter((e) => e.id !== episodeIdMergeIn).map((e) =>
    e.id === episodeIdKeep ? { ...e, contentMarkdown: newMd, updatedAt: t } : e
  );
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (activeEpisodeId === episodeIdMergeIn) activeEpisodeId = episodeIdKeep;
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  next = bumpEpisodeRemount(next, episodeIdKeep);
  return saveAndReturn(reindexBodyEpisodes(next));
}

/** 按 marker 将一集拆成两集；marker 保留在第一节末尾 */
export function splitEpisodeAtMarker(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  marker: string,
  newEpisodeTitle: string
): { snapshot: NovelWorkspaceSnapshot; newEpisodeId: string } | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID || !marker.trim()) return null;
  const ep = snapshot.episodes.find((e) => e.id === episodeId);
  if (!ep) return null;
  const md = ep.contentMarkdown;
  const ix = md.indexOf(marker);
  if (ix < 0) return null;
  const left = md.slice(0, ix + marker.length).trimEnd();
  const right = md.slice(ix + marker.length).trimStart();
  if (!right.trim()) return null;
  const t = nowIso();
  const maxOrder = snapshot.episodes.reduce((m, e) => Math.max(m, e.order), 0);
  const newId = makeId('ep');
  const newEp: NovelEpisode = {
    id: newId,
    title:
      stripNumericTitlePrefix(newEpisodeTitle.trim()) ||
      newEpisodeTitle.trim() ||
      `第${snapshot.episodes.filter((x) => x.id !== NOVEL_OUTLINE_EPISODE_ID).length + 1}集`,
    contentMarkdown: right,
    order: maxOrder + 1,
    updatedAt: t,
  };
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, contentMarkdown: left, updatedAt: t } : e
  );
  const withNew = [...episodes, newEp].sort((a, b) => a.order - b.order);
  let next: NovelWorkspaceSnapshot = {
    ...snapshot,
    episodes: withNew,
    updatedAt: t,
    activeEpisodeId: newEp.id,
  };
  next = reindexBodyEpisodes(next);
  next = bumpEpisodeRemount(next, episodeId);
  next = bumpEpisodeRemount(next, newEp.id);
  const saved = saveAndReturn(next);
  return { snapshot: saved, newEpisodeId: newId };
}

/** 若无快照则从小说列表推导标题并创建空白工作台 */
export function ensureNovelWorkspace(novelId: string): NovelWorkspaceSnapshot {
  const existing = loadNovelWorkspace(novelId);
  if (!existing) {
    const listItem = loadNovelList().find((n) => n.id === novelId);
    const title = listItem?.title.trim() || '未命名小说';
    return saveAndReturn(createBlankWorkspace(novelId, title));
  }
  const migrated = migrateNovelWorkspaceEpisodeTitles(existing);
  const normalized = reindexBodyEpisodes(migrated);
  if (normalized !== existing) {
    saveNovelWorkspace(normalized);
  }
  return normalized;
}
