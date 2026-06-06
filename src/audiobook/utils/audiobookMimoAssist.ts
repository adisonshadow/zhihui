import type { AudioSegment } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { enrichMimoAssistantText } from '@/components/tts/mimoV25TextEnrich';
import { normalizeMimoUserVoicePreset } from '@/components/tts/mimoV25PresetVoices';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import type { AIModelConfig } from '@/types/settings';
import { getEngineById } from '@/components/tts/ttsModelAdapters';
import { resolveMimoRouteForAudiobookSegment } from '@/audiobook/utils/mimoAudiobookRoute';
import { stripCornerQuotesFromAudiobookSpeechText } from '@/audiobook/utils/audiobookNovelCornerQuotes';

/**
 * MiMo 「有声书」同步预处理：assistant 段落 enrich + 远端参数字典（异步部分仅克隆 data-url）。
 */

export interface AudiobookMimoSynthPrepare {
  enrichedAssistant: string;
  ttsExtras: Record<string, unknown>;
  mimoEffectiveModelId?: string;
  usedPresetFallback?: boolean;
}

export function pickPlayableTrimmedText(seg: AudioSegment): string {
  if (!('text' in seg)) return '';
  return stripCornerQuotesFromAudiobookSpeechText(seg.text.trim());
}

export function prepareAudiobookMimoTtsLocally(input: {
  segment: AudioSegment;
  outline?: AudiobookOutlineVoiceSamples;
  novelScript?: Script | null | undefined;
  playbackText?: string;
}): AudiobookMimoSynthPrepare {
  const seg = input.segment;
  const txt = input.playbackText ?? pickPlayableTrimmedText(seg);
  const route = resolveMimoRouteForAudiobookSegment({
    segment: seg,
    outline: input.outline,
    novelScript: input.novelScript ?? undefined,
    playableText: txt,
  });

  const tone = 'voice' in seg ? seg.voice.tone : undefined;
  const emotion = 'voice' in seg ? seg.voice.emotion : undefined;
  const pauses = 'pauses' in seg ? seg.pauses : undefined;
  const speed = 'voice' in seg ? seg.voice.speed : undefined;

  const enriched = enrichMimoAssistantText({
    rawText: txt,
    tone,
    emotion,
    pauses,
    audioTagSupported: route.effectiveModelId !== 'mimo-v2.5-tts-voicedesign',
    autoOverallStyle: true,
  }).text;

  const ttsExtras: Record<string, unknown> = {
    mimoEffectiveModelId: route.effectiveModelId,
    mimoSegment: seg,
    mimoScriptCharacter: route.scriptCharacter ?? null,
    ttsTone: tone ?? '',
    emotion,
  };
  if (typeof speed === 'number' && !Number.isNaN(speed)) {
    ttsExtras.voice_speed_for_enrich_hint = speed;
  }

  if (route.effectiveModelId === 'mimo-v2.5-tts-voiceclone' && route.referenceRelPath) {
    ttsExtras._mimoReferenceRelHint = route.referenceRelPath.trim();
  }

  if (route.effectiveModelId === 'mimo-v2.5-tts-voicedesign' && route.voiceDesignPrompt) {
    ttsExtras.mimoVoiceDesignPrompt = route.voiceDesignPrompt.trim();
  }

  /** 仅在预置链路写入 `voice`；克隆用 data-url */
  let presetVoice =
    typeof route.presetVoice === 'string' && route.presetVoice.trim() ? route.presetVoice.trim() : undefined;

  const explicitPid = normalizeMimoUserVoicePreset('voice' in seg ? seg.voice.voiceId : undefined)?.trim();

  if (explicitPid && route.forcedPresetForSinging !== true) {
    presetVoice = explicitPid;
  }

  if (presetVoice && route.effectiveModelId === 'mimo-v2.5-tts') {
    ttsExtras.voice = presetVoice;
  }

  if (route.usedPresetFallback) {
    ttsExtras.mimoDirectorUserContent =
      '【提示】该说话人大纲未绑定 wav 参考样本且无「声线描述」，已使用内置预置音色兜底。请在「故事大纲」绑定旁白/角色的参考音频以获得与 LongCat/MiMo 一致的克隆音色。';
  }

  return {
    enrichedAssistant: enriched,
    ttsExtras,
    mimoEffectiveModelId: route.effectiveModelId,
    usedPresetFallback: !!route.usedPresetFallback,
  };
}

export function buildAudiobookMimoAssistTextForCache(
  input: Parameters<typeof prepareAudiobookMimoTtsLocally>[0],
): string {
  return prepareAudiobookMimoTtsLocally(input).enrichedAssistant;
}

/** TTS 缓存 key：MiMo assistant 必须与 enrich 一致。 */
export function mimoAssistTextForVoiceOverCacheKey(input: {
  modelKey: string;
  aiModels?: AIModelConfig[] | null;
  segment: AudioSegment;
  outline?: AudiobookOutlineVoiceSamples;
  novelScript?: Script | null;
}): string | undefined {
  const models = input.aiModels ?? [];
  const eng = getEngineById(models, input.modelKey);
  if (eng?.adapterKind !== 'xiaomi_mimo_chat_audio') return undefined;
  const play = pickPlayableTrimmedText(input.segment);
  if (!play) return undefined;
  return buildAudiobookMimoAssistTextForCache({
    segment: input.segment,
    outline: input.outline,
    novelScript: input.novelScript,
    playbackText: play,
  });
}
