import { describe, expect, it } from 'vitest';
import {
  parseEmbeddedPresetVoiceIdFromFileName,
  parseEmbeddedPresetVoiceIdFromPath,
  embeddedVoiceMatchesModel,
  formatVoiceSampleDisplayName,
  resolveEmbeddedMimoPresetFromPath,
} from '@/audiobook/utils/embeddedPresetVoiceId';
import type { AIModelConfig } from '@/types/settings';

describe('embeddedPresetVoiceId', () => {
  it('parses minimax bracket from wav filename', () => {
    const r = parseEmbeddedPresetVoiceIdFromFileName(
      '男-雄浑-纪录片[minimax---Chinese_deep_voiced_male_vv1].wav',
    );
    expect(r).toEqual({
      provider: 'minimax',
      voiceId: 'Chinese_deep_voiced_male_vv1',
    });
  });

  it('parses from relative path', () => {
    const r = parseEmbeddedPresetVoiceIdFromPath(
      'PresetVoice/男-雄浑-纪录片[minimax---Chinese_deep_voiced_male_vv1].wav',
    );
    expect(r?.voiceId).toBe('Chinese_deep_voiced_male_vv1');
  });

  it('returns null when no bracket', () => {
    expect(parseEmbeddedPresetVoiceIdFromFileName('narrator.wav')).toBeNull();
  });

  it('formats display name with provider brand, no extension', () => {
    expect(
      formatVoiceSampleDisplayName(
        'PresetVoice/男-温润[minimax---Chinese (Mandarin)_Gentleman].mp3',
      ),
    ).toBe('男-温润(Minimax)');
  });

  it('formats plain filename without embedded tag', () => {
    expect(formatVoiceSampleDisplayName('narrator.wav')).toBe('narrator');
  });

  it('matches MiniMax Speech model token', () => {
    const embedded = parseEmbeddedPresetVoiceIdFromFileName(
      'x[minimax---vid_1].wav',
    )!;
    const model: AIModelConfig = {
      id: 'm1',
      name: 'MiniMax Speech',
      apiUrl: 'https://api.minimaxi.com',
      apiKey: 'k',
      model: 'speech-2.8-hd',
      capabilityKeys: ['voice_over'],
      minimaxGroupId: 'g',
    };
    expect(embeddedVoiceMatchesModel(embedded, model)).toBe(true);
  });

  it('parses xiaomi embedded preset and resolves MiMo preset voice', () => {
    const r = parseEmbeddedPresetVoiceIdFromFileName('男-少年-苏打[xiaomi---苏打].wav');
    expect(r).toEqual({ provider: 'xiaomi', voiceId: '苏打' });
    expect(resolveEmbeddedMimoPresetFromPath('PresetVoice/男-少年-苏打[xiaomi---苏打].wav')).toBe('苏打');
    expect(
      formatVoiceSampleDisplayName('男-少年-苏打[xiaomi---苏打].wav'),
    ).toBe('男-少年-苏打(Xiaomi)');
  });

  it('matches MiMo model for xiaomi or mimo provider token', () => {
    const embedded = parseEmbeddedPresetVoiceIdFromFileName('x[mimo---茉莉].wav')!;
    const model: AIModelConfig = {
      id: 'm2',
      name: 'MiMo TTS',
      apiUrl: 'https://api.xiaomimimo.com',
      apiKey: 'k',
      model: 'mimo-v2.5-tts',
      capabilityKeys: ['voice_over'],
    };
    expect(embeddedVoiceMatchesModel(embedded, model)).toBe(true);
  });
});
