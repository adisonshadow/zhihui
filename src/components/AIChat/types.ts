/**
 * AI 对话通用组件类型定义
 * 支持多种展示模式（SidePanel、FloatingBottom、Popover），不同模式功能一致、布局有差异
 */
import type { AIModelConfig } from '@/types/settings';

/** 展示模式 */
export type AIChatMode = 'SidePanel' | 'FloatingBottom' | 'Popover';

/** 欢迎词中的下拉 slot 配置 */
export interface WelcomeSlotSelect {
  type: 'select';
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

/** Agent 使用的 Provider 类型 */
export type AgentProviderType = 'chat' | 'images';

/** Agent 角色配置（对应 AI agent） */
export interface AgentConfig {
  /** Agent 唯一标识 */
  key: string;
  /** 显示名称 */
  label: string;
  /** 欢迎句（显示在 Sender 前部 slot） */
  welcomeMessage?: string;
  /** 所需能力 tag 的 key 列表（模型需具备至少其一且已配置 apiUrl/apiKey），空数组表示通用无需特定能力 */
  requiredCapabilityKeys: string[];
  /** 缺失能力时的提示文案（占位符 {missing} 为缺失的能力标签） */
  missingCapabilityHint: string;
  /** 欢迎词中的下拉 slot（如绘图师的绘图类型选择） */
  welcomeSlot?: WelcomeSlotSelect;
  /**
   * 该 Agent 使用的 Provider 类型，默认 'chat'。
   * 'images' 对应 OpenAIImagesProvider（绘图师）。
   * 见功能文档 06 § 4.1
   */
  providerType?: AgentProviderType;
}

/** 提示词项 */
export interface PromptItem {
  key: string;
  label: string;
  message: string;
}

/** Agent 提示词模版（每个 agent 一个文件） */
export interface AgentPrompts {
  /** Agent key，与 AgentConfig.key 一致 */
  agentKey: string;
  /** 基础 system prompt */
  basePrompt: string;
  /** 常用提示词列表 */
  prompts: PromptItem[];
}

/** 模型能力检查结果 */
export interface AgentModelCheckResult {
  /** 是否具备匹配能力的模型 */
  hasValidModel: boolean;
  /** 选中的模型（具备能力且已配置） */
  model: AIModelConfig | null;
  /** 缺失的能力标签（用于提示） */
  missingCapabilityLabels: string[];
}

/** 上下文 Tag（通用，不同专家可扩展） */
export interface AIChatContextTag {
  id: string;
  description: string;
}
