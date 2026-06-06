import { describe, expect, it } from 'vitest';
import { stripAudiobookTextForLocalTts } from './audiobookLocalTtsPlainText';

describe('stripAudiobookTextForLocalTts', () => {
  it('剥除句内方括号语气', () => {
    expect(stripAudiobookTextForLocalTts('[急促，羞恼]转过去！')).toBe('转过去！');
  });

  it('剥除全角与半角括号语气', () => {
    expect(stripAudiobookTextForLocalTts('（压低）你好')).toBe('你好');
    expect(stripAudiobookTextForLocalTts('(whisper)Hello')).toBe('Hello');
  });

  it('剥除风格指令行与行首前缀', () => {
    expect(stripAudiobookTextForLocalTts('风格指令：羞恼，命令\n转过去！')).toBe('转过去！');
    expect(stripAudiobookTextForLocalTts('风格指令: 紧张, 压低')).toBe('');
  });

  it('组合 MiMo 标记', () => {
    expect(stripAudiobookTextForLocalTts('[紧张]呼……[语速加快,碎碎念]……')).toBe('呼…………');
  });
});
