import type { AudioSegment } from '@/constants/Audiobook';
import type { AISettings, AudiobookSettings } from '@/types/settings';
import type { Script } from '@/constants/Script';
import { restSegmentForLocalTtsModelKey } from '@/types/settings';
import { fetchRemoteTtsAudio, getEngineById } from '@/components/tts/ttsModelAdapters';
import { postLocalTtsSynthesis } from '@/audiobook/utils/audiobookTtsRequest';
import {
  audiobookTtsParamsForSegment,
  isLocalAudiobookTtsModelKey,
  normalizeLocalTtsModelKey,
} from '@/audiobook/utils/audiobookTtsModelOptions';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';
import {
  prepareAudiobookMimoTtsLocally,
  pickPlayableTrimmedText,
} from '@/audiobook/utils/audiobookMimoAssist';
import {
  pickReferenceRelPathForSegment,
  resolveVoiceSampleAbsolutePath,
} from '@/audiobook/utils/audiobookSegmentReference';
import { resolveEmbeddedPresetVoiceForEngine } from '@/audiobook/utils/embeddedPresetVoiceId';
import { pickOutlineCloudVoiceForSegment } from '@/audiobook/utils/outlineVoiceBindingDisplay';
import type { TtsEngineOption } from '@/components/tts/ttsModelAdapters';

/** voiceclone payload 近似上限（官方：Base64 串 ≤10MB） */
const MIMO_VOICECLONE_PAYLOAD_WARN = 13_421_772;

async function loadVoiceCloneDataUrlFromOutline(
  audiobookSettings: AudiobookSettings | undefined,
  relPath: string,
): Promise<string> {
  /**
   * MiMo 专用：接口无 voice id，每次请求内联 data:audio/...;base64。
   * 不适用 remoteVoiceIdCache；见 ensureRemoteVoiceId / 云端三家复刻链路。
   */
  const abs = await resolveVoiceSampleAbsolutePath(audiobookSettings, relPath.trim());
  if (!abs?.trim()) {
    throw new Error('无法在本地解析大纲绑定的音色样本路径，请确认预制/自定义音色目录与相对路径是否正确。');
  }
  const read = window.yiman?.fs?.readFileAsDataUrl;
  if (!read) throw new Error('当前环境不支持读取音色样本文件（请在桌面客户端使用音色克隆）。');
  const du = await read(abs.trim());
  if (!du || !du.startsWith('data:'))
    throw new Error('读取参考音频失败（需 wav/mp3），请在大纲重新选择音色文件。');

  if (du.length > MIMO_VOICECLONE_PAYLOAD_WARN) {
    throw new Error('参考音频过大（克隆 payload 须在约 10MB 以内）；请换用较短样本或压缩为 mp3/wav。');
  }
  return du;
}

/** 有声书：大纲 wav → 云端复刻参数（MiniMax / Qwen） */
async function applyAudiobookRemoteVoiceCloneParams(
  engine: TtsEngineOption,
  ttsParams: Record<string, unknown>,
  opts: {
    modelKey: string;
    segment: AudioSegment;
    outline?: AudiobookOutlineVoiceSamples;
    referenceAudioPath?: string;
    referenceText?: string;
    audiobookSettings?: AudiobookSettings;
    outlineRelPath?: string;
  },
): Promise<Record<string, unknown>> {
  const kind = engine.adapterKind;
  if (kind !== 'minimax_t2a_v2' && kind !== 'qwen3_tts_dashscope') {
    return ttsParams;
  }

  const relForEmbedded = opts.outlineRelPath?.trim();
  if (relForEmbedded) {
    const embedded = resolveEmbeddedPresetVoiceForEngine(relForEmbedded, engine);
    if (embedded) {
      return {
        ...ttsParams,
        ttsVoiceSource: 'cloned_id',
        ttsClonedVoiceId: embedded.voiceId,
        voice: embedded.voiceId,
      };
    }
  }

  const cloud = pickOutlineCloudVoiceForSegment(opts.segment, opts.outline);
  if (cloud.engineId === opts.modelKey && cloud.voiceId) {
    return {
      ...ttsParams,
      ttsVoiceSource: 'cloned_id',
      ttsClonedVoiceId: cloud.voiceId,
      voice: cloud.voiceId,
    };
  }

  let abs = opts.referenceAudioPath?.trim() || '';
  if (!abs && opts.outlineRelPath?.trim()) {
    abs =
      (await resolveVoiceSampleAbsolutePath(opts.audiobookSettings, opts.outlineRelPath.trim()))?.trim() ||
      '';
  }

  const vsRaw = typeof ttsParams.ttsVoiceSource === 'string' ? ttsParams.ttsVoiceSource.trim() : 'preset';
  const clonedId =
    typeof ttsParams.ttsClonedVoiceId === 'string' ? ttsParams.ttsClonedVoiceId.trim() : '';
  const publicUrl =
    typeof ttsParams.ttsClonePublicUrl === 'string' ? ttsParams.ttsClonePublicUrl.trim() : '';

  if (vsRaw === 'cloned_id' && clonedId) {
    return { ...ttsParams, ttsVoiceSource: 'cloned_id', ttsClonedVoiceId: clonedId };
  }
  if (vsRaw === 'clone_from_url' && publicUrl) {
    return { ...ttsParams, ttsVoiceSource: 'clone_from_url', ttsClonePublicUrl: publicUrl };
  }

  // CosyVoice 分支已停用
  // if (kind === 'cosyvoice_dashscope_ws') { ... }

  if (abs && (vsRaw === 'preset' || vsRaw === 'clone_from_file')) {
    return {
      ...ttsParams,
      ttsVoiceSource: 'clone_from_file',
      ttsCloneAudioPath: abs,
      ttsReferenceText: opts.referenceText?.trim() || '',
      ttsVoicePrefix: 'yiman',
    };
  }

  return ttsParams;
}

function blobMimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.wav') return 'audio/wav';
  if (e === '.ogg') return 'audio/ogg';
  if (e === '.opus') return 'audio/opus';
  if (e === '.pcm16' || e === '.pcm') return 'audio/pcm';
  return 'audio/mpeg';
}

/** 按工作台所选模型（本地 key 或云端 engineId）合成单段 TTS */
export async function synthesizeAudiobookSegmentAudio(params: {
  modelKey: string;
  text: string;
  speed?: number;
  referenceAudioPath?: string;
  /** LongCat：参考 wav 逐字稿 */
  referenceText?: string;
  segment: AudioSegment;
  config: AISettings | null | undefined;
  outline?: AudiobookOutlineVoiceSamples;
  novelScript?: Script | null;
  audiobookSettings?: AudiobookSettings;
}): Promise<Blob> {
  const { modelKey, text, segment, config } = params;
  const speed = params.speed ?? 1;

  if (isLocalAudiobookTtsModelKey(modelKey)) {
    const mk = normalizeLocalTtsModelKey(modelKey);
    const plainText = stripAudiobookTextForLocalTts(text);
    if (!plainText) {
      throw new Error('去除语气标记与风格指令后正文为空，请保留可朗读的台词正文。');
    }
    return postLocalTtsSynthesis({
      restSegment: restSegmentForLocalTtsModelKey(mk),
      modelKey: mk,
      text: plainText,
      speed,
      referenceAudioPath: params.referenceAudioPath,
      referenceText: params.referenceText,
    });
  }

  const engine = getEngineById(config?.models ?? [], modelKey);
  if (!engine) throw new Error('未找到该 TTS 模型，请检查设置中的「生成配音」配置');

  const ttsBase = audiobookTtsParamsForSegment(segment, engine);

  let finalText = text.trim();
  /** 合并参数起始 */
  let ttsParams: Record<string, unknown> = { ...ttsBase };

  if (engine.adapterKind === 'xiaomi_mimo_chat_audio') {
    const playable = pickPlayableTrimmedText(segment) || text.trim();
    const prep = prepareAudiobookMimoTtsLocally({
      segment,
      outline: params.outline,
      novelScript: params.novelScript,
      playbackText: playable,
    });
    finalText = prep.enrichedAssistant;
    const { _mimoReferenceRelHint: relHintRaw, ...restPrep } = prep.ttsExtras as Record<string, unknown> & {
      _mimoReferenceRelHint?: unknown;
    };
    ttsParams = { ...ttsParams, ...restPrep, mimoPreformattedAssistant: true };

    if (ttsParams.mimoOptimizeTextPreview === undefined) {
      ttsParams.mimoOptimizeTextPreview = false;
    }

    if (prep.mimoEffectiveModelId === 'mimo-v2.5-tts-voiceclone') {
      const rel = typeof relHintRaw === 'string' ? relHintRaw : '';
      if (!rel.trim()) throw new Error('MiMo V2.5 克隆缺少大纲 wav 绑定，请在「故事大纲」为该说话人绑定参考音频。');
      try {
        ttsParams.mimoVoiceCloneDataUrl = await loadVoiceCloneDataUrlFromOutline(
          params.audiobookSettings,
          rel,
        );
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
    }
    delete (ttsParams as { _mimoReferenceRelHint?: unknown })._mimoReferenceRelHint;

    /** 语速：MiMo HTTP 无双速字段（导演模式已通过 enrich 融入 tone）——仍写入 params.speed 仅占位 */
    void speed;

    try {
      const remote = await fetchRemoteTtsAudio(engine, finalText, ttsParams);
      if (!remote.ok) throw new Error(remote.error);
      return new Blob([remote.arrayBuffer], { type: blobMimeFromExt(remote.ext) });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  }

  ttsParams = { ...ttsParams, speed };
  const outlineRelPath = pickReferenceRelPathForSegment(params.segment, params.outline);
  ttsParams = await applyAudiobookRemoteVoiceCloneParams(engine, ttsParams, {
    modelKey,
    segment,
    outline: params.outline,
    referenceAudioPath: params.referenceAudioPath,
    referenceText: params.referenceText,
    audiobookSettings: params.audiobookSettings,
    outlineRelPath,
  });
  const remote = await fetchRemoteTtsAudio(engine, finalText, ttsParams);
  if (!remote.ok) throw new Error(remote.error);
  return new Blob([remote.arrayBuffer], { type: blobMimeFromExt(remote.ext) });
}
