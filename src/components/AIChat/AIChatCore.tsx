/**
 * AI 对话核心逻辑（与布局无关，供各模式复用）
 * 使用 stream 模式，支持对话列表、回退、附件、agent 切换
 * Sender 使用 slotConfig + skill 将 agent、欢迎句、选中对象以 slot 形式显示在输入框内
 */
import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
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

function extractSenderPlainText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    return typeof v === 'string' ? v : '';
  }
  return '';
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
  /** 追加在 Sender slotConfig 最前（预览/嵌入场景，如测试 Function Call 槽位） */
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
  extraSenderSlotConfig = [],
  onLastDrawerImageChange,
  onDrawerSessionSync,
  builtInAgents,
  extraAgents,
  extraFunctionCalls,
  promptTemplates,
  extraPromptItems,
  registerableSenderSlots,
  showForcedFunctionCallSlots,
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
  /** 与 Ant Design X 官方 Sender + Attachments 示例一致：GetRef<typeof …> */
  const senderRef = useRef<GetRef<typeof Sender>>(null);
  /** 粘贴 / 捕获 drop 时调用 ref.upload(file)，与官方 onPasteFile 示例一致 */
  const attachmentsRef = useRef<GetRef<typeof Attachments>>(null);

  const [effectiveContextBlocks, setEffectiveContextBlocks] = useState(() => contextBlocks);
  const [effectiveContextTags, setEffectiveContextTags] = useState(() => contextTags);
  useEffect(() => {
    setEffectiveContextBlocks(contextBlocks);
  }, [contextBlocks]);
  useEffect(() => {
    setEffectiveContextTags(contextTags);
  }, [contextTags]);

  const [forcedFunctionCallNames, setForcedFunctionCallNames] = useState<string[]>([]);
  const pendingOutboundFulltextRef = useRef<string | null>(null);
  const lastTemplateDisplayRef = useRef<string | null>(null);
  const [composerNonce, setComposerNonce] = useState(0);
  const [composerDefaultText, setComposerDefaultText] = useState<string | undefined>(undefined);

  const { agent, hasValidModel, model, missingCapabilityLabels, mergedAgents } = useAgentModel(
    agentKey,
    models,
    { extraAgents, builtInAgents }
  );

  const fcByName = useMemo(() => {
    const merged = mergeFunctionCallDefs(getAllFunctionCalls(), extraFunctionCalls);
    return new Map(merged.map((d) => [d.name, d]));
  }, [extraFunctionCalls]);
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
    for (const block of effectiveContextBlocks) {
      if (block.content?.trim()) ctx.push({ role: 'user', content: `【${block.label}】\n${block.content}` });
    }
    if (formatContextTags && effectiveContextTags.length > 0) {
      const formatted = formatContextTags(effectiveContextTags);
      if (formatted) ctx.push({ role: 'user', content: formatted });
    }
    return ctx;
  }, [effectiveContextBlocks, effectiveContextTags, formatContextTags]);


  const handleSubmit = useCallback(
    async (userText: string, slotConfig?: SlotConfigType[], _skill?: unknown) => {
      const visible = (userText ?? '').trim();
      const pending = pendingOutboundFulltextRef.current;
      const outbound = (pending != null && pending !== '' ? pending : visible).trim();
      pendingOutboundFulltextRef.current = null;
      lastTemplateDisplayRef.current = null;
      setComposerDefaultText(undefined);
      if (!outbound) return;
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
      ctx.push(...history, { role: 'user', content: outbound });
      const params: Record<string, unknown> = { messages: ctx };
      const isImagesAgent = agent?.providerType === 'images';
      if (isImagesAgent) {
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
        let regDefs = getFunctionCallsForAgent(agentKey, model?.capabilityKeys ?? []);
        if (agentKey === MAIN_AGENT_KEY) {
          regDefs = mergeFunctionCallDefs(getFunctionCallsForOrchestrator(), regDefs);
        }
        const toolDefs = mergeFunctionCallDefs(regDefs, extraFunctionCalls);
        if (toolDefs.length > 0) {
          params.tools = toOpenAITools(toolDefs);
        }
        const forced = forcedFunctionCallNames[0];
        if (forced && toolDefs.some((d) => d.name === forced)) {
          // OpenAI 兼容：仅对首个 name 强制；多选时其余仅在 tools 中可选。见 docs/06 §13.5
          params.tool_choice = { type: 'function', function: { name: forced } };
        }
      }
      onRequest(params);
      // Sender.clear() 在部分场景下不能清空输入；提交成功后 remount 以可靠清空（见预览 BottomSender）
      setComposerNonce((n) => n + 1);
    },
    [
      agent?.providerType,
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
      model?.capabilityKeys,
      extraFunctionCalls,
      forcedFunctionCallNames,
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
    agent && agent.key !== MAIN_AGENT_KEY
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
    const slots: SlotConfigType[] = [...extraSenderSlotConfig];
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
        });
      }
    }
    if (agent && agent.key !== MAIN_AGENT_KEY) {
      const hasDrawerSlot = agent.key === 'drawer' && agent.welcomeSlot?.type === 'select';
      if (hasDrawerSlot) {
        slots.push(...getDrawerSlotConfig());
      } else if (agent.welcomeMessage) {
        slots.push({ type: 'text', value: `：${agent.welcomeMessage}` });
      }
    }
    return slots;
  }, [
    agent,
    effectiveContextTags,
    onRemoveContextTag,
    extraSenderSlotConfig,
    registerableSenderSlots,
    showForcedFunctionCallSlots,
    forcedFunctionCallNames,
    fcByName,
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

  const senderHeader = (
    <Sender.Header
      title="附件"
      open={attachmentsOpen}
      onOpenChange={setAttachmentsOpen}
      /** 折叠时仍挂载子树，Attachments 的 DropArea / Upload 才能接到拖到 Sender 上的文件 */
      forceRender
      styles={{ content: { padding: 0 } }}
    >
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
        placeholder={(type) =>
          type === 'drop'
            ? { title: '拖放图片到此处' }
            : {
                icon: <LinkOutlined />,
                title: '上传图片',
                description: '点击或拖拽图片到输入区域',
              }
        }
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
    contextTags: effectiveContextTags,
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
    mergedAgents,
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
    handleSenderChange,
    handleRollbackTo,
    handlePromptClick,
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
