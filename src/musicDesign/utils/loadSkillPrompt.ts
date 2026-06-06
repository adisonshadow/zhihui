import skillRaw from '../SKILL/tidal-cycles/SKILL.md?raw';
import { stripYamlFrontmatter } from './stripYamlFrontmatter';

/** 供 music Agent basePrompt 使用（已去 frontmatter） */
export function loadTidalCyclesSkillBody(): string {
  return stripYamlFrontmatter(skillRaw).trim();
}
