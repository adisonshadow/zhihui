import { describe, expect, it, vi, afterEach } from 'vitest';
import { decodeMinimaxHexAudio } from '@/components/tts/providers/minimaxApiUtils';
import { createMinimaxVoiceDesign } from '@/components/tts/providers/minimaxVoiceDesign';
import type { AIModelConfig } from '@/types/settings';

describe('decodeMinimaxHexAudio', () => {
  it('解码 hex 为 ArrayBuffer', () => {
    const buf = decodeMinimaxHexAudio('48656c6c6f');
    expect(buf).not.toBeNull();
    expect(new TextDecoder().decode(buf!)).toBe('Hello');
  });
});

describe('createMinimaxVoiceDesign', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const model: AIModelConfig = {
    id: 'mm1',
    apiUrl: 'https://api.minimaxi.com/v1',
    apiKey: 'sk-test',
    minimaxGroupId: 'group-1',
    modelDisplayName: 'speech-2.8-hd',
    capabilityKeys: ['voice_over', 'voice_design'],
  };

  it('解析 voice_id 与 trial_audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          voice_id: 'ttv-voice-test',
          trial_audio: '4869',
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
      })),
    );

    const res = await createMinimaxVoiceDesign({
      model,
      prompt: '低沉男声',
      previewText: '你好',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.voiceId).toBe('ttv-voice-test');
    expect(new TextDecoder().decode(res.previewArrayBuffer)).toBe('Hi');
  });

  it('缺少 GroupId 时失败', async () => {
    const res = await createMinimaxVoiceDesign({
      model: { ...model, minimaxGroupId: '' },
      prompt: 'test',
      previewText: 'hi',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/GroupId/);
  });
});
