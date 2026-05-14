/**
 * AI 对话核心逻辑（与布局无关，供各模式复用）
 * 使用 stream 模式，支持对话列表、回退、附件、agent 切换
 * Sender 使用 slotConfig + skill 将 agent、欢迎句、选中对象以 slot 形式显示在输入框内
 */
import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Tag, type GetRef } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { Bubble, Sender, Attachments, Prompts } from '@ant-design/x';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { parseDrawerContent } from './utils/drawerContentRender';
import { useXChat } from '@ant-design/x-sdk';
import { createImagesGenerationProvider } from './providers/imagesProviderFactory';
import { ReasoningChatProvider } from './providers/ReasoningChatProvider';
import type { AIModelConfig } from '@/types/settings';
import type { AgentConfig, AIChatContextTag, PromptItem } from './types';
import { useAgentModel, type BuiltInAgentsMode } from './hooks/useAgentModel';
import { AGENT_PROMPTS_MAP, MAIN_AGENT_KEY } from './experts';
import type { FunctionCallDef } from './utils/functionRegistry';
import {
  getFunctionCallsForAgent,
  getFunctionCallsForOrchestrator,
  getAllFunctionCalls,
  mergeFunctionCallDefs,
  toOpenAITools,
} from './utils/functionRegistry';
import type { PromptTemplateDef, RegisterableSenderSlot, TemplateSlotValue } from './registryTypes';
import { renderPromptTemplate } from './registryTypes';
import {
  getDrawerBasePrompt,
  getDrawerSlotConfig,
  parseDrawerTypeFromSlotConfig,
} from './agents/drawerAgent.tsx';
import type { DrawerType } from './agents/drawerAgent.tsx';
import type { DrawerAspectRatio, DrawerOptions } from './types/drawerOptions';
import { DRAWER_ASPECT_OPTIONS, resolveAspectRatio } from './types/drawerOptions';
import { fileToImageDataUrlForVolc } from './utils/fileToBase64';
import { isToolCardContent, makeToolCardAssistantContent } from './utils/toolCardMarkers';
import type { ConversationListMetaItem } from './aiChatPanelHandles';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';

/**
 * 根据 Agent 配置的 providerType 选择对应 Provider。
 * 所有对话类 Agent 统一使用 ReasoningChatProvider（向下兼容无推理的普通模型）。
 * enableReasoning=false 时，Provider 向火山引擎等 API 发送 thinking.type=disabled。
 * 见功能文档 06 § 4.1
 */
function buildProvider(
  providerType: import('./types').AgentProviderType | undefined,
  modelConfig: AIModelConfig | null,
  enableReasoning: boolean
) {
  if (providerType === 'images') {
    return createImagesGenerationProvider(modelConfig);
  }
  return new ReasoningChatProvider(modelConfig, enableReasoning);
}

const CONV_STORAGE_PREFIX = 'yiman:aichat:conversations:';
const MODEL_PICK_PREFIX = 'yiman:aichat:modelPick:';
const EMPTY_CONTEXT_BLOCKS: Array<{ label: string; content: string }> = [];
const EMPTY_CONTEXT_TAGS: AIChatContextTag[] = [];
const EMPTY_EXTRA_SENDER_SLOTS: SlotConfigType[] = [];

function loadChatModelPickId(storageKey: string): string | null {
  try {
    const v = localStorage.getItem(storageKey);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function saveChatModelPickId(storageKey: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storageKey, id);
    else localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/** 附件拖放调试：DevTools 执行 `localStorage.setItem('yiman:debugAttachments','1')` 后刷新页面；关闭 `localStorage.removeItem('yiman:debugAttachments')` */
function isAttachmentsDebugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('yiman:debugAttachments') === '1';
  } catch {
    return false;
  }
}

function debugAttachments(label: string, payload?: unknown) {
  if (!isAttachmentsDebugEnabled()) return;
  if (payload !== undefined) {
    console.log(`[yiman:Attachments] ${label}`, payload);
  } else {
    console.log(`[yiman:Attachments] ${label}`);
  }
}

/**
 * @ant-design/x Attachments 的 DropArea 在 document 上监听 drop 以 setShowArea(false)。
 * 我们在 Sender 捕获阶段 stopPropagation 后真实 drop 到不了 document，遮罩会卡在「拖放…」。
 * 微任务里派发无文件的 drop：上层捕获会因无 Files/无 files 直接 return，DropArea 仍能收起。
 */
function notifyXAttachmentDropOverlayClose() {
  queueMicrotask(() => {
    try {
      document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
    } catch {
      document.dispatchEvent(new Event('drop', { bubbles: true }));
    }
  });
}

interface ConversationItem {
  key: string;
  label: string;
  messages: Array<{
    role: string;
    content: string;
    reasoningContent?: string;
    /** assistant 消息：模型 tool_calls */
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    /** tool 消息：对应 OpenAI tool_call_id */
    toolCallId?: string;
  }>;
  /** 最后活跃时间戳，用于分组显示（今日/昨日） */
  lastActive?: number;
  /** 置顶的会话固定在列表最前分组 */
  pinned?: boolean;
  /** 用户手动重命名后为 true：不再覆盖为自动推导标题 */
  titleUserLocked?: boolean;
}

function normalizeLoadedConversation(raw: ConversationItem): ConversationItem {
  const m = raw.key?.match?.(/^conv_(\d+)$/);
  const lastActive = raw.lastActive ?? (m ? parseInt(m[1], 10) : 0);
  return {
    ...raw,
    pinned: !!(raw as { pinned?: boolean }).pinned,
    titleUserLocked: !!(raw as { titleUserLocked?: boolean }).titleUserLocked,
    lastActive,
  };
}

function conversationLabelIsPlaceholder(label: string, conversationListLabelDefault?: string): boolean {
  const t = label.trim();
  if (/^对话\s+\d+$/.test(t)) return true;
  const d = conversationListLabelDefault?.trim();
  if (d && t === d) return true;
  return false;
}

function loadConversations(storageKey: string): ConversationItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((c: ConversationItem) => normalizeLoadedConversation(c));
  } catch {
    return [];
  }
}

function saveConversations(storageKey: string, items: ConversationItem[]) {
  try {
    const nonEmptyItems = items.filter((item) => item.messages.length > 0);
    localStorage.setItem(storageKey, JSON.stringify(nonEmptyItems.slice(-20)));
  } catch {
    /* ignore */
  }
}

/** 根据 tool 消息的 toolCallId，回溯找到对应的 function 名称 */
function resolveToolCallNameForMessageRow(
  sdk: Array<{
    message?: {
      role?: string;
      toolCalls?: Array<{ id?: string; name?: string }>;
      toolCallId?: string;
    };
  }>,
  toolCallId: string
): string | undefined {
  const tid = toolCallId.trim();
  if (!tid) return undefined;
  for (let i = sdk.length - 1; i >= 0; i--) {
    const row = sdk[i];
    if (row?.message?.role !== 'assistant') continue;
    const tcs = row.message.toolCalls;
    if (!tcs?.length) continue;
    for (const tc of tcs) {
      if (tc.id === tid && tc.name) return tc.name;
    }
  }
  return undefined;
}

function stringifyMessageContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/** 映射到 OpenAI Chat Completions 单条消息（assistant 带 tool_calls、tool role） */
function mapSdkMessageRowToChatApiPayload(m: {
  message?: {
    role?: string;
    content?: unknown;
    reasoningContent?: unknown;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    toolCallId?: string;
  };
  status?: string;
}): Record<string, unknown> | null {
  const role = m.message?.role;
  if (!role || role === 'system') return null;
  if (role === 'tool') {
    const toolCallId = (m.message as { toolCallId?: string }).toolCallId ?? '';
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: stringifyMessageContent(m.message?.content),
    };
  }
  const contentPlain = stringifyMessageContent(m.message?.content);
  if (role === 'assistant') {
    const tc = (m.message as { toolCalls?: Array<{ id: string; name: string; arguments: string }> }).toolCalls;
    if (tc?.length) {
      const row: Record<string, unknown> = {
        role: 'assistant',
        tool_calls: tc.map((x) => ({
          id: x.id,
          type: 'function',
          function: {
            name: x.name,
            arguments: typeof x.arguments === 'string' && x.arguments.trim() ? x.arguments : '{}',
          },
        })),
      };
      if (contentPlain.trim()) row.content = contentPlain;
      else row.content = null;
      return row;
    }
  }
  return { role, content: contentPlain };
}

function toStoredMessages(messages: any[]): ConversationItem['messages'] {
  return messages
    .filter((m) => m.message?.role && m.message.role !== 'system')
    .filter((m) => m.status !== 'loading' && m.status !== 'error')
    .map((m) => {
      const msg = m.message as {
        reasoningContent?: string;
        toolCalls?: Array<{ id: string; name: string; arguments: string }>;
        toolCallId?: string;
      };
      const rc = msg?.reasoningContent;
      const tc = msg?.toolCalls;
      const toolCallId = msg?.toolCallId;
      return {
        role: String(m.message!.role!),
        content: stringifyMessageContent(m.message?.content),
        ...(rc ? { reasoningContent: rc } : {}),
        ...(tc?.length ? { toolCalls: tc } : {}),
        ...(toolCallId ? { toolCallId } : {}),
      };
    });
}

/** 与已落盘的 messages 一致时不视为有新的活跃——仅切换会话查看不会改变 lastActive */
function persistedMessagesEqual(
  persisted: ConversationItem['messages'] | undefined,
  next: ConversationItem['messages']
): boolean {
  return JSON.stringify(persisted ?? []) === JSON.stringify(next);
}

function toXChatMessages(messages: ConversationItem['messages']) {
  return messages.map((m, i) => ({
    id: `msg_${i}`,
    message: {
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      ...(m.reasoningContent ? { reasoningContent: m.reasoningContent } : {}),
      ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
      ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    },
    status: 'local' as const,
  }));
}

function extractSenderPlainText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    return typeof v === 'string' ? v : '';
  }
  return '';
}

/** `handleSubmit` 选项：编程式投递勿用 Sender 内模板待发的 `pendingOutboundFulltextRef` 覆盖正文 */
export interface AIChatHandleSubmitOptions {
  ignorePendingOutbound?: boolean;
}

/** BottomSender / 画布预览用：与 useAIChatCore 的 onDrawerSessionSync 对齐 */
export interface AIChatDrawerSessionSync {
  isRequesting: boolean;
  imageCount: number;
  aspectRatio: DrawerAspectRatio;
  resolvedAspect: string;
  hasImageAttachment: boolean;
  attachDrawerImageFromSrc: (src: string) => Promise<void>;
  clearDrawerAttachments: () => void;
}

export interface AIChatCoreProps {
  /** Agent 角色 key */
  agentKey: string;
  /** 是否允许切换 agent（已渲染的对话可变更 agent） */
  allowAgentSwitch?: boolean;
  /** 模型列表（来自 ConfigContext） */
  models: AIModelConfig[] | undefined;
  /** 项目/分镜级自定义 prompt 追加到 system */
  projectPrompt?: string | null;
  /** 上下文内容（如当前概要、剧本） */
  contextBlocks?: Array<{ label: string; content: string }>;
  /** 选定的上下文 Tag（可移除） */
  contextTags?: AIChatContextTag[];
  onRemoveContextTag?: (id: string) => void;
  /** 格式化 contextTags 为 AI 可读文本 */
  formatContextTags?: (tags: AIChatContextTag[]) => string;
  /** 写回回调（不同专家不同，如剧本专家：写回概要/剧本），接收最后一条 assistant 内容 */
  writeBackActions?: (lastContent: string) => React.ReactNode;
  /** Sender placeholder */
  senderPlaceholder?: string;
  /** 存储 key 后缀（不同 agent/分镜可区分） */
  storageKeySuffix?: string;
  /** Agent 切换回调（关闭专家 slot 时切到通用） */
  onAgentChange?: (key: string) => void;
  /** 画布比例（绘图师用，画布比例时使用），如 "16:9" | "9:16" */
  canvasAspectRatio?: string;
  /**
   * 是否启用推理内容展示。
   * 启用后，若模型返回 reasoning_content（如火山引擎 doubao-seed 等），
   * 将以 Cursor 风格展示推理过程（流式滚动 → 折叠首行）。
   * 见功能文档 06 § enableReasoning
   */
  enableReasoning?: boolean;
  /** 追加在 Sender slotConfig 最前（预览/嵌入分镜，如测试 Function Call 槽位） */
  extraSenderSlotConfig?: SlotConfigType[];
  /**
   * 绘图师模式下，最后一条助手消息解析出的首张图 URL/data URL 变化时回调（底部栏预览等）
   */
  onLastDrawerImageChange?: (src: string | undefined) => void;
  /**
   * 绘图师底部预览：同步请求态、出图参数、附件图片状态及附件 API（用于占位与改图 loading）
   */
  onDrawerSessionSync?: (state: AIChatDrawerSessionSync) => void;
  /** 见 docs/06 §13：内置 Agent 列表；`none` 时仅用 extraAgents */
  builtInAgents?: BuiltInAgentsMode;
  /** 与内置按 key 合并，extra 覆盖同名 */
  extraAgents?: AgentConfig[];
  /** 与全局 registerFunctionCall 合并进单次请求 tools，同名 extra 覆盖 */
  extraFunctionCalls?: FunctionCallDef[];
  promptTemplates?: PromptTemplateDef[];
  /** 并入当前 Agent 常用提示词（Prompts 区） */
  extraPromptItems?: PromptItem[];
  registerableSenderSlots?: RegisterableSenderSlot[];
  /** 默认 true；false 时不绘制强制 FC 槽位 */
  showForcedFunctionCallSlots?: boolean;
  /** true 时不渲染 Sender 附件头（用于规避特定场景下 Attachments 的布局测量循环） */
  disableAttachmentsHeader?: boolean;
  /** 侧边会话列表：新建条目默认标题（如编剧「新对话」）；不传则沿用「对话 N」 */
  conversationListLabelDefault?: string;
  /** 当标题仍为占位（新对话 / 对话 N）时，由会话内容推导会话名（仅在本轮助手请求完成后触发一次，点击查看历史不写） */
  deriveConversationTitle?: (stored: ConversationItem['messages']) => string | null | undefined;
  /** 会话列表变化（编剧页等与外部会话栏同步） */
  onConversationListChange?: (payload: {
    items: ConversationListMetaItem[];
    activeKey: string | null;
  }) => void;
  /**
   * 助手答复流快照（请求态、最后用户句、最后助手正文）
   * 供小说编辑工作台等将 SSE 写回正文区。
   */
  onAssistStream?: (payload: {
    isRequesting: boolean;
    lastAssistantPlain: string;
    lastUserPlain: string;
    lastUserMessageId?: string | number;
    assistantStreaming: boolean;
    toolCallsPending: boolean;
    toolCallNamesAfterLastUser: string[];
  }) => void;
  /** true 时不追加 agent 默认欢迎语 Slot（小说编辑页等与侧栏并排编辑时减轻干扰） */
  suppressAgentSenderWelcome?: boolean;
  /** true 时不展示 Sender 顶部的「专家 / skill」标签（如「小说作家」），与 suppressAgentSenderWelcome 可并用 */
  suppressSenderAgentSkill?: boolean;
  /** true：无消息时不展示「常用提示词」Prompts（如封面 Popover） */
  suppressEmptyConversationPrompts?: boolean;
  /** true：绘图师 Agent 不注入类型选择等 Sender slot（仍可用绘图模型出图） */
  suppressDrawerSenderSlots?: boolean;
  /**
   * `role: tool` 的气泡内容渲染（如 JSON 工具返回 → A2UI）。
   * 未提供时回退为纯文本 / pre。
   */
  renderToolMessageContent?: (
    content: string,
    meta?: { toolName?: string }
  ) => React.ReactNode;
}

export function useAIChatCore({
  agentKey,
  allowAgentSwitch = true,
  models,
  projectPrompt,
  contextBlocks,
  contextTags,
  onRemoveContextTag,
  formatContextTags,
  writeBackActions,
  senderPlaceholder = 'Shift+Enter 换行，Enter 发送',
  storageKeySuffix = 'default',
  onAgentChange,
  canvasAspectRatio,
  enableReasoning = false,
  extraSenderSlotConfig,
  onLastDrawerImageChange,
  onDrawerSessionSync,
  builtInAgents,
  extraAgents,
  extraFunctionCalls,
  promptTemplates,
  extraPromptItems,
  registerableSenderSlots,
  showForcedFunctionCallSlots,
  disableAttachmentsHeader = false,
  onConversationListChange,
  conversationListLabelDefault,
  deriveConversationTitle,
  onAssistStream,
  suppressAgentSenderWelcome = false,
  suppressSenderAgentSkill = false,
  suppressDrawerSenderSlots = false,
}: AIChatCoreProps) {
  const normalizedContextBlocks = contextBlocks ?? EMPTY_CONTEXT_BLOCKS;
  const normalizedContextTags = contextTags ?? EMPTY_CONTEXT_TAGS;
  const normalizedExtraSenderSlots = extraSenderSlotConfig ?? EMPTY_EXTRA_SENDER_SLOTS;

  const storageKey = `${CONV_STORAGE_PREFIX}${agentKey}:${storageKeySuffix}`;
  const [conversations, setConversations] = useState<ConversationItem[]>(() => loadConversations(storageKey));
  /** 始终指向最新 conversations，供 handleConversationChange 读取，避免闭包陈旧问题 */
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  /** 切换历史会话时会 setMessages 载入旧消息，此时不应刷新 lastActive 造成列表跳动 */
  const skipNextMessagesPersistRef = useRef(false);
  /** activeKey 已切到目标会话、但 messages 仍可能是上一会话内容；一致前禁止落盘目标会话 */
  const selectingConversationKeyRef = useRef<string | null>(null);
  /** 上一轮 isRequesting，用于仅在「本轮 AI 请求刚结束」时允许推导会话标题 */
  const prevIsRequestingRef = useRef(false);
  /** 待推导标题的会话 key（仅在 request 结束时写入；纯切换历史不会写入） */
  const pendingDeriveConversationTitleRef = useRef<{ key: string } | null>(null);
  /** 用户点击 Sender 取消后，阻止本轮未执行的本地工具与自动续跑继续写入。 */
  const requestCancelledRef = useRef(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  activeKeyRef.current = activeKey;
  const [convCounter, setConvCounter] = useState(() => loadConversations(storageKey).length);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<DrawerType>('general');
  const [drawerOptions, setDrawerOptions] = useState<DrawerOptions>({
    imageCount: 1,
    aspectRatio: '1:1',
  });
  /** 与 Ant Design X 官方 Sender + Attachments 示例一致：GetRef<typeof …> */
  const senderRef = useRef<GetRef<typeof Sender>>(null);
  /** 粘贴 / 捕获 drop 时调用 ref.upload(file)，与官方 onPasteFile 示例一致 */
  const attachmentsRef = useRef<GetRef<typeof Attachments>>(null);

  const [effectiveContextBlocks, setEffectiveContextBlocks] = useState(() => normalizedContextBlocks);
  const [effectiveContextTags, setEffectiveContextTags] = useState(() => normalizedContextTags);
  useEffect(() => {
    setEffectiveContextBlocks((prev) => (prev === normalizedContextBlocks ? prev : normalizedContextBlocks));
  }, [normalizedContextBlocks]);
  useEffect(() => {
    setEffectiveContextTags((prev) => (prev === normalizedContextTags ? prev : normalizedContextTags));
  }, [normalizedContextTags]);

  const [forcedFunctionCallNames, setForcedFunctionCallNames] = useState<string[]>([]);
  const pendingOutboundFulltextRef = useRef<string | null>(null);
  const pendingNewConversationSubmitRef = useRef<{ key: string; text: string } | null>(null);
  const lastTemplateDisplayRef = useRef<string | null>(null);
  const [composerNonce, setComposerNonce] = useState(0);
  const [composerDefaultText, setComposerDefaultText] = useState<string | undefined>(undefined);

  const { agent, hasValidModel, missingCapabilityLabels, mergedAgents, validModels } = useAgentModel(
    agentKey,
    models,
    { extraAgents, builtInAgents }
  );

  const chatModelPickKey = `${MODEL_PICK_PREFIX}${agentKey}:${storageKeySuffix}`;
  const [chatModelId, setChatModelId] = useState<string | null>(null);
  useEffect(() => {
    setChatModelId(loadChatModelPickId(chatModelPickKey));
  }, [chatModelPickKey]);

  const effectiveModel = useMemo(() => {
    if (validModels.length === 0) return null;
    if (chatModelId && validModels.some((m) => m.id === chatModelId)) {
      return validModels.find((m) => m.id === chatModelId) ?? validModels[0] ?? null;
    }
    return validModels[0] ?? null;
  }, [validModels, chatModelId]);

  useEffect(() => {
    if (validModels.length === 0) {
      if (chatModelId !== null) {
        setChatModelId(null);
        saveChatModelPickId(chatModelPickKey, null);
      }
      return;
    }
    if (chatModelId && !validModels.some((m) => m.id === chatModelId)) {
      const next = validModels[0]!.id;
      setChatModelId(next);
      saveChatModelPickId(chatModelPickKey, next);
    }
  }, [validModels, chatModelId, chatModelPickKey]);

  const onChatModelChange = useCallback(
    (id: string) => {
      setChatModelId(id);
      saveChatModelPickId(chatModelPickKey, id);
    },
    [chatModelPickKey]
  );

  const fcByName = useMemo(() => {
    const merged = mergeFunctionCallDefs(getAllFunctionCalls(), extraFunctionCalls);
    return new Map(merged.map((d) => [d.name, d]));
  }, [extraFunctionCalls]);
  const promptsDef = agentKey ? AGENT_PROMPTS_MAP[agentKey] : null;
  const provider = React.useMemo(
    () => buildProvider(agent?.providerType, effectiveModel, enableReasoning),
    [agent?.providerType, effectiveModel, enableReasoning]
  );

  /**
   * @ant-design/x-sdk useChatStore 以 conversationKey 为维度复用内存 store；异步 defaultMessages（空数组）
   * 完成时会覆盖 hydrate，导致「切换/重进对话」后消息被清空。
   * 让每个活跃会话使用独立 Key，并结合下方 useLayoutEffect 从我们持久化的快照恢复。
   */
  const chatSessionKey = useMemo(
    () => `aichat-${agentKey}-${storageKeySuffix}::sess::${activeKey ?? '_none_'}`,
    [agentKey, storageKeySuffix, activeKey]
  );

  const { onRequest, messages, isRequesting, abort: sdkAbort, setMessages, isDefaultMessagesRequesting } = useXChat<
    any,
    any,
    any,
    any
  >({
    provider,
    conversationKey: chatSessionKey,
    defaultMessages: () => {
      if (!activeKey) return [];
      const conv = conversationsRef.current.find((c) => c.key === activeKey);
      return conv?.messages ? toXChatMessages(conv.messages) : [];
    },
    requestPlaceholder: () => ({ content: '思考中…', role: 'assistant' }),
    requestFallback: (_requestParams: unknown, { errorInfo }: { errorInfo?: { error?: { message?: string } } }) => ({
      content: errorInfo?.error?.message || '请求失败',
      role: 'assistant',
    }),
  });

  const abort = useCallback(() => {
    requestCancelledRef.current = true;
    sdkAbort();
  }, [sdkAbort]);

  /** 须在 ChatMessagesStore 异步 defaultMessages（空数组）结束之后恢复，否则会再被清空。 */
  useLayoutEffect(() => {
    if (!activeKey) {
      setMessages([]);
      return;
    }
    if (isDefaultMessagesRequesting) return;
    const conv = conversationsRef.current.find((c) => c.key === activeKey);
    if (!conv?.messages?.length) {
      setMessages([]);
      return;
    }
    skipNextMessagesPersistRef.current = true;
    setMessages(toXChatMessages(conv.messages));
  }, [activeKey, setMessages, isDefaultMessagesRequesting]);

  const hasMessages = (messages ?? []).filter((m) => m.message?.role !== 'system').length > 0;

  useEffect(() => {
    if (!activeKey || !messages?.length) return;
    const simplified = toStoredMessages(messages);
    const activeConv = conversationsRef.current.find((c) => c.key === activeKey);
    if (selectingConversationKeyRef.current === activeKey) {
      if (!persistedMessagesEqual(activeConv?.messages, simplified)) return;
      selectingConversationKeyRef.current = null;
    }
    if (skipNextMessagesPersistRef.current) {
      skipNextMessagesPersistRef.current = false;
      setConversations((prev) =>
        prev.map((c) => (c.key === activeKey ? { ...c, messages: simplified } : c))
      );
      return;
    }
    setConversations((prev) => {
      const cur = prev.find((c) => c.key === activeKey);
      if (persistedMessagesEqual(cur?.messages, simplified)) return prev;
      const now = Date.now();
      return prev.map((c) =>
        c.key === activeKey ? { ...c, messages: simplified, lastActive: now } : c
      );
    });
  }, [activeKey, messages]);

  /** 会话标题推导：仅在 isRequesting 刚从 true→false（本轮助手回复结束）时触发；纯点击查看历史不写 label */
  useEffect(() => {
    const aiRequestEnded = prevIsRequestingRef.current === true && isRequesting === false;
    prevIsRequestingRef.current = isRequesting;

    if (activeKey && pendingDeriveConversationTitleRef.current?.key !== activeKey) {
      pendingDeriveConversationTitleRef.current = null;
    }

    if (aiRequestEnded && activeKey) {
      pendingDeriveConversationTitleRef.current = { key: activeKey };
    }

    if (!deriveConversationTitle || !activeKey) return;
    if (!pendingDeriveConversationTitleRef.current) return;

    const { key: deriveForKey } = pendingDeriveConversationTitleRef.current;
    if (deriveForKey !== activeKey) return;

    if (!messages?.length) return;
    if ((messages ?? []).some((m) => m.status === 'loading' || m.status === 'updating')) return;

    const simplified = toStoredMessages(messages);
    if (!simplified.length) return;

    const curSnap = conversationsRef.current.find((c) => c.key === activeKey);
    if (!curSnap) {
      pendingDeriveConversationTitleRef.current = null;
      return;
    }
    if (curSnap.titleUserLocked) {
      pendingDeriveConversationTitleRef.current = null;
      return;
    }
    if (!conversationLabelIsPlaceholder(curSnap.label, conversationListLabelDefault)) {
      pendingDeriveConversationTitleRef.current = null;
      return;
    }
    if (!persistedMessagesEqual(curSnap.messages, simplified)) {
      return;
    }

    const raw = deriveConversationTitle(simplified)?.trim();
    pendingDeriveConversationTitleRef.current = null;
    if (!raw) return;

    const next = raw.replace(/\s+/g, ' ').trim().slice(0, 56);
    if (!next || next === curSnap.label) return;

    setConversations((prev) =>
      prev.map((c) => (c.key === activeKey ? { ...c, label: next } : c))
    );
  }, [
    deriveConversationTitle,
    conversationListLabelDefault,
    activeKey,
    messages,
    isRequesting,
    conversations,
  ]);

  useEffect(() => {
    saveConversations(storageKey, conversations);
  }, [storageKey, conversations]);

  const handleNewConversation = useCallback(() => {
    const now = Date.now();
    const key = `conv_${now}`;
    const listLabel =
      conversationListLabelDefault?.trim() || `对话 ${convCounter + 1}`;
    const item: ConversationItem = {
      key,
      label: listLabel,
      messages: [],
      lastActive: now,
      pinned: false,
      titleUserLocked: false,
    };
    if (activeKey && messages?.length) {
      const simplified = toStoredMessages(messages);
      setConversations((prev) =>
        prev.map((c) => (c.key === activeKey ? { ...c, messages: simplified } : c))
      );
    }
    pendingNewConversationSubmitRef.current = null;
    // 立刻清空当前 XChat store，避免 activeKey 切换到空会话前继续渲染上一条历史。
    setMessages([]);
    setConversations((prev) => [...prev, item]);
    setConvCounter((c) => c + 1);
    setActiveKey(key);
  }, [activeKey, convCounter, conversationListLabelDefault, messages, setMessages]);

  const handleConversationChange = useCallback(
    (key: string) => {
      if (key === activeKey) return;
      if (activeKey && messages?.length) {
        const simplified = toStoredMessages(messages);
        setConversations((prev) =>
          prev.map((c) => (c.key === activeKey ? { ...c, messages: simplified } : c))
        );
      }
      selectingConversationKeyRef.current = key;
      setActiveKey(key);
    },
    [activeKey, messages]
  );

  const renameConversation = useCallback((key: string, title: string) => {
    const t = title.replace(/\s+/g, ' ').trim().slice(0, 56);
    if (!t) return;
    setConversations((prev) =>
      prev.map((c) => (c.key === key ? { ...c, label: t, titleUserLocked: true } : c))
    );
  }, []);

  const setConversationPinned = useCallback((key: string, pinned: boolean) => {
    setConversations((prev) =>
      prev.map((c) => (c.key === key ? { ...c, pinned: !!pinned } : c))
    );
  }, []);

  const deleteConversation = useCallback((key: string) => {
    const deletingActive = activeKeyRef.current === key;
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.key !== key);
      if (deletingActive) {
        const vis = filtered
          .filter((c) => c.messages.length > 0)
          .sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            return (b.lastActive ?? 0) - (a.lastActive ?? 0);
          });
        const nk = vis[0]?.key ?? null;
        queueMicrotask(() => setActiveKey(nk));
      }
      return filtered;
    });
  }, []);

  const buildContextMessages = useCallback(() => {
    const ctx: Array<{ role: string; content: string }> = [];
    for (const block of effectiveContextBlocks) {
      if (block.content?.trim()) ctx.push({ role: 'user', content: `【${block.label}】\n${block.content}` });
    }
    if (formatContextTags) {
      const formatted = formatContextTags(effectiveContextTags);
      if (formatted?.trim()) ctx.push({ role: 'user', content: formatted });
    }
    return ctx;
  }, [effectiveContextBlocks, effectiveContextTags, formatContextTags]);

  const composeTextChatCompletionParams = useCallback(
    (snapshotMessages: typeof messages, appendUserOutbound: string | null, slotParsedDrawerType?: DrawerType) => {
      const drawerForPrompt =
        agentKey === 'drawer' ?
          slotParsedDrawerType ??
          drawerType // 续请求 / continuation 不传 slotConfig 时用会话内状态
        : drawerType;
      const basePromptForRequest =
        agentKey === 'drawer'
          ? getDrawerBasePrompt(drawerForPrompt)
          : (promptsDef?.basePrompt ?? '');
      const systemPromptForRequest =
        basePromptForRequest + (projectPrompt?.trim() ? `\n\n【本项目自定义要求】\n${projectPrompt.trim()}` : '');
      const ctx: Array<Record<string, unknown>> = [{ role: 'system', content: systemPromptForRequest }];
      ctx.push(...buildContextMessages());
      const history = (snapshotMessages ?? [])
        .filter((m) => m.message?.role && m.message.role !== 'system')
        .filter((m) => m.status !== 'loading' && m.status !== 'error')
        .filter((m) => {
          const c = stringifyMessageContent(m.message?.content);
          if (m.message?.role === 'assistant' && isToolCardContent(c)) return false;
          return true;
        })
        .map(mapSdkMessageRowToChatApiPayload)
        .filter((row): row is Record<string, unknown> => row != null);
      ctx.push(...history);
      if (appendUserOutbound?.trim()) {
        ctx.push({ role: 'user', content: appendUserOutbound.trim() });
      }

      let regDefs = getFunctionCallsForAgent(agentKey, effectiveModel?.capabilityKeys ?? []);
      if (agentKey === MAIN_AGENT_KEY) {
        regDefs = mergeFunctionCallDefs(getFunctionCallsForOrchestrator(), regDefs);
      }
      const toolDefs = mergeFunctionCallDefs(regDefs, extraFunctionCalls);
      const params: Record<string, unknown> = { messages: ctx };
      if (toolDefs.length > 0) params.tools = toOpenAITools(toolDefs);
      if (appendUserOutbound?.trim()) {
        const forced = forcedFunctionCallNames[0];
        if (forced && toolDefs.some((d) => d.name === forced)) {
          params.tool_choice = { type: 'function', function: { name: forced } };
        }
      }
      return params;
    },
    [
      agentKey,
      buildContextMessages,
      drawerType,
      effectiveModel?.capabilityKeys,
      extraFunctionCalls,
      forcedFunctionCallNames,
      projectPrompt,
      promptsDef?.basePrompt,
    ]
  );

  const toolsContinuationBusyRef = useRef(false);

  const handleSubmit = useCallback(
    async (
      userText: string,
      slotConfig?: SlotConfigType[],
      _skill?: unknown,
      opts?: AIChatHandleSubmitOptions
    ) => {
      const visible = (userText ?? '').trim();
      const pendingRaw = pendingOutboundFulltextRef.current;
      const pending =
        opts?.ignorePendingOutbound ? null : pendingRaw;
      const outbound = (pending != null && pending !== '' ? pending : visible).trim();
      pendingOutboundFulltextRef.current = null;
      lastTemplateDisplayRef.current = null;
      setComposerDefaultText(undefined);
      if (!outbound) return;
      requestCancelledRef.current = false;
      const effectiveDrawerType =
        agentKey === 'drawer' && slotConfig ? parseDrawerTypeFromSlotConfig(slotConfig) : drawerType;
      let params: Record<string, unknown>;
      const isImagesAgent = agent?.providerType === 'images';
      if (isImagesAgent) {
        const ctx: Array<{ role: string; content: string }> = [
          {
            role: 'system',
            content:
              getDrawerBasePrompt(effectiveDrawerType) +
              (projectPrompt?.trim() ? `\n\n【本项目自定义要求】\n${projectPrompt.trim()}` : ''),
          },
        ];
        ctx.push(...buildContextMessages());
        const history = (messages ?? [])
          .filter((m) => m.message?.role && m.message.role !== 'system')
          .filter((m) => m.status !== 'loading' && m.status !== 'error')
          .filter((m) => {
            const c = stringifyMessageContent(m.message?.content);
            if (m.message?.role === 'assistant' && isToolCardContent(c)) return false;
            return true;
          })
          .map((m) => ({ role: m.message!.role, content: stringifyMessageContent(m.message?.content) }));
        ctx.push(...history, { role: 'user', content: outbound });
        params = { messages: ctx };
        const imageFiles = attachments.filter((f: { originFileObj?: File; type?: string }) => {
          const file = f?.originFileObj ?? f;
          return file && file instanceof File && file.type?.startsWith('image/');
        });
        const attachmentImages: string[] = [];
        if (imageFiles.length > 0) {
          const dataUrls = await Promise.all(
            imageFiles.map((f: { originFileObj?: File }) =>
              fileToImageDataUrlForVolc(f?.originFileObj ?? (f as File))
            )
          );
          attachmentImages.push(...dataUrls.filter(Boolean));
        }
        params.attachmentImages = attachmentImages;
        params.drawerOptions = { ...drawerOptions, canvasAspectRatio };
      } else {
        params = composeTextChatCompletionParams(messages ?? [], outbound, effectiveDrawerType);
      }
      onRequest(params);
      // Sender.clear() 在部分分镜下不能清空输入；提交成功后 remount 以可靠清空（见预览 BottomSender）
      setComposerNonce((n) => n + 1);
    },
    [
      agent?.providerType,
      agentKey,
      buildContextMessages,
      composeTextChatCompletionParams,
      messages,
      onRequest,
      attachments,
      drawerOptions,
      canvasAspectRatio,
      drawerType,
      parseDrawerTypeFromSlotConfig,
      projectPrompt,
    ]
  );

  const handleSubmitInNewConversation = useCallback(
    (text: string) => {
      const visible = (text ?? '').trim();
      if (!visible) return;
      const now = Date.now();
      const key = `conv_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const item: ConversationItem = {
        key,
        label: conversationListLabelDefault?.trim() || `对话 ${convCounter + 1}`,
        messages: [],
        lastActive: now,
        pinned: false,
        titleUserLocked: false,
      };
      pendingNewConversationSubmitRef.current = { key, text: visible };
      setConversations((prev) => [...prev, item]);
      setConvCounter((c) => c + 1);
      setActiveKey(key);
    },
    [convCounter, conversationListLabelDefault]
  );

  useEffect(() => {
    const pending = pendingNewConversationSubmitRef.current;
    if (!pending || pending.key !== activeKey || isDefaultMessagesRequesting) return;
    pendingNewConversationSubmitRef.current = null;
    handleSubmit(pending.text, undefined, undefined, { ignorePendingOutbound: true });
  }, [activeKey, handleSubmit, isDefaultMessagesRequesting]);

  const userTurnIndices = (messages ?? [])
    .map((m, i) => (m.message?.role === 'user' ? i : -1))
    .filter((i) => i >= 0);

  const handleRollbackTo = useCallback(
    (userIndex: number) => {
      setMessages((ori) => ori.slice(0, userIndex + 1));
    },
    [setMessages]
  );

  const appendToolCardMessage = useCallback(
    (tool: 'prepare-gen-stories') => {
      setMessages((ori) => [
        ...ori,
        {
          id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          message: { role: 'assistant' as const, content: makeToolCardAssistantContent(tool) },
          status: 'local' as const,
        },
      ]);
    },
    [setMessages]
  );

  const dismissToolCardAndSubmit = useCallback(
    (messageId: string | number, prompt: string) => {
      setMessages((ori) => ori.filter((x) => x.id !== messageId));
      handleSubmit(prompt, undefined, undefined, { ignorePendingOutbound: true });
    },
    [setMessages, handleSubmit]
  );

  const handlePromptItemClick = useCallback(
    (item: PromptItem) => {
      if (item.launchTool === 'prepare-gen-stories') {
        appendToolCardMessage('prepare-gen-stories');
        return;
      }
      handleSubmit(item.message, undefined, undefined, { ignorePendingOutbound: true });
    },
    [appendToolCardMessage, handleSubmit]
  );

  const lastAssistantContent = [...(messages ?? [])]
    .reverse()
    .find((m) => {
      if (m.message?.role !== 'assistant') return false;
      const c = stringifyMessageContent(m.message?.content);
      if (isToolCardContent(c)) return false;
      const tc = (m.message as { toolCalls?: Array<unknown> })?.toolCalls;
      if (tc?.length && !String(c ?? '').trim()) return false;
      return true;
    })?.message?.content;
  const lastContent = stringifyMessageContent(lastAssistantContent);

  const sdkList = messages ?? [];
  const bubbleItems = sdkList.map((m, i) => {
    const reasoningContent =
      (m.message as { reasoningContent?: string })?.reasoningContent ?? '';
    const toolCalls = (m.message as { toolCalls?: Array<{ name?: string }> })?.toolCalls ?? [];
    const isStreaming = m.status === 'loading' || m.status === 'updating';
    const role = (m.message?.role === 'system' ? 'system' : m.message?.role) || 'assistant';
    const toolCallId =
      role === 'tool' ? String((m.message as { toolCallId?: string }).toolCallId ?? '').trim() : '';
    const toolCallName =
      toolCallId ? resolveToolCallNameForMessageRow(sdkList, toolCallId) : undefined;
    return {
      key: m.id,
      role,
      content: stringifyMessageContent(m.message?.content),
      status: m.status,
      loading: m.status === 'loading',
      extraInfo: {
        index: i,
        reasoningContent,
        isStreaming,
        messageId: m.id,
        toolCallNames: toolCalls.map((x) => x.name).filter(Boolean),
        ...(toolCallName ? { toolCallName } : {}),
      },
    };
  });

  const lastUserPlain = useMemo(() => {
    const list = messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.message?.role === 'user') {
        return stringifyMessageContent(list[i]?.message?.content);
      }
    }
    return '';
  }, [messages]);

  const lastUserMessageId = useMemo(() => {
    const list = messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.message?.role === 'user') {
        return list[i]?.id;
      }
    }
    return undefined;
  }, [messages]);

  const assistantStreaming = useMemo(() => {
    const lastAsst = [...(messages ?? [])]
      .reverse()
      .find((m) => {
        if (m.message?.role !== 'assistant') return false;
        const c = stringifyMessageContent(m.message?.content);
        if (isToolCardContent(c)) return false;
        const tc = (m.message as { toolCalls?: Array<unknown> })?.toolCalls;
        if (tc?.length && !String(c ?? '').trim()) return false;
        return true;
      });
    return lastAsst?.status === 'loading' || lastAsst?.status === 'updating';
  }, [messages]);

  const toolStateAfterLastUser = useMemo(() => {
    const list = messages ?? [];
    let lastUserIndex = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.message?.role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex < 0) return { pending: false, names: [] as string[] };

    const answered = new Set<string>();
    for (let i = lastUserIndex + 1; i < list.length; i++) {
      const row = list[i];
      if (row?.message?.role !== 'tool') continue;
      const tid = String((row.message as { toolCallId?: string }).toolCallId ?? '').trim();
      if (tid) answered.add(tid);
    }

    const names = new Set<string>();
    let pending = false;
    for (let i = lastUserIndex + 1; i < list.length; i++) {
      const row = list[i];
      if (row?.message?.role !== 'assistant') continue;
      const tc = (row.message as { toolCalls?: Array<{ id?: string; name?: string }> }).toolCalls;
      if (!tc?.length) continue;
      for (const call of tc) {
        if (call.name) names.add(call.name);
        if (call.id && !answered.has(call.id)) pending = true;
      }
    }
    return { pending, names: [...names] };
  }, [messages]);

  useEffect(() => {
    if (isRequesting || agent?.providerType === 'images') return;
    if (requestCancelledRef.current) return;
    const sdk = messages ?? [];

    const answered = new Set<string>();
    for (const m of sdk) {
      if (m.message?.role !== 'tool') continue;
      const tid = String((m.message as { toolCallId?: string }).toolCallId ?? '').trim();
      if (tid) answered.add(tid);
    }

    let targetRow: (typeof sdk)[number] | undefined;
    for (let i = sdk.length - 1; i >= 0; i--) {
      const row = sdk[i];
      if (row.message?.role !== 'assistant') continue;
      if (row.status === 'loading' || row.status === 'error' || row.status === 'abort') continue;
      const tc = (row.message as { toolCalls?: Array<{ id: string }> }).toolCalls;
      if (!tc?.length) continue;
      const un = tc.filter((t) => t.id && !answered.has(t.id));
      if (!un.length) continue;
      targetRow = row;
      break;
    }

    if (!targetRow) return;

    void (async () => {
      if (toolsContinuationBusyRef.current) return;
      toolsContinuationBusyRef.current = true;
      try {
        const tcFull = (
          targetRow!.message as { toolCalls?: Array<{ id: string; name: string; arguments: string }> }
        ).toolCalls;
        const toolAdds: typeof sdk = [];
        for (const tc of tcFull!) {
          if (requestCancelledRef.current) break;
          if (!tc?.id || answered.has(tc.id)) continue;
          const def = fcByName.get(tc.name);
          let contentStr: string;
          try {
            if (!def) {
              contentStr = JSON.stringify({ ok: false, error: `未注册的工具: ${tc.name}` });
            } else {
              let argsObj: Record<string, unknown> = {};
              try {
                argsObj = tc.arguments?.trim() ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {};
              } catch {
                argsObj = {};
              }
              const result = await def.handler(argsObj as never);
              contentStr = typeof result === 'string' ? result : JSON.stringify(result);
            }
          } catch (e: unknown) {
            contentStr = JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          toolAdds.push({
            id: `tool_${tc.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            message: { role: 'tool' as const, content: contentStr, toolCallId: tc.id },
            status: 'local' as const,
          });
        }

        if (!toolAdds.length) return;
        if (requestCancelledRef.current) return;

        let mergedSnapshot = sdk;
        flushSync(() => {
          setMessages((ori) => {
            mergedSnapshot = [...ori, ...toolAdds];
            return mergedSnapshot;
          });
        });

        const continuation = composeTextChatCompletionParams(mergedSnapshot, null, undefined);
        if (requestCancelledRef.current) return;
        onRequest(continuation);
      } finally {
        toolsContinuationBusyRef.current = false;
      }
    })();
  }, [messages, isRequesting, agent?.providerType, fcByName, composeTextChatCompletionParams, onRequest, setMessages]);

  useEffect(() => {
    if (!onAssistStream) return;
    onAssistStream({
      isRequesting,
      lastAssistantPlain: lastContent,
      lastUserPlain,
      lastUserMessageId,
      assistantStreaming,
      toolCallsPending: toolStateAfterLastUser.pending,
      toolCallNamesAfterLastUser: toolStateAfterLastUser.names,
    });
  }, [onAssistStream, isRequesting, lastContent, lastUserPlain, lastUserMessageId, assistantStreaming, toolStateAfterLastUser]);

  const visibleConversations = useMemo(
    () => conversations.filter((c) => c.messages.length > 0),
    [conversations]
  );

  const convItems: ConversationListMetaItem[] = useMemo(
    () =>
      visibleConversations.map((c) => ({
        key: c.key,
        label: c.label,
        lastActive: c.lastActive ?? 0,
        pinned: !!c.pinned,
        titleUserLocked: !!c.titleUserLocked,
      })),
    [visibleConversations]
  );

  /** 仅列表元信息 / 当前会话变化时通知父级，供外部 Conversations 排序与高亮 */
  const conversationStructureSigRef = useRef<string>('');
  useEffect(() => {
    if (!onConversationListChange) return;
    const sig = JSON.stringify({
      activeKey,
      items: visibleConversations.map((c) => ({
        k: c.key,
        l: c.label,
        t: c.lastActive ?? 0,
        p: !!c.pinned,
        u: !!c.titleUserLocked,
      })),
    });
    if (sig === conversationStructureSigRef.current) return;
    conversationStructureSigRef.current = sig;
    onConversationListChange({
      items: convItems,
      activeKey,
    });
  }, [convItems, visibleConversations, activeKey, onConversationListChange]);

  const promptItems = useMemo(
    () => [...(promptsDef?.prompts ?? []), ...(extraPromptItems ?? [])],
    [promptsDef?.prompts, extraPromptItems]
  );

  const missingHint = agent && missingCapabilityLabels.length > 0
    ? agent.missingCapabilityHint.replace('{missing}', missingCapabilityLabels.join('、'))
    : '';

  const attachDrawerImageFromSrc = useCallback(async (src: string) => {
    const trimmed = (src ?? '').trim();
    if (!trimmed) return;
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`加载图片失败: ${res.status}`);
    const blob = await res.blob();
    const mime =
      blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/png';
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    const file = new File([blob], `drawer_${Date.now()}.${ext}`, { type: mime });
    const uid = `yiman_attach_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const thumbUrl = trimmed.startsWith('data:') ? trimmed : URL.createObjectURL(blob);
    setAttachments((prev) => [
      ...prev,
      { uid, name: file.name, status: 'done', originFileObj: file, thumbUrl },
    ]);
    setAttachmentsOpen(true);
  }, []);

  const clearDrawerAttachments = useCallback(() => setAttachments([]), []);

  /** 官方示例：Sender.onPasteFile → attachmentsRef.upload(file)（参数为 FileList） */
  const onSenderPasteFile = useCallback((files: FileList) => {
    const api = attachmentsRef.current;
    if (!api?.upload) return;
    Array.from(files).forEach((file) => {
      try {
        api.upload(file);
      } catch {
        /* ignore */
      }
    });
    setAttachmentsOpen(true);
  }, []);

  /**
   * 拖到 Sender 时落点常在内容区 DIV，portaled Upload.Dragger 接不到 drop（故无 beforeUpload/onChange）。
   * 在 Sender 根捕获阶段交给 Attachments ref.upload，与点击选文件同一路径。
   */
  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    let detach: (() => void) | undefined;

    const tryBind = () => {
      if (cancelled) return;
      const el = senderRef.current?.nativeElement as HTMLElement | undefined;
      if (!el) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tryBind);
        return;
      }
      debugAttachments('debug bind: 已挂到 Sender.nativeElement', { tagName: el.tagName });

      const onDragOverCap = (e: DragEvent) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      };

      const onDragEnterCap = (e: DragEvent) => {
        debugAttachments('Sender 根 dragenter [capture]', {
          types: e.dataTransfer ? [...e.dataTransfer.types] : [],
        });
      };

      const onDropCap = (e: DragEvent) => {
        debugAttachments('Sender 根 drop [capture]', {
          fileCount: e.dataTransfer?.files?.length ?? 0,
          targetTag: (e.target as HTMLElement)?.tagName,
          currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
        });
        const dt = e.dataTransfer;
        if (!dt?.types?.includes('Files')) return;
        const files = dt.files;
        if (!files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        const api = attachmentsRef.current;
        if (api?.upload) {
          Array.from(files).forEach((file) => {
            try {
              api.upload(file);
            } catch {
              /* ignore */
            }
          });
        }
        setAttachmentsOpen(true);
        notifyXAttachmentDropOverlayClose();
      };

      el.addEventListener('dragover', onDragOverCap, true);
      el.addEventListener('drop', onDropCap, true);
      el.addEventListener('dragenter', onDragEnterCap, true);
      detach = () => {
        el.removeEventListener('dragover', onDragOverCap, true);
        el.removeEventListener('drop', onDropCap, true);
        el.removeEventListener('dragenter', onDragEnterCap, true);
      };
    };

    tryBind();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      detach?.();
    };
  }, [attachmentsOpen, composerNonce]);

  /** 调试：全局 document 是否收到 drop（对比是否被其它层吃掉） */
  useEffect(() => {
    if (!isAttachmentsDebugEnabled()) return;
    console.log(
      '%c[yiman:Attachments] 调试已开启',
      'color:#7ee787',
      '过滤控制台关键字: yiman:Attachments；关闭: localStorage.removeItem("yiman:debugAttachments") 后刷新'
    );
    const onDocDrop = (e: DragEvent) => {
      debugAttachments('document drop [bubble]', {
        fileCount: e.dataTransfer?.files?.length ?? 0,
        targetTag: (e.target as HTMLElement)?.tagName,
      });
    };
    const onDocDragEnter = (e: DragEvent) => {
      debugAttachments('document dragenter [bubble]', {
        types: e.dataTransfer ? [...e.dataTransfer.types] : [],
      });
    };
    document.addEventListener('drop', onDocDrop);
    document.addEventListener('dragenter', onDocDragEnter);
    return () => {
      document.removeEventListener('drop', onDocDrop);
      document.removeEventListener('dragenter', onDocDragEnter);
    };
  }, []);

  const handleAttachmentsChange = useCallback((info: { file: unknown; fileList: any[] }) => {
    debugAttachments('Attachments onChange', {
      listLen: info.fileList?.length ?? 0,
      lastFile: info.file
        ? {
            name: (info.file as { name?: string }).name,
            status: (info.file as { status?: string }).status,
            uid: (info.file as { uid?: string }).uid,
          }
        : undefined,
    });
    setAttachments(info.fileList);
  }, []);

  const hasImageAttachment = attachments.some((f: { originFileObj?: File; type?: string }) => {
    const file = (f as { originFileObj?: File })?.originFileObj ?? f;
    return file instanceof File && file.type?.startsWith('image/');
  });

  const resolvedAspect = useMemo(
    () => resolveAspectRatio(drawerOptions.aspectRatio, canvasAspectRatio),
    [drawerOptions.aspectRatio, canvasAspectRatio]
  );

  /** Sender skill + slotConfig：与官方 demo 一致，skill 为专家名（可关闭），slotConfig 仅 text/select/tag，无 input/content */
  const senderSkill =
    !suppressSenderAgentSkill && agent && agent.key !== MAIN_AGENT_KEY
      ? {
          value: agent.key,
          title: agent.label,
          closable: { onClose: () => onAgentChange?.('main') },
        }
      : undefined;

  const onLastDrawerImageRef = useRef(onLastDrawerImageChange);
  onLastDrawerImageRef.current = onLastDrawerImageChange;

  useEffect(() => {
    const cb = onLastDrawerImageRef.current;
    if (!cb) return;
    if (agentKey !== 'drawer') {
      cb(undefined);
      return;
    }
    const { images } = parseDrawerContent(lastContent);
    cb(images[0]);
  }, [lastContent, agentKey]);

  const onDrawerSessionSyncRef = useRef(onDrawerSessionSync);
  onDrawerSessionSyncRef.current = onDrawerSessionSync;

  useEffect(() => {
    const sync = onDrawerSessionSyncRef.current;
    if (!sync || agentKey !== 'drawer') return;
    sync({
      isRequesting,
      imageCount: drawerOptions.imageCount,
      aspectRatio: drawerOptions.aspectRatio,
      resolvedAspect,
      hasImageAttachment,
      attachDrawerImageFromSrc,
      clearDrawerAttachments,
    });
  }, [
    agentKey,
    isRequesting,
    drawerOptions.imageCount,
    drawerOptions.aspectRatio,
    resolvedAspect,
    hasImageAttachment,
    attachDrawerImageFromSrc,
    clearDrawerAttachments,
  ]);

  useEffect(() => {
    if (!isAttachmentsDebugEnabled()) return;
    debugAttachments('attachments 状态长度变化', { len: attachments.length, uids: attachments.map((x: { uid?: string }) => x?.uid) });
  }, [attachments]);

  const updateGlobalContext = useCallback(
    (opts: {
      contextBlocks?: Array<{ label: string; content: string }>;
      contextTags?: AIChatContextTag[];
      replace?: boolean;
    }) => {
      const rep = opts.replace === true;
      if (opts.contextBlocks !== undefined) {
        if (rep) setEffectiveContextBlocks(opts.contextBlocks);
        else setEffectiveContextBlocks((prev) => [...prev, ...opts.contextBlocks!]);
      }
      if (opts.contextTags !== undefined) {
        if (rep) setEffectiveContextTags(opts.contextTags);
        else {
          setEffectiveContextTags((prev) => {
            const m = new Map(prev.map((t) => [t.id, t]));
            for (const t of opts.contextTags!) m.set(t.id, t);
            return Array.from(m.values());
          });
        }
      }
    },
    []
  );

  const applyPromptTemplate = useCallback(
    (templateId: string, slotValues: TemplateSlotValue[]) => {
      const list = promptTemplates ?? [];
      const t = list.find((x) => x.id === templateId);
      if (!t) return;
      if (t.agentKey && t.agentKey !== agentKey) return;
      const { fulltext, displayLabel } = renderPromptTemplate(t, slotValues);
      pendingOutboundFulltextRef.current = fulltext;
      lastTemplateDisplayRef.current = displayLabel;
      setComposerDefaultText(displayLabel);
      setComposerNonce((n) => n + 1);
    },
    [promptTemplates, agentKey]
  );

  const senderSlotConfig = useMemo((): SlotConfigType[] => {
    const slots: SlotConfigType[] = [...normalizedExtraSenderSlots];
    for (const rs of registerableSenderSlots ?? []) {
      slots.push({ ...rs.slot, key: rs.id } as SlotConfigType);
    }
    const showFcSlots = showForcedFunctionCallSlots !== false;
    if (showFcSlots) {
      for (const name of forcedFunctionCallNames) {
        slots.push({
          type: 'custom',
          key: `yiman_fc_${name}`,
          props: {},
          formatResult: () => '',
          customRender: () => (
            <Tag
              closable
              style={{ margin: 0, fontSize: 12 }}
              onClose={() => setForcedFunctionCallNames((prev) => prev.filter((n) => n !== name))}
            >
              {fcByName.get(name)?.senderLabel ?? name}
            </Tag>
          ),
        });
      }
    }
    for (const ctx of effectiveContextTags) {
      if (onRemoveContextTag) {
        const removeCb = onRemoveContextTag;
        slots.push({
          type: 'custom',
          key: ctx.id,
          props: {},
          formatResult: () => '',
          customRender: (_val, _onChange, _props, item) => (
            <Tag closable onClose={() => item.key && removeCb(item.key)} style={{ margin: 0, fontSize: 12 }}>
              {ctx.description}
            </Tag>
          ),
        });
      } else {
        slots.push({
          type: 'tag',
          key: ctx.id,
          props: { label: ctx.description, value: ctx.id },
          formatResult: () => '',
        });
      }
    }
    if (agent && agent.key !== MAIN_AGENT_KEY) {
      const hasDrawerSlot =
        agent.key === 'drawer' && agent.welcomeSlot?.type === 'select' && !suppressDrawerSenderSlots;
      if (hasDrawerSlot) {
        slots.push(...getDrawerSlotConfig());
      } else if (agent.welcomeMessage && !suppressAgentSenderWelcome) {
        slots.push({ type: 'text', value: `：${agent.welcomeMessage}` });
      }
    }
    return slots;
  }, [
    agent,
    effectiveContextTags,
    onRemoveContextTag,
    normalizedExtraSenderSlots,
    registerableSenderSlots,
    showForcedFunctionCallSlots,
    forcedFunctionCallNames,
    fcByName,
    suppressAgentSenderWelcome,
    suppressDrawerSenderSlots,
  ]);

  const handleSenderChange = useCallback(
    (raw: string, _event: unknown, slotConfig?: SlotConfigType[]) => {
      if (lastTemplateDisplayRef.current != null) {
        const plain = extractSenderPlainText(raw);
        if (plain.trim() !== lastTemplateDisplayRef.current.trim()) {
          pendingOutboundFulltextRef.current = null;
          lastTemplateDisplayRef.current = null;
        }
      }
      if (agentKey === 'drawer' && slotConfig) {
        setDrawerType(parseDrawerTypeFromSlotConfig(slotConfig));
      }
    },
    [agentKey]
  );

  /**
   * @ant-design/x 的内置 Placeholder 用 Typography.Title/Text 渲染 title/description；
   * Typography 内部 EllipsisMeasure + ResizeObserver 在窄容器/Strict Mode 下会触发
   * 「Maximum update depth exceeded」。这里直接给 ReactElement 走 isValidElement 分支，
   * 完全绕过 Typography 测量。
   */
  const renderPlaceholderNode = (type: 'inline' | 'drop'): React.ReactElement => {
    if (type === 'drop') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 13,
            padding: 8,
            minWidth: 0,
          }}
        >
          拖放图片到此处
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          color: 'rgba(255,255,255,0.7)',
          padding: 8,
          minWidth: 0,
        }}
      >
        <LinkOutlined style={{ fontSize: 18 }} />
        <div style={{ fontSize: 13 }}>上传图片</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
          点击或拖拽图片到输入区域
        </div>
      </div>
    );
  };

  const senderHeader = (
    <Sender.Header
      title="附件"
      open={attachmentsOpen}
      onOpenChange={setAttachmentsOpen}
      /** 折叠时仍挂载子树，Attachments 的 DropArea / Upload 才能接到拖到 Sender 上的文件 */
      forceRender
      styles={{ content: { padding: 0, minWidth: 0 } }}
    >
      <div style={{ width: '100%', minWidth: 1, overflow: 'hidden' }}>
        <Attachments
          ref={attachmentsRef}
          beforeUpload={() => false}
          items={attachments}
          onChange={handleAttachmentsChange}
          multiple
          showUploadList
          listType="picture-card"
          getDropContainer={() => {
            const el = senderRef.current?.nativeElement;
            debugAttachments('getDropContainer()', {
              hasSenderRef: !!senderRef.current,
              el: el
                ? { tagName: el.tagName, className: String(el.className || '').slice(0, 120) }
                : null,
            });
            return el;
          }}
          placeholder={renderPlaceholderNode}
        />
      </div>
    </Sender.Header>
  );

  return {
    // 布局用
    convItems,
    activeKey,
    hasMessages,
    bubbleItems,
    promptItems,
    contextTags: effectiveContextTags,
    lastContent,
    isRequesting,
    senderRef,
    senderHeader: disableAttachmentsHeader ? undefined : senderHeader,
    attachmentsOpen,
    setAttachmentsOpen,
    missingHint,
    hasValidModel,
    agent,
    allowAgentSwitch,
    agentKey,
    mergedAgents,
    validModels,
    selectedChatModelId: effectiveModel?.id,
    onChatModelChange,
    composerNonce,
    composerDefaultText,
    senderSlotConfig,
    senderSkill,
    drawerOptions,
    setDrawerOptions,
    attachments,
    DRAWER_ASPECT_OPTIONS,
    enableReasoning,
    attachDrawerImageFromSrc,
    clearDrawerAttachments,
    updateGlobalContext,
    applyPromptTemplate,
    setForcedFunctionCallNames,

    // 行为
    handleNewConversation,
    handleConversationChange,
    handleSubmit,
    handleSubmitInNewConversation,
    abort,
    handleSenderChange,
    handleRollbackTo,
    handlePromptItemClick,
    handlePromptClick: handlePromptItemClick,
    renameConversation,
    setConversationPinned,
    deleteConversation,
    dismissToolCardAndSubmit,
    userTurnIndices,
    onRemoveContextTag,
    /** 绑定到 Sender onPasteFile，与 @ant-design/x 官方示例一致 */
    onSenderPasteFile,

    // 组件
    Sender,
    Bubble,
    Prompts,
    writeBackActions: lastContent && writeBackActions ? writeBackActions(lastContent) : null,
    senderPlaceholder,
  };
}
