/**
 * AI 设置存储：Electron 优先，Web 模式降级到 localStorage
 * 见 docs/配置订阅使用.md
 */
import { type AISettings, migrateLocalTtsConfig } from '@/types/settings';

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
      novelWriter:
        parsed?.novelWriter && typeof parsed.novelWriter === 'object'
          ? {
              coverImageCount:
                typeof parsed.novelWriter.coverImageCount === 'number'
                  ? Math.max(1, Math.min(12, parsed.novelWriter.coverImageCount))
                  : 4,
            }
          : undefined,
      novelBgVideo: typeof parsed?.novelBgVideo === 'string' ? parsed.novelBgVideo : 'bg1.mp4',
      projectBgVideo: typeof parsed?.projectBgVideo === 'string' ? parsed.projectBgVideo : 'bg1.mp4',
      defaultProjectRoot:
        typeof parsed?.defaultProjectRoot === 'string' ? parsed.defaultProjectRoot : undefined,
      canvasAutoFitViewport:
        typeof parsed?.canvasAutoFitViewport === 'boolean' ? parsed.canvasAutoFitViewport : undefined,
      modalMaskBlur: typeof parsed?.modalMaskBlur === 'boolean' ? parsed.modalMaskBlur : undefined,
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

/** 获取 AI 设置 */
export async function getAISettings(): Promise<AISettings | null> {
  if (hasElectronSettings()) {
    try {
      const data = await window.yiman!.settings!.get();
      return data;
    } catch (e) {
      console.error('[settingsStorage] Electron get 失败', e);
      return getFromLocalStorage();
    }
  }
  return getFromLocalStorage();
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
