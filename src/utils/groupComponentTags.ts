/**
 * 元件 tag 收集工具：用于预览/状态关键帧的 tag 选择
 */
import type { GroupComponentItem } from '@/types/groupComponent';
import type { SpriteSheetItem } from '@/components/character/SpriteSheetPanel';

/** 递归收集当前元件及所有嵌套元件及其 tags */
export function collectGroupsWithTags(
  group: GroupComponentItem | null,
  componentGroups: GroupComponentItem[],
  seen: Set<string> = new Set()
): { group: GroupComponentItem; tags: string[] }[] {
  if (!group || seen.has(group.id)) return [];
  seen.add(group.id);
  const tagOrder: string[] = [];
  for (const s of group.states) {
    for (const t of s.tags) {
      const trimmed = t?.trim();
      if (trimmed && !tagOrder.includes(trimmed)) tagOrder.push(trimmed);
    }
  }
  const result: { group: GroupComponentItem; tags: string[] }[] = [{ group, tags: tagOrder }];
  for (const state of group.states) {
    for (const it of state.items) {
      if (it.type === 'group' && it.groupId) {
        const nested = componentGroups.find((g) => g.id === it.groupId);
        if (nested) {
          result.push(...collectGroupsWithTags(nested, componentGroups, seen));
        }
      }
    }
  }
  return result;
}

/** 递归收集画板中所有标签精灵的 tag 组 */
export function collectTaggedSpritesForPreview(
  group: GroupComponentItem | null,
  componentGroups: GroupComponentItem[],
  spriteSheets: SpriteSheetItem[],
  characterId: string,
  allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[],
  seen: Set<string> = new Set()
): { itemId: string; spriteId: string; spriteName: string; properties: { propertyName: string; tagValues: string[] }[] }[] {
  if (!group || seen.has(group.id)) return [];
  seen.add(group.id);
  const result: { itemId: string; spriteId: string; spriteName: string; properties: { propertyName: string; tagValues: string[] }[] }[] = [];
  const resolveSheets = (charId: string) =>
    charId === characterId ? spriteSheets : allCharactersData?.find((c) => c.characterId === charId)?.spriteSheets ?? [];
  for (const state of group.states) {
    for (const it of state.items) {
      if (it.type === 'sprite') {
        const sheets = resolveSheets(it.characterId);
        const sprite = sheets.find((s) => s.id === it.spriteId);
        if (sprite?.is_tagged_sprite && sprite.property_tags?.length) {
          const properties: { propertyName: string; tagValues: string[] }[] = [];
          for (const prop of sprite.property_tags) {
            const values = new Set<string>();
            for (const ft of sprite.frame_tags ?? []) {
              for (const v of ft[prop] ?? []) {
                if (v?.trim()) values.add(v.trim());
              }
            }
            if (values.size > 0) {
              properties.push({ propertyName: prop, tagValues: [...values] });
            }
          }
          if (properties.length > 0) {
            result.push({
              itemId: it.id,
              spriteId: it.spriteId,
              spriteName: sprite.name || it.spriteId,
              properties,
            });
          }
        }
      } else if (it.type === 'group' && it.groupId) {
        const nested = componentGroups.find((g) => g.id === it.groupId);
        if (nested) {
          result.push(
            ...collectTaggedSpritesForPreview(
              nested,
              componentGroups,
              spriteSheets,
              it.characterId,
              allCharactersData,
              seen
            )
          );
        }
      }
    }
  }
  return result;
}
