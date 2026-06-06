import type { AISettings } from '@/types/settings';
import {
  LOCAL_SFX_MODEL_OPTIONS,
  migrateLocalSfxConfig,
  localSfxProfileIsSaved,
} from '@/types/settings';

export function buildLocalSfxSelectOptions(config: AISettings | null | undefined): {
  value: string;
  label: string;
  disabled?: boolean;
}[] {
  const sfx = migrateLocalSfxConfig(config?.localSfx);
  if (!sfx?.enabled) return [];
  return LOCAL_SFX_MODEL_OPTIONS.map((m) => {
    const saved = localSfxProfileIsSaved(sfx, m.key);
    return {
      value: m.key,
      label: saved ? m.label : `${m.label}（未配置）`,
      disabled: !saved,
    };
  });
}

export function isLocalSfxReady(config: AISettings | null | undefined, modelKey: string): boolean {
  const sfx = migrateLocalSfxConfig(config?.localSfx);
  return sfx?.enabled === true && localSfxProfileIsSaved(sfx, modelKey);
}

export function defaultDurationForLocalSfx(
  config: AISettings | null | undefined,
  modelKey: string,
): number {
  const sfx = migrateLocalSfxConfig(config?.localSfx);
  const d = sfx?.profiles?.[modelKey]?.defaultDurationSeconds;
  return typeof d === 'number' && d >= 2 && d <= 15 ? d : 6;
}

export function activeLocalSfxModelKey(config: AISettings | null | undefined): string {
  const sfx = migrateLocalSfxConfig(config?.localSfx);
  if (!sfx?.enabled) return 'moss_sound_effect';
  return sfx.modelKey ?? 'moss_sound_effect';
}
