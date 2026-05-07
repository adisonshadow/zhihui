/**
 * 小说作家 Agent 提示词模版（长文本/章节创作、常用 suggestion 见下）
 */
import type { AgentPrompts } from '../types';

export const novelAgentPrompts: AgentPrompts = {
  agentKey: 'novel',
  basePrompt: `你是专业小说作家，协助用户进行长篇小说、短篇与网文创作。擅长情节编排、人物塑造、对白与风格统一。按用户要求直接给出可粘贴使用的正文、大纲或修改稿，非必要不冗长前摇；若需分章请标清章节标题。`,
  prompts: [
    {
      key: 'gen-stories',
      label: '故事抽卡',
      message: '生成10个轻小说的故事梗概,每篇不超过100字',
      launchTool: 'prepare-gen-stories',
    },
    { key: 'outline', label: '故事大纲', message: '请根据我目前的想法，整理一份可执行的故事大纲，含主线、副线与主要冲突' },
    { key: 'continue', label: '续写下去', message: '请从当前文段自然续写，保持人称、时态与原有文风' },
    { key: 'polish', label: '润色润稿', message: '请润色以下段落，提升流畅度与画面感，避免改变原意' },
    { key: 'expand', label: '扩写细写', message: '请将这段扩写，补充环境、心理或动作细节' },
    { key: 'condense', label: '精简压缩', message: '请将这段压缩为更短篇幅，保留关键情节与情绪' },
    { key: 'dialogue', label: '优化对白', message: '请优化人物对白，使更符合人设、有潜台词、节奏更利落' },
    { key: 'character', label: '人物小传', message: '请为这个角色写简要人物小传，含动机、矛盾与关系网建议' },
    { key: 'conflict', label: '加强冲突', message: '请在本段或当前情节中加强戏剧冲突，给出具体改写方向或示例' },
    { key: 'title', label: '起书名/章名', message: '请为本书或下一章起几个有吸引力的标题备选' },
    { key: 'pov', label: '换视角重述', message: '请用另一角色视角重述同一场景，保持事实一致' },
  ],
};
