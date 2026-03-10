/**
 * AI 对话核心逻辑（与布局无关，供各模式复用）
 * 使用 stream 模式，支持对话列表、回退、附件、agent 切换
 * Sender 使用 slotConfig + skill 将 agent、欢迎句、选中对象以 slot 形式显示在输入框内
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Tag } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { Bubble, Sender, Attachments, Prompts } from '@ant-design/x';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { useXChat } from '@ant-design/x-sdk';
import OpenAIImagesProvider from './providers/OpenAIImagesProvider';
import { ReasoningChatProvider } from './providers/ReasoningChatProvider';
import type { AIModelConfig } from '@/types/settings';
import type { AIChatContextTag, PromptItem } from './types';
import { useAgentModel } from './hooks/useAgentModel';
import { AGENT_CONFIGS, AGENT_PROMPTS_MAP, MAIN_AGENT_KEY } from './experts';
import {
  getDrawerBasePrompt,
  getDrawerSlotConfig,
  parseDrawerTypeFromSlotConfig,
} from './agents/drawerAgent.tsx';
import type { DrawerType } from './agents/drawerAgent.tsx';
import type { DrawerOptions } from './types/drawerOptions';
import { DRAWER_ASPECT_OPTIONS } from './types/drawerOptions';
import { fileToBase64 } from './utils/fileToBase64';
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
    return new OpenAIImagesProvider(modelConfig);
  }
  return new ReasoningChatProvider(modelConfig, enableReasoning);
}

const CONV_STORAGE_PREFIX = 'yiman:aichat:conversations:';

interface ConversationItem {
  key: string;
  label: string;
  messages: Array<{ role: string; content: string; reasoningContent?: string }>;
  /** 最后活跃时间戳，用于分组显示（今日/昨日） */
  lastActive?: number;
}

function loadConversations(storageKey: string): ConversationItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((c: ConversationItem) => {
      if (c.lastActive) return c;
      const m = c.key?.match?.(/^conv_(\d+)$/);
      return { ...c, lastActive: m ? parseInt(m[1], 10) : 0 };
    });
  } catch {
    return [];
  }
}

function saveConversations(storageKey: string, items: ConversationItem[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(-20)));
  } catch {
    /* ignore */
  }
}

export interface AIChatCoreProps {
  /** Agent 角色 key */
  agentKey: string;
  /** 是否允许切换 agent（已渲染的对话可变更 agent） */
  allowAgentSwitch?: boolean;
  /** 模型列表（来自 ConfigContext） */
  models: AIModelConfig[] | undefined;
  /** 项目/场景级自定义 prompt 追加到 system */
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
  /** 存储 key 后缀（不同 agent/场景可区分） */
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
}

export function useAIChatCore({
  agentKey,
  allowAgentSwitch = true,
  models,
  projectPrompt,
  contextBlocks = [],
  contextTags = [],
  onRemoveContextTag,
  formatContextTags,
  writeBackActions,
  senderPlaceholder = 'Shift+Enter 换行，Enter 发送',
  storageKeySuffix = 'default',
  onAgentChange,
  canvasAspectRatio,
  enableReasoning = false,
}: AIChatCoreProps) {
  const storageKey = `${CONV_STORAGE_PREFIX}${agentKey}:${storageKeySuffix}`;
  const [conversations, setConversations] = useState<ConversationItem[]>(() => loadConversations(storageKey));
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [convCounter, setConvCounter] = useState(() => loadConversations(storageKey).length);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<DrawerType>('general');
  const [drawerOptions, setDrawerOptions] = useState<DrawerOptions>({
    imageCount: 1,
    aspectRatio: '1:1',
  });
  const senderRef = useRef<any>(null);

  const { agent, hasValidModel, model, missingCapabilityLabels } = useAgentModel(agentKey, models);
  const promptsDef = agentKey ? AGENT_PROMPTS_MAP[agentKey] : null;
  const provider = React.useMemo(
    () => buildProvider(agent?.providerType, model, enableReasoning),
    [agent?.providerType, model, enableReasoning]
  );

  const { onRequest, messages, isRequesting, setMessages } = useXChat({
    provider,
    conversationKey: `aichat-${agentKey}-${storageKeySuffix}`,
    requestPlaceholder: () => ({ content: '思考中…', role: 'assistant' }),
    requestFallback: (_, { errorInfo }) => ({
      content: errorInfo?.error?.message || '请求失败',
      role: 'assistant',
    }),
  });

  const hasMessages = (messages ?? []).filter((m) => m.message?.role !== 'system').length > 0;

  useEffect(() => {
    if (!activeKey || !messages?.length) return;
    const simplified = messages
      .filter((m) => m.message?.role && m.message.role !== 'system')
      .filter((m) => m.status !== 'loading' && m.status !== 'error')
      .map((m) => {
        const rc = (m.message as { reasoningContent?: string })?.reasoningContent;
        return {
          role: m.message!.role!,
          content: String(m.message?.content ?? ''),
          ...(rc ? { reasoningContent: rc } : {}),
        };
      });
    const now = Date.now();
    setConversations((prev) =>
      prev.map((c) => (c.key === activeKey ? { ...c, messages: simplified, lastActive: now } : c))
    );
  }, [activeKey, messages]);

  useEffect(() => {
    saveConversations(storageKey, conversations);
  }, [storageKey, conversations]);

  const handleNewConversation = useCallback(() => {
    const now = Date.now();
    const key = `conv_${now}`;
    const item: ConversationItem = { key, label: `对话 ${convCounter + 1}`, messages: [], lastActive: now };
    setConversations((prev) => [...prev, item]);
    setConvCounter((c) => c + 1);
    setActiveKey(key);
    setMessages([]);
  }, [convCounter, setMessages]);

  const handleConversationChange = useCallback(
    (key: string) => {
      const conv = conversations.find((c) => c.key === key);
      const now = Date.now();
      if (activeKey && messages?.length) {
        const simplified = messages
          .filter((m) => m.message?.role && m.message.role !== 'system')
          .filter((m) => m.status !== 'loading' && m.status !== 'error')
          .map((m) => {
            const rc = (m.message as { reasoningContent?: string })?.reasoningContent;
            return {
              role: m.message!.role!,
              content: String(m.message?.content ?? ''),
              ...(rc ? { reasoningContent: rc } : {}),
            };
          });
        setConversations((prev) =>
          prev.map((c) =>
            c.key === activeKey ? { ...c, messages: simplified, lastActive: now } : c.key === key ? { ...c, lastActive: now } : c
          )
        );
      } else {
        setConversations((prev) =>
          prev.map((c) => (c.key === key ? { ...c, lastActive: now } : c))
        );
      }
      setActiveKey(key);
      if (conv?.messages?.length) {
        setMessages(
          conv.messages.map((m, i) => ({
            id: `msg_${i}`,
            message: {
              role: m.role as 'user' | 'assistant',
              content: m.content,
              ...(m.reasoningContent ? { reasoningContent: m.reasoningContent } : {}),
            },
            status: 'local' as const,
          }))
        );
      } else {
        setMessages([]);
      }
    },
    [activeKey, conversations, messages, setMessages]
  );

  const buildContextMessages = useCallback(() => {
    const ctx: Array<{ role: string; content: string }> = [];
    for (const block of contextBlocks) {
      if (block.content?.trim()) ctx.push({ role: 'user', content: `【${block.label}】\n${block.content}` });
    }
    if (formatContextTags && contextTags.length > 0) {
      const formatted = formatContextTags(contextTags);
      if (formatted) ctx.push({ role: 'user', content: formatted });
    }
    return ctx;
  }, [contextBlocks, contextTags, formatContextTags]);


  const handleSubmit = useCallback(
    async (userText: string, slotConfig?: SlotConfigType[], _skill?: unknown) => {
      const text = (userText ?? '').trim();
      if (!text) return;
      const effectiveDrawerType =
        agentKey === 'drawer' && slotConfig ? parseDrawerTypeFromSlotConfig(slotConfig) : drawerType;
      const basePromptForRequest =
        agentKey === 'drawer' ? getDrawerBasePrompt(effectiveDrawerType) : (promptsDef?.basePrompt ?? '');
      const systemPromptForRequest =
        basePromptForRequest + (projectPrompt?.trim() ? `\n\n【本项目自定义要求】\n${projectPrompt.trim()}` : '');
      const ctx: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPromptForRequest }];
      ctx.push(...buildContextMessages());
      const history = (messages ?? [])
        .filter((m) => m.message?.role && m.message.role !== 'system')
        .filter((m) => m.status !== 'loading' && m.status !== 'error')
        .map((m) => ({ role: m.message!.role, content: String(m.message?.content ?? '') }));
      ctx.push(...history, { role: 'user', content: text });
      const params: Record<string, unknown> = { messages: ctx };
      if (agentKey === 'drawer') {
        const imageFiles = attachments.filter((f: { originFileObj?: File; type?: string }) => {
          const file = f?.originFileObj ?? f;
          return file && file instanceof File && file.type?.startsWith('image/');
        });
        const attachmentImages: string[] = [];
        if (imageFiles.length > 0) {
          const bases = await Promise.all(
            imageFiles.map((f: { originFileObj?: File }) => fileToBase64(f?.originFileObj ?? (f as File)))
          );
          attachmentImages.push(...bases.filter(Boolean));
        }
        params.attachmentImages = attachmentImages;
        params.drawerOptions = { ...drawerOptions, canvasAspectRatio };
      }
      onRequest(params);
    },
    [
      agentKey,
      promptsDef?.basePrompt,
      projectPrompt,
      buildContextMessages,
      messages,
      onRequest,
      attachments,
      drawerOptions,
      canvasAspectRatio,
      drawerType,
      parseDrawerTypeFromSlotConfig,
    ]
  );

  const userTurnIndices = (messages ?? [])
    .map((m, i) => (m.message?.role === 'user' ? i : -1))
    .filter((i) => i >= 0);

  const handleRollbackTo = useCallback(
    (userIndex: number) => {
      setMessages((ori) => ori.slice(0, userIndex + 1));
    },
    [setMessages]
  );

  const handlePromptClick = useCallback(
    (item: PromptItem) => {
      handleSubmit(item.message);
    },
    [handleSubmit]
  );

  const lastAssistantContent = messages?.filter((m) => m.message?.role === 'assistant').pop()?.message?.content;
  const lastContent = typeof lastAssistantContent === 'string' ? lastAssistantContent : '';

  const bubbleItems = (messages ?? []).map((m, i) => {
    const reasoningContent =
      (m.message as { reasoningContent?: string })?.reasoningContent ?? '';
    const isStreaming = m.status === 'loading' || m.status === 'updating';
    return {
      key: m.id,
      role: (m.message?.role === 'system' ? 'system' : m.message?.role) || 'assistant',
      content: typeof m.message?.content === 'string' ? m.message.content : '',
      status: m.status,
      loading: m.status === 'loading',
      extraInfo: { index: i, reasoningContent, isStreaming },
    };
  });

  const convItems = conversations.map((c) => ({
    key: c.key,
    label: c.label,
    lastActive: c.lastActive ?? 0,
  }));
  const promptItems = promptsDef?.prompts ?? [];

  const missingHint = agent && missingCapabilityLabels.length > 0
    ? agent.missingCapabilityHint.replace('{missing}', missingCapabilityLabels.join('、'))
    : '';

  /** Sender skill + slotConfig：与官方 demo 一致，skill 为专家名（可关闭），slotConfig 仅 text/select/tag，无 input/content */
  const senderSkill =
    agent && agent.key !== MAIN_AGENT_KEY
      ? {
          value: agent.key,
          title: agent.label,
          closable: { onClose: () => onAgentChange?.('main') },
        }
      : undefined;

  const senderSlotConfig = useMemo((): SlotConfigType[] => {
    const slots: SlotConfigType[] = [];
    if (agent && agent.key !== MAIN_AGENT_KEY) {
      const hasDrawerSlot = agent.key === 'drawer' && agent.welcomeSlot?.type === 'select';
      if (hasDrawerSlot) {
        slots.push(...getDrawerSlotConfig());
      } else if (agent.welcomeMessage) {
        slots.push({ type: 'text', value: `：${agent.welcomeMessage}` });
      }
    }
    for (const ctx of contextTags) {
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
        });
      }
    }
    return slots;
  }, [agent, contextTags, onRemoveContextTag]);

  const handleSenderChange = useCallback(
    (_value: string, _event: unknown, slotConfig?: SlotConfigType[]) => {
      if (agentKey === 'drawer' && slotConfig) {
        setDrawerType(parseDrawerTypeFromSlotConfig(slotConfig));
      }
    },
    [agentKey]
  );

  const senderHeader = (
    <Sender.Header
      title="附件"
      open={attachmentsOpen}
      onOpenChange={setAttachmentsOpen}
      styles={{ content: { padding: 0 } }}
    >
      <Attachments
        beforeUpload={() => false}
        items={attachments}
        onChange={({ fileList }) => setAttachments(fileList)}
        showUploadList
        listType="picture-card"
        placeholder={(type) =>
          type === 'drop'
            ? { title: '拖放文件到此处' }
            : {
                icon: <LinkOutlined />,
                title: '上传文件或图片',
                description: '点击或拖拽文件到此区域',
              }
        }
        getDropContainer={() => senderRef.current?.nativeElement}
      />
    </Sender.Header>
  );

  return {
    // 布局用
    convItems,
    activeKey,
    hasMessages,
    bubbleItems,
    promptItems,
    contextTags,
    lastContent,
    isRequesting,
    senderRef,
    senderHeader,
    attachmentsOpen,
    setAttachmentsOpen,
    missingHint,
    hasValidModel,
    agent,
    allowAgentSwitch,
    agentKey,
    AGENT_CONFIGS,
    senderSlotConfig,
    senderSkill,
    drawerOptions,
    setDrawerOptions,
    attachments,
    DRAWER_ASPECT_OPTIONS,
    enableReasoning,

    // 行为
    handleNewConversation,
    handleConversationChange,
    handleSubmit,
    handleSenderChange,
    handleRollbackTo,
    handlePromptClick,
    userTurnIndices,
    onRemoveContextTag,

    // 组件
    Sender,
    Bubble,
    Prompts,
    writeBackActions: lastContent && writeBackActions ? writeBackActions(lastContent) : null,
    senderPlaceholder,
  };
}
