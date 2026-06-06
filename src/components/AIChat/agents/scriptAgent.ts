/**
 * 剧本 Agent 提示词模版（见功能文档 4.1、docs/短漫剧剧本元素说明.md）
 *
 * 新架构：同时注册为标准化 SkillAgentDefinition
 */
import type { AgentPrompts } from '../types';
import { registerSkillAgent } from '../registryTypes';

export const scriptAgentPrompts: AgentPrompts = {
  agentKey: 'script',
  basePrompt: `你是漫剧剧本专家，帮助用户撰写或修改剧情概要、剧本文本。根据用户当前提供的概要或剧本文本进行扩写、缩写、润色或改写。回复时直接给出可写回概要或剧本的纯文本内容，不要额外说明。`,
  prompts: [
    { key: 'expand-summary', label: '扩写概要', message: '请根据当前概要扩写更详细的剧情描述' },
    { key: 'expand-script', label: '扩写剧本', message: '请根据当前剧本扩写更详细的剧本文本' },
    { key: 'condense-summary', label: '缩写概要', message: '请将当前概要缩写为更简洁的版本' },
    { key: 'condense-script', label: '缩写剧本', message: '请将当前剧本文本缩写为更简洁的版本' },
    { key: 'polish-summary', label: '润色概要', message: '请润色当前概要，提升文采和可读性' },
    { key: 'polish-script', label: '润色剧本', message: '请润色当前剧本文本，提升文采和可读性' },
    { key: 'add-conflict', label: '增加冲突', message: '请在剧情中增加戏剧冲突，让故事更有张力' },
    { key: 'add-dialogue', label: '补充对白', message: '请为当前分镜补充更丰富的角色对白' },
    { key: 'suggest-scenes', label: '建议分镜', message: '请根据当前剧情建议可增加的分镜' },
  ],
};

// ── 新架构：标准化 Skill Agent 注册 ──
registerSkillAgent({
  agentId: 'script_writer',
  agentName: '剧本作家',
  agentType: 'skill',
  description: '精通剧本创作规范，将小说内容转化为包含场景、人物动作、台词、镜头描述的剧本，适配有声书、漫剧等不同场景需求',
  skillPromptTemplate: `${scriptAgentPrompts.basePrompt}\n\n【额外需求】\n{{extra_requirements}}`,
  supportedModels: ['script', 'action_script'],
  allowedTools: ['generate_text', 'update_data'],
  inputType: 'text',
  outputType: 'text',
});
