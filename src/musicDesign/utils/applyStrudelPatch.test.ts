import { describe, expect, it } from 'vitest';
import { applyStrudelPatch, formatStrudelCodeWithLineNumbers } from './applyStrudelPatch';

describe('applyStrudelPatch search', () => {
  const src = 'stack(\n  s("bd"),\n  note("c3")(3,8)\n)';

  it('唯一匹配替换', () => {
    const r = applyStrudelPatch(src, {
      mode: 'search',
      oldText: 'note("c3")(3,8)',
      newText: 'note("<c3>(3,8)")',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toContain('note("<c3>(3,8)")');
  });

  it('未找到 old_text', () => {
    const r = applyStrudelPatch(src, { mode: 'search', oldText: 'missing', newText: 'x' });
    expect(r.ok).toBe(false);
  });

  it('多处匹配且未 replace_all 失败', () => {
    const r = applyStrudelPatch('a\na\n', { mode: 'search', oldText: 'a', newText: 'b' });
    expect(r.ok).toBe(false);
  });
});

describe('applyStrudelPatch lines', () => {
  it('按行替换', () => {
    const src = 'line1\nline2\nline3';
    const r = applyStrudelPatch(src, { mode: 'lines', startLine: 2, endLine: 2, newText: 'fixed' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.code).toBe('line1\nfixed\nline3');
  });
});

describe('formatStrudelCodeWithLineNumbers', () => {
  it('带行号', () => {
    expect(formatStrudelCodeWithLineNumbers('a\nb')).toBe('  1| a\n  2| b');
  });
});
