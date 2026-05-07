import type { NovelWorkspaceItem } from '../types/novelWorkspace';

const STORAGE_KEY = 'yiman:novel-design:novels-v1';

function safeParse(raw: string | null): NovelWorkspaceItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

export function loadNovelList(): NovelWorkspaceItem[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
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
}

export function upsertNovel(item: NovelWorkspaceItem): NovelWorkspaceItem[] {
  const list = loadNovelList();
  const idx = list.findIndex((x) => x.id === item.id);
  const next = idx >= 0 ? [...list.slice(0, idx), item, ...list.slice(idx + 1)] : [...list, item];
  saveNovelList(next);
  return next;
}
