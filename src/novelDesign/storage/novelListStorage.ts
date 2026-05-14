/**
 * 小说列表 — 双存储：localStorage（同步读写）+ IPC 异步同步到 SQLite
 */
import type { NovelWorkspaceItem } from '../types/novelWorkspace';

const STORAGE_KEY = 'yiman:novel-design:novels-v1';

function api() {
  return window.yiman?.novel;
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
    const list = safeParse(localStorage.getItem(STORAGE_KEY));
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
