/**
 * 阿里云百炼：声音复刻 customization API（Qwen3-TTS / CosyVoice）
 * 文档：https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';

const CUSTOMIZATION_URL_CN =
  'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization';

export interface DashscopeEnrollQwenInput {
  apiKey: string;
  targetModel: string;
  preferredName: string;
  audioDataUrl: string;
  referenceText?: string;
  language?: string;
}

export interface DashscopeEnrollCosyInput {
  apiKey: string;
  targetModel: string;
  prefix: string;
  publicAudioUrl: string;
  languageHints?: string[];
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
}

async function postCustomization(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; voiceId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(CUSTOMIZATION_URL_CN, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      output?: { voice?: string; voice_id?: string };
      code?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.message || json.code || `HTTP ${res.status}`,
      };
    }
    const voiceId = (json.output?.voice ?? json.output?.voice_id ?? '').trim();
    if (!voiceId) {
      return { ok: false, error: '复刻响应中未找到 voice / voice_id' };
    }
    return { ok: true, voiceId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Qwen3-TTS：支持 base64 data URL */
export async function enrollQwen3TtsVoice(
  input: DashscopeEnrollQwenInput,
): Promise<{ ok: true; voiceId: string } | { ok: false; error: string }> {
  const audioPayload: Record<string, string> = { data: input.audioDataUrl.trim() };
  const body: Record<string, unknown> = {
    model: 'qwen-voice-enrollment',
    input: {
      action: 'create',
      target_model: input.targetModel.trim(),
      preferred_name: input.preferredName.trim() || 'yiman',
      audio: audioPayload,
    },
  };
  if (input.referenceText?.trim()) {
    (body.input as Record<string, unknown>).text = input.referenceText.trim();
  }
  if (input.language?.trim()) {
    (body.input as Record<string, unknown>).language = input.language.trim();
  }
  return postCustomization(input.apiKey, body);
}

/** CosyVoice 已停用：须公网可访问 URL */
/*
export async function enrollCosyVoice(
  input: DashscopeEnrollCosyInput,
): Promise<{ ok: true; voiceId: string } | { ok: false; error: string }> {
  ...
}
*/

export function resolveDashscopeSynthModel(model: AIModelConfig): string {
  return (resolveRequestModelId(model) ?? model.model ?? '').trim();
}

export function isCosyVoiceModelId(modelId: string): boolean {
  return modelId.toLowerCase().includes('cosyvoice');
}

export function isQwen3TtsModelId(modelId: string): boolean {
  const s = modelId.toLowerCase();
  return s.includes('qwen') && s.includes('tts');
}
