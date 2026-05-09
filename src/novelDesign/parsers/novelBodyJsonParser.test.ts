import { describe, expect, it } from 'vitest';
import {
  extractNovelWritePayload,
  getBestBodyContent,
  getBestTargetN,
  truncateUnicodeChars,
} from './novelBodyJsonParser';

describe('extractNovelWritePayload', () => {
  it('从 ```novel-body-json fence 中解析 payload', () => {
    const raw = [
      '我先做些分析。',
      '```novel-body-json',
      '{"novel_write_payload":{"n":1,"mode":"replace","title":"测试标题","content_markdown":"这是正文\\n第二行"}}',
      '```',
      '后面还有文字。',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.hasMarker).toBe(true);
    expect(result.payload).not.toBeNull();
    expect(result.payload!.n).toBe(1);
    expect(result.payload!.mode).toBe('replace');
    expect(result.payload!.title).toBe('测试标题');
    expect(result.payload!.content_markdown).toBe('这是正文\n第二行');
    expect(result.preMarkerContent).toBe('我先做些分析。');
    expect(result.postMarkerContent).toBe('后面还有文字。');
  });

  it('从 ```json fence 中解析 payload（兼容）', () => {
    const raw = [
      '```json',
      '{"novel_write_payload":{"n":2,"mode":"append","title":"第二集","content_markdown":"新内容"}}',
      '```',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.hasMarker).toBe(true);
    expect(result.payload).not.toBeNull();
    expect(result.payload!.n).toBe(2);
    expect(result.payload!.content_markdown).toBe('新内容');
    expect(result.preMarkerContent).toBe('');
    expect(result.postMarkerContent).toBe('');
  });

  it('无 fence 但有 marker 时 hasMarker=true, payload=null', () => {
    const raw = '这是普通的对话，没有 JSON 代码块。{"novel_write_payload": 写点东西}';
    const result = extractNovelWritePayload(raw);
    expect(result.hasMarker).toBe(true);
    expect(result.payload).toBeNull();
  });

  it('完全无 marker 时 hasMarker=false', () => {
    const raw = '这是完全无关的对话内容。';
    const result = extractNovelWritePayload(raw);
    expect(result.hasMarker).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.displayText).toBe(raw);
  });

  it('content_markdown 含特殊字符时 JSON.parse 仍正确', () => {
    const raw = [
      '```novel-body-json',
      JSON.stringify({
        novel_write_payload: {
          n: 1,
          mode: 'replace',
          title: '测试标题',
          content_markdown: '含引号"和反斜杠\\和换行\n第三行',
        },
      }),
      '```',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.payload).not.toBeNull();
    expect(result.payload!.content_markdown).toBe('含引号"和反斜杠\\和换行\n第三行');
  });

  it('JSON 解析失败时 payload 降级为 null，streamContentMarkdown 作为兜底', () => {
    const raw = [
      '```novel-body-json',
      '{"novel_write_payload":{"n":1,"mode":"replace","title":"坏JSON","content_markdown":"正文未闭合"}',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.payload).toBeNull();
    expect(result.hasMarker).toBe(true);
    expect(result.streamContentMarkdown).toBe('正文未闭合');
    expect(result.streamTargetN).toBe(1);
  });

  it('fence 外文字被正确提取为 displayText（含前后文字）', () => {
    const raw = [
      '分析文字...',
      '```novel-body-json',
      '{"novel_write_payload":{"n":1,"content_markdown":"正文"}}',
      '```',
      '结束语。',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.displayText).toBe('分析文字...\n\n结束语。');
  });

  it('多条 fence 时 payload 取最后一条（replace 迭代覆盖）', () => {
    const raw = [
      '```novel-body-json',
      '{"novel_write_payload":{"n":1,"content_markdown":"第一段"}}',
      '```',
      '```novel-body-json',
      '{"novel_write_payload":{"n":2,"content_markdown":"第二段"}}',
      '```',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.payload).not.toBeNull();
    expect(result.payload!.n).toBe(2);
    expect(result.payload!.content_markdown).toBe('第二段');
  });

  it('streamContentMarkdown 宽松提取含转义换行', () => {
    const raw = [
      '```novel-body-json',
      '{"novel_write_payload":{"n":1,"content_markdown":"行1\\n行2\\n行3"}}',
      '```',
    ].join('\n');

    const result = extractNovelWritePayload(raw);
    expect(result.streamContentMarkdown).toBe('行1\n行2\n行3');
  });

  it('streamTargetN 从 marker 区域提取集序号', () => {
    const raw = '之前文字 {"novel_write_payload":{"n":3,"content_markdown":"正文"}} 之后文字';
    const result = extractNovelWritePayload(raw);
    expect(result.streamTargetN).toBe(3);
  });

  it('streamTargetN 无有效 n 时返回 null', () => {
    const raw = '文字 {"novel_write_payload":{"mode":"append"}}';
    const result = extractNovelWritePayload(raw);
    expect(result.streamTargetN).toBeNull();
  });
});

describe('getBestBodyContent', () => {
  it('优先使用严格解析的 content_markdown', () => {
    const raw = [
      '```novel-body-json',
      '{"novel_write_payload":{"content_markdown":"严格模式"}}',
      '```',
    ].join('\n');
    const parsed = extractNovelWritePayload(raw);
    expect(getBestBodyContent(parsed)).toBe('严格模式');
  });

  it('严格解析为空时降级到 streamContentMarkdown', () => {
    const raw = '文字 {"novel_write_payload":{"content_markdown":"宽松模式"}}';
    const parsed = extractNovelWritePayload(raw);
    expect(parsed.payload).toBeNull();
    expect(getBestBodyContent(parsed)).toBe('宽松模式');
  });
});

describe('getBestTargetN', () => {
  it('优先使用严格解析的 n', () => {
    const raw = [
      '```novel-body-json',
      '{"novel_write_payload":{"n":5,"content_markdown":"正文"}}',
      '```',
    ].join('\n');
    const parsed = extractNovelWritePayload(raw);
    expect(getBestTargetN(parsed)).toBe(5);
  });

  it('严格解析无 n 时降级到 streamTargetN', () => {
    const raw = '{"novel_write_payload":{"n":7,"content_markdown":"正文"}}';
    const parsed = extractNovelWritePayload(raw);
    expect(parsed.payload).toBeNull();
    expect(parsed.streamTargetN).toBe(7);
    expect(getBestTargetN(parsed)).toBe(7);
  });
});

describe('truncateUnicodeChars', () => {
  it('短文本不截断', () => {
    expect(truncateUnicodeChars('你好', 10)).toBe('你好');
  });

  it('长文本截断并加省略号', () => {
    const text = '一二三四五六七八九十';
    expect(truncateUnicodeChars(text, 5)).toBe('一二三四五…');
  });

  it('emoji 按 Unicode 标量计', () => {
    expect(truncateUnicodeChars('😀😀😀😀😀', 3)).toBe('😀😀😀…');
  });
});
