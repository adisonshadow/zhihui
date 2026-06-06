import { describe, expect, it } from 'vitest';
import { stripYamlFrontmatter } from './stripYamlFrontmatter';

describe('stripYamlFrontmatter', () => {
  it('去除 --- 包裹的首段 YAML frontmatter', () => {
    const raw =
      "---\nname: x\n---\n\n# Body\n你好";
    expect(stripYamlFrontmatter(raw)).toBe('# Body\n你好');
  });

  it('无 frontmatter 时原样 trim', () => {
    expect(stripYamlFrontmatter(' hello ')).toBe('hello');
  });

  it('仅有开头 --- 且无闭合时不误删正文', () => {
    expect(stripYamlFrontmatter('---\nstill here')).toContain('still here');
  });
});
