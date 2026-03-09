/**
 * 剧情大纲页：集列表、概要/剧本编辑、漫剧剧本专家 Chat（见功能文档 4.1、开发计划 2.5）
 * 剧本结构见 docs/短漫剧剧本元素说明.md 15，src/types/script.ts
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Tag,
} from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { IconButton } from '@/components/antd-plus/IconButton';
import type { AIModelConfig } from '@/types/settings';
import type { EpisodeRow } from '@/types/project';
import type { ProjectInfo } from '@/hooks/useProject';
import type { ScriptScene, DramaTag } from '@/types/script';
import { getSceneItems } from '@/types/script';
import type { ScriptChatContext } from '@/types/scriptChat';
import { getItemDescription } from '@/types/scriptChat';
import { SceneEditor } from '@/components/script/SceneEditor';
import { ScriptExpertChat } from '@/components/script/ScriptExpertChat';
import { useConfigSubscribe, useConfigContext } from '@/contexts/ConfigContext';
import '@ant-design/x-markdown/themes/dark.css';

const { TextArea } = Input;
const { Text } = Typography;

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
    items: [],
    dramaTags: [],
  };
}

/** 加载时迁移旧格式 dialogues/narrations/actions 到 items */
function ensureSceneItems(scenes: ScriptScene[], epIndex: number): ScriptScene[] {
  return scenes.map((s, si) => {
    const items = getSceneItems(s, epIndex, si);
    if (items.length > 0 && (!s.items || s.items.length === 0)) {
      return { ...s, items };
    }
    return s;
  });
}

export default function OutlineTab({ project, onEpisodesChange }: OutlineTabProps) {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const { refreshConfig } = useConfigContext();
  // 进入剧本页时刷新配置，确保识别到最新添加的模型（见功能文档 4.1）
  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);
  // 优先选用已配置 apiUrl+apiKey 的「生成剧本」模型（多个时取第一个可用的）
  const scriptModel =
    config?.models?.find(
      (m) =>
        m.capabilityKeys?.includes('script') &&
        (m.apiUrl?.trim()?.length ?? 0) > 0 &&
        (m.apiKey?.trim()?.length ?? 0) > 0
    ) ?? config?.models?.find((m) => m.capabilityKeys?.includes('script')) ?? null;

  // 调试：剧本专家模型识别（开发时可在 Console 查看）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mask = (s: string | undefined) => (s ? `${s.slice(0, 4)}***${s.slice(-2)}` : '(空)');
    console.log('[剧本专家] config:', config ? `有 ${config.models?.length ?? 0} 个模型` : 'null');
    console.log('[剧本专家] scriptModel:', scriptModel
      ? {
          id: scriptModel.id,
          name: scriptModel.name,
          model: scriptModel.model,
          apiUrl: scriptModel.apiUrl || '(空)',
          apiUrlLength: scriptModel.apiUrl?.length ?? 0,
          apiKeyMasked: mask(scriptModel.apiKey),
          apiKeyLength: scriptModel.apiKey?.length ?? 0,
          capabilityKeys: scriptModel.capabilityKeys,
        }
      : '未找到');
    console.log('[剧本专家] 判定:', scriptModel
      ? (!scriptModel.apiUrl?.trim() || !scriptModel.apiKey?.trim()
          ? 'apiUrl/apiKey 为空或仅空格'
          : 'OK，应显示 Chat')
      : '无具备生成剧本能力的模型');
  }, [config, scriptModel]);

  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistEpisodeRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [form] = Form.useForm();
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [projectScriptPrompt, setProjectScriptPrompt] = useState<string | null>(null);
  const [structuredData, setStructuredData] = useState<EpisodeStructuredData | null>(null);
  const [epSummaryFocused, setEpSummaryFocused] = useState(false);
  const [sceneSummaryFocused, setSceneSummaryFocused] = useState(false);
  const [scriptChatContexts, setScriptChatContexts] = useState<ScriptChatContext[]>([]);
  const projectDir = project.project_dir;

  const addScriptContext = useCallback((ctx: ScriptChatContext) => {
    setScriptChatContexts((prev) => {
      if (prev.some((c) => c.id === ctx.id)) return prev;
      return [...prev, ctx];
    });
  }, []);

  const removeScriptContext = useCallback((id: string) => {
    setScriptChatContexts((prev) => prev.filter((c) => c.id !== id));
  }, []);

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
    if (!selectedEpisode) return;
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
    const parsed = parseScriptStructured(selectedEpisode.script_structured);
    const scriptScenes = parsed?.scenes ?? [];
    const epIdx = episodes.findIndex((e) => e.id === selectedEpisode.id);
    (async () => {
      type DbScene = { id: string; name?: string; sort_order: number };
      const dbScenes = ((await (window.yiman?.project as { getScenes?: (dir: string, epId?: string) => Promise<DbScene[]> })?.getScenes?.(projectDir, selectedEpisode.id)) ?? []) as DbScene[];
      const scriptIds = new Set(scriptScenes.map((s) => s.id));
      const missingFromScript = dbScenes.filter((s: DbScene) => !scriptIds.has(s.id)).sort((a: DbScene, b: DbScene) => a.sort_order - b.sort_order);
      const merged: ScriptScene[] = [
        ...missingFromScript.map((s: DbScene, i: number) => ({
          id: s.id,
          path: `episode.${epIdx + 1}.scene.${i + 1}`,
          title: s.name || `场景 ${s.sort_order + 1}`,
          items: [],
          dramaTags: [],
        })),
        ...scriptScenes,
      ].map((s, i) => ({ ...s, path: `episode.${epIdx + 1}.scene.${i + 1}` }));
      const migrated = ensureSceneItems(merged, Math.max(0, epIdx));
      setStructuredData({ scenes: migrated });
      setSelectedSceneIndex(0);
    })();
  }, [selectedEpisode, episodes, form, projectDir]);

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

  const persistEpisode = useCallback(async () => {
    if (!selectedId) return;
    try {
      const values = await form.validateFields().catch(() => form.getFieldsValue());
      const characterRefs = Array.isArray(values.character_refs) ? JSON.stringify(values.character_refs) : '[]';
      const scenesToSave =
        structuredData?.scenes?.map((s) => {
          const items = getSceneItems(s, epIndex, structuredData.scenes.indexOf(s));
          if (items.length > 0) {
            const { dialogues, narrations, actions, ...rest } = s;
            return { ...rest, items };
          }
          return s;
        }) ?? [];
      const scriptStructured = scenesToSave.length > 0 ? JSON.stringify({ scenes: scenesToSave }) : null;
      const res = await window.yiman?.project?.updateEpisode(projectDir, selectedId, {
        title: values.title,
        summary: values.summary,
        script_text: values.script_text,
        character_refs: characterRefs,
        script_structured: scriptStructured,
      });
      if (res?.ok) {
        setEpisodes((prev) =>
          prev.map((ep) =>
            ep.id === selectedId
              ? {
                  ...ep,
                  title: values.title,
                  summary: values.summary,
                  script_text: values.script_text,
                  character_refs: characterRefs,
                  script_structured: scriptStructured,
                }
              : ep
          )
        );
        // 同步 scenes 表，确保设计器与剧本一致（见功能文档 4.1）
        type DbScene = { id: string };
        const api = window.yiman?.project as { getScenes?: (dir: string, epId?: string) => Promise<DbScene[]>; updateScene?: (dir: string, id: string, data: { name?: string; sort_order?: number }) => Promise<{ ok: boolean }>; createScene?: (dir: string, data: { id: string; episode_id: string; name?: string; sort_order?: number }) => Promise<{ ok: boolean }> };
        const dbScenes = (await api?.getScenes?.(projectDir, selectedId)) ?? [];
        const dbIds = new Set(dbScenes.map((s: DbScene) => s.id));
        for (let i = 0; i < scenesToSave.length; i++) {
          const s = scenesToSave[i];
          const name = s.title || `场景 ${i + 1}`;
          if (dbIds.has(s.id)) {
            await api?.updateScene?.(projectDir, s.id, { name, sort_order: i });
          } else {
            await api?.createScene?.(projectDir, {
              id: s.id,
              episode_id: selectedId,
              name,
              sort_order: i,
            });
          }
        }
      } else {
        message.error(res?.error || '保存失败');
      }
    } catch {
      // ignore validation errors
    }
  }, [selectedId, projectDir, form, structuredData, epIndex, message]);

  persistEpisodeRef.current = persistEpisode;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistEpisodeRef.current();
    }, 400);
  }, []);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleWriteBackSummary = (content: string) => {
    form.setFieldValue('summary', content);
    scheduleSave();
    message.success('已填入概要');
  };

  const handleWriteBackScript = (content: string) => {
    form.setFieldValue('script_text', content);
    scheduleSave();
    message.success('已填入剧本');
  };

  const handleAddScene = () => {
    const scenes = structuredData?.scenes ?? [];
    const next = createEmptyScene(epIndex, scenes.length);
    setStructuredData({ scenes: [...scenes, next] });
    setSelectedSceneIndex(scenes.length);
    scheduleSave();
  };

  const handleRemoveScene = (sceneIdx: number) => {
    const scenes = [...(structuredData?.scenes ?? [])];
    scenes.splice(sceneIdx, 1);
    setStructuredData({
      scenes: scenes.map((s, i) => ({ ...s, path: `episode.${epIndex + 1}.scene.${i + 1}` })),
    });
    setSelectedSceneIndex((prev) => (prev >= scenes.length - 1 ? Math.max(0, prev - 1) : prev));
    scheduleSave();
  };

  const handleUpdateScene = (sceneIdx: number, patch: Partial<ScriptScene> | ((prev: ScriptScene) => ScriptScene)) => {
    const scenes = [...(structuredData?.scenes ?? [])];
    const prev = scenes[sceneIdx];
    scenes[sceneIdx] = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
    setStructuredData({ ...structuredData!, scenes });
    scheduleSave();
  };


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
            <Form
              form={form}
              layout="vertical"
              onValuesChange={() => scheduleSave()}
            >
              {selectedEpisode ? (
                <>
                  <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                    <Input placeholder="本集标题" />
                  </Form.Item>
                  <Form.Item label=" ">
                    <Button
                      type="dashed"
                      size="small"
                      icon={<MessageOutlined />}
                      onClick={() => {
                        const vals = form.getFieldsValue();
                        addScriptContext({
                          id: `ep_${selectedId}`,
                          type: 'episode',
                          description: vals.title || selectedEpisode?.title || `第 ${epIndex + 1} 集`,
                          episode: {
                            title: vals.title,
                            summary: vals.summary,
                            characterRefs: Array.isArray(vals.character_refs) ? vals.character_refs : [],
                          },
                          epIndex,
                        });
                      }}
                    >
                      添加到AI对话
                    </Button>
                  </Form.Item>
                  <Form.Item name="summary" label="概要">
                    <TextArea
                      rows={epSummaryFocused ? 5 : 1}
                      placeholder="本集剧情概要"
                      onFocus={() => setEpSummaryFocused(true)}
                      onBlur={() => setEpSummaryFocused(false)}
                    />
                  </Form.Item>

                  <Divider>场景</Divider>
                  <div style={{ marginBottom: 16 }}>
                    <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
                      {(structuredData?.scenes ?? []).map((scene, si) => (
                        <IconButton
                          key={scene.id}
                          enabled={selectedSceneIndex === si}
                          onClick={() => setSelectedSceneIndex(si)}
                          enabledStyle={{ background: 'rgba(23,119,255,0.25)' }}
                        >
                          {scene.title || `场景 ${si + 1}`}
                        </IconButton>
                      ))}
                      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddScene}>
                        添加场景
                      </Button>
                    </Space>

                    {(() => {
                      const scenes = structuredData?.scenes ?? [];
                      if (scenes.length === 0) return null;
                      const si = Math.min(selectedSceneIndex, scenes.length - 1);
                      const scene = scenes[si];
                      if (!scene) return null;
                      return (
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
                              rows={sceneSummaryFocused ? 5 : 1}
                              placeholder="场景概要"
                              value={scene.summary ?? ''}
                              onChange={(e) => handleUpdateScene(si, { summary: e.target.value || undefined })}
                              onFocus={() => setSceneSummaryFocused(true)}
                              onBlur={() => setSceneSummaryFocused(false)}
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
                            <Button
                              type="dashed"
                              size="small"
                              icon={<MessageOutlined />}
                              onClick={() =>
                                addScriptContext({
                                  id: `scene_${scene.id}`,
                                  type: 'scene',
                                  description: scene.title || `场景 ${si + 1}`,
                                  scene: {
                                    title: scene.title,
                                    summary: scene.summary,
                                    location: scene.location,
                                    timeOfDay: scene.timeOfDay,
                                    atmosphere: scene.atmosphere,
                                    dramaTags: scene.dramaTags,
                                  },
                                  epIndex,
                                  sceneIndex: si,
                                })
                              }
                            >
                              添加到AI对话
                            </Button>
                          </Space>

                          <SceneEditor
                            scene={scene}
                            sceneIndex={si}
                            epIndex={epIndex}
                            characters={characters}
                            onUpdate={(patch) => handleUpdateScene(si, patch)}
                            onAddItemToContext={(item) => {
                              addScriptContext({
                                id: `item_${item.id}`,
                                type: 'item',
                                description: getItemDescription(item),
                                item,
                                epIndex,
                                sceneIndex: si,
                              });
                            }}
                          />

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
                      );
                    })()}
                  </div>

                  <Form.Item name="script_text" label="剧本文本（纯文本，供 AI 参考）" style={{ display: 'none' }}>
                    <TextArea rows={6} placeholder="详细剧本文本或从结构化场景导出" />
                  </Form.Item>
                  <Form.Item name="character_refs" label="绑定人物" style={{ display: 'none' }}>
                    <Select
                      mode="multiple"
                      placeholder="选择本集出现的人物（供视频设计器人物 Tab 排序）"
                      allowClear
                      options={characters.map((c) => ({ label: c.name, value: c.id }))}
                      style={{ width: '100%' }}
                    />
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
            {!scriptModel ? (
              <Space orientation="vertical" size="small">
                <Text type="secondary">请在「设置」中添加具备「生成剧本」能力的模型，并勾选该能力后点击「保存」。</Text>
                <Button size="small" onClick={() => refreshConfig()}>刷新配置</Button>
              </Space>
            ) : !scriptModel.apiUrl?.trim() || !scriptModel.apiKey?.trim() ? (
              <Space orientation="vertical" size="small">
                <Text type="secondary">请完善该模型的 API 地址与密钥，点击「保存」后重试。</Text>
                <Button size="small" onClick={() => refreshConfig()}>刷新配置</Button>
              </Space>
            ) : (
              <ScriptExpertChat
                scriptModel={scriptModel}
                projectScriptPrompt={projectScriptPrompt}
                currentSummary={selectedEpisode?.summary}
                currentScript={selectedEpisode?.script_text}
                scriptChatContexts={scriptChatContexts}
                onRemoveContext={removeScriptContext}
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
