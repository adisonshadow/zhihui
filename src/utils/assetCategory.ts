/**
 * 素材面板 UI 分类工具（见文档 09-素材面板分类方案）
 * 分类存储于素材的 tags 字段，以 __cat: 前缀标识；精灵图/元件存于 uiCategory 字段
 * 默认分类为 'prop'（道具），所有未标记的现有素材归入道具
 */

export type AssetUiCategory = 'scene' | 'prop' | 'effect';

export const CAT_TAG_PREFIX = '__cat:';

export const UI_ASSET_CATEGORIES = [
  { value: 'scene' as const, label: '布景' },
  { value: 'prop' as const, label: '道具' },
  { value: 'effect' as const, label: '特效' },
  { value: 'text' as const, label: '文字' },
  { value: 'sound' as const, label: '声音' },
] as const;

export type UiCategoryValue = (typeof UI_ASSET_CATEGORIES)[number]['value'];

/** 从 tags 字符串中读取 UI 分类，无标记时默认为 'prop'（道具） */
export function getAssetUiCategory(tags: string | null | undefined): AssetUiCategory {
  if (!tags) return 'prop';
  for (const part of tags.split(/[,，\s]+/)) {
    const p = part.trim();
    if (p.startsWith(CAT_TAG_PREFIX)) {
      const cat = p.slice(CAT_TAG_PREFIX.length);
      if (cat === 'scene' || cat === 'effect') return cat;
      if (cat === 'prop') return 'prop';
    }
  }
  return 'prop';
}

/** 在 tags 字符串中写入 UI 分类标签（覆盖已有的 __cat: 标签） */
export function addCategoryToTags(
  existingTags: string | null | undefined,
  category: AssetUiCategory,
): string {
  const catTag = `${CAT_TAG_PREFIX}${category}`;
  if (!existingTags || !existingTags.trim()) return catTag;
  const parts = existingTags
    .split(/[,，\s]+/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(CAT_TAG_PREFIX));
  return [...parts, catTag].join(',');
}
