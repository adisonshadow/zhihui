/**
 * AI 对话通用组件
 * 支持多种展示模式（SidePanel、FloatingBottom、Popover）、专家角色、能力检查、Function Call 注册
 */
export { AIChat } from './AIChat';
export { AIChatSidePanel } from './AIChatSidePanel';
export { AIChatFloatingBottom } from './AIChatFloatingBottom';
export { AIChatPopover } from './AIChatPopover';
export { useAIChatCore } from './AIChatCore';
export { AGENT_CONFIGS, AGENT_PROMPTS_MAP, MAIN_AGENT_KEY } from './experts';
export { useAgentModel } from './hooks/useAgentModel';
export {
  registerFunctionCall,
  unregisterFunctionCall,
  getFunctionCallsForAgent,
  getFunctionCallsForOrchestrator,
  invokeFunctionCall,
  toOpenAITools,
  getAllFunctionCalls,
} from './utils/functionRegistry';
export { ReasoningChatProvider } from './providers/ReasoningChatProvider';
export type { AIChatMode, AgentConfig, AgentPrompts, AIChatContextTag, PromptItem, AgentProviderType } from './types';
export type { AIChatCoreProps } from './AIChatCore';
export type { AIChatProps } from './AIChat';
export type { AIChatFloatingBottomProps } from './AIChatFloatingBottom';
export type { AIChatPopoverProps } from './AIChatPopover';
export type { FunctionCallDef, FunctionScope } from './utils/functionRegistry';
export type { ReasoningMessage } from './providers/ReasoningChatProvider';
