import { findBalancedJsonSlice } from '@/components/AIChat/utils/balancedJsonSlice';

/** 与本地 `generate_video` handler 成功体一致、模型复述进正文时用于去重 */
export function isOrchestratorEchoedGenerateVideoResultJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  if (o.ok !== true) return false;
  return typeof o.video === 'string' && o.video.trim().length > 0;
}

/** 去掉 assistant 正文里复读的 generate_video JSON（含 fenced 与内嵌 `{...}`） */
export function stripOrchestratorEchoedGenerateVideoJson(markdown: string): string {
  let s = markdown;
  const fenceMatches = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let mi = fenceMatches.length - 1; mi >= 0; mi--) {
    const m = fenceMatches[mi];
    const inner = m[1]?.trim();
    if (!inner?.startsWith('{')) continue;
    try {
      const p = JSON.parse(inner) as unknown;
      if (!isOrchestratorEchoedGenerateVideoResultJson(p)) continue;
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
        if (isOrchestratorEchoedGenerateVideoResultJson(p)) {
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
