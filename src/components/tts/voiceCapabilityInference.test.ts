import { describe, expect, it } from 'vitest';
import {
  findVoiceDesignEngines,
  findVoiceEnrollmentEngines,
  hasVoiceDesignCapability,
  hasVoiceEnrollmentCapability,
} from '@/components/tts/voiceCapabilityInference';
import { buildVoiceOverEngineList } from '@/components/tts/ttsModelAdapters';
import type { AIModelConfig } from '@/types/settings';

const mimo = (partial: Partial<AIModelConfig> & { id: string; modelDisplayName: string }): AIModelConfig => ({
  apiUrl: 'https://api.xiaomimimo.com/v1',
  apiKey: 'sk-test',
  capabilityKeys: [],
  ...partial,
});

const qwen = (partial: Partial<AIModelConfig> & { id: string }): AIModelConfig => ({
  apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
  apiKey: 'sk-test',
  capabilityKeys: ['voice_over', 'voice_enrollment'],
  modelDisplayName: 'qwen3-tts-flash',
  ...partial,
});

const minimax = (partial: Partial<AIModelConfig> & { id: string }): AIModelConfig => ({
  apiUrl: 'https://api.minimaxi.com/v1',
  apiKey: 'sk-test',
  minimaxGroupId: 'g1',
  modelDisplayName: 'speech-2.8-hd',
  capabilityKeys: ['voice_over', 'voice_enrollment', 'voice_design'],
  ...partial,
});

describe('voiceCapabilityInference', () => {
  it('voice_design：MiMo / Qwen / MiniMax', () => {
    const models = [
      mimo({ id: 'd1', modelDisplayName: 'mimo-v2.5-tts-voicedesign', capabilityKeys: ['voice_design'] }),
      {
        id: 'qvd1',
        apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
        apiKey: 'sk-test',
        modelDisplayName: 'qwen3-tts-vd-2026-01-26',
        capabilityKeys: ['voice_design'],
      } as AIModelConfig,
      minimax({ id: 'mm1' }),
      qwen({ id: 'q1', capabilityKeys: ['voice_over'] }),
    ];
    expect(findVoiceDesignEngines(models).map((e) => e.engineId).sort()).toEqual(['d1', 'mm1', 'qvd1']);
  });

  it('voice_enrollment：MiniMax Speech（API 模式，非独立模型）', () => {
    const models = [minimax({ id: 'mm1' })];
    expect(hasVoiceEnrollmentCapability(models[0]!)).toBe(true);
    expect(findVoiceEnrollmentEngines(models).map((e) => e.engineId)).toEqual(['mm1']);
  });

  it('voice_enrollment：Qwen flash / instruct 无音色复制能力', () => {
    const flash = qwen({ id: 'q1', modelDisplayName: 'qwen3-tts-flash', capabilityKeys: ['voice_over'] });
    const instruct = qwen({
      id: 'q2',
      modelDisplayName: 'qwen3-tts-instruct-flash',
      capabilityKeys: ['voice_over'],
    });
    expect(hasVoiceEnrollmentCapability(flash)).toBe(false);
    expect(hasVoiceEnrollmentCapability(instruct)).toBe(false);
    expect(findVoiceEnrollmentEngines([flash, instruct])).toHaveLength(0);
  });

  it('voice_enrollment：Qwen tts-vc 模型', () => {
    const vc = qwen({
      id: 'qvc',
      modelDisplayName: 'qwen3-tts-vc-2026-01-22',
      capabilityKeys: ['voice_enrollment'],
    });
    expect(hasVoiceEnrollmentCapability(vc)).toBe(true);
    expect(findVoiceEnrollmentEngines([vc]).map((e) => e.engineId)).toEqual(['qvc']);
  });

  it('旧配置 slug 含 tts-vc 可推断 Qwen 音色复制', () => {
    const legacy = qwen({
      id: 'legacy-vc',
      modelDisplayName: 'qwen3-tts-vc-2026-01-22',
      capabilityKeys: ['voice_over'],
    });
    expect(findVoiceEnrollmentEngines([legacy])).toHaveLength(1);
  });

  it('MiniMax 三 capability 时仍只进 voice_over 片段下拉', () => {
    const models = [minimax({ id: 'mm1' })];
    expect(buildVoiceOverEngineList(models).map((e) => e.engineId)).toEqual(['mm1']);
    expect(findVoiceDesignEngines(models)).toHaveLength(1);
    expect(findVoiceEnrollmentEngines(models)).toHaveLength(1);
  });

  it('旧配置 slug 含 voicedesign 可推断 voice_design', () => {
    const model = mimo({
      id: 'legacy',
      modelDisplayName: 'mimo-v2.5-tts-voicedesign',
      capabilityKeys: ['voice_over'],
    });
    expect(hasVoiceDesignCapability(model)).toBe(true);
  });

  it('voice_enrollment：MiMo voiceclone 实例', () => {
    const model = mimo({
      id: 'c1',
      modelDisplayName: 'mimo-v2.5-tts-voiceclone',
      capabilityKeys: ['voice_enrollment'],
    });
    expect(hasVoiceEnrollmentCapability(model)).toBe(true);
    expect(findVoiceEnrollmentEngines([model])).toHaveLength(1);
    expect(findVoiceEnrollmentEngines([model])[0]?.engineId).toBe('c1');
  });

  it('旧配置 slug 含 voiceclone 可推断 MiMo 音色复制', () => {
    const model = mimo({
      id: 'legacy-clone',
      modelDisplayName: 'mimo-v2.5-tts-voiceclone',
      capabilityKeys: ['voice_over'],
    });
    expect(findVoiceEnrollmentEngines([model])).toHaveLength(1);
  });

  it('voicedesign 不出现在 voice_over 引擎列表', () => {
    const models = [
      mimo({ id: 'd1', modelDisplayName: 'mimo-v2.5-tts-voicedesign', capabilityKeys: ['voice_design'] }),
      mimo({ id: 't1', modelDisplayName: 'mimo-v2.5-tts', capabilityKeys: ['voice_over'] }),
    ];
    const list = buildVoiceOverEngineList(models);
    expect(list.map((e) => e.engineId)).toEqual(['t1']);
  });
});
