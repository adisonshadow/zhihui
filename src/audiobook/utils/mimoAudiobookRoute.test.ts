import { describe, expect, it } from 'vitest';
import type { DialogueSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { resolveMimoRouteForAudiobookSegment } from '@/audiobook/utils/mimoAudiobookRoute';

describe('resolveMimoRouteForAudiobookSegment', () => {
  const script: Pick<Script, 'characters'> = {
    characters: [
      {
        id: 'hero',
        name: '林夜',
        description: '',
        personality: '',
        importance: 'MAIN',
        voiceCharacteristic: '青年男声偏低沉',
      },
    ],
  } as Pick<Script, 'characters'> as Script;

  it('对白 + 大纲 byCharacter → voiceclone', () => {
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'hero',
      text: '你好。',
      voice: { characterId: 'hero', tone: '平静' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      outline: { byCharacterId: { hero: 'samples/h.wav' } },
      novelScript: script,
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts-voiceclone');
    expect(r.referenceRelPath).toBe('samples/h.wav');
    expect(r.reason).toBe('outline_wav');
  });

  it('对白 + 大纲 xiaomi 内嵌预置 → preset 而非 voiceclone', () => {
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'lu-chen',
      text: '你好。',
      voice: { characterId: 'lu-chen', tone: '平静' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      outline: {
        byCharacterId: { 'lu-chen': 'PresetVoice/男-少年-苏打[xiaomi---苏打].wav' },
      },
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts');
    expect(r.presetVoice).toBe('苏打');
    expect(r.referenceRelPath).toBeUndefined();
    expect(r.reason).toBe('preset_from_voice_id');
  });

  it('旁白 narratorRelPath → voiceclone', () => {
    const seg = {
      type: SegmentType.Narration,
      text: '夜色。',
      voice: { characterId: 'narrator', tone: '低沉' },
    } as const;
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      outline: { narratorRelPath: 'n.wav' },
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts-voiceclone');
    expect(r.referenceRelPath).toBe('n.wav');
  });

  it('无 wav + 有声线描述 → voicedesign', () => {
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'hero',
      text: '一句。',
      voice: { characterId: 'hero', tone: '冷' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      novelScript: script,
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts-voicedesign');
    expect(r.voiceDesignPrompt).toContain('青年男声偏低沉');
    expect(r.reason).toBe('voice_design');
  });

  it('无 wav + 无声线描述但有片段 personaTag → voicedesign（次要角色）', () => {
    const scriptBare: Pick<Script, 'characters'> = {
      characters: [{ id: 'x', name: 'X', description: '', personality: '', importance: 'MINOR' }],
    } as Pick<Script, 'characters'> as Script;
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'x',
      text: '中文。',
      voice: { characterId: 'x', tone: '蛮横威胁', emotion: '凶狠', personaTag: '中老年男性' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      novelScript: scriptBare,
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts-voicedesign');
    expect(r.voiceDesignPrompt).toBe('中老年男性');
    expect(r.reason).toBe('voice_design');
  });

  it('无 wav + 无声线描述 → preset 兜底', () => {
    const scriptBare: Pick<Script, 'characters'> = {
      characters: [{ id: 'x', name: 'X', description: '', personality: '', importance: 'MINOR' }],
    } as Pick<Script, 'characters'> as Script;
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'x',
      text: '中文。',
      voice: { characterId: 'x', tone: '平' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      novelScript: scriptBare,
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts');
    expect(r.presetVoice).toBeTruthy();
    expect(r.usedPresetFallback).toBe(true);
  });

  it('克隆路径 + tone 标注唱歌 → 降至预置歌唱', () => {
    const seg: DialogueSegment = {
      type: SegmentType.Dialogue,
      speakerId: 'hero',
      text: '歌词。',
      voice: { characterId: 'hero', tone: '唱歌', emotion: '深情' },
    };
    const r = resolveMimoRouteForAudiobookSegment({
      segment: seg,
      outline: { byCharacterId: { hero: 's.wav' } },
      novelScript: script,
      playableText: '歌词。',
    });
    expect(r.effectiveModelId).toBe('mimo-v2.5-tts');
    expect(r.forcedPresetForSinging).toBe(true);
  });
});
