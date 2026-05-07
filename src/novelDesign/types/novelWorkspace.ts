/**
 * 编剧工作区：小说列表条目（本地草稿，见 novelListStorage）
 */
export interface NovelWorkspaceItem {
  id: string;
  title: string;
  /** 题材/类型标签（展示用） */
  genres: string[];
  coverDataUrl?: string | null;
  updatedAt: string;
  createdAt: string;
}
