/**
 * 剧情大纲页：集列表、概要/剧本编辑、漫剧剧本专家 Chat（见功能文档 4.1、开发计划 2.5）
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Form,
  Space,
  Typography,
  App,
  Select,
  Divider,
  Card,
  Spin,
  Splitter,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Bubble, Sender } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { useXChat, OpenAIChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModalityConfig } from '@/types/settings';
import type { EpisodeRow } from '@/types/project';
import type { ProjectInfo } from '@/hooks/useProject';
import '@ant-design/x-markdown/themes/dark.css';

const { TextArea } = Input;
const { Title, Text } = Typography;

function buildScriptExpertProvider(textConfig: AIModalityConfig | null) {
  const baseURL = (textConfig?.apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  return new OpenAIChatProvider({
    request: XRequest(baseURL, {
      manual: true,
      params: {
        stream: true,
        model: textConfig?.model?.trim() || 'gpt-3.5-turbo',
      },
      headers: textConfig?.apiKey ? { Authorization: `Bearer ${textConfig.apiKey}` } : undefined,
    }),
  });
}

interface OutlineTabProps {
  project: ProjectInfo;
  onEpisodesChange?: () => void;
}

interface CharacterOption {
  id: string;
  name: string;
}

export default function OutlineTab({ project, onEpisodesChange }: OutlineTabProps) {
  const { message } = App.useApp();
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [textConfig, setTextConfig] = useState<AIModalityConfig | null>(null);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [projectScriptPrompt, setProjectScriptPrompt] = useState<string | null>(null);
  const projectDir = project.project_dir;

  const loadEpisodes = useCallback(async () => {
    if (!window.yiman?.project?.getEpisodes) return;
    setLoading(true);
    try {
      const list = await window.yiman.project.getEpisodes(projectDir);
      setEpisodes(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      if (selectedId && !list.some((e) => e.id === selectedId)) setSelectedId(list[0]?.id ?? null);
    } catch (e) {
      message.error('加载集列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, selectedId, message]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  useEffect(() => {
    if (!window.yiman?.project?.getCharacters) return;
    window.yiman.project
      .getCharacters(projectDir)
      .then((list: { id: string; name: string }[]) => {
        setCharacters(list.map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setCharacters([]));
  }, [projectDir]);

  useEffect(() => {
    window.yiman?.settings?.get().then((s) => setTextConfig(s.text));
  }, []);

  useEffect(() => {
    if (!window.yiman?.project?.getAiConfig) return;
    window.yiman.project.getAiConfig(projectDir).then((row: { script_expert_prompt: string | null } | null) => {
      setProjectScriptPrompt(row?.script_expert_prompt ?? null);
    });
  }, [projectDir]);

  const selectedEpisode = episodes.find((e) => e.id === selectedId);
  useEffect(() => {
    if (selectedEpisode) {
      let characterRefs: string[] = [];
      try {
        characterRefs = JSON.parse(selectedEpisode.character_refs ?? '[]');
      } catch {
        characterRefs = [];
      }
      form.setFieldsValue({
        title: selectedEpisode.title,
        summary: selectedEpisode.summary,
        script_text: selectedEpisode.script_text,
        character_refs: characterRefs,
      });
    }
  }, [selectedEpisode, form]);

  const handleAddEpisode = async () => {
    const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await window.yiman?.project?.createEpisode(projectDir, {
      id,
      title: `第 ${episodes.length + 1} 集`,
      sort_order: episodes.length,
    });
    if (res?.ok) {
      message.success('已添加一集');
      loadEpisodes();
      setSelectedId(id);
      onEpisodesChange?.();
    } else message.error(res?.error || '添加失败');
  };

  const handleDeleteEpisode = async (id: string) => {
    const res = await window.yiman?.project?.deleteEpisode(projectDir, id);
    if (res?.ok) {
      message.success('已删除');
      if (selectedId === id) setSelectedId(episodes.find((e) => e.id !== id)?.id ?? null);
      loadEpisodes();
      onEpisodesChange?.();
    } else message.error(res?.error || '删除失败');
  };

  const handleSaveEpisode = async () => {
    if (!selectedId) return;
    const values = await form.validateFields();
    const characterRefs = Array.isArray(values.character_refs) ? JSON.stringify(values.character_refs) : '[]';
    const res = await window.yiman?.project?.updateEpisode(projectDir, selectedId, {
      title: values.title,
      summary: values.summary,
      script_text: values.script_text,
      character_refs: characterRefs,
    });
    if (res?.ok) {
      message.success('已保存');
      loadEpisodes();
    } else message.error(res?.error || '保存失败');
    setSaving(false);
  };

  const handleWriteBackSummary = (content: string) => {
    form.setFieldValue('summary', content);
    message.success('已填入概要，请点击保存');
  };

  const handleWriteBackScript = (content: string) => {
    form.setFieldValue('script_text', content);
    message.success('已填入剧本，请点击保存');
  };

  const provider = React.useMemo(() => buildScriptExpertProvider(textConfig), [textConfig]);

  return (
    <div style={{ height: '100%', minHeight: 200 }}>
      <Splitter style={{ height: '100%' }} orientation="horizontal">
        {/* 左侧：集列表，默认 200px */}
        <Splitter.Panel defaultSize={200} min={120} max={360}>
          <Card size="small" 
                styles={{
                  root: {
                    borderColor: 'transparent',
                    boxShadow: 'none',
                    borderRadius: 0,
                  },
                }}
                title="集列表" style={{ height: '100%', overflow: 'auto' }}>
            <Button type="primary" block icon={<PlusOutlined />} onClick={handleAddEpisode} style={{ marginBottom: 12 }}>
              添加一集
            </Button>
            <Spin spinning={loading}>
              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                {episodes.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span
                      style={{
                        cursor: 'pointer',
                        fontWeight: selectedId === item.id ? 600 : 400,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.title || `集 ${item.sort_order + 1}`}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteEpisode(item.id)}
                    />
                  </div>
                ))}
              </Space>
            </Spin>
          </Card>
        </Splitter.Panel>

        {/* 中间：概要 + 剧本编辑 */}
        <Splitter.Panel min={280}>
          <Card size="small" 
                styles={{
                  root: {
                    borderColor: 'transparent',
                    boxShadow: 'none',
                    borderRadius: 0,
                  },
                }}
                title={selectedEpisode ? selectedEpisode.title : '选择或添加一集'} style={{ height: '100%', overflow: 'auto' }}>
            <Form form={form} layout="vertical" onFinish={() => { setSaving(true); handleSaveEpisode(); }}>
            {selectedEpisode ? (
              <>
                <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                  <Input placeholder="本集标题" />
                </Form.Item>
                <Form.Item name="summary" label="概要">
                  <TextArea rows={3} placeholder="本集剧情概要" />
                </Form.Item>
                <Form.Item name="script_text" label="剧本文本">
                  <TextArea rows={10} placeholder="详细剧本文本" />
                </Form.Item>
                <Form.Item name="character_refs" label="绑定人物">
                  <Select
                    mode="multiple"
                    placeholder="选择本集出现的人物（供视频设计器人物 Tab 排序）"
                    allowClear
                    options={characters.map((c) => ({ label: c.name, value: c.id }))}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    保存
                  </Button>
                </Form.Item>
              </>
            ) : (
              <Text type="secondary">在左侧添加一集或选择已有集进行编辑。</Text>
            )}
            </Form>
          </Card>
        </Splitter.Panel>

        {/* 右侧：漫剧剧本专家 Chat，默认 320px */}
        <Splitter.Panel defaultSize={320} min={240} max={480}>
          <Card size="small" title="漫剧剧本专家" style={{ height: '100%', overflow: 'auto' }}>
            {!textConfig?.apiUrl || !textConfig?.apiKey ? (
              <Text type="secondary">请在「设置」中配置文本 API（API 地址与密钥）后使用剧本专家。</Text>
            ) : (
              <ScriptExpertChat
                provider={provider}
                projectScriptPrompt={projectScriptPrompt}
                currentSummary={selectedEpisode?.summary}
                currentScript={selectedEpisode?.script_text}
                onWriteBackSummary={handleWriteBackSummary}
                onWriteBackScript={handleWriteBackScript}
              />
            )}
          </Card>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}

interface ScriptExpertChatProps {
  provider: OpenAIChatProvider;
  projectScriptPrompt?: string | null;
  currentSummary?: string;
  currentScript?: string;
  onWriteBackSummary: (content: string) => void;
  onWriteBackScript: (content: string) => void;
}

const SCRIPT_EXPERT_BASE_PROMPT = `你是漫剧剧本专家，帮助用户撰写或修改剧情概要、剧本文本。根据用户当前提供的概要或剧本文本进行扩写、缩写、润色或改写。回复时直接给出可写回概要或剧本的纯文本内容，不要额外说明。`;

function ScriptExpertChat({
  provider,
  projectScriptPrompt,
  currentSummary,
  currentScript,
  onWriteBackSummary,
  onWriteBackScript,
}: ScriptExpertChatProps) {
  const { onRequest, messages, isRequesting } = useXChat({
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

  const bubbleItems = (messages ?? []).map((m) => ({
    key: m.id,
    role: (m.message?.role === 'system' ? 'system' : m.message?.role) || 'assistant',
    content: typeof m.message?.content === 'string' ? m.message.content : '',
    status: m.status,
    loading: m.status === 'loading',
  }));

  const handleSubmit = (userText: string) => {
    const ctx: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];
    if (currentSummary) ctx.push({ role: 'user', content: `【当前概要】\n${currentSummary}` });
    if (currentScript) ctx.push({ role: 'user', content: `【当前剧本】\n${currentScript}` });
    ctx.push({ role: 'user', content: userText });
    onRequest({ messages: ctx });
  };

  const lastAssistantContent = messages?.filter((m) => m.message?.role === 'assistant').pop()?.message?.content;
  const lastContent = typeof lastAssistantContent === 'string' ? lastAssistantContent : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 480, backgroundColor: 'red'  }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 8 }}>
        <Bubble.List
          items={bubbleItems}
          role={{
            assistant: {
              placement: 'start',
              variant: 'borderless',
              contentRender: (content: string) => <XMarkdown theme="dark">{content}</XMarkdown>,
            },
            user: { placement: 'end', variant: 'borderless' },
            system: { placement: 'start', variant: 'borderless' },
          }}
        />
      </div>
      <Sender
        loading={isRequesting}
        placeholder="输入指令，如：根据当前概要扩写剧本"
        onSubmit={(msg) => handleSubmit(msg)}
      />
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
