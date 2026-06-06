import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { loadNovelList, saveNovelList } from '@/novelDesign/storage/novelListStorage';
import { deleteNovelWorkspaceLocal } from '@/novelDesign/storage/novelWorkspaceStorage';
import { resolveNovelProjectDirForItem } from '@/audiobook/utils/audiobookProjectDir';

export async function openNovelProjectDirectory(item: NovelWorkspaceItem): Promise<void> {
  const dir = await resolveNovelProjectDirForItem(item);
  if (!dir) {
    throw new Error('未找到项目目录。请确认创建项目时已选择存储路径。');
  }
  const err = await window.yiman?.shell?.openPath?.(dir);
  if (err) throw new Error(err || '无法打开目录');
}

export async function deleteNovelProject(
  item: NovelWorkspaceItem,
  deleteOnDisk: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (deleteOnDisk) {
    const projectDir = await resolveNovelProjectDirForItem(item);
    if (!projectDir) {
      return { ok: false, error: '未找到本地项目目录，无法删除磁盘内容' };
    }
    const res = await window.yiman?.fs?.removePathRecursive?.(projectDir);
    if (!res?.ok) return { ok: false, error: res?.error ?? '删除本地目录失败' };
  }

  deleteNovelWorkspaceLocal(item.id);
  saveNovelList(loadNovelList().filter((x) => x.id !== item.id));

  try {
    await window.yiman?.novel?.delete?.(item.id);
  } catch {
    /* ignore */
  }

  return { ok: true };
}
