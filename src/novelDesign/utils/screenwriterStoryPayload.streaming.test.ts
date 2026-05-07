import { describe, expect, it } from 'vitest';
import {
  extractJsonCandidateString,
  parseStorySeedFieldsStreaming,
  parseStorySeedFields,
  tryParseStoryRecordsFromIncompleteJson,
} from './screenwriterStoryPayload';

describe('SSE 小说雏形：围栏与增量解析', () => {
  it('```json 与 { 之间可无换行（模型常一行输出 fence 头）', () => {
    expect(extractJsonCandidateString('```json{"stories":[')).toBe('{"stories":[');
  });

  it('未闭合 JSON 中已完整的故事对象会逐个出现（旧式 stories 数组）', () => {
    const partial = [
      '```json',
      '{"stories":[',
      '{"index":1,"title":"一","sellingPoint":"卖","worldview":"界","characters":["a"],"summary":"概"},',
      '{"index":2,"title":"二","sellingPoint":"卖","worldview":"界","characters":["b"],"summary":"概"}',
    ].join('\n');
    expect(tryParseStoryRecordsFromIncompleteJson(extractJsonCandidateString(partial)!).length).toBe(2);
    const seeds = parseStorySeedFieldsStreaming(partial);
    expect(seeds.length).toBe(2);
    expect(seeds[0].title).toBe('一');
    expect(seeds[1].title).toBe('二');
  });

  it('多块独立 fenced JSON（kind yiman_story_seed）合并解析', () => {
    const content = [
      '简述',
      '```json',
      '{"kind":"yiman_story_seed","index":1,"title":"甲","summary":"乙"}',
      '```',
      '',
      '```json',
      '{"kind":"yiman_story_seed","index":2,"title":"丙","summary":"丁"}',
      '```',
    ].join('\n');
    const seeds = parseStorySeedFields(content);
    expect(seeds.length).toBe(2);
    expect(seeds[0].title).toBe('甲');
    expect(seeds[1].title).toBe('丙');
    expect(parseStorySeedFieldsStreaming(content).map((x) => x.title)).toEqual(['甲', '丙']);
  });

  it('JSON summary 字符串中含 ``` 不误判为围栏尾部，须得到全部 N 条', () => {
    const content = [
      '```json',
      '{"kind":"yiman_story_seed","index":1,"title":"一","summary":"见 ```代码``` 写法"}',
      '```',
      '```json',
      '{"kind":"yiman_story_seed","index":2,"title":"二","summary":"OK"}',
      '```',
      '```json',
      '{"kind":"yiman_story_seed","index":3,"title":"三","summary":"末尾"}',
      '```',
    ].join('\n');
    expect(parseStorySeedFields(content).map((s) => s.title)).toEqual(['一', '二', '三']);
  });

  it('末块围栏未闭合时仍能解析已累计的闭合块（流式渐进）', () => {
    const partial = [
      '```json',
      '{"kind":"yiman_story_seed","index":1,"title":"先","summary":"OK"}',
      '```',
      '',
      '```json',
      '{"kind":"yiman_story_seed","index":2,"title":"后',
    ].join('\n');
    const seeds = parseStorySeedFieldsStreaming(partial);
    expect(seeds.length).toBe(1);
    expect(seeds[0].title).toBe('先');
  });

  it('同条消息末尾的大纲 kind 不参与小说雏形列表', () => {
    const content = [
      '正文',
      '```json',
      '{"kind":"yiman_story_seed","index":1,"title":"书名","summary":"概要"}',
      '```',
      '```json',
      '{"kind":"yiman_screenwriter_outline","storyName":"书名","source":"雏形1","summary":"一句"}',
      '```',
    ].join('\n');
    expect(parseStorySeedFields(content)).toHaveLength(1);
    expect(parseStorySeedFields(content)[0].title).toBe('书名');
  });
});
