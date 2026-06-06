import { findBalancedJsonSlice } from '@/components/AIChat/utils/balancedJsonSlice';

/** 与本地 `generate_images` handler 返回体一致、模型常复读进 assistant 正文的结构（避免与 tool 气泡双次出图） */
export function isOrchestratorEchoedGenerateImagesResultJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (!Array.isArray(o.images) || o.images.length === 0) return false;
  return o.images.every((x) => typeof x === 'string');
}

/**
 * 从主 Agent assistant 正文中去掉复读的 tool 结果 JSON（含 ```json fenced 与内嵌 `{...}`）。
 */
export function stripOrchestratorEchoedGenerateImagesJson(markdown: string): string {
  let s = markdown;
  const fenceMatches = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let mi = fenceMatches.length - 1; mi >= 0; mi--) {
    const m = fenceMatches[mi];
    const inner = m[1]?.trim();
    if (!inner?.startsWith('{')) continue;
    try {
      const p = JSON.parse(inner) as unknown;
      if (!isOrchestratorEchoedGenerateImagesResultJson(p)) continue;
      const start = m.index ?? 0;
      s = `${s.slice(0, start)}\n${s.slice(start + m[0].length)}`;
    } catch {
      /* skip */
    }
  }

  let guard = 0;
  while (guard++ < 32) {
    let removed = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{') continue;
      const hit = findBalancedJsonSlice(s, i);
      if (!hit) continue;
      try {
        const p = JSON.parse(hit.slice) as unknown;
        if (isOrchestratorEchoedGenerateImagesResultJson(p)) {
          s = `${s.slice(0, i)} ${s.slice(hit.end + 1)}`;
          removed = true;
          break;
        }
      } catch {
        /* skip */
      }
    }
    if (!removed) break;
  }

  return s.replace(/\n{3,}/g, '\n\n').trimEnd();
}
