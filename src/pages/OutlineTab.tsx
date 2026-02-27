/**
 * 剧情大纲页：集列表、概要/剧本编辑、漫剧剧本专家 Chat（见功能文档 4.1、开发计划 2.5）
 * 剧本结构见 docs/短漫剧剧本元素说明.md 15，src/types/script.ts
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
  Collapse,
  Tag,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Bubble, Sender } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { useXChat, OpenAIChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModelConfig } from '@/types/settings';
import type { EpisodeRow } from '@/types/project';
import type { ProjectInfo } from '@/hooks/useProject';
import type {
  ScriptEpisode,
  ScriptScene,
  ScriptDialogue,
  ScriptNarration,
  ScriptAction,
  DramaTag,
} from '@/types/script';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import '@ant-design/x-markdown/themes/dark.css';

const { TextArea } = Input;
const { Title, Text } = Typography;

const DRAMA_TAG_OPTIONS: { value: DramaTag; label: string }[] = [
  { value: 'suspense', label: '悬念' },
  { value: 'hook', label: '钩子' },
  { value: 'conflict', label: '冲突' },
  { value: 'reversal', label: '反转' },
  { value: 'climax', label: '高潮' },
  { value: 'foreshadow', label: '伏笔' },
  { value: 'payoff', label: '回收' },
  { value: 'tension', label: '紧张' },
  { value: 'relief', label: '舒缓' },
  { value: 'comedy', label: '喜剧点' },
  { value: 'tearjerker', label: '催泪点' },
];

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

interface OutlineTabProps {
  project: ProjectInfo;
  onEpisodesChange?: () => void;
}

interface CharacterOption {
  id: string;
  name: string;
}

interface EpisodeStructuredData {
  scenes: ScriptScene[];
}

function parseScriptStructured(raw: string | null | undefined): EpisodeStructuredData | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EpisodeStructuredData>;
    return {
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    };
  } catch {
    return null;
  }
}

function createEmptyScene(epIdx: number, sceneIdx: number): ScriptScene {
  const id = `scene_${epIdx}_${sceneIdx}_${Date.now()}`;
  const path = `episode.${epIdx + 1}.scene.${sceneIdx + 1}`;
  return {
    id,
    path,
    title: `场景 ${sceneIdx + 1}`,
    dialogues: [],
    narrations: [],
    actions: [],
    dramaTags: [],
  };
}

function createEmptyDialogue(epIdx: number, sceneIdx: number, order: number): ScriptDialogue {
  return {
    id: `dlg_${Date.now()}_${order}`,
    path: `episode.${epIdx + 1}.scene.${sceneIdx + 1}.dialogue.${order}`,
    speaker: '',
    text: '',
    order,
  };
}

function createEmptyNarration(epIdx: number, sceneIdx: number, order: number): ScriptNarration {
  return {
    id: `nar_${Date.now()}_${order}`,
    path: `episode.${epIdx + 1}.scene.${sceneIdx + 1}.narration.${order}`,
    narratorType: '全知',
    text: '',
    order,
  };
}

function createEmptyAction(epIdx: number, sceneIdx: number, order: number): ScriptAction {
  return {
    id: `act_${Date.now()}_${order}`,
    path: `episode.${epIdx + 1}.scene.${sceneIdx + 1}.action.${order}`,
    description: '',
    order,
  };
}

export default function OutlineTab({ project, onEpisodesChange }: OutlineTabProps) {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const scriptModel = config?.models?.find((m) => m.capabilityKeys?.includes('script')) ?? null;
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [projectScriptPrompt, setProjectScriptPrompt] = useState<string | null>(null);
  const [structuredData, setStructuredData] = useState<EpisodeStructuredData | null>(null);
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
        setCharacters(
          list
            .filter((c) => c.id !== '__standalone_sprites__')
            .map((c) => ({ id: c.id, name: c.name }))
        );
      })
      .catch(() => setCharacters([]));
  }, [projectDir]);

  useEffect(() => {
    if (!window.yiman?.project?.getAiConfig) return;
    window.yiman.project.getAiConfig(projectDir).then((row: { script_expert_prompt: string | null } | null) => {
      setProjectScriptPrompt(row?.script_expert_prompt ?? null);
    });
  }, [projectDir]);

  const selectedEpisode = episodes.find((e) => e.id === selectedId);
  const epIndex = selectedEpisode ? episodes.findIndex((e) => e.id === selectedId) : 0;

  useEffect(() => {
    if (selectedEpisode) {
      let characterRefs: string[] = [];
      try {
        characterRefs = JSON.parse(selectedEpisode.character_refs ?? '[]');
      } catch {
        characterRefs = [];
      }
      const parsed = parseScriptStructured(selectedEpisode.script_structured);
      setStructuredData(parsed ?? { scenes: [] });
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
    const scriptStructured =
      structuredData && structuredData.scenes.length > 0
        ? JSON.stringify({ scenes: structuredData.scenes })
        : null;
    const res = await window.yiman?.project?.updateEpisode(projectDir, selectedId, {
      title: values.title,
      summary: values.summary,
      script_text: values.script_text,
      character_refs: characterRefs,
      script_structured: scriptStructured,
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

  const handleAddScene = () => {
    const scenes = structuredData?.scenes ?? [];
    const next = createEmptyScene(epIndex, scenes.length);
    setStructuredData({
      scenes: [...scenes, next],
    });
  };

  const handleRemoveScene = (sceneIdx: number) => {
    const scenes = [...(structuredData?.scenes ?? [])];
    scenes.splice(sceneIdx, 1);
    setStructuredData({
      scenes: scenes.map((s, i) => ({ ...s, path: `episode.${epIndex + 1}.scene.${i + 1}` })),
    });
  };

  const handleUpdateScene = (sceneIdx: number, patch: Partial<ScriptScene>) => {
    const scenes = [...(structuredData?.scenes ?? [])];
    scenes[sceneIdx] = { ...scenes[sceneIdx], ...patch };
    setStructuredData({ ...structuredData!, scenes });
  };

  const handleAddDialogue = (sceneIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const dialogues = [...scene.dialogues];
    const next = createEmptyDialogue(epIndex, sceneIdx, dialogues.length + 1);
    dialogues.forEach((d, i) => (d.order = i + 1));
    dialogues.push(next);
    handleUpdateScene(sceneIdx, { dialogues });
  };

  const handleRemoveDialogue = (sceneIdx: number, dlgIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const dialogues = scene.dialogues.filter((_, i) => i !== dlgIdx);
    dialogues.forEach((d, i) => (d.order = i + 1));
    handleUpdateScene(sceneIdx, { dialogues });
  };

  const handleUpdateDialogue = (sceneIdx: number, dlgIdx: number, patch: Partial<ScriptDialogue>) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const dialogues = [...scene.dialogues];
    dialogues[dlgIdx] = { ...dialogues[dlgIdx], ...patch };
    handleUpdateScene(sceneIdx, { dialogues });
  };

  const handleAddNarration = (sceneIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const narrations = [...scene.narrations];
    const next = createEmptyNarration(epIndex, sceneIdx, narrations.length + 1);
    narrations.forEach((n, i) => (n.order = i + 1));
    narrations.push(next);
    handleUpdateScene(sceneIdx, { narrations });
  };

  const handleRemoveNarration = (sceneIdx: number, narIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const narrations = scene.narrations.filter((_, i) => i !== narIdx);
    narrations.forEach((n, i) => (n.order = i + 1));
    handleUpdateScene(sceneIdx, { narrations });
  };

  const handleUpdateNarration = (sceneIdx: number, narIdx: number, patch: Partial<ScriptNarration>) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const narrations = [...scene.narrations];
    narrations[narIdx] = { ...narrations[narIdx], ...patch };
    handleUpdateScene(sceneIdx, { narrations });
  };

  const handleAddAction = (sceneIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const actions = [...scene.actions];
    const next = createEmptyAction(epIndex, sceneIdx, actions.length + 1);
    actions.forEach((a, i) => (a.order = i + 1));
    actions.push(next);
    handleUpdateScene(sceneIdx, { actions });
  };

  const handleRemoveAction = (sceneIdx: number, actIdx: number) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const actions = scene.actions.filter((_, i) => i !== actIdx);
    actions.forEach((a, i) => (a.order = i + 1));
    handleUpdateScene(sceneIdx, { actions });
  };

  const handleUpdateAction = (sceneIdx: number, actIdx: number, patch: Partial<ScriptAction>) => {
    const scene = structuredData?.scenes[sceneIdx];
    if (!scene) return;
    const actions = [...scene.actions];
    actions[actIdx] = { ...actions[actIdx], ...patch };
    handleUpdateScene(sceneIdx, { actions });
  };

  const provider = React.useMemo(() => buildScriptExpertProvider(scriptModel), [scriptModel]);

  return (
    <div style={{ height: '100%', minHeight: 200 }}>
      <Splitter style={{ height: '100%' }} orientation="horizontal">
        <Splitter.Panel defaultSize={200} min={120} max={360}>
          <Card
            size="small"
            styles={{ root: { borderColor: 'transparent', boxShadow: 'none', borderRadius: 0 } }}
            title="集列表"
            style={{ height: '100%', overflow: 'auto' }}
          >
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

        <Splitter.Panel min={280}>
          <Card
            size="small"
            styles={{ root: { borderColor: 'transparent', boxShadow: 'none', borderRadius: 0 } }}
            title={selectedEpisode ? selectedEpisode.title : '选择或添加一集'}
            style={{ height: '100%', overflow: 'auto' }}
          >
            <Form form={form} layout="vertical" onFinish={() => { setSaving(true); handleSaveEpisode(); }}>
              {selectedEpisode ? (
                <>
                  <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                    <Input placeholder="本集标题" />
                  </Form.Item>
                  <Form.Item name="summary" label="概要">
                    <TextArea rows={3} placeholder="本集剧情概要" />
                  </Form.Item>

                  <Divider>场景（对白 / 旁白 / 动作 结构化，戏剧效果标签绑定场景）</Divider>
                  <div style={{ marginBottom: 16 }}>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddScene} style={{ marginBottom: 8 }}>
                      添加场景
                    </Button>
                    {(structuredData?.scenes ?? []).map((scene, si) => (
                      <Collapse
                        key={scene.id}
                        size="small"
                        style={{ marginBottom: 8 }}
                        items={[
                          {
                            key: scene.id,
                            label: (
                              <span>
                                {scene.title || `场景 ${si + 1}`}
                                {scene.dramaTags?.length ? (
                                  <Space size={[0, 4]} style={{ marginLeft: 8 }}>
                                    {scene.dramaTags.map((t) => (
                                      <Tag key={t}>{t}</Tag>
                                    ))}
                                  </Space>
                                ) : null}
                              </span>
                            ),
                            children: (
                              <div style={{ padding: '8px 0' }}>
                                <Space orientation="vertical" style={{ width: '100%' }} size="small">
                                  <Input
                                    placeholder="场景标题"
                                    value={scene.title}
                                    onChange={(e) => handleUpdateScene(si, { title: e.target.value })}
                                    addonBefore="标题"
                                  />
                                  <Input
                                    placeholder="地点"
                                    value={scene.location ?? ''}
                                    onChange={(e) => handleUpdateScene(si, { location: e.target.value || undefined })}
                                    addonBefore="地点"
                                  />
                                  <TextArea
                                    rows={2}
                                    placeholder="场景概要"
                                    value={scene.summary ?? ''}
                                    onChange={(e) => handleUpdateScene(si, { summary: e.target.value || undefined })}
                                  />
                                  <Select<DramaTag[]>
                                    mode="multiple"
                                    placeholder="场景戏剧标签"
                                    allowClear
                                    value={scene.dramaTags}
                                    onChange={(tags) => handleUpdateScene(si, { dramaTags: tags })}
                                    options={DRAMA_TAG_OPTIONS}
                                    style={{ width: '100%' }}
                                  />
                                </Space>

                                <Divider orientation="left" style={{ margin: '12px 0 8px' }}>
                                  对白
                                </Divider>
                                {scene.dialogues.map((d, di) => (
                                  <div key={d.id} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <Select
                                      placeholder="说话人"
                                      value={d.speaker || undefined}
                                      onChange={(v) => handleUpdateDialogue(si, di, { speaker: v })}
                                      options={characters.map((c) => ({ label: c.name, value: c.id }))}
                                      style={{ width: 100 }}
                                      allowClear
                                    />
                                    <Input
                                      placeholder="台词"
                                      value={d.text}
                                      onChange={(e) => handleUpdateDialogue(si, di, { text: e.target.value })}
                                      style={{ flex: 1 }}
                                    />
                                    <Input
                                      placeholder="情绪"
                                      value={d.emotion ?? ''}
                                      onChange={(e) => handleUpdateDialogue(si, di, { emotion: e.target.value || undefined })}
                                      style={{ width: 80 }}
                                    />
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveDialogue(si, di)} />
                                  </div>
                                ))}
                                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAddDialogue(si)}>
                                  添加对白
                                </Button>

                                <Divider orientation="left" style={{ margin: '12px 0 8px' }}>
                                  旁白
                                </Divider>
                                {scene.narrations.map((n, ni) => (
                                  <div key={n.id} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <Select
                                      placeholder="叙述者"
                                      value={n.narratorType}
                                      onChange={(v) => handleUpdateNarration(si, ni, { narratorType: v as ScriptNarration['narratorType'] })}
                                      options={[
                                        { label: '全知', value: '全知' },
                                        { label: '第一人称主角', value: '第一人称主角' },
                                        { label: '第一人称配角', value: '第一人称配角' },
                                      ]}
                                      style={{ width: 140 }}
                                    />
                                    <Input
                                      placeholder="旁白内容"
                                      value={n.text}
                                      onChange={(e) => handleUpdateNarration(si, ni, { text: e.target.value })}
                                      style={{ flex: 1 }}
                                    />
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveNarration(si, ni)} />
                                  </div>
                                ))}
                                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAddNarration(si)}>
                                  添加旁白
                                </Button>

                                <Divider orientation="left" style={{ margin: '12px 0 8px' }}>
                                  动作
                                </Divider>
                                {scene.actions.map((a, ai) => (
                                  <div key={a.id} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <Input
                                      placeholder="动作/舞台说明"
                                      value={a.description}
                                      onChange={(e) => handleUpdateAction(si, ai, { description: e.target.value })}
                                      style={{ flex: 1 }}
                                    />
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveAction(si, ai)} />
                                  </div>
                                ))}
                                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAddAction(si)}>
                                  添加动作
                                </Button>

                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  block
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleRemoveScene(si)}
                                  style={{ marginTop: 12 }}
                                >
                                  删除场景
                                </Button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    ))}
                  </div>

                  <Form.Item name="script_text" label="剧本文本（纯文本，供 AI 参考）">
                    <TextArea rows={6} placeholder="详细剧本文本或从结构化场景导出" />
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

        <Splitter.Panel defaultSize={320} min={240} max={480}>
          <Card size="small" title="漫剧剧本专家" style={{ height: '100%', overflow: 'auto' }}>
            {!scriptModel?.apiUrl || !scriptModel?.apiKey ? (
              <Text type="secondary">请在「设置」中添加具备「生成剧本」能力的模型（API 地址与密钥）后使用剧本专家。</Text>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
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
