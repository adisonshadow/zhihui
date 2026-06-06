import { describe, expect, it } from 'vitest';
import {
  hasPresetVoiceSampleDirs,
  presetVoiceSampleScanRoots,
  resolveAudiobookVoiceSampleRoots,
  voiceSampleRootForRelativePath,
} from './audiobookVoiceSampleRoots';

describe('audiobookVoiceSampleRoots', () => {
  it('legacy 根目录回退到外置与自定义', () => {
    expect(resolveAudiobookVoiceSampleRoots({ voiceSamplesRootDir: '/legacy' })).toEqual({
      builtin: '',
      external: '/legacy',
      custom: '/legacy',
    });
  });

  it('独立外置 / custom', () => {
    expect(
      resolveAudiobookVoiceSampleRoots({
        presetVoiceSamplesRootDir: '/external',
        customVoiceSamplesRootDir: '/custom',
      }),
    ).toEqual({ builtin: '', external: '/external', custom: '/custom' });
  });

  it('.yiman-voices 走 custom 根', () => {
    const roots = { builtin: '/builtin', external: '/external', custom: '/custom' };
    expect(voiceSampleRootForRelativePath('.yiman-voices/foo.wav', roots)).toBe('/custom');
    expect(voiceSampleRootForRelativePath('男声/旁白.wav', roots)).toBe('/external');
  });

  it('合并扫描根：builtin + external 去重', () => {
    const roots = { builtin: '/builtin', external: '/external', custom: '' };
    expect(presetVoiceSampleScanRoots(roots)).toEqual(['/builtin', '/external']);
    expect(hasPresetVoiceSampleDirs(roots)).toBe(true);
    expect(hasPresetVoiceSampleDirs({ builtin: '/b', external: '', custom: '' })).toBe(true);
  });
});
