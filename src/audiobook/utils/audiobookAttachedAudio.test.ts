import { describe, expect, it } from 'vitest';
import {
  coerceAttachedAudioItem,
  coerceAttachedAudioList,
  mergeAttachedAudioLists,
} from './audiobookAttachedAudio';
import { defaultAttachedAudioVolume } from './audiobookAttachedAudioDefaults';

describe('coerceAttachedAudioItem', () => {
  it('解析 AI 输入并 strip audioSrc', () => {
    const item = coerceAttachedAudioItem({
      kind: 'backgroundMusic',
      description: '悬疑低频弦乐',
      delay_sec: 1.5,
      audio_src: '/fake/path.mp3',
    });
    expect(item?.description).toBe('悬疑低频弦乐');
    expect(item?.delaySec).toBe(1.5);
    expect(item?.volume).toBe(defaultAttachedAudioVolume('backgroundMusic'));
    expect(item?.audioSrc).toBeUndefined();
  });

  it('preserveAudioSrc 时保留用户路径', () => {
    const item = coerceAttachedAudioItem(
      {
        id: 'a1',
        kind: 'soundEffect',
        description: '风声',
        delay_sec: 0,
        audio_src: '/Users/me/wind.wav',
      },
      { preserveAudioSrc: true },
    );
    expect(item?.audioSrc).toBe('/Users/me/wind.wav');
  });
});

describe('mergeAttachedAudioLists', () => {
  it('按 id 保留已有 audioSrc', () => {
    const merged = mergeAttachedAudioLists(
      [{ id: 'x', kind: 'soundEffect', description: '旧', delaySec: 0, volume: 0.8, audioSrc: '/a.wav' }],
      [{ id: 'x', kind: 'soundEffect', description: '新描述', delaySec: 2, volume: 0.8 }],
    );
    expect(merged[0]?.description).toBe('新描述');
    expect(merged[0]?.audioSrc).toBe('/a.wav');
  });
});

describe('coerceAttachedAudioList', () => {
  it('过滤无效项', () => {
    expect(coerceAttachedAudioList([{ kind: 'bgm' }, { kind: 'soundEffect', description: '门响' }])).toHaveLength(1);
  });

  it('未写 delay 时默认 1 秒', () => {
    const list = coerceAttachedAudioList([{ kind: 'soundEffect', description: '门响' }]);
    expect(list[0]?.delaySec).toBe(1);
  });
});
