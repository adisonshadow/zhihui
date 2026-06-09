/**
 * Qwen3-TTS 非流式 HTTP 合成
 * POST /api/v1/services/aigc/multimodal-generation/generation
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';

const GENERATION_URL_CN =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

export async function synthesizeQwen3Tts(params: {
  model: AIModelConfig;
  text: string;
  voiceId: string;
  languageType?: string;
  /** qwen3-tts-instruct-flash：人声风格指令 */
  instructions?: string;
}): Promise<{ ok: true; arrayBuffer: ArrayBuffer; ext: string } | { ok: false; error: string }> {
  const apiKey = (params.model.apiKey ?? '').trim();
  if (!apiKey) return { ok: false, error: '缺少 DashScope API Key' };

  const modelId = (resolveRequestModelId(params.model) ?? 'qwen3-tts-flash').trim();
  const text = params.text.trim();
  if (!text) return { ok: false, error: '文本为空' };
  const voice = params.voiceId.trim();
  if (!voice) return { ok: false, error: '缺少 voice 参数' };
  const instructions = params.instructions?.trim();

  try {
    const res = await fetch(GENERATION_URL_CN, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: {
          text,
          voice,
          language_type: params.languageType?.trim() || 'Chinese',
          ...(instructions ? { instructions } : {}),
        },
        parameters: {
          stream: false,
        },
      }),
    });

    const json = (await res.json()) as {
      output?: { audio?: { url?: string; data?: string } };
      code?: string;
      message?: string;
    };

    if (!res.ok) {
      return { ok: false, error: json.message || json.code || `HTTP ${res.status}` };
    }

    const audioUrl = json.output?.audio?.url?.trim();
    if (audioUrl) {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return { ok: false, error: `下载合成音频失败 HTTP ${audioRes.status}` };
      }
      const buf = await audioRes.arrayBuffer();
      const ext = audioUrl.includes('.wav') ? '.wav' : '.mp3';
      return { ok: true, arrayBuffer: buf, ext };
    }

    const b64 = json.output?.audio?.data?.trim();
    if (b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { ok: true, arrayBuffer: bytes.buffer, ext: '.wav' };
    }

    return { ok: false, error: 'Qwen3-TTS 响应中未找到 audio.url 或 audio.data' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
