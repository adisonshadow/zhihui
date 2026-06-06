import type { Script } from '@/constants/Script';
import type { AudiobookSettings, AIModelConfig, AISettings } from '@/types/settings';
import { SegmentType, type AudioSegment, type AudiobookEpisode } from '@/constants/Audiobook';
import { getEngineById } from '@/components/tts/ttsModelAdapters';
import {
  pickReferenceRelPathForSegment,
  resolveReferenceTextForSegment,
  resolveVoiceSampleAbsolutePath,
} from '@/audiobook/utils/audiobookSegmentReference';
import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';
import {
  prepareAudiobookMimoTtsLocally,
  mimoAssistTextForVoiceOverCacheKey,
} from '@/audiobook/utils/audiobookMimoAssist';
import { synthesizeAudiobookSegmentAudio } from '@/audiobook/utils/audiobookTtsSynthesize';
import {
  buildAudiobookTtsCacheKey,
  audiobookTtsCacheGet,
  audiobookTtsCacheLoadKeyFromDisk,
  audiobookTtsCacheSet,
} from '@/audiobook/utils/audiobookSegmentTtsCache';
import { isLocalAudiobookTtsModelKey } from '@/audiobook/utils/audiobookTtsModelOptions';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { segmentHasPlayableText } from '@/audiobook/utils/audiobookModel';

function segmentPlayableText(seg: AudioSegment): string {
  if (!segmentHasPlayableText(seg)) return '';
  if ('text' in seg) return seg.text.trim();
  return '';
}

export type SynthesizeAudiobookSegmentToCacheParams = {
  novelId?: string;
  episode: AudiobookEpisode;
  segmentIndex: number;
  modelKey: string;
  force: boolean;
  config: AISettings | null | undefined;
  models: AIModelConfig[];
  outlineVoice?: AudiobookOutlineVoiceSamples;
  novelScript?: Script | null;
  audiobookSettings?: AudiobookSettings;
  onWarning?: (msg: string) => void;
  onError?: (msg: string) => void;
};

/** 单段 TTS 合成并写入内存/磁盘缓存（导出与播放共用） */
export async function synthesizeAudiobookSegmentToCache(
  params: SynthesizeAudiobookSegmentToCacheParams,
): Promise<string | null> {
  const {
    novelId,
    episode: ep,
    segmentIndex: index,
    modelKey,
    force,
    config,
    models,
    outlineVoice,
    novelScript,
    audiobookSettings,
    onWarning,
    onError,
  } = params;

  const seg = ep.segments[index];
  if (!seg) return null;

  if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
    return null;
  }

  const rawText = segmentPlayableText(seg);
  if (!rawText) return null;

  const localPlainText = isLocalAudiobookTtsModelKey(modelKey)
    ? stripAudiobookTextForLocalTts(rawText)
    : undefined;
  if (isLocalAudiobookTtsModelKey(modelKey) && !localPlainText) {
    onError?.('去除语气标记与风格指令后正文为空，请保留可朗读的台词正文');
    return null;
  }

  const assistResolved = mimoAssistTextForVoiceOverCacheKey({
    modelKey,
    aiModels: models,
    segment: seg,
    outline: outlineVoice,
    novelScript,
  });

  const key = buildAudiobookTtsCacheKey({
    episodeId: ep.id,
    segmentIndex: index,
    segment: seg,
    outline: outlineVoice,
    modelKey,
    speed: 1,
    assistTextResolved: assistResolved,
    localPlainText,
  });
  if (!key) return null;

  if (!force) {
    let hit = audiobookTtsCacheGet(key);
    if (!hit && novelId?.trim()) {
      hit = await audiobookTtsCacheLoadKeyFromDisk(novelId.trim(), key);
    }
    if (hit) return hit;
  }

  let referenceAudioPath: string | undefined;
  let referenceText: string | undefined;
  if (isLocalAudiobookTtsModelKey(modelKey)) {
    const refRel = pickReferenceRelPathForSegment(seg, outlineVoice);
    referenceAudioPath = await resolveVoiceSampleAbsolutePath(audiobookSettings, refRel);
    referenceText = await resolveReferenceTextForSegment({
      segment: seg,
      outline: outlineVoice,
      referenceAudioAbsPath: referenceAudioPath,
    });
    if (referenceAudioPath) {
      const { warmLocalTtsVoiceReference } = await import(
        '@/novelDesign/utils/localTtsWarmVoiceReferences'
      );
      await warmLocalTtsVoiceReference(modelKey, {
        referenceAudioPath,
        referenceText: referenceText?.trim() || undefined,
      });
    }
    if (referenceAudioPath && !referenceText?.trim()) {
      throw new Error(
        'LongCat 语音克隆需要参考音频文稿：请在参考 wav 同目录放置同名 UTF-8 .txt（内容为 wav 里实际说的话）。',
      );
    }
  }

  if (getEngineById(models, modelKey)?.adapterKind === 'xiaomi_mimo_chat_audio') {
    const pf = prepareAudiobookMimoTtsLocally({
      segment: seg,
      outline: outlineVoice,
      novelScript,
      playbackText: rawText,
    }).usedPresetFallback;
    if (pf) {
      onWarning?.(
        '该说话人大纲未绑定 wav 或未配置声线描述，MiMo 已用内置预置音色兜底：请在「故事大纲」绑定音色样本以更贴近你的角色音色。',
      );
    }
  }

  const blob = await synthesizeAudiobookSegmentAudio({
    modelKey,
    text: localPlainText ?? rawText,
    speed: 1,
    referenceAudioPath,
    referenceText,
    segment: seg,
    config,
    outline: outlineVoice,
    novelScript,
    audiobookSettings,
  });
  return audiobookTtsCacheSet(key, blob, novelId);
}
