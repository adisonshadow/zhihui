/**
 * 有声书工作台：TTS 模型下拉（本地 MLX + 设置里 voice_over 云端模型）
 */
import type { AISettings, AIModelConfig, LocalTtsConfig } from '@/types/settings';
import { LOCAL_TTS_MODEL_OPTIONS, localTtsProfileIsSaved } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import {
  normalizeMimoUserVoicePreset,
  isMimoV25PresetVoice,
} from '@/components/tts/mimoV25PresetVoices';
import type { TtsEngineOption } from '@/components/tts/ttsModelAdapters';
import {
  buildVoiceOverEngineList,
  defaultParamsForAdapter,
  getEngineById,
  LEGACY_LOCAL_MOSS_ENGINE_ID,
  resolveVoiceOverEngineId,
} from '@/components/tts/ttsModelAdapters';
import { findVoiceEnrollmentEngines, findVoiceDesignEngines } from '@/components/tts/voiceCapabilityInference';
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';

const LOCAL_KEYS = new Set(
  LOCAL_TTS_MODEL_OPTIONS.map((o) => o.key).concat(['moss_tts_local_mlx']),
);

export function normalizeLocalTtsModelKey(k: string | undefined): string {
  const x = k ?? 'longcat_audio_dit';
  return x === 'moss_tts_local_mlx' ? 'moss_tts' : x;
}

export function isLocalAudiobookTtsModelKey(modelKey: string): boolean {
  return LOCAL_KEYS.has(modelKey) || LOCAL_KEYS.has(normalizeLocalTtsModelKey(modelKey));
}

export type AudiobookTtsSelectOption = { value: string; label: string };

/** capability 弹窗下拉：显示 Model ID（首字母大写） */
export function engineOptionLabel(engine: TtsEngineOption): string {
  const m = engine.modelConfig;
  const slug = (m ? resolveRequestModelId(m) : undefined) ?? m?.id ?? engine.engineId;
  return capitalizeAudiobookModelIdLabel(slug);
}

/** 音色设计 Modal 下拉 */
export function buildVoiceDesignSelectOptions(
  models: AIModelConfig[] | undefined,
): AudiobookTtsSelectOption[] {
  return findVoiceDesignEngines(models).map((e) => ({
    value: e.engineId,
    label: engineOptionLabel(e),
  }));
}

/** 同一 preset / 列表名称下多实例时，下拉用 model id 区分 */
function voiceOverEngineGroupKey(m: AIModelConfig): string {
  const preset = m.presetKey?.trim();
  if (preset) return `preset:${preset}`;
  const name = m.name?.trim();
  if (name) return `name:${name}`;
  return `id:${m.id}`;
}

/** 首字母大写（仅第一个字符） */
export function capitalizeAudiobookModelIdLabel(modelId: string): string {
  const id = modelId.trim();
  if (!id) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function countVoiceOverEngineGroups(engines: TtsEngineOption[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of engines) {
    if (!e.modelConfig) continue;
    const gk = voiceOverEngineGroupKey(e.modelConfig);
    counts.set(gk, (counts.get(gk) ?? 0) + 1);
  }
  return counts;
}

function audiobookRemoteEngineLabel(e: TtsEngineOption, groupCounts: Map<string, number>): string {
  if (!e.modelConfig) return e.label;
  const gk = voiceOverEngineGroupKey(e.modelConfig);
  if ((groupCounts.get(gk) ?? 0) >= 2) {
    const modelId = resolveRequestModelId(e.modelConfig)?.trim() || e.modelConfig.id;
    return capitalizeAudiobookModelIdLabel(modelId);
  }
  return e.label;
}

/** 构建片段 TTS 模型下拉项：本地（已启用时）+ 设置中所有「生成配音」模型 */
export function buildAudiobookTtsSelectOptions(config: AISettings | null | undefined): AudiobookTtsSelectOption[] {
  const opts: AudiobookTtsSelectOption[] = [];
  const local = config?.localTts;

  // 本地 TTS：只显示已启用 + 已配置路径的模型
  if (local) {
    for (const o of LOCAL_TTS_MODEL_OPTIONS) {
      const profile = local.profiles?.[o.key];
      const enabled = profile?.enabled === true;
      const saved = !!profile?.modelPath?.trim();
      if (enabled && saved) {
        opts.push({ value: o.key, label: `[本地] ${o.label}` });
      }
    }
  }

  const engines = buildVoiceOverEngineList(config?.models ?? []);
  const groupCounts = countVoiceOverEngineGroups(engines);

  for (const e of engines) {
    const label = audiobookRemoteEngineLabel(e, groupCounts);
    opts.push({
      value: e.engineId,
      label: e.isLocal ? `[API] ${label}` : label,
    });
  }

  return opts;
}

/** 音色复制 Modal：enrollment + MiMo voiceclone 引擎下拉 */
export function buildVoiceEnrollmentSelectOptions(
  config: AISettings | null | undefined,
): AudiobookTtsSelectOption[] {
  return findVoiceEnrollmentEngines(config?.models ?? []).map((e) => ({
    value: e.engineId,
    label: engineOptionLabel(e),
  }));
}

/** 将持久化的 key 对齐为当前下拉 options 中的 value（含本地别名、云端 engineId 迁移） */
export function resolveAudiobookTtsModelKeyForOptions(
  key: string | undefined,
  config: AISettings | null | undefined,
): string | undefined {
  const raw = key?.trim();
  if (!raw) return undefined;
  const opts = buildAudiobookTtsSelectOptions(config);
  if (opts.some((o) => o.value === raw)) return raw;

  const norm = normalizeLocalTtsModelKey(raw);
  const localHit = opts.find(
    (o) => o.value === norm || normalizeLocalTtsModelKey(o.value) === norm,
  );
  if (localHit) return localHit.value;

  const engine = getEngineById(config?.models ?? [], raw);
  if (engine && opts.some((o) => o.value === engine.engineId)) return engine.engineId;

  if (raw === LEGACY_LOCAL_MOSS_ENGINE_ID) {
    const migrated = resolveVoiceOverEngineId(raw, config?.models ?? []);
    if (migrated && opts.some((o) => o.value === migrated)) return migrated;
  }

  // 按 model.id 查找（m_xxx 格式的模型 ID）
  const byModelId = buildVoiceOverEngineList(config?.models ?? []).find((e) => e.modelConfig?.id === raw);
  if (byModelId && opts.some((o) => o.value === byModelId.engineId)) return byModelId.engineId;

  return undefined;
}

export function defaultAudiobookTtsModelKey(config: AISettings | null | undefined): string {
  const configured = config?.audiobook?.defaultTtsModelKey?.trim();
  if (configured) {
    const resolved = resolveAudiobookTtsModelKeyForOptions(configured, config);
    if (resolved) return resolved;
  }

  const local = config?.localTts;
  const preferred = normalizeLocalTtsModelKey(local?.modelKey);
  if (local?.enabled && localTtsProfileIsSaved(local, preferred)) {
    const resolved = resolveAudiobookTtsModelKeyForOptions(preferred, config);
    if (resolved) return resolved;
  }
  const engines = buildVoiceOverEngineList(config?.models ?? []);
  if (engines.length > 0) return engines[0]!.engineId;
  return resolveAudiobookTtsModelKeyForOptions(preferred, config) ?? preferred;
}

/** 片段实际使用的 TTS 模型 key（持久化值无效时回退全局默认） */
export function resolveSegmentTtsModelKey(
  index: number,
  storedKeys: Record<number, string>,
  config: AISettings | null | undefined,
): string {
  const fallback = defaultAudiobookTtsModelKey(config);
  const stored = storedKeys[index]?.trim();
  if (!stored) return fallback;
  return resolveAudiobookTtsModelKeyForOptions(stored, config) ?? fallback;
}

export function isAudiobookTtsModelReady(modelKey: string, config: AISettings | null | undefined): boolean {
  if (!config) return false;
  if (isLocalAudiobookTtsModelKey(modelKey)) {
    const local = config.localTts;
    const k = normalizeLocalTtsModelKey(modelKey);
    const profile = local?.profiles?.[k];
    return local?.enabled === true && Boolean(profile?.modelPath?.trim());
  }
  const engine = getEngineById(config.models ?? [], modelKey);
  if (!engine?.modelConfig) return false;
  const m = engine.modelConfig;
  if (m.isLocal) return Boolean(m.apiUrl?.trim());
  return Boolean(m.apiUrl?.trim() && m.apiKey?.trim());
}

/** 磁盘缓存恢复时尝试的 modelKey 候选（避免刷新后默认模型与生成时不一致） */
export function audiobookTtsModelKeysForHydrate(config: AISettings | null | undefined): string[] {
  const keys = new Set<string>();
  keys.add(defaultAudiobookTtsModelKey(config));
  const local = config?.localTts;
  if (local?.enabled) {
    for (const o of LOCAL_TTS_MODEL_OPTIONS) keys.add(o.key);
    keys.add('moss_tts_local_mlx');
  }
  for (const e of buildVoiceOverEngineList(config?.models ?? [])) {
    keys.add(e.engineId);
  }
  return [...keys];
}

export function anyAudiobookTtsModelReady(config: AISettings | null | undefined): boolean {
  return buildAudiobookTtsSelectOptions(config).some((o) => isAudiobookTtsModelReady(o.value, config));
}

/** 云端合成参数：结合片段语气/情绪（如 MiMo style） */
export function audiobookTtsParamsForSegment(
  seg: AudioSegment,
  engine: TtsEngineOption,
): Record<string, unknown> {
  const merged = defaultParamsForAdapter(engine.adapterKind, engine.modelConfig);
  if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
    return merged;
  }
  const v = seg.voice;
  if (v.emotion && typeof v.emotion === 'string') {
    merged.emotion = v.emotion;
  }
  if (typeof v.speed === 'number' && !Number.isNaN(v.speed) && v.speed > 0) {
    merged.speed = v.speed;
  }
  if (engine.adapterKind === 'xiaomi_mimo_chat_audio') {
    const toneTrim = typeof v.tone === 'string' ? v.tone.trim() : '';
    merged.ttsTone = toneTrim;
    merged.mimoStyleRole = toneTrim || (typeof merged.mimoStyleRole === 'string' ? merged.mimoStyleRole : '');
    const ov = normalizeMimoUserVoicePreset(v.voiceId)?.trim();
    if (ov && isMimoV25PresetVoice(ov)) merged.voice = ov;
  }
  return merged;
}

export function localTtsProfileForKey(
  localTts: LocalTtsConfig | undefined,
  modelKey: string,
): { modelPath?: string } | undefined {
  if (!isLocalAudiobookTtsModelKey(modelKey)) return undefined;
  const k = normalizeLocalTtsModelKey(modelKey);
  return localTts?.profiles?.[k];
}
