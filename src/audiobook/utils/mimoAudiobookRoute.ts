import type { Character, Script } from '@/constants/Script';
import type { AudioSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { pickReferenceRelPathForSegment } from '@/audiobook/utils/audiobookSegmentReference';
import { pickOutlineStyleInstructionForSegment } from '@/audiobook/utils/outlineVoiceStyleInstruction';
import { resolveEmbeddedMimoPresetFromPath } from '@/audiobook/utils/embeddedPresetVoiceId';
import {
  inferTextLanguageHint,
  isMimoV25PresetVoice,
  normalizeMimoUserVoicePreset,
  resolveFallbackPresetVoiceByText,
} from '@/components/tts/mimoV25PresetVoices';
import { detectSingIntent } from '@/components/tts/mimoV25StyleTags';
import type { MimoV25EffectiveModelId } from '@/components/tts/mimoV25TtsBuilder';

export type MimoAudiobookRouteReason = 'outline_wav' | 'voice_design' | 'preset_from_voice_id' | 'preset_fallback';

export interface MimoAudiobookResolvedRoute {
  effectiveModelId: MimoV25EffectiveModelId;
  referenceRelPath?: string;
  voiceDesignPrompt?: string;
  presetVoice?: string;
  /** 大纲无 wav 且无 voiceCharacteristic 等非理想路径 */
  usedPresetFallback?: boolean;
  /** 文档：唱歌需在预置模型；已从 clone/design 降为 preset */
  forcedPresetForSinging?: boolean;
  scriptCharacter?: Character | null;
  reason: MimoAudiobookRouteReason;
}

function pickScriptCharacter(seg: AudioSegment, script: Script | undefined): Character | null {
  const list = script?.characters ?? [];
  if (!list.length) return null;
  if (seg.type === SegmentType.Dialogue) {
    return list.find((c) => c.id === seg.speakerId) ?? null;
  }
  if (seg.type === SegmentType.InnerVoice) {
    return list.find((c) => c.id === seg.characterId) ?? null;
  }
  if (seg.type === SegmentType.Narration || seg.type === SegmentType.ChapterTitle) {
    const cid = seg.voice?.characterId?.trim();
    return cid ? (list.find((c) => c.id === cid) ?? null) : null;
  }
  return null;
}

/**
 * 有声书段落 → MiMo V2.5 模型与音色数据源（优先大纲 wav）。
 */
export function resolveMimoRouteForAudiobookSegment(input: {
  segment: AudioSegment;
  outline?: AudiobookOutlineVoiceSamples;
  novelScript?: Script;
  playableText?: string;
}): MimoAudiobookResolvedRoute {
  const seg = input.segment;
  const ch = pickScriptCharacter(seg, input.novelScript);
  const txt = input.playableText ?? ('text' in seg ? seg.text : '') ?? '';

  const refRel = pickReferenceRelPathForSegment(seg, input.outline);

  // 如果片段显式指定了系统预置音色（voiceId 字段），优先用预置而非克隆
  const rawVoiceId = 'voice' in seg ? seg.voice.voiceId : undefined;
  const explicitPreset = rawVoiceId && isMimoV25PresetVoice(rawVoiceId) ? normalizeMimoUserVoicePreset(rawVoiceId) : undefined;
  if (explicitPreset) {
    return {
      effectiveModelId: 'mimo-v2.5-tts',
      presetVoice: explicitPreset,
      scriptCharacter: ch,
      reason: 'preset_from_voice_id',
    };
  }

  /** 大纲 wav 内嵌 [xiaomi---预置名] / [mimo---预置名] → 系统内置音色，不走 clone（见 TTS 架构文档 2） */
  if (refRel?.trim()) {
    const embeddedMimoPreset = resolveEmbeddedMimoPresetFromPath(refRel);
    if (embeddedMimoPreset) {
      return {
        effectiveModelId: 'mimo-v2.5-tts',
        presetVoice: embeddedMimoPreset,
        scriptCharacter: ch,
        reason: 'preset_from_voice_id',
      };
    }

    const singing = detectSingIntent('voice' in seg ? seg.voice.tone : undefined, 'voice' in seg ? seg.voice.emotion : undefined, txt);
    if (singing && 'voice' in seg) {
      const presetVoice =
        (isMimoV25PresetVoice(seg.voice.voiceId) ? seg.voice.voiceId?.trim() : undefined) ??
        resolveFallbackPresetVoiceByText(txt);
      return {
        effectiveModelId: 'mimo-v2.5-tts',
        presetVoice,
        forcedPresetForSinging: true,
        scriptCharacter: ch,
        reason: 'preset_from_voice_id',
      };
    }
    return {
      effectiveModelId: 'mimo-v2.5-tts-voiceclone',
      referenceRelPath: refRel.trim(),
      scriptCharacter: ch,
      reason: 'outline_wav',
    };
  }

  /** 无样本：优先大纲「风格指令」，其次剧本 voiceCharacteristic */
  const outlineStyle = pickOutlineStyleInstructionForSegment(seg, input.outline)?.trim();
  if (outlineStyle) {
    const singing = detectSingIntent('voice' in seg ? seg.voice.tone : undefined, 'voice' in seg ? seg.voice.emotion : undefined, txt);
    if (singing && 'voice' in seg) {
      const presetVoice =
        (isMimoV25PresetVoice(seg.voice.voiceId) ? seg.voice.voiceId!.trim() : undefined) ??
        resolveFallbackPresetVoiceByText(txt);
      return {
        effectiveModelId: 'mimo-v2.5-tts',
        presetVoice,
        forcedPresetForSinging: true,
        scriptCharacter: ch,
        reason: 'preset_from_voice_id',
      };
    }
    return {
      effectiveModelId: 'mimo-v2.5-tts-voicedesign',
      voiceDesignPrompt: outlineStyle,
      scriptCharacter: ch,
      reason: 'voice_design',
    };
  }

  const vch = ch?.voiceCharacteristic?.trim();
  if (vch) {
    const singing = detectSingIntent('voice' in seg ? seg.voice.tone : undefined, 'voice' in seg ? seg.voice.emotion : undefined, txt);
    if (singing && 'voice' in seg) {
      const presetVoice =
        isMimoV25PresetVoice(seg.voice.voiceId) ? seg.voice.voiceId!.trim() : resolveFallbackPresetVoiceByText(txt);
      return {
        effectiveModelId: 'mimo-v2.5-tts',
        presetVoice,
        forcedPresetForSinging: true,
        scriptCharacter: ch,
        reason: 'preset_from_voice_id',
      };
    }
    return {
      effectiveModelId: 'mimo-v2.5-tts-voicedesign',
      voiceDesignPrompt: vch,
      scriptCharacter: ch,
      reason: 'voice_design',
    };
  }

  /** 剧本无声线描述时：片段内人设腔调标签（次要角色常见，用户未必给大纲 wav） */
  const segPersona = 'voice' in seg ? seg.voice.personaTag?.trim() : '';
  if (segPersona) {
    const singing = detectSingIntent('voice' in seg ? seg.voice.tone : undefined, 'voice' in seg ? seg.voice.emotion : undefined, txt);
    if (singing && 'voice' in seg) {
      const presetVoice =
        isMimoV25PresetVoice(seg.voice.voiceId) ? seg.voice.voiceId!.trim() : resolveFallbackPresetVoiceByText(txt);
      return {
        effectiveModelId: 'mimo-v2.5-tts',
        presetVoice,
        forcedPresetForSinging: true,
        scriptCharacter: ch,
        reason: 'preset_from_voice_id',
      };
    }
    return {
      effectiveModelId: 'mimo-v2.5-tts-voicedesign',
      voiceDesignPrompt: segPersona,
      scriptCharacter: ch,
      reason: 'voice_design',
    };
  }

  /** segment.voice.voiceId 若显式 MiMo 预置 */
  if ('voice' in seg && seg.voice.voiceId && isMimoV25PresetVoice(seg.voice.voiceId)) {
    return {
      effectiveModelId: 'mimo-v2.5-tts',
      presetVoice: seg.voice.voiceId.trim(),
      scriptCharacter: ch,
      reason: 'preset_from_voice_id',
    };
  }

  const fallbackVoice =
    ('voice' in seg && normalizeMimoUserVoicePreset(seg.voice.voiceId)) || resolveFallbackPresetVoiceByText(txt);

  /** 兜底：仍为预置链路，交由 UI warning */
  inferTextLanguageHint(txt);
  return {
    effectiveModelId: 'mimo-v2.5-tts',
    presetVoice: fallbackVoice,
    usedPresetFallback: true,
    scriptCharacter: ch,
    reason: 'preset_fallback',
  };
}
