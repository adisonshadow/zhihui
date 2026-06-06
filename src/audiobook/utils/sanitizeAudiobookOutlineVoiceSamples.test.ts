import { describe, expect, it } from 'vitest';
import type { AIModelConfig } from '@/types/settings';
import { sanitizeAudiobookOutlineVoiceSamples } from './sanitizeAudiobookOutlineVoiceSamples';

const voiceModel = (id: string): AIModelConfig => ({
  id,
  name: 'TTS',
  provider: 'dashscope',
  apiUrl: 'https://example.com',
  apiKey: 'sk',
  model: 'qwen3-tts',
  capabilityKeys: ['voice_over'],
});

describe('sanitizeAudiobookOutlineVoiceSamples', () => {
  it('无效旁白 engineId 时清除 cloud 字段', () => {
    const { binding, changed } = sanitizeAudiobookOutlineVoiceSamples(
      {
        narratorRelPath: '旁白.wav',
        narratorCloudEngineId: 'deleted',
        narratorCloudVoiceId: 'v1',
      },
      [voiceModel('m1')],
    );
    expect(changed).toBe(true);
    expect(binding?.narratorRelPath).toBe('旁白.wav');
    expect(binding?.narratorCloudEngineId).toBeUndefined();
    expect(binding?.narratorCloudVoiceId).toBeUndefined();
  });

  it('角色 cloud 仅 engine 无 voice 时清除该角色 cloud 映射', () => {
    const { binding, changed } = sanitizeAudiobookOutlineVoiceSamples(
      {
        byCharacterId: { c1: 'a.wav' },
        byCharacterCloudEngineId: { c1: 'm1' },
      },
      [voiceModel('m1')],
    );
    expect(changed).toBe(true);
    expect(binding?.byCharacterCloudEngineId).toBeUndefined();
    expect(binding?.byCharacterId?.c1).toBe('a.wav');
  });

  it('有效配对保持不变', () => {
    const input = {
      narratorCloudEngineId: 'm1',
      narratorCloudVoiceId: 'v1',
    };
    const { binding, changed } = sanitizeAudiobookOutlineVoiceSamples(input, [voiceModel('m1')]);
    expect(changed).toBe(false);
    expect(binding).toEqual(input);
  });
});
