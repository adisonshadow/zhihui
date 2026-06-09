/**
 * TTS 引擎与远程模型请求的参数适配（不同供应商字段不同，集中在此扩展）
 * 本地不再内嵌推理；用户通过「设置」中带「生成配音」的模型接入本机或云端服务。
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import type { SceneContentItem } from '@/types/script';
import type { AudioSegment, Pause } from '@/constants/Audiobook';
import {
  buildMimoV25ChatBodyParts,
  coerceMimoApiAudioFormat,
  type MimoV25EffectiveModelId,
} from '@/components/tts/mimoV25TtsBuilder';
import { enrichMimoAssistantText } from '@/components/tts/mimoV25TextEnrich';
import type { Character } from '@/constants/Script';
import {
  ensureRemoteVoiceIdForTts,
  invalidateRemoteVoiceIdCache,
} from '@/components/tts/ensureRemoteVoiceId';
import {
  isRemoteVoiceIdStaleError,
  parseTtsVoiceSourceParams,
} from '@/components/tts/remoteVoiceIdTypes';
import { synthesizeQwen3Tts } from '@/components/tts/providers/qwen3TtsSynthesize';
import { resolveDashscopeSynthModel } from '@/components/tts/providers/dashscopeVoiceEnrollment';
// CosyVoice 已停用，见 cosyVoiceModelUtils.ts
// import { ... } from '@/components/tts/cosyVoiceModelUtils';

/** 历史版本剧本项可能持久化此 id，打开 TTS 时映射到当前首个 voice_over 模型 */
export const LEGACY_LOCAL_MOSS_ENGINE_ID = 'local_moss';

export type TtsAdapterKind =
  | 'openai_audio_speech'
  | 'generic_post_audio'
  | 'xiaomi_mimo_chat_audio'
  | 'minimax_t2a_v2'
  | 'qwen3_tts_dashscope';
  // | 'cosyvoice_dashscope_ws'; // CosyVoice 已停用

export interface TtsEngineOption {
  engineId: string;
  label: string;
  isLocal: boolean;
  modelConfig?: AIModelConfig;
  adapterKind: TtsAdapterKind;
}

function isXiaomiMimoHost(apiUrl: string): boolean {
  const u = (apiUrl || '').toLowerCase();
  return u.includes('xiaomimimo.com') || u.includes('mimo-v2.com');
}

function isMinimaxHost(apiUrl: string): boolean {
  return (apiUrl || '').toLowerCase().includes('minimaxi.com');
}

function isDashscopeHost(apiUrl: string): boolean {
  return (apiUrl || '').toLowerCase().includes('dashscope.aliyuncs.com');
}

/** MiMo：控制台密钥去首尾空白；若用户误把「Bearer xxx」整段粘贴进密钥框则去掉前缀（见平台 OpenAI SDK 与 curl 两种习惯） */
function normalizeMimoApiKey(raw: string): string {
  let k = (raw ?? '').trim();
  if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, '').trim();
  return k;
}

function inferRemoteAdapter(model: AIModelConfig): TtsAdapterKind {
  const u = (model.apiUrl || '').toLowerCase();
  const p = (model.provider || '').toLowerCase();
  const slug = (resolveRequestModelId(model) ?? model.model ?? '').toLowerCase();
  if (isXiaomiMimoHost(model.apiUrl)) return 'xiaomi_mimo_chat_audio';
  /** MiniMax 与 OpenAI 兼容网关均常见 /v1，必须先于「含 /v1 即 OpenAI speech」的启发式判断 */
  if (isMinimaxHost(model.apiUrl)) return 'minimax_t2a_v2';
  if (isDashscopeHost(model.apiUrl) || p.includes('dashscope') || p.includes('alibaba')) {
    // if (slug.includes('cosyvoice')) return 'cosyvoice_dashscope_ws';
    if (slug.includes('qwen') && slug.includes('tts')) return 'qwen3_tts_dashscope';
  }
  if (u.includes('audio/speech')) return 'openai_audio_speech';
  if (u.includes('openai') || p.includes('openai') || u.includes('/v1')) return 'openai_audio_speech';
  return 'generic_post_audio';
}

/** 将 AIModelConfig 映射为 TtsEngineOption（不按 capability 过滤） */
export function buildTtsEngineListFromModels(models: AIModelConfig[]): TtsEngineOption[] {
  return (models ?? []).map((m) => ({
    engineId: m.id,
    label: (m.name?.trim() || resolveRequestModelId(m)?.trim() || m.id) as string,
    isLocal: m.isLocal === true,
    modelConfig: m,
    adapterKind: inferRemoteAdapter(m),
  }));
}

/** 设置中 tag「生成配音」对应 capability key：voice_over */
export function buildVoiceOverEngineList(models: AIModelConfig[]): TtsEngineOption[] {
  return buildTtsEngineListFromModels(models).filter((e) => {
    // CosyVoice 预设已注释，旧配置中的 cosyvoice 实例也不进入配音列表
    const slug = (resolveRequestModelId(e.modelConfig!) ?? '').toLowerCase();
    if (slug.includes('cosyvoice')) return false;
    return (e.modelConfig?.capabilityKeys ?? []).includes('voice_over');
  });
}

export function getEngineById(models: AIModelConfig[], engineId: string): TtsEngineOption | undefined {
  return buildVoiceOverEngineList(models).find((e) => e.engineId === engineId);
}

/** 将持久化的 engineId 解析为当前可用的 voice_over 模型 id（含旧版 local_moss 回退） */
export function resolveVoiceOverEngineId(persisted: string | undefined, models: AIModelConfig[]): string {
  const list = (models ?? []).filter((m) => (m.capabilityKeys ?? []).includes('voice_over'));
  if (list.length === 0) return '';
  if (persisted && persisted !== LEGACY_LOCAL_MOSS_ENGINE_ID && list.some((m) => m.id === persisted)) {
    return persisted;
  }
  return list[0].id;
}

export function defaultParamsForAdapter(
  kind: TtsAdapterKind,
  model?: AIModelConfig,
): Record<string, unknown> {
  switch (kind) {
    case 'xiaomi_mimo_chat_audio':
      /** V2.5 预置兜底「茉莉」（中文知性旁白）；有声书可走克隆自动覆盖 voice */
      return { voice: '茉莉', format: 'mp3', mimoStyleRole: '', ttsTone: '' };
    case 'minimax_t2a_v2':
      /** 与官方示例一致；voice 存 voice_id（见 platform.minimaxi.com speech-t2a-http） */
      return {
        voice: 'male-qn-qingse',
        ttsVoiceSource: 'preset',
        speed: 1,
        vol: 1,
        pitch: 0,
        emotion: 'happy',
        format: 'mp3',
        minimax_sample_rate: 32000,
        minimax_bitrate: 128000,
        minimax_channel: 1,
        subtitle_enable: false,
      };
    case 'qwen3_tts_dashscope':
      return {
        voice: 'Cherry',
        ttsVoiceSource: 'preset',
        qwen_language_type: 'Chinese',
      };
    // case 'cosyvoice_dashscope_ws': { ... } // CosyVoice 已停用
    case 'openai_audio_speech':
      return { speed: 1, voice: 'alloy' };
    case 'generic_post_audio':
    default:
      return { speed: 1, voice: '', extraJson: '' };
  }
}

export function mergeParamsForItem(
  item: SceneContentItem,
  engine: TtsEngineOption,
  characters: { id: string; tts_voice?: string | null; tts_speed?: number | null }[]
): Record<string, unknown> {
  const defaults = defaultParamsForAdapter(engine.adapterKind, engine.modelConfig);
  const saved = item.tts?.engineId === engine.engineId && item.tts.params ? { ...item.tts.params } : {};
  const merged = { ...defaults, ...saved };
  if (item.type === 'dialogue' && item.speaker) {
    const ch = characters.find((c) => c.id === item.speaker);
    if (typeof ch?.tts_speed === 'number' && !Number.isNaN(ch.tts_speed)) {
      if (engine.adapterKind === 'openai_audio_speech' || engine.adapterKind === 'minimax_t2a_v2') {
        merged.speed = ch.tts_speed;
      }
    }
    if (ch?.tts_voice) {
      if (engine.adapterKind === 'xiaomi_mimo_chat_audio' && !(typeof merged.voice === 'string' && merged.voice.trim())) {
        merged.voice = ch.tts_voice;
      }
      if (engine.adapterKind === 'openai_audio_speech' && !(typeof merged.voice === 'string' && merged.voice.trim())) {
        merged.voice = ch.tts_voice;
      }
      if (engine.adapterKind === 'generic_post_audio' && !(typeof merged.voice === 'string' && merged.voice.trim())) {
        merged.voice = ch.tts_voice;
      }
      if (engine.adapterKind === 'minimax_t2a_v2' && !(typeof merged.voice === 'string' && merged.voice.trim())) {
        merged.voice = ch.tts_voice;
      }
    }
  }
  if (item.emotion) {
    merged.emotion = item.emotion;
  }
  if (engine.adapterKind === 'xiaomi_mimo_chat_audio') {
    let roleHint = '';
    if (typeof merged.mimoStyleRole === 'string' && merged.mimoStyleRole.trim()) {
      roleHint = merged.mimoStyleRole.trim();
    } else if (item.type === 'narration') {
      roleHint = item.narratorType ?? '全知';
    } else if (item.type === 'dialogue' && item.speaker) {
      roleHint = characters.find((c) => c.id === item.speaker)?.name?.trim() ?? '';
    }
    if (!(typeof merged.mimoStyleRole === 'string' && merged.mimoStyleRole.trim()) && roleHint) {
      merged.mimoStyleRole = roleHint;
    }
    if (!(typeof merged.ttsTone === 'string' && merged.ttsTone.trim()) && merged.mimoStyleRole) {
      merged.ttsTone = String(merged.mimoStyleRole);
    }
  }
  return merged;
}

export function buildOpenAiSpeechRequest(
  model: AIModelConfig,
  text: string,
  params: Record<string, unknown>
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const base = model.apiUrl.trim().replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/audio/speech` : `${base}/v1/audio/speech`;
  const voice = typeof params.voice === 'string' && params.voice ? params.voice : 'alloy';
  const speed = typeof params.speed === 'number' && params.speed > 0 ? params.speed : 1;
  const responseFormat =
    typeof params.response_format === 'string' && params.response_format.trim()
      ? params.response_format.trim()
      : 'mp3';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!model.isLocal && (model.apiKey ?? '').trim()) {
    headers.Authorization = `Bearer ${model.apiKey.trim()}`;
  }
  return {
    url,
    headers,
    body: {
      model: (resolveRequestModelId(model) || 'tts-1').trim(),
      input: text,
      voice,
      speed,
      response_format: responseFormat,
    },
  };
}

function hexStringToArrayBuffer(hex: string): ArrayBuffer {
  const h = hex.trim().replace(/\s/g, '').replace(/^0x/i, '');
  if (h.length % 2 !== 0) throw new Error('无效的 hex 音频数据');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) {
    out[i / 2] = parseInt(h.slice(i, i + 2), 16);
  }
  return out.buffer;
}

/**
 * MiniMax 同步语音合成 HTTP（非流式）
 * 文档：https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
 */
export function buildMinimaxT2aV2Request(
  model: AIModelConfig,
  text: string,
  params: Record<string, unknown>
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const base = model.apiUrl.trim().replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/t2a_v2` : `${base}/v1/t2a_v2`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = model.isLocal ? '' : normalizeMimoApiKey(model.apiKey);
  if (key) headers.Authorization = `Bearer ${key}`;

  const voiceId =
    (typeof params.voice === 'string' && params.voice.trim()) || 'male-qn-qingse';
  const speed = typeof params.speed === 'number' && params.speed > 0 ? params.speed : 1;
  const vol = typeof params.vol === 'number' && params.vol > 0 ? params.vol : 1;
  const pitch = typeof params.pitch === 'number' && !Number.isNaN(params.pitch) ? params.pitch : 0;
  const emotion =
    typeof params.emotion === 'string' && params.emotion.trim() ? params.emotion.trim() : 'happy';
  const sampleRate =
    typeof params.minimax_sample_rate === 'number' ? params.minimax_sample_rate : 32000;
  const bitrate = typeof params.minimax_bitrate === 'number' ? params.minimax_bitrate : 128000;
  const channel = typeof params.minimax_channel === 'number' ? params.minimax_channel : 1;
  const fmt =
    typeof params.format === 'string' && ['mp3', 'wav', 'pcm'].includes(params.format)
      ? params.format
      : 'mp3';

  const toneRaw = params.minimax_tone_dict;
  let pronunciation_dict: { tone?: string[] } | undefined;
  if (Array.isArray(toneRaw) && toneRaw.every((x) => typeof x === 'string')) {
    pronunciation_dict = { tone: toneRaw as string[] };
  } else if (typeof toneRaw === 'string' && toneRaw.trim()) {
    const trimmed = toneRaw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const j = JSON.parse(trimmed) as { tone?: string[] };
        if (j?.tone && Array.isArray(j.tone)) pronunciation_dict = { tone: j.tone };
      } catch {
        /* ignore */
      }
    } else {
      const lines = trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length) pronunciation_dict = { tone: lines };
    }
  }

  const body: Record<string, unknown> = {
    model: (resolveRequestModelId(model) || 'speech-2.8-hd').trim(),
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol,
      pitch,
      emotion,
    },
    audio_setting: {
      sample_rate: sampleRate,
      bitrate,
      format: fmt,
      channel,
    },
    subtitle_enable: params.subtitle_enable === true,
  };
  if (pronunciation_dict?.tone?.length) body.pronunciation_dict = pronunciation_dict;

  return { url, headers, body };
}

function parseMinimaxT2aJson(
  json: unknown
): { ok: true; hex: string; format: string } | { ok: false; error: string } {
  const root = json as {
    data?: { audio?: string; status?: number };
    base_resp?: { status_code?: number; status_msg?: string };
    extra_info?: { audio_format?: string };
  };
  const code = root.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    return { ok: false, error: root.base_resp?.status_msg ?? `MiniMax 错误码 ${code}` };
  }
  const st = root.data?.status;
  if (st !== undefined && st !== 2) {
    return { ok: false, error: st === 1 ? '语音合成进行中（非流式应返回已完成）' : `data.status=${String(st)}` };
  }
  const hex = root.data?.audio;
  if (typeof hex !== 'string' || !hex.trim()) {
    return { ok: false, error: '响应中未找到 data.audio（hex）' };
  }
  const fmt = typeof root.extra_info?.audio_format === 'string' ? root.extra_info.audio_format : 'mp3';
  return { ok: true, hex: hex.trim(), format: fmt };
}

/** @deprecated MiMo V2.5 改用音频标签，`style` 仅兼容旧会话 */
export function buildMimoStylePrefixFromParams(params: Record<string, unknown>): string {
  const role = typeof params.mimoStyleRole === 'string' ? params.mimoStyleRole.trim() : '';
  const emo = typeof params.emotion === 'string' ? params.emotion.trim() : '';
  const parts = [role, emo].filter(Boolean);
  if (parts.length === 0) return '';
  return `<style>${parts.join(' ')}</style>`;
}

/** V2.5 assistant 正文：默认自动补上整体风格前缀等；有声书可走 mimoPreformattedAssistant */
export function buildMimoAssistantContentForTts(text: string, params: Record<string, unknown>): string {
  if (params.mimoPreformattedAssistant === true) return (text ?? '').trim();

  const eff =
    typeof params.mimoEffectiveModelId === 'string' ? params.mimoEffectiveModelId.trim().toLowerCase() : '';
  const audioTagSupported =
    eff !== 'mimo-v2.5-tts-voicedesign' && params.mimoAudioTagSupported !== false;

  const toneRaw =
    typeof params.ttsTone === 'string' && params.ttsTone.trim() ?
      params.ttsTone.trim()
    : typeof params.mimoStyleRole === 'string' ?
      params.mimoStyleRole.trim()
    : undefined;
  const speedMul =
    typeof params.voice_speed_for_enrich_hint === 'number' && !Number.isNaN(params.voice_speed_for_enrich_hint) ?
      params.voice_speed_for_enrich_hint
    : undefined;
  const tone =
    speedMul ?
      `${toneRaw ?? ''}${toneRaw?.trim() ? ' ' : ''}语速约×${speedMul.toFixed(2)}`
    : toneRaw;

  const emotion = typeof params.emotion === 'string' ? params.emotion.trim() : undefined;
  const pausesRaw = params.mimoPauses ?? params.pauses;
  const pauses =
    Array.isArray(pausesRaw) ? (pausesRaw.filter(Boolean) as Pause[]) : undefined;

  return enrichMimoAssistantText({
    rawText: text ?? '',
    tone,
    emotion,
    pauses,
    audioTagSupported,
    autoOverallStyle: params.mimoSkipAutoOverallStyle !== true,
  }).text;
}

/**
 * MiMo V2.5：POST /v1/chat/completions；user=导演模式/音色描述；assistant=带标签的合成文本；
 * V2「不得使用 role=system」的旧约束仍适用。
 */
export function buildXiaomiMimoChatTtsRequest(
  model: AIModelConfig,
  text: string,
  params: Record<string, unknown>
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const base = model.apiUrl.trim().replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const p = { ...params };
  if (typeof p.mimoSystemPrompt === 'string' && p.mimoSystemPrompt.trim()) {
    /** 极少数旧配置：并入导演块前缀 */
    const prev = typeof p.mimoDirectorUserContent === 'string' ? p.mimoDirectorUserContent.trim() : '';
    const blk =
      prev ? `${prev}\n\n【补充】${p.mimoSystemPrompt.trim()}` : p.mimoSystemPrompt.trim();
    p.mimoDirectorUserContent = blk;
  }

  const assistantContent =
    typeof text === 'string' && p.mimoPreformattedAssistant === true ?
      text.trim()
    : buildMimoAssistantContentForTts(text ?? '', p);

  const effParam =
    typeof p.mimoEffectiveModelId === 'string' && p.mimoEffectiveModelId.trim() ?
      p.mimoEffectiveModelId.trim()
    : '';

  const bodyParts = buildMimoV25ChatBodyParts({
    modelFromSettings: model,
    assistantContentEnriched: assistantContent,
    params: p,
    segment: typeof p.mimoSegment === 'object' && p.mimoSegment ? (p.mimoSegment as AudioSegment) : undefined,
    scriptCharacter:
      typeof p.mimoScriptCharacter === 'object' && p.mimoScriptCharacter !== null ?
        (p.mimoScriptCharacter as Character)
      : null,
    effectiveModelId:
      effParam === 'mimo-v2.5-tts-voiceclone' ||
      effParam === 'mimo-v2.5-tts-voicedesign' ||
      effParam === 'mimo-v2.5-tts' ?
        (effParam as MimoV25EffectiveModelId)
      : undefined,
    presetVoiceFallback:
      typeof p.mimoPresetVoiceFallback === 'string' ?
        p.mimoPresetVoiceFallback.trim() || undefined
      : undefined,
    voiceCloneDataUrl:
      typeof p.mimoVoiceCloneDataUrl === 'string' ? p.mimoVoiceCloneDataUrl.trim() : undefined,
    voiceDesignPrompt:
      typeof p.mimoVoiceDesignPrompt === 'string' ? p.mimoVoiceDesignPrompt.trim() : undefined,
  });

  const key = model.isLocal ? '' : normalizeMimoApiKey(model.apiKey);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['api-key'] = key;
  }

  return {
    url,
    headers,
    body: {
      model: bodyParts.model,
      messages: bodyParts.messages,
      audio: bodyParts.audio,
    },
  };
}

function extFromAudioFormat(format: string): string {
  const f = (format ?? '').trim().toLowerCase();
  if (f === 'wav') return '.wav';
  if (f === 'pcm' || f === 'pcm16') return `.${f === 'pcm16' ? 'pcm16' : 'pcm'}`;
  return '.mp3';
}

function parseMimoTtsResponseJson(json: unknown): { ok: true; base64: string; ext: string } | { ok: false; error: string } {
  const root = json as {
    choices?: Array<{ message?: { audio?: { data?: string; format?: string } } }>;
  };
  const data = root?.choices?.[0]?.message?.audio?.data;
  if (typeof data !== 'string' || !data.trim()) {
    return { ok: false, error: 'MiMo 响应中未找到 choices[0].message.audio.data' };
  }
  const fmt = root?.choices?.[0]?.message?.audio?.format;
  const ext =
    typeof fmt === 'string' && fmt.trim() ? `.${fmt.trim().replace(/^\./, '')}` : '.mp3';
  return { ok: true, base64: data.trim(), ext };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** 通用 POST：向配置的 apiUrl 发 JSON，期望返回 audio/* 或 application/octet-stream */
export function buildGenericTtsPost(
  model: AIModelConfig,
  text: string,
  params: Record<string, unknown>
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  let extra: Record<string, unknown> = {};
  const raw = params.extraJson;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      extra = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      extra = {};
    }
  }
  const url = model.apiUrl.trim().replace(/\/$/, '');
  return {
    url,
    headers: {
      Authorization: !model.isLocal && model.apiKey ? `Bearer ${model.apiKey}` : '',
      'Content-Type': 'application/json',
    },
    body: {
      model: resolveRequestModelId(model) ?? model.model,
      text,
      input: text,
      voice: params.voice,
      speed: params.speed,
      ...extra,
    },
  };
}

function extFromContentType(ct: string): string {
  const c = (ct || '').toLowerCase();
  if (c.includes('wav')) return '.wav';
  if (c.includes('mpeg') || c.includes('mp3')) return '.mp3';
  if (c.includes('ogg')) return '.ogg';
  if (c.includes('opus')) return '.opus';
  return '.bin';
}

export async function fetchRemoteTtsAudio(
  engine: TtsEngineOption,
  text: string,
  params: Record<string, unknown>
): Promise<{ ok: true; arrayBuffer: ArrayBuffer; ext: string } | { ok: false; error: string }> {
  if (!engine.modelConfig) return { ok: false, error: '模型配置缺失' };

  const voiceCloneKinds: TtsAdapterKind[] = [
    'minimax_t2a_v2',
    'qwen3_tts_dashscope',
    // 'cosyvoice_dashscope_ws',
  ];
  if (!voiceCloneKinds.includes(engine.adapterKind)) {
    return fetchRemoteTtsAudioOnce(engine, text, params);
  }

  const vs = parseTtsVoiceSourceParams(params);
  const canInvalidateOnFail = vs.source === 'clone_from_file' || vs.source === 'clone_from_url';

  for (let attempt = 0; attempt < 2; attempt++) {
    const ensured = await ensureRemoteVoiceIdForTts({
      adapterKind: engine.adapterKind,
      model: engine.modelConfig,
      ttsParams: params,
      previewText: text.slice(0, 120),
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error };
    }
    const synthParams = { ...params, voice: ensured.voiceId };
    const result = await fetchRemoteTtsAudioOnce(engine, text, synthParams);
    if (result.ok) return result;
    const shouldRetry =
      attempt === 0 &&
      canInvalidateOnFail &&
      (isRemoteVoiceIdStaleError(result.error) || ensured.fromCache);
    if (shouldRetry) {
      await invalidateRemoteVoiceIdCache({
        adapterKind: engine.adapterKind,
        model: engine.modelConfig,
        ttsParams: params,
      });
      continue;
    }
    return result;
  }
  return { ok: false, error: '合成失败' };
}

async function fetchRemoteTtsAudioOnce(
  engine: TtsEngineOption,
  text: string,
  params: Record<string, unknown>
): Promise<{ ok: true; arrayBuffer: ArrayBuffer; ext: string } | { ok: false; error: string }> {
  if (!engine.modelConfig) return { ok: false, error: '模型配置缺失' };
  const m = engine.modelConfig;
  try {
    if (engine.adapterKind === 'xiaomi_mimo_chat_audio') {
      /**
       * 小米 MiMo：无 voice id 复刻缓存；克隆分支内联 base64 参考音频（见 mimoV25TtsBuilder）。
       */
      const { url, headers, body } = buildXiaomiMimoChatTtsRequest(m, text, params);
      const b = body as { model?: string; audio?: { voice?: string } };

      /** 音色克隆链路必须附带参考音频 data-url */
      if (
        typeof b.model === 'string' &&
        b.model.includes('voiceclone') &&
        !(typeof b.audio?.voice === 'string' && b.audio.voice.startsWith('data:'))
      ) {
        return {
          ok: false,
          error:
            'MiMo V2.5 音色克隆需要大纲 wav 样本（data:audio/...;base64,...）。请在「故事大纲」为旁白或角色绑定参考音频。',
        };
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const jsonMaybe = ct.includes('application/json') || ct.includes('text/json');
      if (jsonMaybe) {
        const json = (await res.json()) as unknown;
        if (!res.ok) {
          const errObj = json as { error?: { message?: string }; message?: string };
          const msg = errObj?.error?.message || errObj?.message || JSON.stringify(json).slice(0, 200);
          return { ok: false, error: `HTTP ${res.status} ${msg}` };
        }
        const parsed = parseMimoTtsResponseJson(json);
        if (!parsed.ok) return parsed;
        const buf = base64ToArrayBuffer(parsed.base64);
        const paramFmt = typeof params.format === 'string' ? params.format : 'mp3';
        const ext = parsed.ext && parsed.ext !== '.mp3' ? parsed.ext : extFromAudioFormat(paramFmt);
        return { ok: true, arrayBuffer: buf, ext };
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
      }
      const buf = await res.arrayBuffer();
      return { ok: true, arrayBuffer: buf, ext: extFromContentType(ct) };
    }
    if (engine.adapterKind === 'openai_audio_speech') {
      const { url, headers, body } = buildOpenAiSpeechRequest(m, text, params);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
      }
      const buf = await res.arrayBuffer();
      const ct = res.headers.get('content-type') || '';
      const rf = typeof body.response_format === 'string' ? body.response_format : 'mp3';
      const ext =
        ct.includes('wav') || rf === 'wav'
          ? '.wav'
          : ct.includes('mpeg') || ct.includes('mp3') || rf === 'mp3'
            ? '.mp3'
            : extFromContentType(ct);
      return { ok: true, arrayBuffer: buf, ext };
    }
    if (engine.adapterKind === 'minimax_t2a_v2') {
      const { url, headers, body } = buildMinimaxT2aV2Request(m, text, params);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
      }
      const json = (await res.json()) as unknown;
      const parsed = parseMinimaxT2aJson(json);
      if (!parsed.ok) return parsed;
      try {
        const buf = hexStringToArrayBuffer(parsed.hex);
        const ext =
          parsed.format === 'wav' ? '.wav' : parsed.format === 'pcm' ? '.pcm' : '.mp3';
        return { ok: true, arrayBuffer: buf, ext };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (engine.adapterKind === 'qwen3_tts_dashscope') {
      const voiceId = typeof params.voice === 'string' ? params.voice : '';
      const lang =
        typeof params.qwen_language_type === 'string' ? params.qwen_language_type : 'Chinese';
      const instructions =
        typeof params.qwenInstructions === 'string' ? params.qwenInstructions.trim() : undefined;
      return synthesizeQwen3Tts({ model: m, text, voiceId, languageType: lang, instructions });
    }
    // CosyVoice WebSocket 合成已停用
    // if (engine.adapterKind === 'cosyvoice_dashscope_ws') { ... }
    const { url, headers, body } = buildGenericTtsPost(m, text, params);
    const h = { ...headers } as Record<string, string>;
    if (m.isLocal || !m.apiKey) delete h.Authorization;
    const res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
    }
    const ct = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    const ext = ct.includes('wav') ? '.wav' : ct.includes('mpeg') || ct.includes('mp3') ? '.mp3' : '.bin';
    return { ok: true, arrayBuffer: buf, ext };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function generateTtsBase64ForEngine(
  engine: TtsEngineOption,
  text: string,
  params: Record<string, unknown>
): Promise<{ ok: true; base64: string; ext: string } | { ok: false; error: string }> {
  const t = text.trim();
  if (!t) return { ok: false, error: '文本为空' };

  const remote = await fetchRemoteTtsAudio(engine, t, params);
  if (!remote.ok) return remote;
  return { ok: true, base64: bufferToBase64(remote.arrayBuffer), ext: remote.ext };
}
