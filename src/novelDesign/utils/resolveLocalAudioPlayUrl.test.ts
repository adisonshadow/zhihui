import { describe, expect, it } from 'vitest';
import { resolveLocalAudioPlayUrl } from './resolveLocalAudioPlayUrl';

describe('resolveLocalAudioPlayUrl', () => {
  it('绝对路径加 file://', () => {
    expect(resolveLocalAudioPlayUrl('/tmp/a.mp3')).toBe('file:///tmp/a.mp3');
  });

  it('已有 scheme 不变', () => {
    expect(resolveLocalAudioPlayUrl('file:///x.wav')).toBe('file:///x.wav');
    expect(resolveLocalAudioPlayUrl('blob:abc')).toBe('blob:abc');
  });
});
