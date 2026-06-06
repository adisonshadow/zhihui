import { restSegmentForLocalSfxModelKey } from '@/types/settings';

const AI_SERVICE_BASE = 'http://127.0.0.1:19815';

export async function postLocalSfxGenerate(params: {
  modelKey: string;
  description: string;
  durationSeconds: number;
}): Promise<Blob> {
  const segment = restSegmentForLocalSfxModelKey(params.modelKey);
  const res = await fetch(`${AI_SERVICE_BASE}/api/v1/sfx/${segment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: params.description.trim(),
      durationSeconds: params.durationSeconds,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const msg =
      typeof (err as { error?: string }).error === 'string' ?
        (err as { error: string }).error
      : `音效生成失败 HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.blob();
}
