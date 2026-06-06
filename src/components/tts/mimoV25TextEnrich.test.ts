import { describe, expect, it } from 'vitest';
import { enrichMimoAssistantText } from '@/components/tts/mimoV25TextEnrich';

describe('mimoV25TextEnrich', () => {
  it('中文：voice.tone 风格指令 → […] 前缀，text 保留句内 […] 标签', () => {
    const r = enrichMimoAssistantText({
      rawText:
        '[紧张，深呼吸]呼……冷静，冷静。不就是一个面试吗……[语速加快，碎碎念]自我介绍已经背了五十遍了，应该没问题的。加油，你可以的……[小声]哎呀，领带歪没歪？',
      tone: '紧张,急切',
      audioTagSupported: true,
    });
    expect(r.text).toBe(
      '[紧张，急切][紧张，深呼吸]呼……冷静，冷静。不就是一个面试吗……[语速加快，碎碎念]自我介绍已经背了五十遍了，应该没问题的。加油，你可以的……[小声]哎呀，领带歪没歪？',
    );
    expect(r.hadLeadingStyleApplied).toBe(true);
  });

  it('中文：emotion 并入风格指令前缀', () => {
    const r = enrichMimoAssistantText({
      rawText: '你好。',
      tone: '温柔',
      emotion: '开心',
      audioTagSupported: true,
    });
    expect(r.text).toBe('[温柔，开心]你好。');
    expect(r.hadLeadingStyleApplied).toBe(true);
  });

  it('已有前导圆括号整体风格不再叠加', () => {
    const t = '(悲伤)人走了。';
    const r = enrichMimoAssistantText({ rawText: t, tone: '活泼', emotion: '开心', audioTagSupported: true });
    expect(r.text).toBe(t);
    expect(r.hadLeadingStyleApplied).toBe(false);
  });

  it('text 以句内 […] 起头仍会加整体风格前缀', () => {
    const r = enrichMimoAssistantText({
      rawText: '[紧张]快走。',
      tone: '急促',
      audioTagSupported: true,
    });
    expect(r.text).toBe('[急促][紧张]快走。');
  });

  it('tone 命中方言则整体前缀含方言', () => {
    const r = enrichMimoAssistantText({
      rawText: '走起。',
      tone: '东北话',
      audioTagSupported: true,
    });
    expect(r.text).toBe('[东北话]走起。');
  });

  it('唱歌意图 → (唱歌) 前缀', () => {
    const r = enrichMimoAssistantText({
      rawText: '海阔天空',
      tone: '深情',
      emotion: '唱歌',
      audioTagSupported: true,
    });
    expect(r.text.startsWith('(唱歌)')).toBe(true);
  });

  it('voicedesign 路径不注入标签（仅 trim）', () => {
    const raw = '  一段话  ';
    const r = enrichMimoAssistantText({ rawText: raw, tone: '温柔', emotion: '开心', audioTagSupported: false });
    expect(r.text).toBe('一段话');
  });

  it('inline pause 插入 [停顿]', () => {
    const r = enrichMimoAssistantText({
      rawText: '012345',
      tone: '',
      pauses: [{ position: 'inline', durationMs: 500, charOffset: 3 }],
      audioTagSupported: true,
      autoOverallStyle: false,
    });
    expect(r.text).toBe('012[停顿]345');
    expect(r.hadPauseInsertions).toBe(true);
  });

  it('长停顿阈值', () => {
    const r = enrichMimoAssistantText({
      rawText: 'abcd',
      pauses: [{ position: 'inline', durationMs: 900, charOffset: 2 }],
      audioTagSupported: true,
      autoOverallStyle: false,
    });
    expect(r.text).toBe('ab[长停顿]cd');
  });
});
