import type { RefIndicatorType } from './types';

/**
 * 将 refIndicator 拼成「用户选择了：…」前缀，供 AIChat `onSubmit` 注册（与 Sender / emitUserMessage 共用）。
 */
export function applyRefIndicatorUserChoicePrefix(
  message: string,
  refIndicator: readonly RefIndicatorType[]
): string {
  const trimmed = (message ?? '').trim();
  if (!refIndicator.length) return trimmed;
  const parts = refIndicator.map((item) =>
    String(item.description ?? '').replace(/%f/g, String(item.content ?? ''))
  );
  const summary = parts.join(' \n');
  return `用户选择了：${summary}\n\n${trimmed}`;
}
