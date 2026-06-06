/**
 * 小说封面：远程出图 URL → Electron 本地 image-cache → file:// 持久化引用
 */
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';

function toFileUrl(localPath: string): string {
  const p = localPath.trim();
  if (p.startsWith('file://')) return p;
  return `file://${p}`;
}

export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function imageCacheApi() {
  return window.yiman?.images?.cache;
}

/** 下载并缓存远程封面，返回可展示的 file://（失败时回退原 URL） */
export async function persistNovelCoverFromRemote(remoteUrl: string): Promise<string> {
  const raw = remoteUrl.trim();
  if (!raw) return raw;
  if (!isRemoteImageUrl(raw)) return raw.startsWith('file://') ? raw : toFileUrl(raw);

  const api = imageCacheApi();
  if (!api?.save) {
    console.warn('[novelCover] 无 image-cache API，封面仍使用远程 URL');
    return raw;
  }

  const existing = await api.resolve(raw);
  if (existing) return toFileUrl(existing);

  const res = await api.save(raw);
  if (res.ok) return toFileUrl(res.localPath);
  console.warn('[novelCover] 缓存失败:', res.error);
  return raw;
}

function migrateStoredCover(novelId: string, fileUrl: string): void {
  const item = loadNovelList().find((x) => x.id === novelId);
  if (!item?.coverDataUrl || item.coverDataUrl === fileUrl) return;
  if (!isRemoteImageUrl(item.coverDataUrl)) return;
  upsertNovel({ ...item, coverDataUrl: fileUrl, updatedAt: new Date().toISOString() });
}

/**
 * 解析列表/详情展示用封面地址；远程 URL 走本地缓存，并可写回 novel 列表。
 */
export async function resolveNovelCoverForDisplay(
  stored: string | null | undefined,
  options?: { novelId?: string; persistIfCached?: boolean },
): Promise<string | null> {
  const raw = stored?.trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('file://')) return raw;
  if (!isRemoteImageUrl(raw)) {
    return raw.includes('://') ? raw : toFileUrl(raw);
  }

  const api = imageCacheApi();
  if (!api) return raw;

  const cachedPath = await api.resolve(raw);
  if (cachedPath) {
    const fileUrl = toFileUrl(cachedPath);
    if (options?.persistIfCached && options.novelId) {
      migrateStoredCover(options.novelId, fileUrl);
    }
    return fileUrl;
  }

  const saved = await api.save(raw);
  if (!saved.ok) return raw;

  const fileUrl = toFileUrl(saved.localPath);
  if (options?.persistIfCached && options.novelId) {
    migrateStoredCover(options.novelId, fileUrl);
  }
  return fileUrl;
}
