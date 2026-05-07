import type { NovelEpisode } from '@/novelDesign/storage/novelWorkspaceStorage';
import { NOVEL_OUTLINE_EPISODE_ID } from '@/novelDesign/storage/novelWorkspaceStorage';

/** 去掉「1、xxx」式前缀，得到编辑器/存储用标题 */
export function stripNumericEpisodeTitlePrefix(title: string): string {
  const t = title.trim();
  const m = t.match(/^\d+[、.．:：]\s*(.+)$/);
  return m ? m[1].trim() : t;
}

/**
 * 左侧导航等：正文集为「n、标题」；故事大纲固定「故事大纲」。
 * 编辑器内仅展示 `ep.title`（不含序号前缀）。
 */
export function formatNovelEpisodeNavLabel(ep: NovelEpisode): string {
  if (ep.id === NOVEL_OUTLINE_EPISODE_ID) return '故事大纲';
  const n = ep.episode;
  const title = ep.title.trim() || (n != null ? `第${n}集` : '未命名集');
  return n != null && n > 0 ? `${n}、${title}` : title;
}

/** 供 AI 列表行：带序号的展示名 */
export function formatNovelEpisodeListLabelForPrompt(ep: NovelEpisode): string {
  return formatNovelEpisodeNavLabel(ep);
}
