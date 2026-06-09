/**
 * 音色设计 / 音色复制 capability 推断（兼容旧配置未写入新 tag 的模型实例）
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import {
  buildTtsEngineListFromModels,
  type TtsAdapterKind,
  type TtsEngineOption,
} from '@/components/tts/ttsModelAdapters';

const ENROLLMENT_ADAPTER_KINDS: TtsAdapterKind[] = [
  'qwen3_tts_dashscope',
  // 'cosyvoice_dashscope_ws',
  'minimax_t2a_v2',
];

function modelSlug(model: AIModelConfig): string {
  return (resolveRequestModelId(model) ?? model.model ?? '').toLowerCase();
}

function isMimoHost(apiUrl: string): boolean {
  const u = (apiUrl || '').toLowerCase();
  return u.includes('xiaomimimo.com') || u.includes('mimo-v2.com');
}

function apiReady(model: AIModelConfig): boolean {
  if (!(model.apiUrl ?? '').trim()) return false;
  return model.isLocal === true || !!(model.apiKey ?? '').trim();
}

function isMinimaxHost(apiUrl: string): boolean {
  return (apiUrl || '').toLowerCase().includes('minimaxi.com');
}

export function hasVoiceDesignCapability(model: AIModelConfig): boolean {
  if ((model.capabilityKeys ?? []).includes('voice_design')) {
    if (isMimoHost(model.apiUrl) || isDashscopeHost(model.apiUrl) || isMinimaxHost(model.apiUrl)) {
      return true;
    }
  }
  if (isMimoHost(model.apiUrl) && modelSlug(model).includes('voicedesign')) return true;
  if (isDashscopeHost(model.apiUrl)) {
    const slug = modelSlug(model);
    if (slug.includes('tts-vd')) return true;
  }
  return false;
}

export function hasVoiceEnrollmentCapability(model: AIModelConfig): boolean {
  if (hasMimoVoiceCloneCapability(model)) return true;

  const e = buildTtsEngineListFromModels([model])[0];
  if (!e || !ENROLLMENT_ADAPTER_KINDS.includes(e.adapterKind)) return false;

  if ((model.capabilityKeys ?? []).includes('voice_enrollment')) return true;

  const slug = modelSlug(model);
  // Qwen：仅 tts-vc 独立复刻模型（flash / instruct 仅合成，不可 enrollment）
  if (e.adapterKind === 'qwen3_tts_dashscope' && isDashscopeHost(model.apiUrl)) {
    return slug.includes('tts-vc');
  }
  // MiniMax Speech：同一模型承担 voice_clone API
  if (e.adapterKind === 'minimax_t2a_v2' && isMinimaxHost(model.apiUrl)) {
    return (model.capabilityKeys ?? []).includes('voice_over');
  }
  return false;
}

/** MiMo 音色复制：上传样本内联克隆，无云端 voice_id */
export function hasMimoVoiceCloneCapability(model: AIModelConfig): boolean {
  if (!isMimoHost(model.apiUrl)) return false;
  return modelSlug(model).includes('voiceclone');
}

export function isMimoVoiceCloneEngine(engine: TtsEngineOption): boolean {
  if (engine.adapterKind !== 'xiaomi_mimo_chat_audio' || !engine.modelConfig) return false;
  return modelSlug(engine.modelConfig).includes('voiceclone');
}

function isDashscopeHost(apiUrl: string): boolean {
  const u = (apiUrl || '').toLowerCase();
  return u.includes('dashscope.aliyuncs.com') || u.includes('dashscope-intl.aliyuncs.com');
}

export function isMimoVoiceDesignEngine(engine: TtsEngineOption): boolean {
  if (engine.adapterKind !== 'xiaomi_mimo_chat_audio' || !engine.modelConfig) return false;
  return hasVoiceDesignCapability(engine.modelConfig);
}

export function isDashscopeVoiceDesignEngine(engine: TtsEngineOption): boolean {
  if (!engine.modelConfig) return false;
  if (engine.adapterKind !== 'qwen3_tts_dashscope') return false;
  return hasVoiceDesignCapability(engine.modelConfig);
}

export function isMinimaxVoiceDesignEngine(engine: TtsEngineOption): boolean {
  if (!engine.modelConfig) return false;
  if (engine.adapterKind !== 'minimax_t2a_v2') return false;
  return hasVoiceDesignCapability(engine.modelConfig);
}

/** Qwen3-TTS Instruct 合成：可通过 instructions 传入风格指令（qwen3-tts-flash 不支持） */
export function isQwen3TtsInstructModel(model: AIModelConfig): boolean {
  const slug = modelSlug(model);
  return slug.includes('tts') && slug.includes('instruct');
}

export function isQwen3TtsInstructEngine(engine: TtsEngineOption): boolean {
  if (!engine.modelConfig) return false;
  if (engine.adapterKind !== 'qwen3_tts_dashscope') return false;
  return isQwen3TtsInstructModel(engine.modelConfig);
}

/** 音色设计：MiMo / Qwen / MiniMax（CosyVoice 已停用） */
export function findVoiceDesignEngines(models: AIModelConfig[] | undefined): TtsEngineOption[] {
  const out: TtsEngineOption[] = [];
  for (const m of models ?? []) {
    if (!hasVoiceDesignCapability(m) || !apiReady(m)) continue;
    const slug = modelSlug(m);
    if (slug.includes('cosyvoice')) continue;
    const e = buildTtsEngineListFromModels([m])[0];
    if (!e) continue;
    if (isMimoHost(m.apiUrl) && e.adapterKind === 'xiaomi_mimo_chat_audio') {
      out.push(e);
      continue;
    }
    if (e.adapterKind === 'qwen3_tts_dashscope') {
      out.push(e);
      continue;
    }
    if (e.adapterKind === 'minimax_t2a_v2' && isMinimaxHost(m.apiUrl)) {
      out.push(e);
    }
  }
  out.sort((a, b) => {
    const sa = modelSlug(a.modelConfig!);
    const sb = modelSlug(b.modelConfig!);
    return sa.localeCompare(sb);
  });
  return out;
}

/** 音色复制：云端 enrollment + MiMo voiceclone */
export function findVoiceEnrollmentEngines(models: AIModelConfig[] | undefined): TtsEngineOption[] {
  const out: TtsEngineOption[] = [];
  const seen = new Set<string>();
  const add = (e: TtsEngineOption | undefined) => {
    if (!e || seen.has(e.engineId)) return;
    seen.add(e.engineId);
    out.push(e);
  };

  for (const m of models ?? []) {
    if (!apiReady(m)) continue;
    if (modelSlug(m).includes('cosyvoice')) continue;
    const e = buildTtsEngineListFromModels([m])[0];
    if (!e) continue;
    if (hasMimoVoiceCloneCapability(m)) {
      add(e);
      continue;
    }
    if (!hasVoiceEnrollmentCapability(m)) continue;
    if (ENROLLMENT_ADAPTER_KINDS.includes(e.adapterKind)) add(e);
  }
  return out;
}

export function findMimoVoiceDesignEngine(
  models: AIModelConfig[] | undefined,
): TtsEngineOption | undefined {
  return findVoiceDesignEngines(models)[0];
}
