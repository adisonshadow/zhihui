import type { AIModelConfig } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';

/** 阿里云百炼 / DashScope OpenAPI，同一 DASHSCOPE_API_KEY 可复用 */
export const VENDOR_KEY_ALIYUN_DASHSCOPE = 'aliyun_dashscope';

/** DeepSeek 官方 API（https://api.deepseek.com）同一 DEEPSEEK_API_KEY 可复用 */
export const VENDOR_KEY_DEEPSEEK = 'deepseek';

/** 火山引擎 Ark / 豆包（ark.volces、openspeech 等）同一密钥策略下可复用 */
export const VENDOR_KEY_VOLCENGINE_ARK = 'volcengine_ark';

/**
 * 从已保存的模型中查找可复用的 API Key（同 vendorKey，或历史数据仅匹配 dashscope 域名）
 */
export function findReusableApiKeyForPreset(
  models: AIModelConfig[] | undefined,
  preset: ModelPreset
): string | undefined {
  const list = models ?? [];
  const vk = preset.vendorKey;
  if (!vk) return undefined;
  const withKey = (m: AIModelConfig) => Boolean(m.apiKey?.trim());
  const byExact = list.find((m) => withKey(m) && m.vendorKey === vk);
  if (byExact?.apiKey) return byExact.apiKey.trim();
  if (vk === VENDOR_KEY_ALIYUN_DASHSCOPE) {
    const byHost = list.find(
      (m) =>
        withKey(m) &&
        (m.apiUrl?.includes('dashscope.aliyuncs.com') ?? false) &&
        (m.vendorKey == null || m.vendorKey === VENDOR_KEY_ALIYUN_DASHSCOPE)
    );
    if (byHost?.apiKey) return byHost.apiKey.trim();
  }
  if (vk === VENDOR_KEY_DEEPSEEK) {
    const byHost = list.find(
      (m) =>
        withKey(m) &&
        (m.apiUrl?.includes('api.deepseek.com') ?? false) &&
        (m.vendorKey == null || m.vendorKey === VENDOR_KEY_DEEPSEEK)
    );
    if (byHost?.apiKey) return byHost.apiKey.trim();
  }
  if (vk === VENDOR_KEY_VOLCENGINE_ARK) {
    const isVolcArkHost = (url: string) =>
      /volces\.com|openspeech\.bytedance\.com/.test(url);
    const byHost = list.find(
      (m) =>
        withKey(m) &&
        (m.apiUrl != null && isVolcArkHost(m.apiUrl)) &&
        (m.vendorKey == null || m.vendorKey === VENDOR_KEY_VOLCENGINE_ARK)
    );
    if (byHost?.apiKey) return byHost.apiKey.trim();
  }
  return undefined;
}
