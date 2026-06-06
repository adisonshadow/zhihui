/**
 * 音乐 / Strudel 专家：提示词正文来自 `src/musicDesign/SKILL/tidal-cycles/SKILL.md`（构建时 raw 导入）。
 */
import type { AgentPrompts } from '../types';
import { registerSkillAgent } from '../registryTypes';
import { loadTidalCyclesSkillBody } from '@/musicDesign/utils/loadSkillPrompt';

export const musicAgentPrompts: AgentPrompts = {
  agentKey: 'music',
  basePrompt: loadTidalCyclesSkillBody(),
  prompts: [
    { key: 'drums', label: '鼓组', message: '生成一段 4/4 鼓点，带踩镲，用 ```strudel 给出完整代码' },
    { key: 'bass', label: '贝斯', message: '为当前风格生成一条 bassline，与鼓组 stack，完整替换代码' },
    { key: 'ambient', label: '氛围', message: '生成氛围铺底 + 慢节奏旋律，偏电影感，完整 strudel 代码' },
    { key: 'denser', label: '加厚', message: '在现有代码基础上加厚织体（更多层或效果），输出完整替换版' },
    { key: 'simplify', label: '简化', message: '简化当前 pattern，保留节奏骨架，输出完整替换版' },
  ],
};

registerSkillAgent({
  agentId: 'music_composer',
  agentName: 'Tidal 作曲',
  agentType: 'skill',
  description: '根据 Strudel/Tidal Cycles 模式语言生成可播放的 pattern，支持鼓、贝斯、和弦与效果链（纯文本生成，不依赖专用音乐模型）',
  skillPromptTemplate: `${musicAgentPrompts.basePrompt}\n\n【额外需求】\n{{extra_requirements}}`,
  supportedModels: [],
  allowedTools: ['music_patch_pattern', 'music_set_pattern'],
  inputType: 'text',
  outputType: 'text',
});
