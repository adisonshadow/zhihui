/**
 * 编剧工作区：小说列表条目（本地草稿，见 novelListStorage）
 */
export interface NovelWorkspaceItem {
  id: string;
  title: string;
  /** 题材/类型标签（展示用） */
  genres: string[];
  coverDataUrl?: string | null;
  /** 已开通有声书工作台（仅能从小说编剧详情创建） */
  audiobookEnabled?: boolean;
  /** 小说项目根目录（创建项目时选择的路径，供有声书导出等） */
  projectDir?: string | null;
  electronProjectId?: string | null;
  updatedAt: string;
  createdAt: string;
}
