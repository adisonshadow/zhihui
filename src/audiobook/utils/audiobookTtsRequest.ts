/** 与 LocalTtsPreview 一致：直连 AI 服务；请求体经 localTtsSynthesisAdapter 按模型组装 */
import { buildLocalTtsSynthesisJsonBody, type LocalTtsSynthesisInput } from '@/novelDesign/utils/localTtsSynthesisAdapter';
import { parseTtsApiError } from '@/novelDesign/utils/parseTtsApiError';

const AI_SERVICE_BASE = 'http://127.0.0.1:19815';

export type PostLocalTtsParams = LocalTtsSynthesisInput & {
  restSegment: string;
  /** 与 `AISettings.localTts.modelKey` / 工作台所选一致 */
  modelKey: string;
};

export async function postLocalTtsSynthesis(params: PostLocalTtsParams): Promise<Blob> {
  const body = buildLocalTtsSynthesisJsonBody(params.modelKey, {
    text: params.text,
    speed: params.speed ?? 1,
    referenceAudioPath: params.referenceAudioPath,
    referenceText: params.referenceText,
  });
  const res = await fetch(`${AI_SERVICE_BASE}/api/v1/tts/${params.restSegment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(parseTtsApiError((err as { error?: string }).error, `TTS HTTP ${res.status}`));
  }
  return res.blob();
}

/** @deprecated 使用 {@link postLocalTtsSynthesis} 并传入 modelKey */
export async function postLocalTtsWithOptionalReference(params: {
  restSegment: string;
  text: string;
  speed?: number;
  referenceAudioPath?: string;
}): Promise<Blob> {
  return postLocalTtsSynthesis({
    ...params,
    modelKey: 'longcat_audio_dit',
    speed: params.speed ?? 1,
  });
}
