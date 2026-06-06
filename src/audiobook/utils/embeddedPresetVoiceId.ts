/**
 * 预制音色文件名内嵌的云端 voice_id，格式：[provider---voice_id]
 * 例：男-雄浑-纪录片[minimax---Chinese_deep_voiced_male_vv1].wav
 */
import type { AIModelConfig } from '@/types/settings';
import {
  buildTtsEngineListFromModels,
  type TtsAdapterKind,
  type TtsEngineOption,
} from '@/components/tts/ttsModelAdapters';

/** `[minimax---Chinese_deep_voiced_male_vv1]` */
const EMBEDDED_VOICE_ID_RE = /\[([a-z][a-z0-9]*)---([^\]]+)\]/i;

export type EmbeddedPresetVoiceId = {
  /** 全小写，如 minimax（对应 MiniMax Speech 首词） */
  provider: string;
  voiceId: string;
};

export function fileNameFromPath(p: string): string {
  const norm = p.trim().replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts[parts.length - 1] ?? norm;
}

export function parseEmbeddedPresetVoiceIdFromFileName(fileName: string): EmbeddedPresetVoiceId | null {
  const base = fileName.trim();
  if (!base) return null;
  const m = base.match(EMBEDDED_VOICE_ID_RE);
  if (!m?.[1] || !m[2]) return null;
  const voiceId = m[2].trim();
  if (!voiceId) return null;
  return { provider: m[1].toLowerCase(), voiceId };
}

export function parseEmbeddedPresetVoiceIdFromPath(pathOrRel: string): EmbeddedPresetVoiceId | null {
  return parseEmbeddedPresetVoiceIdFromFileName(fileNameFromPath(pathOrRel));
}

/** 去掉文件名中的 `[provider---voice_id]` 段（保留扩展名） */
export function stripEmbeddedVoiceIdFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return trimmed;
  const dot = trimmed.lastIndexOf('.');
  const hasExt = dot > 0 && dot < trimmed.length - 1;
  const base = hasExt ? trimmed.slice(0, dot) : trimmed;
  const ext = hasExt ? trimmed.slice(dot) : '';
  const cleaned = base.replace(EMBEDDED_VOICE_ID_RE, '').trim();
  return cleaned ? `${cleaned}${ext}` : trimmed;
}

/** 文件名内 provider 标记 → 列表展示用品牌名 */
function embeddedProviderDisplayLabel(provider: string): string {
  const p = provider.trim().toLowerCase();
  if (p === 'minimax') return 'Minimax';
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * 列表展示用：去掉路径、扩展名与 `[provider---voice_id]`；
 * 若含内置标记则追加 `(Minimax)` 等，如 男-温润(Minimax)
 */
export function formatVoiceSampleDisplayName(pathOrRel: string): string {
  const rawFileName = fileNameFromPath(pathOrRel);
  const embedded = parseEmbeddedPresetVoiceIdFromFileName(rawFileName);
  const stripped = stripEmbeddedVoiceIdFromFileName(rawFileName);
  const dot = stripped.lastIndexOf('.');
  const stem = dot > 0 ? stripped.slice(0, dot).trim() : stripped.trim();
  if (!stem) return pathOrRel.trim() || pathOrRel;
  if (embedded) {
    const brand = embeddedProviderDisplayLabel(embedded.provider);
    return brand ? `${stem}(${brand})` : stem;
  }
  return stem;
}

/** TTS 适配器 → 文件名中的 provider 标记（与预制命名约定一致） */
export function embeddedVoiceProviderTokenForAdapter(kind: TtsAdapterKind): string | null {
  if (kind === 'minimax_t2a_v2') return 'minimax';
  return null;
}

export function embeddedVoiceProviderTokenForModel(model: AIModelConfig): string | null {
  const engine = buildTtsEngineListFromModels([model])[0];
  if (!engine) return null;
  return embeddedVoiceProviderTokenForAdapter(engine.adapterKind);
}

export function embeddedVoiceMatchesModel(
  embedded: EmbeddedPresetVoiceId,
  model: AIModelConfig,
): boolean {
  const token = embeddedVoiceProviderTokenForModel(model);
  return token != null && token === embedded.provider;
}

export function embeddedVoiceMatchesEngine(
  embedded: EmbeddedPresetVoiceId,
  engine: TtsEngineOption,
): boolean {
  if (!engine.modelConfig) return false;
  return embeddedVoiceMatchesModel(embedded, engine.modelConfig);
}

/** 大纲绑定路径 + 当前合成引擎是否命中内置 voice_id */
export function resolveEmbeddedPresetVoiceForEngine(
  relOrAbsPath: string | undefined,
  engine: TtsEngineOption,
): EmbeddedPresetVoiceId | null {
  const rel = relOrAbsPath?.trim();
  if (!rel) return null;
  const embedded = parseEmbeddedPresetVoiceIdFromPath(rel);
  if (!embedded || !embeddedVoiceMatchesEngine(embedded, engine)) return null;
  return embedded;
}
