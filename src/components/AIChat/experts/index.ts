/**
 * Agent 角色注册表（对应 AI agent）
 * 每个 agent 对应：能力要求、提示词模版、欢迎句
 */
import type { AgentConfig, AgentPrompts } from '../types';
import { CAPABILITY_TAGS } from '@/types/settings';
import { scriptAgentPrompts } from '../agents/scriptAgent';
import { drawerAgentPrompts, DRAWER_TYPE_OPTIONS } from '../agents/drawerAgent';

/** 主 agent：调度入口，默认选项，计划实现 function call 调度能力 */
export const MAIN_AGENT_KEY = 'main';

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    key: MAIN_AGENT_KEY,
    label: 'Agent',
    welcomeMessage: '有什么可以帮您？',
    requiredCapabilityKeys: [],
    missingCapabilityHint: '缺失匹配能力的模型，请在设置中添加已配置 API 的模型。',
  },
  {
    key: 'script',
    label: '剧本专家',
    welcomeMessage: '我是剧本专家，可帮您扩写、缩写、润色概要或剧本。',
    requiredCapabilityKeys: ['script', 'action_script'],
    missingCapabilityHint: '缺失匹配能力的模型，请在设置中添加具备「{missing}」能力且已配置 API 的模型。',
  },
  {
    key: 'drawer',
    label: '绘图师',
    welcomeMessage: '描述您想要的绘图类型图片，将为您生成。',
    requiredCapabilityKeys: ['draw'],
    missingCapabilityHint: '缺失匹配能力的模型，请在设置中添加具备「{missing}」能力且已配置 API 的模型。',
    providerType: 'images' as const,
    welcomeSlot: {
      type: 'select' as const,
      options: [...DRAWER_TYPE_OPTIONS],
      defaultValue: 'general',
    },
  },
];

/** Agent key -> 提示词模版 */
export const AGENT_PROMPTS_MAP: Record<string, AgentPrompts> = {
  [MAIN_AGENT_KEY]: {
    agentKey: MAIN_AGENT_KEY,
    basePrompt: '你是一个有帮助的 AI 助手，根据用户问题提供准确、有用的回答。',
    prompts: [
      { key: 'summarize', label: '简要总结', message: '请简要总结上述内容的核心要点' },
      { key: 'expand', label: '详细说明', message: '请对上述内容进行更详细的展开说明' },
      { key: 'simplify', label: '通俗解释', message: '请用更通俗易懂的方式解释上述内容' },
      { key: 'translate', label: '翻译成中文', message: '请将上述内容翻译成中文' },
    ],
  },
  script: scriptAgentPrompts,
  drawer: drawerAgentPrompts,
};

export { DRAWER_TYPE_OPTIONS };

/** 根据能力 key 获取标签文案 */
export function getCapabilityLabel(key: string): string {
  return CAPABILITY_TAGS.find((t) => t.key === key)?.label ?? key;
}
