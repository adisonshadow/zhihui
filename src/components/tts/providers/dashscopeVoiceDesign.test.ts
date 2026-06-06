import { describe, expect, it } from 'vitest';
import {
  inferDashscopeVoiceDesignKind,
  isQwenVoiceDesignModelId,
} from '@/components/tts/providers/dashscopeVoiceDesign';
import type { AIModelConfig } from '@/types/settings';
import { voiceDesignLimitsForEngine } from '@/novelDesign/utils/voiceDesignSynthesize';
import { buildTtsEngineListFromModels } from '@/components/tts/ttsModelAdapters';

describe('dashscopeVoiceDesign', () => {
  it('识别 Qwen 声音设计 model id', () => {
    expect(isQwenVoiceDesignModelId('qwen3-tts-vd-2026-01-26')).toBe(true);
    expect(isQwenVoiceDesignModelId('qwen3-tts-flash')).toBe(false);
  });

  it('inferDashscopeVoiceDesignKind：仅 Qwen', () => {
    const qwenVd: AIModelConfig = {
      id: 'q1',
      apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
      apiKey: 'k',
      modelDisplayName: 'qwen3-tts-vd-2026-01-26',
      capabilityKeys: ['voice_design'],
    };
    expect(inferDashscopeVoiceDesignKind(qwenVd)).toBe('qwen');
    const cosy: AIModelConfig = {
      id: 'c1',
      apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
      apiKey: 'k',
      modelDisplayName: 'cosyvoice-v3.5-flash',
      capabilityKeys: ['voice_design'],
    };
    expect(inferDashscopeVoiceDesignKind(cosy)).toBeNull();
  });

  it('voiceDesignLimitsForEngine：Qwen 字数上限', () => {
    const qwen = buildTtsEngineListFromModels([
      {
        id: 'q1',
        apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
        apiKey: 'k',
        modelDisplayName: 'qwen3-tts-vd-2026-01-26',
        capabilityKeys: ['voice_design'],
      },
    ])[0]!;
    expect(voiceDesignLimitsForEngine(qwen)).toEqual({ previewTextMax: 1024, voicePromptMax: 2048 });
  });
});
