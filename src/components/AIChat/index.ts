/**
 * AI 对话通用组件
 * 支持多种展示模式、专家角色、能力检查
 */
export { AIChat } from './AIChat';
export { AIChatSidePanel } from './AIChatSidePanel';
export { useAIChatCore } from './AIChatCore';
export { AGENT_CONFIGS, AGENT_PROMPTS_MAP, MAIN_AGENT_KEY } from './experts';
export { useAgentModel } from './hooks/useAgentModel';
export type { AIChatMode, AgentConfig, AgentPrompts, AIChatContextTag, PromptItem } from './types';
export type { AIChatCoreProps } from './AIChatCore';
export type { AIChatProps } from './AIChat';
