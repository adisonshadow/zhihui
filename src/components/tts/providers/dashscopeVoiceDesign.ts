/**
 * 阿里云百炼：声音设计 customization API（Qwen；CosyVoice 已停用）
 * 文档：https://help.aliyun.com/zh/model-studio/voice-design-api-references
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveDashscopeSynthModel } from '@/components/tts/providers/dashscopeVoiceEnrollment';

const CUSTOMIZATION_URL_CN =
  'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization';

export type DashscopeVoiceDesignResult =
  | {
      ok: true;
      voiceId: string;
      targetModel: string;
      previewArrayBuffer: ArrayBuffer;
      responseFormat: string;
    }
  | { ok: false; error: string };

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
}

function decodeBase64Audio(data: string): ArrayBuffer | null {
  const raw = data.trim();
  if (!raw) return null;
  try {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

type CustomizationJson = {
  output?: {
    voice?: string;
    voice_id?: string;
    target_model?: string;
    preview_audio?: {
      data?: string;
      response_format?: string;
    };
  };
  code?: string;
  message?: string;
};

async function postVoiceDesign(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<DashscopeVoiceDesignResult> {
  try {
    const res = await fetch(CUSTOMIZATION_URL_CN, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CustomizationJson;
    if (!res.ok) {
      return { ok: false, error: json.message || json.code || `HTTP ${res.status}` };
    }
    const voiceId = (json.output?.voice ?? json.output?.voice_id ?? '').trim();
    if (!voiceId) {
      return { ok: false, error: '声音设计响应中未找到 voice / voice_id' };
    }
    const b64 = json.output?.preview_audio?.data?.trim() ?? '';
    const previewArrayBuffer = decodeBase64Audio(b64);
    if (!previewArrayBuffer) {
      return { ok: false, error: '声音设计响应中预览音频无效' };
    }
    const responseFormat = json.output?.preview_audio?.response_format?.trim() || 'wav';
    const targetModel = json.output?.target_model?.trim() || '';
    return { ok: true, voiceId, targetModel, previewArrayBuffer, responseFormat };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Qwen 声音设计：model=qwen-voice-design */
export async function createQwenVoiceDesign(input: {
  apiKey: string;
  targetModel: string;
  voicePrompt: string;
  previewText: string;
  preferredName?: string;
  language?: string;
}): Promise<DashscopeVoiceDesignResult> {
  const body: Record<string, unknown> = {
    model: 'qwen-voice-design',
    input: {
      action: 'create',
      target_model: input.targetModel.trim(),
      preferred_name: (input.preferredName?.trim() || 'yiman').slice(0, 16),
      voice_prompt: input.voicePrompt.trim(),
      preview_text: input.previewText.trim(),
      language: input.language?.trim() || 'zh',
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'wav',
    },
  };
  return postVoiceDesign(input.apiKey, body);
}

/** CosyVoice 声音设计已停用 */
// export async function createCosyVoiceDesign(...) { ... }

export function resolveDashscopeVoiceDesignTargetModel(model: AIModelConfig): string {
  return resolveDashscopeSynthModel(model);
}

export function isQwenVoiceDesignModelId(modelId: string): boolean {
  return modelId.toLowerCase().includes('tts-vd');
}

export function inferDashscopeVoiceDesignKind(model: AIModelConfig): 'qwen' | null {
  const slug = resolveDashscopeVoiceDesignTargetModel(model).toLowerCase();
  if (slug.includes('cosyvoice')) return null;
  if (isQwenVoiceDesignModelId(slug)) return 'qwen';
  if ((model.capabilityKeys ?? []).includes('voice_design') && slug.includes('qwen')) return 'qwen';
  return null;
}
