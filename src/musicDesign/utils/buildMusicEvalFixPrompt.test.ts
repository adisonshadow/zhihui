import { describe, expect, it } from 'vitest';
import { buildMusicEvalFixEphemeral, MUSIC_EVAL_FIX_USER_DISPLAY } from './buildMusicEvalFixPrompt';

describe('buildMusicEvalFixEphemeral', () => {
  it('包含错误与失败代码', () => {
    const s = buildMusicEvalFixEphemeral('[mini] parse error', 's("bd")');
    expect(s).toContain('[mini] parse error');
    expect(s).toContain('s("bd")');
    expect(s).toContain('music_patch_pattern');
  });

  it('用户可见句固定', () => {
    expect(MUSIC_EVAL_FIX_USER_DISPLAY).toMatch(/局部 patch/);
  });
});
