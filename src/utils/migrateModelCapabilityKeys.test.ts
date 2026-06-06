import { describe, expect, it } from 'vitest';
import { migrateModelsCapabilityKeys } from '@/utils/migrateModelCapabilityKeys';
import type { AIModelConfig } from '@/types/settings';

describe('migrateModelsCapabilityKeys', () => {
  it('preset 实例 capabilityKeys 与 modal 不一致时对齐', () => {
    const models: AIModelConfig[] = [
      {
        id: 'c1',
        presetKey: 'xiaomi_mimo_tts',
        modelDisplayName: 'mimo-v2.5-tts-voiceclone',
        apiUrl: 'https://api.xiaomimimo.com/v1',
        apiKey: 'sk',
        capabilityKeys: ['voice_over', 'voice_enrollment'],
      },
      {
        id: 'vd1',
        presetKey: 'qwen_tts',
        modelDisplayName: 'qwen3-tts-vd-2026-01-26',
        apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
        apiKey: 'sk',
        capabilityKeys: ['voice_design', 'voice_over'],
      },
      {
        id: 't1',
        presetKey: 'xiaomi_mimo_tts',
        modelDisplayName: 'mimo-v2.5-tts',
        apiUrl: 'https://api.xiaomimimo.com/v1',
        apiKey: 'sk',
        capabilityKeys: ['voice_over'],
      },
    ];
    const { models: next, changed } = migrateModelsCapabilityKeys(models);
    expect(changed).toBe(true);
    expect(next.find((m) => m.id === 'c1')?.capabilityKeys).toEqual(['voice_enrollment']);
    expect(next.find((m) => m.id === 'vd1')?.capabilityKeys).toEqual(['voice_design']);
    expect(next.find((m) => m.id === 't1')?.capabilityKeys).toEqual(['voice_over']);
  });

  it('无 presetKey 的自定义模型不改动', () => {
    const models: AIModelConfig[] = [
      {
        id: 'x1',
        apiUrl: 'https://example.com',
        apiKey: 'sk',
        capabilityKeys: ['voice_over', 'voice_design'],
      },
    ];
    const { models: next, changed } = migrateModelsCapabilityKeys(models);
    expect(changed).toBe(false);
    expect(next[0]?.capabilityKeys).toEqual(['voice_over', 'voice_design']);
  });
});
