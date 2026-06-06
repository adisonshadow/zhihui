import { describe, expect, it } from 'vitest';
import {
  buildOverallStyleInstruction,
  mimoStyleKeywordsOverlap,
  normalizeMimoInlineStyleTagsInText,
  normalizeMimoOverallStyleInstruction,
  validateMimoInlineStyleTagContent,
  validateMimoInlineStyleTagsInText,
  validateMimoOverallStyleInstruction,
  validateMimoToneNotDuplicatedInInlineTags,
} from './mimoV25StyleTags';

describe('mimo style instruction', () => {
  it('一般 1 个关键词', () => {
    expect(normalizeMimoOverallStyleInstruction('压低')).toBe('压低');
    expect(buildOverallStyleInstruction('压低')).toBe('压低');
  });

  it('最多 2 个关键词', () => {
    expect(normalizeMimoOverallStyleInstruction('紧张,急切')).toBe('紧张，急切');
    expect(normalizeMimoOverallStyleInstruction('紧张', '急切')).toBe('紧张，急切');
  });

  it('拒绝超过 2 个关键词', () => {
    expect(validateMimoOverallStyleInstruction('紧张,急切,压低')).toMatch(/最多 2 个/);
  });

  it('拒绝长关键词', () => {
    const err = validateMimoOverallStyleInstruction('非常无奈清醒自嘲感');
    expect(err).toMatch(/过长/);
  });

  it('截断并合并过长 tone 为前两词（normalize）', () => {
    expect(normalizeMimoOverallStyleInstruction('无奈、清醒，带点自我吐槽感')).toBe('无奈，清醒');
  });
});

describe('mimo inline […] tags', () => {
  it('拒绝过长句内标签', () => {
    const bad = '[画外音，退后半步打量自己的作品，带着自嘲的笑意]丑是丑了点';
    expect(validateMimoInlineStyleTagsInText(bad)).toMatch(/关键词过多/);
  });

  it('拒绝过长关键词', () => {
    expect(validateMimoInlineStyleTagContent('非常无奈清醒自嘲的长描述')).toMatch(/过长/);
  });

  it('接受 1～2 个短关键词', () => {
    const ok = '[画外音]丑是丑了点，[轻快]但能用。';
    expect(validateMimoInlineStyleTagsInText(ok)).toBeNull();
  });

  it('normalize 截断过长标签为前两词', () => {
    const raw =
      '[画外音，退后半步打量自己的作品，带着自嘲的笑意]丑是丑了点，[语速轻快，自我安慰般的收尾]但能用。';
    expect(normalizeMimoInlineStyleTagsInText(raw)).toBe(
      '[画外音，退后半步打量自己]丑是丑了点，[语速轻快，自我安慰般的收尾]但能用。',
    );
  });
});

describe('mimo tone vs inline […] no overlap', () => {
  it('检测子串重复：打圆场 vs 圆场', () => {
    expect(mimoStyleKeywordsOverlap('打圆场', '圆场')).toBe(true);
  });

  it('拒绝 tone 与句内标签重复', () => {
    const err = validateMimoToneNotDuplicatedInInlineTags(
      '打圆场，温和',
      undefined,
      '[圆场]楚瑶，这是林小棠。[快速]小棠，这是楚瑶。',
    );
    expect(err).toMatch(/重复/);
    expect(err).toMatch(/圆场/);
  });

  it('拒绝完全一致：审视', () => {
    expect(
      validateMimoToneNotDuplicatedInInlineTags('审视，平淡', undefined, '[审视]回来了？'),
    ).toMatch(/审视/);
  });

  it('允许 tone 与句内演法分层', () => {
    expect(
      validateMimoToneNotDuplicatedInInlineTags(
        '打圆场，温和',
        undefined,
        '[快速]楚瑶，这是林小棠。[轻声]小棠，这是楚瑶。',
      ),
    ).toBeNull();
    expect(
      validateMimoToneNotDuplicatedInInlineTags(
        '自嘲',
        undefined,
        '[画外音]丑是丑了点，[轻快]但能用。',
      ),
    ).toBeNull();
  });
});
