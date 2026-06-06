/**
 * 有声书片段 → 故事大纲中绑定的音色样本相对路径（相对设置里的「音色样本根目录」）
 */
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';
import type { Character, Script } from '@/constants/Script';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { resolveVoiceSampleReferenceText } from '@/audiobook/utils/audiobookVoiceSampleReferenceText';

/** 解析角色绑定的 key：对白用 speakerId，其次 voice.characterId */
function dialogueCharacterKeys(seg: AudioSegment & { speakerId: string; voice: { characterId: string } }): string[] {
  const keys = [seg.speakerId, seg.voice?.characterId].filter(Boolean) as string[];
  return [...new Set(keys)];
}

function characterKeysForRefText(
  seg: AudioSegment,
): string[] {
  if (seg.type === SegmentType.Dialogue) {
    return dialogueCharacterKeys(seg as AudioSegment & { speakerId: string; voice: { characterId: string } });
  }
  if (seg.type === SegmentType.InnerVoice) {
    return [...new Set([seg.characterId, seg.voice?.characterId].filter(Boolean) as string[])];
  }
  return [];
}

/** 故事大纲已为该说话人绑定参考 wav（克隆 / LongCat 主路径） */
export function segmentSpeakerHasOutlineVoiceBinding(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): boolean {
  return Boolean(pickReferenceRelPathForSegment(seg, outline)?.trim());
}

function scriptCharacterForSegment(seg: AudioSegment, script?: Script | null): Character | null {
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
 * 片段卡片是否展示「人设腔调」：仅当 TTS 会落到 personaTag 兜底（无大纲 wav、无剧本声线描述）时展示。
 */
export function shouldShowAudiobookSegmentPersonaTag(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
  script?: Script | null,
): boolean {
  const persona = 'voice' in seg ? seg.voice.personaTag?.trim() : '';
  if (!persona) return false;
  if (segmentSpeakerHasOutlineVoiceBinding(seg, outline)) return false;
  if (scriptCharacterForSegment(seg, script)?.voiceCharacteristic?.trim()) return false;
  return true;
}

export function pickReferenceRelPathForSegment(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): string | undefined {
  if (!outline) return undefined;
  const by = outline.byCharacterId;

  switch (seg.type) {
    case SegmentType.Narration:
    case SegmentType.ChapterTitle:
      return outline.narratorRelPath?.trim() || undefined;
    case SegmentType.Dialogue: {
      if (!by) return undefined;
      for (const k of dialogueCharacterKeys(seg)) {
        const p = by[k]?.trim();
        if (p) return p;
      }
      return undefined;
    }
    case SegmentType.InnerVoice: {
      if (!by) return undefined;
      const keys = [seg.characterId, seg.voice?.characterId].filter(Boolean) as string[];
      for (const k of [...new Set(keys)]) {
        const p = by[k]?.trim();
        if (p) return p;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** 故事大纲 JSON 中缓存的逐字稿（旧版）；新流程以 wav 同目录 .txt 为准，见 resolveReferenceTextForSegment */
export function pickReferenceRefTextForSegment(
  seg: AudioSegment,
  outline?: AudiobookOutlineVoiceSamples,
): string | undefined {
  if (!outline) return undefined;
  switch (seg.type) {
    case SegmentType.Narration:
    case SegmentType.ChapterTitle:
      return outline.narratorRefText?.trim() || undefined;
    case SegmentType.Dialogue:
    case SegmentType.InnerVoice: {
      const by = outline.byCharacterRefText;
      if (!by) return undefined;
      for (const k of characterKeysForRefText(seg)) {
        const t = by[k]?.trim();
        if (t) return t;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** 同目录 .txt 优先（与界面「仅选 wav、文稿放侧车文件」一致）；其次兼容旧数据里的大纲内嵌文稿 */
export async function resolveReferenceTextForSegment(params: {
  segment: AudioSegment;
  outline?: AudiobookOutlineVoiceSamples;
  referenceAudioAbsPath?: string;
}): Promise<string | undefined> {
  const fromDisk = await resolveVoiceSampleReferenceText(params.referenceAudioAbsPath);
  if (fromDisk) return fromDisk;
  return pickReferenceRefTextForSegment(params.segment, params.outline);
}

import type { AudiobookSettings } from '@/types/settings';
import {
  presetVoiceResolveRoots,
  resolveAudiobookVoiceSampleRoots,
  type AudiobookVoiceSampleRoots,
} from '@/audiobook/utils/audiobookVoiceSampleRoots';
import { getBuiltinPresetVoiceDir } from '@/audiobook/utils/builtinPresetVoiceDir';

export type { AudiobookVoiceSampleRoots };

export async function resolveVoiceSampleAbsolutePath(
  rootsOrLegacyRoot: AudiobookVoiceSampleRoots | AudiobookSettings | string | undefined,
  relPath: string | undefined,
): Promise<string | undefined> {
  const rel = relPath?.trim();
  if (!rel) return undefined;

  let roots: AudiobookVoiceSampleRoots;
  if (typeof rootsOrLegacyRoot === 'string') {
    const legacy = rootsOrLegacyRoot.trim();
    roots = { builtin: '', external: legacy, custom: legacy };
  } else if (
    rootsOrLegacyRoot &&
    typeof rootsOrLegacyRoot === 'object' &&
    ('builtin' in rootsOrLegacyRoot || 'external' in rootsOrLegacyRoot || 'custom' in rootsOrLegacyRoot)
  ) {
    roots = rootsOrLegacyRoot as AudiobookVoiceSampleRoots;
  } else {
    roots = resolveAudiobookVoiceSampleRoots(rootsOrLegacyRoot as AudiobookSettings | undefined);
    roots.builtin = await getBuiltinPresetVoiceDir();
  }

  const join = window.yiman?.fs?.pathJoin;
  const pathExists = window.yiman?.fs?.pathExists;
  if (!join) return undefined;
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return undefined;

  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('.yiman-voices/')) {
    const customRoot = roots.custom.trim();
    if (!customRoot) return undefined;
    try {
      return await join(customRoot, ...parts);
    } catch {
      return undefined;
    }
  }

  for (const root of presetVoiceResolveRoots(roots)) {
    const base = root.trim();
    if (!base) continue;
    try {
      const abs = await join(base, ...parts);
      if (pathExists) {
        if (await pathExists(abs)) return abs;
      } else {
        return abs;
      }
    } catch {
      /* 尝试下一个根目录 */
    }
  }
  return undefined;
}
