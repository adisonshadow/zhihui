/**
 * MiniMax 音色设计：POST /v1/voice_design
 * 文档：https://platform.minimaxi.com/docs/api-reference/voice-design-design
 */
import type { AIModelConfig } from '@/types/settings';
import {
  decodeMinimaxHexAudio,
  minimaxApiBase,
  minimaxGroupIdFromModel,
  normalizeMinimaxApiKey,
} from '@/components/tts/providers/minimaxApiUtils';

export type MinimaxVoiceDesignResult =
  | {
      ok: true;
      voiceId: string;
      previewArrayBuffer: ArrayBuffer;
      /** 试听音频格式，默认 mp3 */
      responseFormat: string;
    }
  | { ok: false; error: string };

type VoiceDesignJson = {
  voice_id?: string;
  trial_audio?: string;
  base_resp?: { status_code?: number; status_msg?: string };
};

export async function createMinimaxVoiceDesign(params: {
  model: AIModelConfig;
  prompt: string;
  previewText: string;
  /** 可选自定义 voice_id；不传则由平台生成 */
  voiceId?: string;
  aigcWatermark?: boolean;
}): Promise<MinimaxVoiceDesignResult> {
  const prompt = params.prompt.trim();
  const previewText = params.previewText.trim();
  if (!prompt) return { ok: false, error: '音色描述不能为空' };
  if (!previewText) return { ok: false, error: '试听文本不能为空' };
  if (previewText.length > 500) {
    return { ok: false, error: 'MiniMax 试听文本不能超过 500 字' };
  }

  const apiKey = normalizeMinimaxApiKey(params.model.apiKey ?? '');
  if (!apiKey) return { ok: false, error: '缺少 MiniMax API Key' };

  let groupId: string;
  try {
    groupId = minimaxGroupIdFromModel(params.model);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const body: Record<string, unknown> = {
    prompt,
    preview_text: previewText,
    aigc_watermark: params.aigcWatermark === true,
  };
  const customVoiceId = params.voiceId?.trim();
  if (customVoiceId) body.voice_id = customVoiceId;

  const url = `${minimaxApiBase(params.model)}/voice_design?GroupId=${encodeURIComponent(groupId)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as VoiceDesignJson;
    const code = json.base_resp?.status_code;
    if (code !== undefined && code !== 0) {
      return { ok: false, error: json.base_resp?.status_msg ?? `MiniMax 音色设计错误码 ${code}` };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const voiceId = (json.voice_id ?? '').trim();
    if (!voiceId) {
      return { ok: false, error: 'MiniMax 音色设计响应缺少 voice_id' };
    }

    const hex = (json.trial_audio ?? '').trim();
    const previewArrayBuffer = decodeMinimaxHexAudio(hex);
    if (!previewArrayBuffer) {
      return { ok: false, error: 'MiniMax 音色设计响应中试听音频无效（trial_audio hex）' };
    }

    return { ok: true, voiceId, previewArrayBuffer, responseFormat: 'mp3' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
