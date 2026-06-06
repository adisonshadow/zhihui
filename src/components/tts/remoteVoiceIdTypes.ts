/**
 * 云端 TTS 音色复刻：参数约定与缓存键构建
 */
export type RemoteVoiceIdProvider = 'minimax' | 'qwen3_tts' | 'cosyvoice';

/** 音色来源（TTS 参数 ttsVoiceSource） */
export type TtsVoiceSourceKind = 'preset' | 'cloned_id' | 'clone_from_file' | 'clone_from_url';

export interface RemoteVoiceIdCacheKeyInput {
  provider: RemoteVoiceIdProvider;
  targetModel: string;
  /** 本地绝对路径 / 公网 URL / 已有 voiceId 的稳定标识 */
  sourceKey: string;
  /** 参考文稿或 prefix 等附加因子 */
  extraKey?: string;
}

export function buildRemoteVoiceCacheKey(input: RemoteVoiceIdCacheKeyInput): string {
  const parts = [
    input.provider,
    input.targetModel.trim().toLowerCase(),
    input.sourceKey.trim(),
    (input.extraKey ?? '').trim(),
  ].filter(Boolean);
  return parts.join(':');
}

/** 从 params 解析音色来源配置 */
export function parseTtsVoiceSourceParams(params: Record<string, unknown>): {
  source: TtsVoiceSourceKind;
  clonedVoiceId: string;
  cloneAudioPath: string;
  clonePublicUrl: string;
  voicePrefix: string;
  referenceText: string;
} {
  const raw = typeof params.ttsVoiceSource === 'string' ? params.ttsVoiceSource.trim() : 'preset';
  const source: TtsVoiceSourceKind =
    raw === 'cloned_id' || raw === 'clone_from_file' || raw === 'clone_from_url' ? raw : 'preset';
  return {
    source,
    clonedVoiceId: typeof params.ttsClonedVoiceId === 'string' ? params.ttsClonedVoiceId.trim() : '',
    cloneAudioPath: typeof params.ttsCloneAudioPath === 'string' ? params.ttsCloneAudioPath.trim() : '',
    clonePublicUrl: typeof params.ttsClonePublicUrl === 'string' ? params.ttsClonePublicUrl.trim() : '',
    voicePrefix:
      typeof params.ttsVoicePrefix === 'string' && params.ttsVoicePrefix.trim() ?
        params.ttsVoicePrefix.trim()
      : 'yiman',
    referenceText: typeof params.ttsReferenceText === 'string' ? params.ttsReferenceText.trim() : '',
  };
}

/** 合成失败时是否应 invalidate 缓存并重试复刻 */
export function isRemoteVoiceIdStaleError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('voice not found') ||
    m.includes('voice_id') && (m.includes('invalid') || m.includes('not found') || m.includes('不存在')) ||
    m.includes('voice is invalid') ||
    m.includes('音色') && (m.includes('无效') || m.includes('不存在') || m.includes('下线') || m.includes('过期')) ||
    m.includes('request voice is invalid')
  );
}
