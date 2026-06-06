import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';

const AUDIOBOOK_EXPORT_SUBDIR = 'audioBookFiles';

/** 有声书导出 WAV 默认子目录（相对小说项目根） */
export function audiobookExportFilesDirName(): string {
  return AUDIOBOOK_EXPORT_SUBDIR;
}

/**
 * 解析小说项目根目录：工作区 projectDir → 列表项 projectDir → electronProjectId 对应漫剧项目目录
 */
/** 列表卡片：仅从列表项 / 本地工作区 / electronProjectId 解析项目目录 */
export async function resolveNovelProjectDirForItem(
  item: NovelWorkspaceItem,
): Promise<string | null> {
  const fromList = item.projectDir?.trim();
  if (fromList) return fromList;

  const { loadNovelWorkspace } = await import('@/novelDesign/storage/novelWorkspaceStorage');
  const ws = loadNovelWorkspace(item.id);
  if (ws) return resolveNovelProjectDir(ws, item);

  const pid = item.electronProjectId?.trim();
  if (!pid || !window.yiman?.projects?.list) return null;
  try {
    const projects = await window.yiman.projects.list();
    return projects.find((p) => p.id === pid)?.project_dir?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function resolveNovelProjectDir(
  workspace: NovelWorkspaceSnapshot,
  listItem?: NovelWorkspaceItem | null,
): Promise<string | null> {
  const fromWorkspace = workspace.projectDir?.trim();
  if (fromWorkspace) return fromWorkspace;

  const fromList = listItem?.projectDir?.trim();
  if (fromList) return fromList;

  const pid = (workspace.electronProjectId ?? listItem?.electronProjectId)?.trim();
  if (!pid || !window.yiman?.projects?.list) return null;

  try {
    const projects = await window.yiman.projects.list();
    const row = projects.find((p) => p.id === pid);
    return row?.project_dir?.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveAudiobookExportDir(
  workspace: NovelWorkspaceSnapshot,
  listItem?: NovelWorkspaceItem | null,
): Promise<string | null> {
  const root = await resolveNovelProjectDir(workspace, listItem);
  if (!root || !window.yiman?.fs?.pathJoin) return null;
  return window.yiman.fs.pathJoin(root, AUDIOBOOK_EXPORT_SUBDIR);
}
