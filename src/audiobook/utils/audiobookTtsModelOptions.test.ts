import { describe, expect, it } from 'vitest';
import {
  buildAudiobookTtsSelectOptions,
  capitalizeAudiobookModelIdLabel,
  defaultAudiobookTtsModelKey,
  resolveAudiobookTtsModelKeyForOptions,
  resolveSegmentTtsModelKey,
} from '@/audiobook/utils/audiobookTtsModelOptions';
import type { AISettings } from '@/types/settings';

const voiceModel = (partial: {
  id: string;
  name?: string;
  presetKey?: string;
  modelDisplayName?: string;
}) => ({
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
  apiKey: 'sk-test',
  capabilityKeys: ['voice_over'],
  ...partial,
});

const mimo = (partial: {
  id: string;
  modelDisplayName: string;
  capabilityKeys: string[];
}) => ({
  apiUrl: 'https://api.xiaomimimo.com/v1',
  apiKey: 'sk-test',
  ...partial,
});

describe('buildAudiobookTtsSelectOptions', () => {
  it('同一 preset 多版本时只显示首字母大写的 model id', () => {
    const config: AISettings = {
      models: [
        voiceModel({
          id: 'm1',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-flash',
        }),
        voiceModel({
          id: 'm2',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-instruct-flash',
        }),
      ],
    };
    const opts = buildAudiobookTtsSelectOptions(config);
    expect(opts.find((o) => o.value === 'm1')?.label).toBe('Qwen3-tts-flash');
    expect(opts.find((o) => o.value === 'm2')?.label).toBe('Qwen3-tts-instruct-flash');
  });

  it('仅一个版本时仍显示模型名称', () => {
    const config: AISettings = {
      models: [
        voiceModel({
          id: 'm1',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-flash',
        }),
      ],
    };
    const opts = buildAudiobookTtsSelectOptions(config);
    expect(opts.find((o) => o.value === 'm1')?.label).toBe('Qwen-TTS');
  });

  it('voicedesign / voiceclone / tts-vd 不出现在片段 TTS 下拉', () => {
    const config = {
      models: [
        mimo({ id: 'd1', modelDisplayName: 'mimo-v2.5-tts-voicedesign', capabilityKeys: ['voice_design'] }),
        mimo({ id: 'c1', modelDisplayName: 'mimo-v2.5-tts-voiceclone', capabilityKeys: ['voice_enrollment'] }),
        mimo({ id: 't1', modelDisplayName: 'mimo-v2.5-tts', capabilityKeys: ['voice_over'] }),
        voiceModel({
          id: 'qvd',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-vd-2026-01-26',
          capabilityKeys: ['voice_design'],
        }),
        voiceModel({
          id: 'qf',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-flash',
        }),
      ],
    };
    const opts = buildAudiobookTtsSelectOptions(config);
    expect(opts.map((o) => o.value).sort()).toEqual(['qf', 't1']);
  });
});

describe('capitalizeAudiobookModelIdLabel', () => {
  it('仅首字母大写', () => {
    expect(capitalizeAudiobookModelIdLabel('qwen3-tts-flash')).toBe('Qwen3-tts-flash');
  });
});

describe('defaultAudiobookTtsModelKey', () => {
  it('使用有声书设置中的默认模型', () => {
    const config: AISettings = {
      models: [
        voiceModel({
          id: 'm1',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-flash',
        }),
      ],
      audiobook: { defaultTtsModelKey: 'm1' },
    };
    expect(defaultAudiobookTtsModelKey(config)).toBe('m1');
    expect(resolveSegmentTtsModelKey(0, {}, config)).toBe('m1');
  });

  it('本地模型别名 moss_tts_local_mlx 对齐为 moss_tts', () => {
    const config: AISettings = {
      localTts: {
        enabled: true,
        modelKey: 'moss_tts',
        profiles: { moss_tts: { modelPath: '/tmp/moss' } },
      },
      audiobook: { defaultTtsModelKey: 'moss_tts_local_mlx' },
    };
    const opts = buildAudiobookTtsSelectOptions(config);
    expect(opts.some((o) => o.value === 'moss_tts')).toBe(true);
    expect(resolveAudiobookTtsModelKeyForOptions('moss_tts_local_mlx', config)).toBe('moss_tts');
    expect(defaultAudiobookTtsModelKey(config)).toBe('moss_tts');
  });

  it('localStorage 无效 key 回退默认', () => {
    const config: AISettings = {
      models: [
        voiceModel({
          id: 'm1',
          presetKey: 'qwen_tts',
          name: 'Qwen-TTS',
          modelDisplayName: 'qwen3-tts-flash',
        }),
      ],
      audiobook: { defaultTtsModelKey: 'm1' },
    };
    expect(resolveSegmentTtsModelKey(0, { 0: 'deleted-model-id' }, config)).toBe('m1');
  });
});
