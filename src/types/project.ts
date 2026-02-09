/**
 * 漫剧项目类型（见功能文档 2.2）
 */
export interface ProjectItem {
  id: string;
  name: string;
  landscape: number;
  project_dir: string;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 集/剧情大纲行（见功能文档 4.1、开发计划 2.5）
 */
export interface EpisodeRow {
  id: string;
  title: string;
  sort_order: number;
  summary: string;
  script_text: string;
  character_refs?: string;
  created_at: string;
  updated_at: string;
}
