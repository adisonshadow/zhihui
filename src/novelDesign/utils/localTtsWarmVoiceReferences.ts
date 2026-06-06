/**
 * 本地 TTS：参考音色编码预热（编码一次、后续 /generate 复用）
 */
import type { AudiobookEpisode, AudioSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';
import type { AudiobookSettings } from '@/types/settings';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  pickReferenceRelPathForSegment,
  resolveReferenceTextForSegment,
  resolveVoiceSampleAbsolutePath,
} from '@/audiobook/utils/audiobookSegmentReference';
import { isLocalAudiobookTtsModelKey } from '@/audiobook/utils/audiobookTtsModelOptions';

const AI_SERVICE_BASE = 'http://127.0.0.1:19815';

export type VoiceRefWarmItem = {
  referenceAudioPath: string;
  referenceText?: string;
};

/** 本集需克隆的参考 wav 绝对路径（去重） */
export async function collectVoiceRefWarmItemsForEpisode(
  episode: AudiobookEpisode | null | undefined,
  outline: AudiobookOutlineVoiceSamples | undefined,
  audiobookSettings: AudiobookSettings | undefined,
): Promise<VoiceRefWarmItem[]> {
  if (!episode?.segments?.length) return [];
  const byPath = new Map<string, VoiceRefWarmItem>();

  for (const seg of episode.segments) {
    if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
      continue;
    }
    const refRel = pickReferenceRelPathForSegment(seg, outline);
    if (!refRel?.trim()) continue;
    const abs = await resolveVoiceSampleAbsolutePath(audiobookSettings, refRel);
    if (!abs?.trim() || byPath.has(abs)) continue;
    let referenceText: string | undefined;
    try {
      referenceText = await resolveReferenceTextForSegment({
        segment: seg,
        outline,
        referenceAudioAbsPath: abs,
      });
    } catch {
      referenceText = undefined;
    }
    byPath.set(abs, {
      referenceAudioPath: abs,
      ...(referenceText?.trim() ? { referenceText: referenceText.trim() } : {}),
    });
  }
  return [...byPath.values()];
}

export async function warmLocalTtsVoiceReference(
  modelKey: string,
  item: VoiceRefWarmItem,
): Promise<{ ok: boolean; message?: string; cache_hit?: boolean }> {
  const res = await fetch(`${AI_SERVICE_BASE}/api/v1/tts/warm-voice-reference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelKey,
      referenceAudioPath: item.referenceAudioPath,
      referenceText: item.referenceText,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    cache_hit?: boolean;
  };
  return {
    ok: data.ok === true,
    message: data.message,
    cache_hit: data.cache_hit,
  };
}

/** 为本集所有唯一参考音色预热（仅本地 TTS modelKey） */
export async function warmLocalTtsVoiceReferencesForEpisode(
  modelKey: string,
  episode: AudiobookEpisode | null | undefined,
  outline: AudiobookOutlineVoiceSamples | undefined,
  audiobookSettings: AudiobookSettings | undefined,
): Promise<{ warmed: number; failed: string[] }> {
  if (!isLocalAudiobookTtsModelKey(modelKey)) {
    return { warmed: 0, failed: [] };
  }
  const items = await collectVoiceRefWarmItemsForEpisode(episode, outline, audiobookSettings);
  let warmed = 0;
  const failed: string[] = [];
  for (const item of items) {
    const r = await warmLocalTtsVoiceReference(modelKey, item);
    if (r.ok) warmed += 1;
    else failed.push(r.message ?? item.referenceAudioPath);
  }
  return { warmed, failed };
}
