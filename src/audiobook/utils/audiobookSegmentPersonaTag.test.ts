import { describe, expect, it } from 'vitest';
import { SegmentType } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { shouldShowAudiobookSegmentPersonaTag } from './audiobookSegmentReference';

const script: Script = {
  id: 's1',
  title: 't',
  genre: [],
  logline: '',
  style: { artStyle: '写实' },
  targetDuration: 60,
  characters: [
    {
      id: 'chu_yao',
      name: '楚瑶',
      description: '',
      personality: '',
      importance: 'MAIN',
      voiceCharacteristic: '年轻女声',
    },
    {
      id: 'extra',
      name: '路人',
      description: '',
      personality: '',
      importance: 'MINOR',
    },
  ],
  episodes: [],
  metadata: { createdAt: '', updatedAt: '' },
};

describe('shouldShowAudiobookSegmentPersonaTag', () => {
  const dialogue = {
    type: SegmentType.Dialogue as const,
    speakerId: 'chu_yao',
    text: '你好',
    voice: { characterId: 'chu_yao', tone: '自然', personaTag: '年轻女声，带着房东女儿的傲气' },
  };

  it('大纲已绑 wav 时不展示人设腔调', () => {
    expect(
      shouldShowAudiobookSegmentPersonaTag(dialogue, { byCharacterId: { chu_yao: 'voices/chu.wav' } }, script),
    ).toBe(false);
  });

  it('剧本有声线描述但未绑 wav 时不展示', () => {
    expect(shouldShowAudiobookSegmentPersonaTag(dialogue, undefined, script)).toBe(false);
  });

  it('无 wav 且无声线描述时展示 personaTag', () => {
    const minor = {
      type: SegmentType.Dialogue as const,
      speakerId: 'extra',
      text: '嗯',
      voice: { characterId: 'extra', tone: '平', personaTag: '沙哑老者' },
    };
    expect(shouldShowAudiobookSegmentPersonaTag(minor, undefined, script)).toBe(true);
  });
});
