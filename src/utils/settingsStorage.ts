/**
 * AI 设置存储：Electron 优先，Web 模式降级到 localStorage
 * 见 docs/配置订阅使用.md
 */
import { type AISettings, migrateLocalSfxConfig, migrateLocalTtsConfig } from '@/types/settings';
import { normalizeNovelWriterAuthorName } from '@/utils/novelWriterAuthorName';
import { migrateModelsCapabilityKeys } from '@/utils/migrateModelCapabilityKeys';

const STORAGE_KEY = 'yiman:settings';

function getFromLocalStorage(): AISettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      models: Array.isArray(parsed?.models) ? parsed.models : [],
      aiMattingConfigs: Array.isArray(parsed?.aiMattingConfigs) ? parsed.aiMattingConfigs : [],
      localTts: migrateLocalTtsConfig(
        parsed?.localTts && typeof parsed.localTts === 'object' ? parsed.localTts : undefined,
      ),
      localSfx: migrateLocalSfxConfig(
        parsed?.localSfx && typeof parsed.localSfx === 'object' ? parsed.localSfx : undefined,
      ),
      novelWriter:
        parsed?.novelWriter && typeof parsed.novelWriter === 'object'
          ? (() => {
              const nw = parsed.novelWriter as { coverImageCount?: unknown; authorName?: unknown };
              const authorName = normalizeNovelWriterAuthorName(
                typeof nw.authorName === 'string' ? nw.authorName : undefined,
              );
              return {
                coverImageCount:
                  typeof nw.coverImageCount === 'number'
                    ? Math.max(1, Math.min(12, nw.coverImageCount))
                    : 4,
                ...(authorName ? { authorName } : {}),
              };
            })()
          : undefined,
      novelBgVideo: typeof parsed?.novelBgVideo === 'string' ? parsed.novelBgVideo : 'bg1.mp4',
      projectBgVideo: typeof parsed?.projectBgVideo === 'string' ? parsed.projectBgVideo : 'bg1.mp4',
      audiobookBgVideo:
        typeof parsed?.audiobookBgVideo === 'string'
          ? parsed.audiobookBgVideo
          : typeof parsed?.novelBgVideo === 'string'
            ? parsed.novelBgVideo
            : 'bg1.mp4',
      defaultProjectRoot:
        typeof parsed?.defaultProjectRoot === 'string' ? parsed.defaultProjectRoot : undefined,
      canvasAutoFitViewport:
        typeof parsed?.canvasAutoFitViewport === 'boolean' ? parsed.canvasAutoFitViewport : undefined,
      modalMaskBlur: typeof parsed?.modalMaskBlur === 'boolean' ? parsed.modalMaskBlur : undefined,
      audiobook:
        parsed?.audiobook && typeof parsed.audiobook === 'object' ?
          (() => {
            const ab = parsed.audiobook as Record<string, unknown>;
            const legacyRoot =
              typeof ab.voiceSamplesRootDir === 'string' ? ab.voiceSamplesRootDir.trim() : '';
            const presetRoot =
              typeof ab.presetVoiceSamplesRootDir === 'string' ?
                ab.presetVoiceSamplesRootDir.trim()
              : legacyRoot;
            const customRoot =
              typeof ab.customVoiceSamplesRootDir === 'string' ?
                ab.customVoiceSamplesRootDir.trim()
              : legacyRoot;
            const defaultTtsModelKey =
              typeof ab.defaultTtsModelKey === 'string' ? ab.defaultTtsModelKey.trim() : '';
            const savedVoiceSamples =
              Array.isArray(ab.savedVoiceSamples) ?
                (ab.savedVoiceSamples as unknown[])
                  .map((x) => {
                    const o = x as Record<string, unknown>;
                    const id = typeof o.id === 'string' ? o.id.trim() : '';
                    const name = typeof o.name === 'string' ? o.name.trim() : '';
                    const relativePath =
                      typeof o.relativePath === 'string' ? o.relativePath.trim().replace(/\\/g, '/') : '';
                    const createdAt =
                      typeof o.createdAt === 'string' ? o.createdAt.trim() : new Date().toISOString();
                    const voiceDescription =
                      typeof o.voiceDescription === 'string' ? o.voiceDescription.trim() : undefined;
                    if (!id || !name || !relativePath) return null;
                    return {
                      id,
                      name,
                      relativePath,
                      createdAt,
                      ...(voiceDescription ? { voiceDescription } : {}),
                    };
                  })
                  .filter((x): x is NonNullable<typeof x> => x != null)
              : [];
            const row: AISettings['audiobook'] = {};
            if (presetRoot) row.presetVoiceSamplesRootDir = presetRoot;
            if (customRoot) row.customVoiceSamplesRootDir = customRoot;
            if (defaultTtsModelKey) row.defaultTtsModelKey = defaultTtsModelKey;
            if (savedVoiceSamples.length > 0) row.savedVoiceSamples = savedVoiceSamples;
            return Object.keys(row).length > 0 ? row : undefined;
          })()
        : undefined,
    };
  } catch {
    return null;
  }
}

function saveToLocalStorage(data: AISettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[settingsStorage] localStorage 写入失败', e);
  }
}

/** 是否使用 Electron 存储（有 window.yiman.settings） */
export function hasElectronSettings(): boolean {
  return !!(typeof window !== 'undefined' && window.yiman?.settings?.get && window.yiman?.settings?.save);
}

function applyModelCapabilityMigration(data: AISettings): AISettings {
  const { models, changed } = migrateModelsCapabilityKeys(data.models ?? []);
  if (!changed) return data;
  return { ...data, models };
}

/** 获取 AI 设置 */
export async function getAISettings(): Promise<AISettings | null> {
  if (hasElectronSettings()) {
    try {
      const data = await window.yiman!.settings!.get();
      if (!data) return null;
      // 仅内存对齐 capabilityKeys，不在 get 时写盘（避免 load 时自动 save 覆盖用户配置）
      return applyModelCapabilityMigration(data);
    } catch (e) {
      console.error('[settingsStorage] Electron get 失败', e);
      return null;
    }
  }
  const data = getFromLocalStorage();
  if (!data) return null;
  return applyModelCapabilityMigration(data);
}

/** 保存 AI 设置 */
export async function saveAISettings(data: AISettings): Promise<{ ok: boolean; error?: string }> {
  if (hasElectronSettings()) {
    try {
      return await window.yiman!.settings!.save(data);
    } catch (e) {
      console.error('[settingsStorage] Electron save 失败', e);
      return { ok: false, error: String(e) };
    }
  }
  saveToLocalStorage(data);
  return { ok: true };
}
