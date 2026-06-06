import { describe, expect, it } from 'vitest';
import {
  extractNovelCornerQuoteSpans,
  stripCornerQuotesFromAudiobookSpeechText,
} from './audiobookNovelCornerQuotes';

describe('audiobookNovelCornerQuotes', () => {
  it('提取「」对白及同段后续叙述', () => {
    const md =
      '「陆泽先生，感谢您在过去三年为公司做出的贡献……即日起解除劳动关系……」邮件正文他只看了一眼就划掉了。';
    const spans = extractNovelCornerQuoteSpans(md);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.quoted_text).toContain('陆泽先生');
    expect(spans[0]!.narration_after).toBe('邮件正文他只看了一眼就划掉了。');
  });

  it('strip 保留对白、去掉引号', () => {
    expect(
      stripCornerQuotesFromAudiobookSpeechText('「你好。」'),
    ).toBe('你好。');
    expect(
      stripCornerQuotesFromAudiobookSpeechText('[紧张]「快走」'),
    ).toBe('[紧张]快走');
  });

  it('无直角引号时原样返回', () => {
    expect(stripCornerQuotesFromAudiobookSpeechText('旁白一句。')).toBe('旁白一句。');
  });
});
