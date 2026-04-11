/**
 * 按模型 / 端点选择 Images 类 Provider；新增厂商时在 providers 下加扩展类并在此注册。
 */
import type { AIModelConfig } from '@/types/settings';
import OpenAIImagesProvider from './OpenAIImagesProvider';
import VolcArkSeedreamImagesProvider from './VolcArkSeedreamImagesProvider';

/** 是否走火山方舟 Seedream 扩展（doubao-seedream 等） */
export function looksLikeVolcArkSeedream(modelConfig: AIModelConfig | null): boolean {
  if (!modelConfig) return false;
  const u = (modelConfig.apiUrl ?? '').toLowerCase();
  if (u.includes('volces.com') || u.includes('volcengine')) return true;
  const m = (modelConfig.model ?? '').toLowerCase();
  return m.includes('seedream') || m.includes('doubao');
}

export function createImagesGenerationProvider(modelConfig: AIModelConfig | null): OpenAIImagesProvider {
  if (looksLikeVolcArkSeedream(modelConfig)) {
    return new VolcArkSeedreamImagesProvider(modelConfig);
  }
  return new OpenAIImagesProvider(modelConfig);
}
