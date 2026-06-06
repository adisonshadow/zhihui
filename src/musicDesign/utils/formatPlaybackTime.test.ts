import { describe, expect, it } from 'vitest';
import { computePlaybackDurationSec, formatPlaybackTime } from './formatPlaybackTime';

describe('computePlaybackDurationSec', () => {
  it('duration = cycleCount / cps', () => {
    expect(computePlaybackDurationSec(1, 0.9)).toBeCloseTo(1 / 0.9);
    expect(computePlaybackDurationSec(4, 1)).toBe(4);
  });

  it('cps 下限 0.25，cycle 下限 1', () => {
    expect(computePlaybackDurationSec(0, 0.1)).toBe(1 / 0.25);
    expect(computePlaybackDurationSec(1, 0)).toBe(1 / 0.25);
  });
});

describe('formatPlaybackTime', () => {
  it('格式 m:ss', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(5)).toBe('0:05');
    expect(formatPlaybackTime(65)).toBe('1:05');
    expect(formatPlaybackTime(125.7)).toBe('2:05');
  });

  it('非法值回退 0:00', () => {
    expect(formatPlaybackTime(-1)).toBe('0:00');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
  });
});
