/**
 * 从 SKILL.md 原始文本剥离 YAML frontmatter（与 Cursor Skill 文件结构兼容）。
 */
export function stripYamlFrontmatter(raw: string): string {
  const t = raw.trimStart();
  if (!t.startsWith('---')) return raw.trim();
  const end = t.indexOf('\n---', 3);
  if (end < 0) return raw.trim();
  return t.slice(end + 4).trim();
}
