import { describe, expect, it } from 'vitest';
import {
  formatCosyVoice418Hint,
  isCosyVoiceV35ModelId,
  isInvalidCosyVoiceV35PresetVoice,
  normalizeCosyVoiceTargetModel,
  sanitizeCosyVoiceDesignPrefix,
} from '@/components/tts/cosyVoiceModelUtils';
import { defaultParamsForAdapter } from '@/components/tts/ttsModelAdapters';
import type { AIModelConfig } from '@/types/settings';

describe('cosyVoiceModelUtils', () => {
  it('识别 v3.5 模型', () => {
    expect(isCosyVoiceV35ModelId('cosyvoice-v3.5-plus')).toBe(true);
    expect(isCosyVoiceV35ModelId('cosyvoice-v3-flash')).toBe(false);
  });

  it('v3.5 拒绝 longanyang 预置音色', () => {
    expect(isInvalidCosyVoiceV35PresetVoice('cosyvoice-v3.5-flash', 'longanyang')).toBe(true);
    expect(isInvalidCosyVoiceV35PresetVoice('cosyvoice-v3.5-plus', 'cosyvoice-v3.5-plus-vd-yiman-abc')).toBe(
      false,
    );
  });

  it('normalizeCosyVoiceTargetModel', () => {
    expect(normalizeCosyVoiceTargetModel('CosyVoice v3.5 Plus')).toBe('cosyvoice-v3.5-plus');
  });

  it('sanitizeCosyVoiceDesignPrefix', () => {
    expect(sanitizeCosyVoiceDesignPrefix('yi_man')).toBe('yiman');
  });

  it('418 提示包含 v3.5 说明', () => {
    const msg = formatCosyVoice418Hint('[cosyvoice:]Engine return error code: 418', {
      modelId: 'cosyvoice-v3.5-plus',
      voiceId: 'longanyang',
    });
    expect(msg).toContain('v3.5');
    expect(msg).toContain('longanyang');
  });

  it('defaultParamsForAdapter：v3.5 不默认 longanyang', () => {
    const m: AIModelConfig = {
      id: 'c1',
      apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
      modelDisplayName: 'cosyvoice-v3.5-plus',
      capabilityKeys: ['voice_over'],
    };
    const p = defaultParamsForAdapter('cosyvoice_dashscope_ws', m);
    expect(p.voice).toBe('');
    expect(p.ttsVoiceSource).toBe('cloned_id');

    const legacy = defaultParamsForAdapter('cosyvoice_dashscope_ws', {
      ...m,
      modelDisplayName: 'cosyvoice-v3-flash',
    });
    expect(legacy.voice).toBe('longanyang');
  });
});
