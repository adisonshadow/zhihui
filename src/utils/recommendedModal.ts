import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';
import type { RecommendedModalEntry } from '@/types/recommendedModels';

/** 根据当前填写的名称/版本匹配配置中的推荐条目（用于 baseUrl、abilityTags、io 等） */
export function resolveRecommendedVariant(
  preset: ModelPreset,
  modelDisplayName: string,
  primaryVersion: string,
): RecommendedModalEntry | undefined {
  const md = modelDisplayName.trim();
  const pv = primaryVersion.trim();
  const list = preset.recommendedModals ?? [];
  if (!list.length || !md) return undefined;
  const byName = list.filter(
    (m) =>
      m.name === md ||
      m.displayName === md ||
      m.name.toLowerCase() === md.toLowerCase() ||
      m.displayName.toLowerCase() === md.toLowerCase(),
  );
  if (byName.length === 0) return undefined;
  if (pv) {
    const exact = byName.find((m) => (m.primaryVersion ?? '') === pv);
    if (exact) return exact;
  }
  if (!pv) {
    const noVersion = byName.find((m) => !(m.primaryVersion ?? '').trim());
    if (noVersion) return noVersion;
  }
  return byName.length === 1 ? byName[0] : undefined;
}
