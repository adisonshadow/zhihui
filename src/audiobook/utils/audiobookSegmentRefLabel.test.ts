import { describe, expect, it } from 'vitest';
import { SegmentType } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import {
  formatAudiobookSegmentRefIndicator,
  resolveAudiobookSegmentSpeakerDisplayName,
} from './audiobookSegmentRefLabel';

const script: Script = {
  id: 's1',
  title: 't',
  genre: [],
  logline: '',
  style: { artStyle: '写实' },
  targetDuration: 60,
  characters: [
    { id: 'jiang_ci', name: '江辞', description: '', personality: '', importance: 'MAIN' },
    {
      id: 'jiang_ci-画外音',
      name: '江辞画外音',
      description: '',
      personality: '',
      importance: 'MAIN',
    },
    { id: 'shen', name: '沈管家', description: '', personality: '', importance: 'SECONDARY' },
  ],
  episodes: [],
  metadata: { createdAt: '', updatedAt: '' },
};

describe('resolveAudiobookSegmentSpeakerDisplayName', () => {
  it('画外音专用 id 显示原角色名而非 id', () => {
    const name = resolveAudiobookSegmentSpeakerDisplayName(
      {
        type: SegmentType.InnerVoice,
        characterId: 'jiang_ci-画外音',
        text: '……',
        voice: { characterId: 'jiang_ci-画外音', tone: '平' },
      },
      script,
    );
    expect(name).toBe('江辞');
  });

  it('对白 speakerId 显示角色名', () => {
    const name = resolveAudiobookSegmentSpeakerDisplayName(
      {
        type: SegmentType.Dialogue,
        speakerId: 'shen',
        text: '请进',
        voice: { characterId: 'shen', tone: '粗' },
      },
      script,
    );
    expect(name).toBe('沈管家');
  });
});

describe('formatAudiobookSegmentRefIndicator', () => {
  it('refIndicator 使用角色名', () => {
    const label = formatAudiobookSegmentRefIndicator(
      6,
      {
        type: SegmentType.InnerVoice,
        characterId: 'jiang_ci-画外音',
        text: 'x',
        voice: { characterId: 'jiang_ci-画外音', tone: '平' },
      },
      script,
    );
    expect(label).toBe('#7 画外音 江辞');
  });
});
