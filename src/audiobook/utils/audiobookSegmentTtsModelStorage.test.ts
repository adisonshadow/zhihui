import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AISettings } from '@/types/settings';
import {
  sanitizeSegmentTtsModelKeys,
  loadAndSanitizeSegmentTtsModelKeys,
  saveSegmentTtsModelKeys,
} from './audiobookSegmentTtsModelStorage';

describe('sanitizeSegmentTtsModelKeys', () => {
  const config: AISettings = {
    models: [
      {
        id: 'm1',
        name: 'MiMo',
        provider: 'xiaomi',
        apiUrl: 'https://api.example.com',
        apiKey: 'sk',
        model: 'mimo-v2.5-tts',
        capabilityKeys: ['voice_over'],
      },
    ],
    localTts: {
      enabled: true,
      modelKey: 'longcat_audio_dit',
      profiles: { longcat_audio_dit: { modelPath: '/models/lc' } },
    },
    audiobook: { defaultTtsModelKey: 'm1' },
  };

  it('删除无法对齐下拉的 key', () => {
    const { keys, changed } = sanitizeSegmentTtsModelKeys({ 0: 'gone-model', 1: 'm1', 2: 'longcat_audio_dit' }, config);
    expect(changed).toBe(true);
    expect(keys).toEqual({ 1: 'm1', 2: 'longcat_audio_dit' });
  });

  it('本地别名 moss_tts_local_mlx 规范为 moss_tts', () => {
    const { keys, changed } = sanitizeSegmentTtsModelKeys({ 0: 'moss_tts_local_mlx' }, config);
    expect(changed).toBe(true);
    expect(keys[0]).toBe('moss_tts');
  });
});

describe('loadAndSanitizeSegmentTtsModelKeys', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
    });
  });

  it('加载后写回清理结果', () => {
    saveSegmentTtsModelKeys('n1', 'e1', { 0: 'invalid-id' });
    const config: AISettings = {
      models: [
        {
          id: 'm1',
          name: 'TTS',
          provider: 'x',
          apiUrl: 'https://x',
          apiKey: 'k',
          model: 'm',
          capabilityKeys: ['voice_over'],
        },
      ],
    };
    const keys = loadAndSanitizeSegmentTtsModelKeys('n1', 'e1', config);
    expect(keys).toEqual({});
    const raw = JSON.parse(
      (localStorage as { store: Record<string, string> }).store['yiman:audiobook:segment-tts-model:n1:e1'] ?? '{}',
    );
    expect(raw).toEqual({});
  });
});
