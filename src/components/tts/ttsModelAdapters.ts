/**
 * TTS 引擎与远程模型请求的参数适配（不同供应商字段不同，集中在此扩展）
 * 本地不再内嵌推理；用户通过「设置」中带「生成配音」的模型接入本机或云端服务。
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import type { SceneContentItem } from '@/types/script';

/** 历史版本剧本项可能持久化此 id，打开 TTS 时映射到当前首个 voice_over 模型 */
export const LEGACY_LOCAL_MOSS_ENGINE_ID = 'local_moss';

export type TtsAdapterKind =
  | 'openai_audio_speech'
  | 'generic_post_audio'
  | 'xiaomi_mimo_chat_audio'
  | 'minimax_t2a_v2';

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

/** MiMo：控制台密钥去首尾空白；若用户误把「Bearer xxx」整段粘贴进密钥框则去掉前缀（见平台 OpenAI SDK 与 curl 两种习惯） */
function normalizeMimoApiKey(raw: string): string {
  let k = (raw ?? '').trim();
  if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, '').trim();
  return k;
}

function inferRemoteAdapter(model: AIModelConfig): TtsAdapterKind {
  const u = (model.apiUrl || '').toLowerCase();
  const p = (model.provider || '').toLowerCase();
  if (isXiaomiMimoHost(model.apiUrl)) return 'xiaomi_mimo_chat_audio';
  /** MiniMax 与 OpenAI 兼容网关均常见 /v1，必须先于「含 /v1 即 OpenAI speech」的启发式判断 */
  if (isMinimaxHost(model.apiUrl)) return 'minimax_t2a_v2';
  if (u.includes('audio/speech')) return 'openai_audio_speech';
  if (u.includes('openai') || p.includes('openai') || u.includes('/v1')) return 'openai_audio_speech';
  return 'generic_post_audio';
}

/** 设置中 tag「生成配音」对应 capability key：voice_over */
export function buildVoiceOverEngineList(models: AIModelConfig[]): TtsEngineOption[] {
  return (models ?? [])
    .filter((m) => (m.capabilityKeys ?? []).includes('voice_over'))
    .map((m) => ({
      engineId: m.id,
      label: (m.name?.trim() || resolveRequestModelId(m)?.trim() || m.id) as string,
      isLocal: m.isLocal === true,
      modelConfig: m,
      adapterKind: inferRemoteAdapter(m),
    }));
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

export function defaultParamsForAdapter(kind: TtsAdapterKind): Record<string, unknown> {
  switch (kind) {
    case 'xiaomi_mimo_chat_audio':
      return { voice: 'default_zh', format: 'mp3', mimoStyleRole: '' };
    case 'minimax_t2a_v2':
      /** 与官方示例一致；voice 存 voice_id（见 platform.minimaxi.com speech-t2a-http） */
      return {
        voice: 'male-qn-qingse',
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
  const defaults = defaultParamsForAdapter(engine.adapterKind);
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
    if (!(typeof merged.mimoStyleRole === 'string' && merged.mimoStyleRole.trim())) {
      if (item.type === 'narration') {
        merged.mimoStyleRole = item.narratorType ?? '全知';
      } else if (item.type === 'dialogue' && item.speaker) {
        const nm = characters.find((c) => c.id === item.speaker)?.name?.trim();
        if (nm) merged.mimoStyleRole = nm;
      }
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

/** 小米开放平台强烈建议的系统提示（见首次调用 / 模型说明）；与官方示例一致为英文日期句式 */
function buildMimoRecommendedSystemContent(): string {
  const d = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ] as const;
  const weekday = weekdays[d.getDay()];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `You are MiMo, an AI assistant developed by Xiaomi. Today is date: ${weekday}, ${month} ${day}, ${year}. Your knowledge cutoff date is December 2024.`;
}

/** MiMo：将「角色 + 情绪」写入同一 `<style>…</style>` 前缀（官方 speech-synthesis）；若正文已以 `<style>` 开头则不再重复添加 */
export function buildMimoStylePrefixFromParams(params: Record<string, unknown>): string {
  const role = typeof params.mimoStyleRole === 'string' ? params.mimoStyleRole.trim() : '';
  const emo = typeof params.emotion === 'string' ? params.emotion.trim() : '';
  const parts = [role, emo].filter(Boolean);
  if (parts.length === 0) return '';
  return `<style>${parts.join(' ')}</style>`;
}

/** 最终写入 assistant.content 的字符串（风格标签 + 待合成台词） */
export function buildMimoAssistantContentForTts(text: string, params: Record<string, unknown>): string {
  const body = (text ?? '').trim();
  const prefix = buildMimoStylePrefixFromParams(params);
  if (!prefix) return body;
  if (/^\s*<style>/i.test(body)) return body;
  return `${prefix}${body}`;
}

const MIMO_DEFAULT_USER_PROMPT =
  '请结合语境与系统设定，朗读下一条 assistant 中的目标文本（可含开头的 <style> 风格标签与舞台说明）。';

/** 小米 MiMo TTS：POST /v1/chat/completions + modalities/audio。
 * 上游对 mimo-v2-tts 返回「messages[0] system role is not allowed for TTS model」——不得使用 role=system；
 * 将官方推荐的身份/日期说明并入 user.content 首段，再接语气引导；合成目标仍在 assistant。 */
export function buildXiaomiMimoChatTtsRequest(
  model: AIModelConfig,
  text: string,
  params: Record<string, unknown>
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const base = model.apiUrl.trim().replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const voice = typeof params.voice === 'string' && params.voice.trim() ? params.voice.trim() : 'default_zh';
  const format =
    typeof params.format === 'string' && ['mp3', 'wav', 'pcm'].includes(params.format)
      ? params.format
      : 'mp3';
  const modelName = (resolveRequestModelId(model) || 'mimo-v2-tts').trim();
  const key = model.isLocal ? '' : normalizeMimoApiKey(model.apiKey);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    // api.xiaomimimo.com 与 OpenAI SDK 一致为 Bearer；mimo-v2 文档 curl 为 api-key，同时发送以兼容不同网关
    headers.Authorization = `Bearer ${key}`;
    headers['api-key'] = key;
  }
  const guidanceBlock =
    typeof params.mimoSystemPrompt === 'string' && params.mimoSystemPrompt.trim()
      ? params.mimoSystemPrompt.trim()
      : buildMimoRecommendedSystemContent();
  const instructionBlock =
    typeof params.mimoUserPrompt === 'string' && params.mimoUserPrompt.trim()
      ? params.mimoUserPrompt.trim()
      : MIMO_DEFAULT_USER_PROMPT;
  const userContent = `${guidanceBlock}\n\n${instructionBlock}`;
  const assistantContent = buildMimoAssistantContentForTts(text, params);
  return {
    url,
    headers,
    body: {
      model: modelName,
      modalities: ['text', 'audio'],
      audio: { voice, format },
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent },
      ],
    },
  };
}

function extFromAudioFormat(format: string): string {
  if (format === 'wav' || format === 'pcm') return `.${format === 'pcm' ? 'pcm' : 'wav'}`;
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
  const m = engine.modelConfig;
  try {
    if (engine.adapterKind === 'xiaomi_mimo_chat_audio') {
      const { url, headers, body } = buildXiaomiMimoChatTtsRequest(m, text, params);
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
