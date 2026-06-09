/**
 * 小说列表 — 双存储：localStorage（同步读写）+ IPC 异步同步到 SQLite
 */
import type { NovelWorkspaceItem } from '../types/novelWorkspace';

const STORAGE_KEY = 'yiman:novel-design:novels-v1';
const WORKSPACE_STORAGE_KEY = 'yiman:novel-design:workspace-v2';
const OUTLINE_EPISODE_ID = '__story_outline__';

function api() {
  return window.yiman?.novel;
}

/** 工作区已有有声书数据结构（与 enableAudiobookForNovel 一致） */
function workspaceLocalHasAudiobook(novelId: string): boolean {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<
      string,
      { episodes?: Array<{ id: string; episodeAudiobook?: unknown | null }> }
    >;
    const ws = map[novelId];
    if (!ws?.episodes?.length) return false;
    return ws.episodes.some((e) => e.id !== OUTLINE_EPISODE_ID && e.episodeAudiobook != null);
  } catch {
    return false;
  }
}

/** 列表 flag 与工作区有声书数据不一致时，以工作区为准补全 audiobookEnabled */
function repairAudiobookEnabledFlags(list: NovelWorkspaceItem[]): NovelWorkspaceItem[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.audiobookEnabled) return item;
    if (!workspaceLocalHasAudiobook(item.id)) return item;
    changed = true;
    return { ...item, audiobookEnabled: true, updatedAt: new Date().toISOString() };
  });
  if (!changed) return list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  syncToDb(next);
  return next;
}

function safeParse(raw: string | null): NovelWorkspaceItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

/** 异步同步到 SQLite */
function syncToDb(items: NovelWorkspaceItem[]): void {
  const a = api();
  if (!a) return;
  for (const item of items) {
    a.upsert(item).catch(() => {});
  }
}

let restoreAttempted = false;

export function loadNovelList(): NovelWorkspaceItem[] {
  try {
    const list = repairAudiobookEnabledFlags(safeParse(localStorage.getItem(STORAGE_KEY)));
    // 如果 localStorage 为空，尝试从 SQLite 恢复
    if (list.length === 0 && !restoreAttempted) {
      restoreAttempted = true;
      const a = api();
      if (a) {
        a.list().then((dbItems) => {
          if (dbItems.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dbItems));
            // 触发页面刷新以显示恢复的数据
            window.location.reload();
          }
        }).catch(() => {});
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function saveNovelList(items: NovelWorkspaceItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
  syncToDb(items);
}

export function upsertNovel(item: NovelWorkspaceItem): NovelWorkspaceItem[] {
  const list = loadNovelList();
  const idx = list.findIndex((x) => x.id === item.id);
  const next = idx >= 0 ? [...list.slice(0, idx), item, ...list.slice(idx + 1)] : [...list, item];
  saveNovelList(next);
  return next;
}
