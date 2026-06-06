/**
 * 常见模型 preset：多模型 ID tags → 多条 AIModelConfig 同步
 */
import type { AIModelConfig } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';
import { resolveRecommendedVariant } from '@/utils/recommendedModal';
import { resolveRequestModelId, splitLegacyModelId } from '@/utils/aiModelRequestId';

export interface ParsedModelIdTag {
  modelDisplayName: string;
  primaryVersion: string;
}

export function parseModelIdTag(raw: string): ParsedModelIdTag {
  const s = (raw ?? '').trim();
  if (!s) return { modelDisplayName: '', primaryVersion: '' };
  return splitLegacyModelId(s);
}

export function requestModelIdFromParsed(p: ParsedModelIdTag): string {
  const d = (p.modelDisplayName ?? '').trim();
  const v = (p.primaryVersion ?? '').trim();
  return resolveRequestModelId({ modelDisplayName: d || undefined, primaryVersion: v || undefined } as AIModelConfig) ?? '';
}

export function modelInstanceKey(presetKey: string, requestModelId: string): string {
  return `${presetKey}::${requestModelId.toLowerCase()}`;
}

export function buildPresetModelFromTag(opts: {
  preset: ModelPreset;
  /** 单行 tag：完整 slug 或可拆分的 name-version */
  tag: string;
  apiKey: string;
  /** 实例展示名（所有兄弟共用） */
  name: string;
  /** 克隆 capability / apiUrl 时的参考（同 preset 已有一条时） */
  templateModel?: AIModelConfig | undefined;
}): AIModelConfig | null {
  const { preset, tag, name, apiKey, templateModel } = opts;
  const parsed = parseModelIdTag(tag);
  const md = parsed.modelDisplayName.trim();
  if (!md) return null;
  const pv = parsed.primaryVersion.trim();
  const variant = resolveRecommendedVariant(preset, md, pv);
  const capabilityKeys =
    variant?.abilityTags?.length
      ? [...variant.abilityTags]
      : templateModel?.capabilityKeys?.length
        ? [...templateModel.capabilityKeys]
        : [...preset.capabilityKeys];
  const apiUrl = variant?.baseUrl?.trim()
    ? variant.baseUrl.trim()
    : templateModel?.apiUrl ?? preset.apiUrl;

  const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const next: AIModelConfig = {
    id,
    name: name.trim() || preset.displayName,
    provider: preset.provider,
    apiUrl,
    apiKey: preset.isLocal ? '' : apiKey.trim(),
    capabilityKeys,
    presetKey: preset.presetKey,
    isLocal: preset.isLocal,
  };
  if (preset.vendorKey) next.vendorKey = preset.vendorKey;
  if (templateModel?.minimaxGroupId?.trim()) next.minimaxGroupId = templateModel.minimaxGroupId.trim();
  next.modelDisplayName = md;
  if (pv) next.primaryVersion = pv;
  return next;
}

/** 去重：同 requestModelId 只保留第一次出现的 tag */
export function normalizeTagsForPreset(tags: string[]): { tag: string; rid: string }[] {
  const seen = new Set<string>();
  const out: { tag: string; rid: string }[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const rid = requestModelIdFromParsed(parseModelIdTag(tag));
    if (!rid) continue;
    const k = rid.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ tag, rid });
  }
  return out;
}

export interface SyncPresetModelsFromTagsOpts {
  preset: ModelPreset;
  allModels: AIModelConfig[];
  tags: string[];
  apiKey: string;
  sharedName?: string;
  /** append：仅新增，不删除同 preset 其它实例；reconcile：按 tags 对齐增删改 */
  mode: 'append' | 'reconcile';
}

export interface SyncPresetModelsFromTagsResult {
  nextModels: AIModelConfig[];
  added: number;
  skipped: number;
  removed: number;
}

export function syncPresetModelsFromTags(opts: SyncPresetModelsFromTagsOpts): SyncPresetModelsFromTagsResult {
  const { preset, allModels, tags, apiKey, mode } = opts;
  const normalized = normalizeTagsForPreset(tags);
  const sharedName = (opts.sharedName ?? preset.displayName).trim() || preset.displayName;

  if (mode === 'append') {
    const existingKeys = new Set<string>();
    for (const m of allModels) {
      if (m.presetKey !== preset.presetKey) continue;
      const rid = (resolveRequestModelId(m) ?? '').trim().toLowerCase();
      if (rid) existingKeys.add(rid);
    }
    let skipped = 0;
    let added = 0;
    const appended: AIModelConfig[] = [];
    const siblingTemplate = allModels.find((m) => m.presetKey === preset.presetKey);
    for (const { tag, rid } of normalized) {
      const rk = rid.toLowerCase();
      if (existingKeys.has(rk)) {
        skipped += 1;
        continue;
      }
      const built = buildPresetModelFromTag({
        preset,
        tag,
        apiKey,
        name: sharedName,
        templateModel: siblingTemplate ?? appended[0],
      });
      if (!built) {
        skipped += 1;
        continue;
      }
      appended.push(built);
      existingKeys.add(rk);
      added += 1;
    }
    return { nextModels: [...allModels, ...appended], added, skipped, removed: 0 };
  }

  /** reconcile */
  const others = allModels.filter((m) => m.presetKey !== preset.presetKey);
  const unmatched = [...allModels.filter((m) => m.presetKey === preset.presetKey)];
  let added = 0;
  const rebuilt: AIModelConfig[] = [];

  const applyUpdates = (
    base: AIModelConfig,
    tag: string,
  ): AIModelConfig => {
    const parsed = parseModelIdTag(tag);
    const md = parsed.modelDisplayName.trim();
    const pv = parsed.primaryVersion.trim();
    const variant = resolveRecommendedVariant(preset, md, pv);
    const capabilityKeys =
      variant?.abilityTags?.length
        ? [...variant.abilityTags]
        : base.capabilityKeys?.length
          ? [...base.capabilityKeys]
          : [...preset.capabilityKeys];
    const apiUrl = variant?.baseUrl?.trim()
      ? variant.baseUrl.trim()
      : base.apiUrl ?? preset.apiUrl;
    const next: AIModelConfig = {
      ...base,
      name: sharedName,
      apiUrl,
      apiKey: preset.isLocal ? '' : apiKey.trim(),
      capabilityKeys,
    };
    next.modelDisplayName = md || undefined;
    next.primaryVersion = pv || undefined;
    if (!md && !pv && base.model) next.model = base.model;
    return next;
  };

  for (const { tag, rid } of normalized) {
    const rk = rid.toLowerCase();
    const idx = unmatched.findIndex((m) => (resolveRequestModelId(m) ?? '').trim().toLowerCase() === rk);
    if (idx >= 0) {
      const m = unmatched[idx]!;
      unmatched.splice(idx, 1);
      rebuilt.push(applyUpdates(m, tag));
    } else {
      const built = buildPresetModelFromTag({
        preset,
        tag,
        apiKey,
        name: sharedName,
        templateModel: rebuilt.find((x) => x.presetKey === preset.presetKey),
      });
      if (built) {
        rebuilt.push(built);
        added += 1;
      }
    }
  }

  const removed = unmatched.length;
  return { nextModels: [...others, ...rebuilt], added, skipped: 0, removed };
}

export function formatModelSelectLabel(m: AIModelConfig, contextModels: AIModelConfig[]): string {
  const base = m.name?.trim() || resolveRequestModelId(m) || m.id;
  const reqId = capitalize(resolveRequestModelId(m) ?? '').trim();

  let showSuffix = false;
  const pk = m.presetKey?.trim();
  if (pk) {
    const samePreset = contextModels.filter((x) => x.presetKey === pk);
    if (samePreset.length >= 2) showSuffix = true;
  } else {
    const n = (m.name ?? '').trim();
    if (n) {
      const cnt = contextModels.filter((x) => (x.name ?? '').trim() === n).length;
      if (cnt >= 2) showSuffix = true;
    }
  }

  // if (showSuffix && reqId) return `${base} · ${reqId}`;
  if (showSuffix && reqId) return `${reqId}`;
  return base;
}

function capitalize(str: string): string {
  if (!str) return '';
  return str[0].toUpperCase() + str.slice(1);
}
