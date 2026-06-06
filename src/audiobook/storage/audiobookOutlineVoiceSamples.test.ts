import { describe, expect, it } from 'vitest';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';

describe('AudiobookOutlineVoiceSamples cloud fields', () => {
  it('JSON round-trip 保留 cloud 字段', () => {
    const input: AudiobookOutlineVoiceSamples = {
      narratorRelPath: '.yiman-voices/n.wav',
      narratorCloudEngineId: 'eng1',
      narratorCloudVoiceId: 'voice_abc',
      byCharacterCloudEngineId: { c1: 'eng2' },
      byCharacterCloudVoiceId: { c1: 'voice_xyz' },
    };
    const out = JSON.parse(JSON.stringify(input)) as AudiobookOutlineVoiceSamples;
    expect(out.narratorCloudVoiceId).toBe('voice_abc');
    expect(out.byCharacterCloudVoiceId?.c1).toBe('voice_xyz');
  });
});
