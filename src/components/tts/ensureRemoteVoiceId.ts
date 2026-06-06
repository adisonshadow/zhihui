/**
 * 确保远程 TTS 已有可用 voice id：查缓存 → 复刻 → 写缓存
 */
import type { AIModelConfig } from '@/types/settings';
import type { TtsAdapterKind } from '@/components/tts/ttsModelAdapters';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import {
  buildRemoteVoiceCacheKey,
  parseTtsVoiceSourceParams,
  type RemoteVoiceIdProvider,
} from '@/components/tts/remoteVoiceIdTypes';
import {
  // enrollCosyVoice, // CosyVoice 已停用
  enrollQwen3TtsVoice,
  resolveDashscopeSynthModel,
} from '@/components/tts/providers/dashscopeVoiceEnrollment';
import {
  cloneMinimaxVoice,
  minimaxVoiceIdFromSource,
} from '@/components/tts/providers/minimaxVoiceClone';
import { parseEmbeddedPresetVoiceIdFromPath } from '@/audiobook/utils/embeddedPresetVoiceId';

function providerForAdapter(kind: TtsAdapterKind): RemoteVoiceIdProvider | null {
  if (kind === 'minimax_t2a_v2') return 'minimax';
  if (kind === 'qwen3_tts_dashscope') return 'qwen3_tts';
  // if (kind === 'cosyvoice_dashscope_ws') return 'cosyvoice';
  return null;
}

async function readLocalAudioDataUrl(absPath: string): Promise<string> {
  const read = window.yiman?.fs?.readFileAsDataUrl;
  if (!read) throw new Error('当前环境无法读取本地音色文件');
  const du = await read(absPath);
  if (!du?.startsWith('data:')) throw new Error('读取参考音频失败');
  return du;
}

async function cacheGet(
  provider: RemoteVoiceIdProvider,
  cacheKey: string,
): Promise<{ voiceId: string } | null> {
  const api = window.yiman?.voiceId?.get;
  if (!api) return null;
  const row = await api(provider, cacheKey);
  return row?.voiceId ? { voiceId: row.voiceId } : null;
}

async function cacheSet(
  provider: RemoteVoiceIdProvider,
  cacheKey: string,
  voiceId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await window.yiman?.voiceId?.set?.(provider, cacheKey, {
    voiceId,
    createdAt: new Date().toISOString(),
    meta,
  });
}

export async function ensureRemoteVoiceIdForTts(params: {
  adapterKind: TtsAdapterKind;
  model: AIModelConfig;
  ttsParams: Record<string, unknown>;
  previewText?: string;
}): Promise<
  | { ok: true; voiceId: string; fromCache: boolean }
  | { ok: false; error: string; skipSynth?: boolean }
> {
  const provider = providerForAdapter(params.adapterKind);
  if (!provider) {
    return { ok: true, voiceId: String(params.ttsParams.voice ?? ''), fromCache: false };
  }

  const vs = parseTtsVoiceSourceParams(params.ttsParams);
  const targetModel = resolveDashscopeSynthModel(params.model) || resolveRequestModelId(params.model) || '';

  if (vs.source === 'preset') {
    const preset = typeof params.ttsParams.voice === 'string' ? params.ttsParams.voice.trim() : '';
    if (!preset) {
      return { ok: false, error: '请选择预置音色或配置音色复刻来源', skipSynth: true };
    }
    return { ok: true, voiceId: preset, fromCache: false };
  }

  if (vs.source === 'cloned_id') {
    if (!vs.clonedVoiceId) {
      return { ok: false, error: '请填写已复刻的 voice_id', skipSynth: true };
    }
    return { ok: true, voiceId: vs.clonedVoiceId, fromCache: false };
  }

  let sourceKey = '';
  if (vs.source === 'clone_from_file') {
    if (!vs.cloneAudioPath) {
      return { ok: false, error: '请选择本地音色文件', skipSynth: true };
    }
    sourceKey = vs.cloneAudioPath;
  } else if (vs.source === 'clone_from_url') {
    if (!vs.clonePublicUrl) {
      return {
        ok: false,
        error: '公网 URL 复刻已停用（原 CosyVoice 专用），请改用本地文件复刻或填写 voice_id',
        skipSynth: true,
      };
    }
    sourceKey = vs.clonePublicUrl;
  }

  const cacheKey = buildRemoteVoiceCacheKey({
    provider,
    targetModel: targetModel || params.model.id,
    sourceKey,
    extraKey: vs.voicePrefix,
  });

  const cached = await cacheGet(provider, cacheKey);
  if (cached?.voiceId) {
    return { ok: true, voiceId: cached.voiceId, fromCache: true };
  }

  if (provider === 'minimax') {
    const embedded =
      vs.source === 'clone_from_file' && vs.cloneAudioPath ?
        parseEmbeddedPresetVoiceIdFromPath(vs.cloneAudioPath)
      : null;
    if (embedded?.provider === 'minimax') {
      return { ok: true, voiceId: embedded.voiceId, fromCache: false };
    }

    const customId = minimaxVoiceIdFromSource(sourceKey, vs.voicePrefix);
    const cloned = await cloneMinimaxVoice({
      model: params.model,
      audioPath: vs.cloneAudioPath,
      customVoiceId: customId,
      previewText: params.previewText,
    });
    if (!cloned.ok) return cloned;
    await cacheSet(provider, cacheKey, cloned.voiceId, { fileId: cloned.fileId });
    return { ok: true, voiceId: cloned.voiceId, fromCache: false };
  }

  if (provider === 'qwen3_tts') {
    const dataUrl = await readLocalAudioDataUrl(vs.cloneAudioPath);
    const enrolled = await enrollQwen3TtsVoice({
      apiKey: params.model.apiKey,
      targetModel: targetModel || 'qwen3-tts-flash',
      preferredName: vs.voicePrefix,
      audioDataUrl: dataUrl,
      referenceText: vs.referenceText || undefined,
    });
    if (!enrolled.ok) return enrolled;
    await cacheSet(provider, cacheKey, enrolled.voiceId);
    return { ok: true, voiceId: enrolled.voiceId, fromCache: false };
  }

  // CosyVoice enrollment 已停用
  // if (provider === 'cosyvoice') { ... }

  return { ok: false, error: '未知 TTS provider' };
}

export async function invalidateRemoteVoiceIdCache(params: {
  adapterKind: TtsAdapterKind;
  model: AIModelConfig;
  ttsParams: Record<string, unknown>;
}): Promise<void> {
  const provider = providerForAdapter(params.adapterKind);
  if (!provider) return;
  const vs = parseTtsVoiceSourceParams(params.ttsParams);
  if (vs.source !== 'clone_from_file' && vs.source !== 'clone_from_url') return;

  const targetModel = resolveDashscopeSynthModel(params.model) || resolveRequestModelId(params.model) || '';
  const sourceKey =
    vs.source === 'clone_from_file' ? vs.cloneAudioPath : vs.clonePublicUrl;
  if (!sourceKey) return;

  const cacheKey = buildRemoteVoiceCacheKey({
    provider,
    targetModel: targetModel || params.model.id,
    sourceKey,
    extraKey: vs.voicePrefix,
  });
  await window.yiman?.voiceId?.invalidate?.(provider, cacheKey);
}
