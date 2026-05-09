/**
 * 创作偏好持久化存储（抽卡页/写作页通用）
 */
import { getContentTypeEpisodeGuide } from '@/novelDesign/AITools/genOutline/index';
import type { ScreenwriterDrawForm } from '@/novelDesign/prompts/screenwriterDrawPrompt';
import { DEFAULT_SCREENWRITER_DRAW_FORM } from '@/novelDesign/prompts/screenwriterDrawPrompt';

const STORAGE_KEY = 'yiman:novel-design:creation-preference';

function safeParse(raw: string | null): ScreenwriterDrawForm | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (typeof o.innovation === 'string' && typeof o.genre === 'string') {
        return {
          ...DEFAULT_SCREENWRITER_DRAW_FORM,
          ...o,
        } as ScreenwriterDrawForm;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function loadCreationPreference(): ScreenwriterDrawForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParse(raw) ?? { ...DEFAULT_SCREENWRITER_DRAW_FORM };
  } catch {
    return { ...DEFAULT_SCREENWRITER_DRAW_FORM };
  }
}

export function saveCreationPreference(form: ScreenwriterDrawForm): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    /* ignore quota */
  }
}

/** 将创作偏好格式化为纯文本行数组（供展示或拼入 projectPrompt） */
export function formatPreferenceLines(form: ScreenwriterDrawForm): string[] {
  const kw = form.keywords.replace(/\s+/g, ' ').trim();
  const contentTypeLabel = form.customContentType?.trim() || form.contentType;
  const lengthLabel = form.customLength?.trim() || form.length;

  const lines: string[] = [
    `作品类型：${contentTypeLabel}`,
    `题材：${form.genre}`,
    `受众：${form.audience}`,
    `情感模式：${form.cpMode}`,
    `故事基调：${form.tone}`,
    `叙事节奏：${form.pace}`,
    `预期篇幅：${lengthLabel}`,
  ];
  const storyPlots = form.storyPlots.filter((x) => x !== '任意');
  if (storyPlots.length > 0) {
    lines.push(`故事情节：${storyPlots.join('、')}`);
  }
  if (kw) {
    lines.push(`灵感关键词：${kw}`);
  }
  return lines;
}

/** 将创作偏好格式化为 projectPrompt 中注入的文本块 */
export function formatPreferenceBlock(form: ScreenwriterDrawForm): string {
  const contentTypeLabel = form.customContentType?.trim() || form.contentType;
  const episodeGuide = getContentTypeEpisodeGuide(form.contentType, form.customContentType);
  const lines = formatPreferenceLines(form);

  const blockLines: string[] = [];
  // 将 formatPreferenceLines 中的每一行加上「- 」前缀，并插入每集时长指引
  for (const line of lines) {
    if (line.startsWith('作品类型：')) {
      blockLines.push('- 作品类型：' + contentTypeLabel);
    } else if (line.startsWith('预期篇幅：')) {
      blockLines.push('- ' + line);
      blockLines.push('- 每集时长指引：' + episodeGuide);
    } else {
      blockLines.push('- ' + line);
    }
  }
  return '【创作偏好（用户在抽卡页的设置，后续所有生成须遵循）】\n' + blockLines.join('\n');
}
