/**
 * AI 对话通用组件
 * 支持多种展示模式（SidePanel、FloatingBottom、Popover）、专家角色、能力检查、Function Call 注册
 */
export { AIChat } from './AIChat';
export { AIChatSidePanel } from './AIChatSidePanel';
export { AIChatFloatingBottom } from './AIChatFloatingBottom';
export { AIChatPopover } from './AIChatPopover';
export { AIChatBottomSender } from './AIChatBottomSender';
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
  mergeFunctionCallDefs,
} from './utils/functionRegistry';
export { ReasoningChatProvider } from './providers/ReasoningChatProvider';
export type { AIChatMode, AgentConfig, AgentPrompts, AIChatContextTag, PromptItem, AgentProviderType } from './types';
export type { AIChatCoreProps, AIChatDrawerSessionSync } from './AIChatCore';
export type { AIChatProps } from './AIChat';
export type { AIChatFloatingBottomProps } from './AIChatFloatingBottom';
export type { AIChatPopoverProps } from './AIChatPopover';
export type { FunctionCallDef, FunctionScope } from './utils/functionRegistry';
export type {
  PromptTemplateDef,
  PromptTemplateSlotDef,
  RegisterableSenderSlot,
  TemplateSlotValue,
} from './registryTypes';
export type { AIChatSidePanelHandle, AIChatSenderHandle } from './aiChatPanelHandles';
export type { BuiltInAgentsMode, UseAgentModelOptions } from './hooks/useAgentModel';
export type { ReasoningMessage } from './providers/ReasoningChatProvider';
