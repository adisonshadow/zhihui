import { describe, expect, it } from 'vitest';
import { SegmentType } from '@/constants/Audiobook';
import {
  countMimoInlineBracketTags,
  patchTouchesAudiobookTtsVoice,
} from './audiobookMimoInlineTags';
import { mergeAudiobookSegmentPatch } from './audiobookModel';

describe('audiobookMimoInlineTags', () => {
  it('统计句内方括号标签', () => {
    const t =
      '[紧张，深呼吸]呼……[语速加快，碎碎念]自我介绍[小声]哎呀';
    expect(countMimoInlineBracketTags(t)).toBe(3);
  });

  it('纯文本为 0', () => {
    expect(countMimoInlineBracketTags('你好，请进。')).toBe(0);
  });

  it('patch 改 tone 视为 TTS voice 更新', () => {
    expect(patchTouchesAudiobookTtsVoice({ voice: { tone: '急促' } })).toBe(true);
    expect(patchTouchesAudiobookTtsVoice({ text: 'x' })).toBe(false);
  });
});

describe('mergeAudiobookSegmentPatch', () => {
  it('仅 patch voice 时保留原 text 与 speakerId', () => {
    const existing = {
      type: SegmentType.Dialogue as const,
      text: '原来你早就知道。',
      speakerId: 'hero',
      voice: { characterId: 'hero', tone: '平' },
    };
    const merged = mergeAudiobookSegmentPatch(existing, {
      voice: { tone: '颤抖、压低声' },
    });
    expect(merged?.type).toBe(SegmentType.Dialogue);
    if (merged?.type === SegmentType.Dialogue) {
      expect(merged.speakerId).toBe('hero');
      expect(merged.text).toBe('原来你早就知道。');
      expect(merged.voice.tone).toBe('颤抖，压低声');
    }
  });
});
