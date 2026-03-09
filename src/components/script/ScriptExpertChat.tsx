/**
 * 剧本专家 AI Chat（参考 Aisting SidePanel 布局）
 * 布局：第一行置顶（Conversations+新建），第二行内容区，第三四行置底（剧本对象+Sender）
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Space, Tag, Divider, Flex } from 'antd';
import { PlusOutlined, LinkOutlined, RollbackOutlined } from '@ant-design/icons';
import { Bubble, Sender, Attachments, Prompts } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { useXChat, OpenAIChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModelConfig } from '@/types/settings';
import type { ScriptChatContext } from '@/types/scriptChat';
import { formatScriptContextForAI } from '@/types/scriptChat';
import { SCRIPT_PROMPTS } from './ScriptExpertPrompts';
import '@ant-design/x-markdown/themes/dark.css';

function buildScriptExpertProvider(modelConfig: AIModelConfig | null) {
  const baseURL = (modelConfig?.apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  return new OpenAIChatProvider({
    request: XRequest(baseURL, {
      manual: true,
      params: {
        stream: true,
        model: modelConfig?.model?.trim() || 'gpt-3.5-turbo',
      },
      headers: modelConfig?.apiKey ? { Authorization: `Bearer ${modelConfig.apiKey}` } : undefined,
    }),
  });
}

const SCRIPT_EXPERT_BASE_PROMPT = `你是漫剧剧本专家，帮助用户撰写或修改剧情概要、剧本文本。根据用户当前提供的概要或剧本文本进行扩写、缩写、润色或改写。回复时直接给出可写回概要或剧本的纯文本内容，不要额外说明。`;

export interface ScriptExpertChatProps {
  scriptModel: AIModelConfig | null;
  projectScriptPrompt?: string | null;
  currentSummary?: string;
  currentScript?: string;
  scriptChatContexts?: ScriptChatContext[];
  onRemoveContext?: (id: string) => void;
  onWriteBackSummary: (content: string) => void;
  onWriteBackScript: (content: string) => void;
}

const CONV_STORAGE_KEY = 'yiman:scriptExpert:conversations';

interface ConversationItem {
  key: string;
  label: string;
  messages: Array<{ role: string; content: string }>;
}

function loadConversations(): ConversationItem[] {
  try {
    const raw = localStorage.getItem(CONV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(items: ConversationItem[]) {
  try {
    localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    /* ignore */
  }
}

export function ScriptExpertChat({
  scriptModel,
  projectScriptPrompt,
  currentSummary,
  currentScript,
  scriptChatContexts = [],
  onRemoveContext,
  onWriteBackSummary,
  onWriteBackScript,
}: ScriptExpertChatProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>(loadConversations);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [convCounter, setConvCounter] = useState(() => loadConversations().length);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const senderRef = useRef<any>(null);

  const provider = React.useMemo(() => buildScriptExpertProvider(scriptModel), [scriptModel]);

  const { onRequest, messages, isRequesting, setMessages } = useXChat({
    provider,
    conversationKey: 'script-expert',
    requestPlaceholder: () => ({ content: '思考中…', role: 'assistant' }),
    requestFallback: (_, { errorInfo }) => ({
      content: errorInfo?.error?.message || '请求失败',
      role: 'assistant',
    }),
  });

  const systemPrompt =
    SCRIPT_EXPERT_BASE_PROMPT +
    (projectScriptPrompt?.trim() ? `\n\n【本项目自定义要求】\n${projectScriptPrompt.trim()}` : '');

  const hasMessages = (messages ?? []).filter((m) => m.message?.role !== 'system').length > 0;

  // 消息变化时持久化到当前对话
  useEffect(() => {
    if (!activeKey || !messages?.length) return;
    const simplified = messages
      .filter((m) => m.message?.role && m.message.role !== 'system')
      .filter((m) => m.status !== 'loading' && m.status !== 'error')
      .map((m) => ({ role: m.message!.role!, content: String(m.message?.content ?? '') }));
    setConversations((prev) =>
      prev.map((c) =>
        c.key === activeKey ? { ...c, messages: simplified } : c
      )
    );
  }, [activeKey, messages]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const handleNewConversation = useCallback(() => {
    const key = `conv_${Date.now()}`;
    const item: ConversationItem = { key, label: `对话 ${convCounter + 1}`, messages: [] };
    setConversations((prev) => [...prev, item]);
    setConvCounter((c) => c + 1);
    setActiveKey(key);
    setMessages([]);
  }, [convCounter, setMessages]);

  const handleConversationChange = useCallback(
    (key: string) => {
      const conv = conversations.find((c) => c.key === key);
      // 切换前将当前消息保存到旧对话
      if (activeKey && messages?.length) {
        const simplified = messages
          .filter((m) => m.message?.role && m.message.role !== 'system')
          .filter((m) => m.status !== 'loading' && m.status !== 'error')
          .map((m) => ({ role: m.message!.role!, content: String(m.message?.content ?? '') }));
        setConversations((prev) =>
          prev.map((c) =>
            c.key === activeKey ? { ...c, messages: simplified } : c
          )
        );
      }
      setActiveKey(key);
      if (conv?.messages?.length) {
        setMessages(
          conv.messages.map((m, i) => ({
            id: `msg_${i}`,
            message: { role: m.role as 'user' | 'assistant', content: m.content },
            status: 'local' as const,
          }))
        );
      } else {
        setMessages([]);
      }
    },
    [activeKey, conversations, messages, setMessages]
  );

  const handleSubmit = useCallback(
    (userText: string) => {
      const contextBlock = formatScriptContextForAI(scriptChatContexts);
      const ctx: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];
      if (currentSummary) ctx.push({ role: 'user', content: `【当前概要】\n${currentSummary}` });
      if (currentScript) ctx.push({ role: 'user', content: `【当前剧本】\n${currentScript}` });
      if (contextBlock) ctx.push({ role: 'user', content: contextBlock });
      const history = (messages ?? [])
        .filter((m) => m.message?.role && m.message.role !== 'system')
        .filter((m) => m.status !== 'loading' && m.status !== 'error')
        .map((m) => ({ role: m.message!.role, content: String(m.message?.content ?? '') }));
      ctx.push(...history, { role: 'user', content: userText });
      onRequest({ messages: ctx });
    },
    [systemPrompt, currentSummary, currentScript, scriptChatContexts, messages, onRequest]
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
    (item: (typeof SCRIPT_PROMPTS)[0]) => {
      handleSubmit(item.message);
    },
    [handleSubmit]
  );

  const lastAssistantContent = messages?.filter((m) => m.message?.role === 'assistant').pop()?.message?.content;
  const lastContent = typeof lastAssistantContent === 'string' ? lastAssistantContent : '';

  const bubbleItems = (messages ?? []).map((m, i) => ({
    key: m.id,
    role: (m.message?.role === 'system' ? 'system' : m.message?.role) || 'assistant',
    content: typeof m.message?.content === 'string' ? m.message.content : '',
    status: m.status,
    loading: m.status === 'loading',
    extraInfo: { index: i },
  }));

  const convItems = conversations.map((c) => ({ key: c.key, label: c.label }));

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

  return (
    <div
      style={{
        height: '100%',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 第一行：Conversations + 新建，置顶 */}
      <div style={{ flexShrink: 0, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Flex align="center" gap={8} wrap="wrap">
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleNewConversation}>
            新建对话
          </Button>
          {convItems.map((c) => (
            <Button
              key={c.key}
              type="text"
              size="small"
              onClick={() => handleConversationChange(c.key)}
              style={{ fontWeight: activeKey === c.key ? 600 : 400 }}
            >
              {c.label}
            </Button>
          ))}
        </Flex>
      </div>

      {/* 第二行：未对话时 Prompts / 对话时 Bubble.List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {!hasMessages ? (
          <Prompts
            vertical
            title="常用提示词："
            items={SCRIPT_PROMPTS.map((p) => ({ key: p.key, description: p.label }))}
            onItemClick={(info) => {
              const key = (info?.data as { key?: string })?.key;
              const item = SCRIPT_PROMPTS.find((x) => x.key === key);
              if (item) handlePromptClick(item);
            }}
            styles={{
              title: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
              item: { display: 'inline-block', margin: '4px 8px 4px 0' },
            }}
          />
        ) : (
          <Bubble.List
            items={bubbleItems}
            role={{
              assistant: {
                placement: 'start',
                variant: 'borderless',
                contentRender: (content: string) => <XMarkdown>{content}</XMarkdown>,
              },
              user: {
                placement: 'end',
                variant: 'borderless',
                header: (_content, info) => {
                  const idx = (info?.extraInfo as { index?: number })?.index;
                  if (idx == null || !userTurnIndices.includes(idx)) return null;
                  return (
                    <Button
                      type="text"
                      size="small"
                      icon={<RollbackOutlined />}
                      title="撤回到此步"
                      onClick={() => handleRollbackTo(idx)}
                      style={{ fontSize: 11, marginRight: 4 }}
                    />
                  );
                },
              },
              system: { placement: 'start', variant: 'borderless' },
            }}
            autoScroll
            style={{ height: '100%' }}
          />
        )}
      </div>

      {/* 第三行：选定的剧本对象，置底 */}
      {scriptChatContexts.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            maxHeight: 80,
            overflow: 'auto',
          }}
        >
          <Space wrap size={[4, 4]}>
            {scriptChatContexts.map((ctx) => (
              <Tag
                key={ctx.id}
                closable={!!onRemoveContext}
                onClose={() => onRemoveContext?.(ctx.id)}
                style={{ fontSize: 11 }}
              >
                {ctx.description}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* 第四行：Sender，置底 */}
      <div style={{ flexShrink: 0, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Sender
          ref={senderRef}
          header={senderHeader}
          loading={isRequesting}
          placeholder="输入指令，如：根据当前概要扩写剧本。Shift+Enter 换行，Enter 发送"
          onSubmit={(msg) => handleSubmit(msg)}
          disabled={!scriptModel}
          autoSize={{ minRows: 2, maxRows: 6 }}
          footer={(oriNode, info) => {
            const comps = info?.components;
            const SendButton = comps?.SendButton;
            const LoadingButton = comps?.LoadingButton;
            return (
              <Flex justify="space-between" align="center">
                <Button
                  type="text"
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                />
                {SendButton && LoadingButton ? (
                  isRequesting ? <LoadingButton type="default" /> : <SendButton type="primary" />
                ) : (
                  <Button
                    type="primary"
                    disabled={!scriptModel}
                    loading={isRequesting}
                    onClick={() => {
                      const v = senderRef.current?.getValue?.();
                      const text = (v && typeof v === 'object' && 'value' in v ? v.value : '')?.trim?.();
                      if (text) handleSubmit(text);
                    }}
                  >
                    发送
                  </Button>
                )}
              </Flex>
            );
          }}
          onCancel={() => {}}
          suffix={false}
        />
      </div>

      {/* 写回按钮 */}
      {lastContent && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <Space>
            <Button size="small" onClick={() => onWriteBackSummary(lastContent)}>
              写回概要
            </Button>
            <Button size="small" onClick={() => onWriteBackScript(lastContent)}>
              写回剧本
            </Button>
          </Space>
        </>
      )}
    </div>
  );
}
