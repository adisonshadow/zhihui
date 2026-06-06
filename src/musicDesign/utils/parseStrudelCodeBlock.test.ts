import { describe, expect, it } from 'vitest';
import { extractLastClosedStrudelBlock, extractStreamingStrudelCandidate } from './parseStrudelCodeBlock';

describe('extractLastClosedStrudelBlock', () => {
  it('提取 tidal 围栏', () => {
    const t = '说明\n```tidal\ns("bd")\n```\n';
    expect(extractLastClosedStrudelBlock(t)).toBe('s("bd")');
  });

  it('取最后一个闭合 strudel 块', () => {
    const t = '```strudel\nfirst\n```\n\nlater\n```strudel\nsecond\n```';
    expect(extractLastClosedStrudelBlock(t)).toBe('second');
  });

  it('未闭合返回 null', () => {
    expect(extractLastClosedStrudelBlock('```strudel\nopen')).toBeNull();
  });

  it('``` 与 { 之间无换行仍识别', () => {
    const t = 'x\n```strudel\nnote("c3")\n```';
    expect(extractLastClosedStrudelBlock(t)).toBe('note("c3")');
  });
});

describe('extractStreamingStrudelCandidate', () => {
  it('未闭合时返回开 fence 后全文', () => {
    const t = '头\n```strudel\nline1\nline2';
    expect(extractStreamingStrudelCandidate(t)).toBe('line1\nline2');
  });

  it('已闭合时与 closed 提取一致', () => {
    const t = '```strudel\nok\n```';
    expect(extractStreamingStrudelCandidate(t)).toBe('ok');
  });
});
