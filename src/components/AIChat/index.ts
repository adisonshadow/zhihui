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
  getFunctionCallDef,
  mergeFunctionCallDefs,
} from './utils/functionRegistry';
export { ReasoningChatProvider } from './providers/ReasoningChatProvider';
export type { AIChatMode, AgentConfig, AgentPrompts, AIChatContextTag, PromptItem, AgentProviderType, RefIndicatorType, AIChatSidePanelOnSubmit, AIChatSidePanelOnSubmitReturn } from './types';
export { applyRefIndicatorUserChoicePrefix } from './applyRefIndicatorUserChoicePrefix';
export type {
  AIChatCoreProps,
  AIChatDrawerSessionSync,
  AIChatHandleSubmitOptions,
  AIProjectPromptInput,
  AIProjectPromptParts,
} from './AIChatCore';
export {
  decideToolDisplayMode,
  canMergeIntoSameThoughtchain,
  splitIntoThoughtchains,
} from './utils/toolCardMarkers';
export type {
  ToolDisplayMode,
  ToolDisplayPreferences,
  ToolInvocationMeta,
} from './utils/toolCardMarkers';
export type { AIChatProps } from './AIChat';
export type { AIChatFloatingBottomProps } from './AIChatFloatingBottom';
export type { AIChatPopoverProps } from './AIChatPopover';
export type { FunctionCallDef, FunctionScope } from './utils/functionRegistry';
export type {
  PromptTemplateDef,
  PromptTemplateSlotDef,
  RegisterableSenderSlot,
  TemplateSlotValue,
  SkillAgentDefinition,
  AgentTypeV2,
  AgentUIConfig,
  AgentUIConfigField,
  MultiModalToolDefinition,
  ExposedMultimodalAgentDecl,
} from './registryTypes';
export {
  registerSkillAgent,
  getAllSkillAgents,
  getSkillAgent,
  unregisterSkillAgent,
  registerMultiModalTool,
  getAllMultiModalTools,
  getMultiModalTool,
  buildExposedMultimodalAgents,
} from './registryTypes';
export type { AIChatSidePanelHandle, AIChatSenderHandle, AIChatEmitUserMessagePayload } from './aiChatPanelHandles';
export type { BuiltInAgentsMode, UseAgentModelOptions } from './hooks/useAgentModel';
export type { ReasoningMessage } from './providers/ReasoningChatProvider';
