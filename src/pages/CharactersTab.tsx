/**
 * 人物设计页：人物列表 CRUD、名称/形象/备注、默认 TTS 参数、角度与骨骼绑定（见功能文档 4.2、开发计划 2.6，docs/06-人物骨骼贴图功能设计.md）
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Form,
  Space,
  Typography,
  App,
  Card,
  Spin,
  Modal,
  InputNumber,
  Splitter,
} from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined, PictureOutlined, RobotOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import { parseCharacterAngles, serializeCharacterAngles } from '@/types/skeleton';
import type { CharacterAngle } from '@/types/skeleton';
import { SkeletonBindingPanel } from '@/components/character/SkeletonBindingPanel';

const { TextArea } = Input;
const { Text } = Typography;

interface CharacterRow {
  id: string;
  name: string;
  image_path: string | null;
  note: string | null;
  tts_voice: string | null;
  tts_speed: number | null;
  angles: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
}

interface CharactersTabProps {
  project: ProjectInfo;
}

export default function CharactersTab({ project }: CharactersTabProps) {
  const { message } = App.useApp();
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [skeletonPanelOpen, setSkeletonPanelOpen] = useState(false);
  const [skeletonPanelAngle, setSkeletonPanelAngle] = useState<CharacterAngle | null>(null);
  const projectDir = project.project_dir;

  const loadCharacters = useCallback(async () => {
    if (!window.yiman?.project?.getCharacters) return;
    setLoading(true);
    try {
      const list = (await window.yiman.project.getCharacters(projectDir)) as CharacterRow[];
      setCharacters(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      if (selectedId && !list.some((c) => c.id === selectedId)) setSelectedId(list[0]?.id ?? null);
    } catch {
      message.error('加载人物列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, selectedId, message]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const selected = characters.find((c) => c.id === selectedId);
  useEffect(() => {
    if (selected) {
      form.setFieldsValue({
        name: selected.name,
        note: selected.note ?? '',
        tts_voice: selected.tts_voice ?? '',
        tts_speed: selected.tts_speed ?? 1,
      });
      if (selected.image_path && window.yiman?.project?.getAssetDataUrl) {
        window.yiman.project.getAssetDataUrl(projectDir, selected.image_path).then(setImageDataUrl);
      } else {
        setImageDataUrl(null);
      }
    }
  }, [selected, form, projectDir]);

  const handleAdd = async () => {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await window.yiman?.project?.createCharacter(projectDir, { id, name: '新人物' });
    if (res?.ok) {
      message.success('已添加人物');
      loadCharacters();
      setSelectedId(id);
    } else message.error(res?.error || '添加失败');
  };

  const handleDelete = async (id: string) => {
    const res = await window.yiman?.project?.deleteCharacter(projectDir, id);
    if (res?.ok) {
      message.success('已删除');
      if (selectedId === id) setSelectedId(characters.find((c) => c.id !== id)?.id ?? null);
      loadCharacters();
    } else message.error(res?.error || '删除失败');
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const values = await form.validateFields();
      const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
        name: values.name,
        note: values.note || null,
        tts_voice: values.tts_voice || null,
        tts_speed: values.tts_speed ?? null,
      });
      if (res?.ok) {
        message.success('已保存');
        loadCharacters();
      } else message.error(res?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadImage = async () => {
    const filePath = await window.yiman?.dialog?.openFile?.();
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, 'character');
    if (!res?.ok) {
      message.error(res?.error || '上传失败');
      return;
    }
    if (!selectedId || !res.path) return;
    const up = await window.yiman.project.updateCharacter(projectDir, selectedId, { image_path: res.path });
    if (up?.ok) {
      message.success('已绑定形象');
      const dataUrl = await window.yiman.project.getAssetDataUrl?.(projectDir, res.path);
      setImageDataUrl(dataUrl ?? null);
      loadCharacters();
    } else message.error(up?.error || '绑定失败');
  };

  const openAssetPicker = () => {
    setAssetPickerOpen(true);
    window.yiman?.project?.getAssets(projectDir).then((list: AssetRow[]) => setAssets(list));
  };

  const handlePickAsset = async (path: string) => {
    if (!selectedId) return;
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, { image_path: path });
    if (res?.ok) {
      message.success('已绑定形象');
      const dataUrl = await window.yiman?.project?.getAssetDataUrl?.(projectDir, path);
      setImageDataUrl(dataUrl ?? null);
      setAssetPickerOpen(false);
      loadCharacters();
    } else message.error(res?.error || '绑定失败');
  };

  const angles = selected ? parseCharacterAngles(selected.angles ?? null) : [];

  const openSkeletonPanel = (angle: CharacterAngle) => {
    setSkeletonPanelAngle(angle);
    setSkeletonPanelOpen(true);
  };

  const handleSkeletonSave = async (updatedAngle: CharacterAngle) => {
    if (!selectedId || !skeletonPanelAngle) return;
    const nextAngles = angles.map((a) => (a.id === updatedAngle.id ? updatedAngle : a));
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      angles: serializeCharacterAngles(nextAngles),
    });
    if (res?.ok) {
      loadCharacters();
    } else {
      message.error(res?.error || '保存失败');
    }
  };

  const handleAddAngle = async () => {
    if (!selectedId) return;
    const newId = `angle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newAngle: CharacterAngle = { id: newId, name: `角度 ${angles.length + 1}` };
    const nextAngles = [...angles, newAngle];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      angles: serializeCharacterAngles(nextAngles),
    });
    if (res?.ok) {
      loadCharacters();
      setSkeletonPanelAngle(newAngle);
      setSkeletonPanelOpen(true);
    } else {
      message.error(res?.error || '添加角度失败');
    }
  };

  return (
    <div style={{ height: '100%', minHeight: 400 }}>
      <Splitter style={{ height: '100%' }} orientation="horizontal">
        {/* 左侧：人物列表，默认 240px */}
        <Splitter.Panel defaultSize={240} min={160} max={400}>
          <Card size="small" title="人物列表" style={{ height: '100%', overflow: 'auto' }}>
            <Button type="primary" block icon={<PlusOutlined />} onClick={handleAdd} style={{ marginBottom: 12 }}>
              添加人物
            </Button>
            <Spin spinning={loading}>
              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                {characters.map((item) => (
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
                      {item.name || '未命名'}
                    </span>
                    <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
                  </div>
                ))}
              </Space>
            </Spin>
          </Card>
        </Splitter.Panel>

        {/* 右侧：人物编辑 */}
        <Splitter.Panel min={320}>
          <Card size="small" title={selected ? selected.name || '选择或添加人物' : '选择或添加人物'} style={{ height: '100%', overflow: 'auto' }}>
            <Form form={form} layout="vertical" onFinish={() => { setSaving(true); handleSave(); }}>
            {selected ? (
              <>
                <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                  <Input placeholder="人物名称" />
                </Form.Item>

                <Form.Item label="形象">
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                    <div style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {imageDataUrl ? (
                        <img src={imageDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Text type="secondary">暂无形象</Text>
                      )}
                    </div>
                    <Space wrap>
                      <Button type="default" icon={<UploadOutlined />} onClick={handleUploadImage}>
                        本地上传
                      </Button>
                      <Button type="default" icon={<PictureOutlined />} onClick={openAssetPicker}>
                        从素材库选择
                      </Button>
                      <Button type="default" icon={<RobotOutlined />} disabled>
                        AI 绘画（开发中）
                      </Button>
                    </Space>
                  </Space>
                </Form.Item>

                <Form.Item label="角度与骨骼">
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {angles.map((angle) => (
                      <div
                        key={angle.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 6,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{angle.name}</span>
                        <Button
                          type="default"
                          size="small"
                          icon={<ApartmentOutlined />}
                          onClick={() => openSkeletonPanel(angle)}
                        >
                          骨骼设置
                        </Button>
                      </div>
                    ))}
                    <Button type="dashed" size="small" block onClick={handleAddAngle}>
                      添加角度
                    </Button>
                  </Space>
                </Form.Item>

                <Form.Item name="note" label="备注">
                  <TextArea rows={3} placeholder="人物设定、备注等" />
                </Form.Item>

                <Form.Item name="tts_voice" label="默认 TTS 音色">
                  <Input placeholder="如：音色 ID 或名称，供视频设计器对白默认带出" />
                </Form.Item>
                <Form.Item name="tts_speed" label="默认 TTS 语速" extra="1 为正常语速">
                  <InputNumber min={0.5} max={2} step={0.1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    保存
                  </Button>
                </Form.Item>
              </>
            ) : (
              <Text type="secondary">在左侧添加人物或选择已有角色进行编辑。</Text>
            )}
            </Form>
          </Card>
        </Splitter.Panel>
      </Splitter>

      <Modal
        title="从素材库选择形象"
        open={assetPickerOpen}
        onCancel={() => setAssetPickerOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {assets.length === 0 ? (
            <Text type="secondary">暂无素材，请先使用「本地上传」添加图片。</Text>
          ) : (
            <Space wrap size="middle">
              {assets.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: 80,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                  onClick={() => handlePickAsset(a.path)}
                >
                  <AssetThumb projectDir={projectDir} path={a.path} />
                  <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.path}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>

      {skeletonPanelAngle && (
        <SkeletonBindingPanel
          open={skeletonPanelOpen}
          onClose={() => { setSkeletonPanelOpen(false); setSkeletonPanelAngle(null); }}
          projectDir={projectDir}
          characterId={selectedId!}
          angle={skeletonPanelAngle}
          onSave={handleSkeletonSave}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
        />
      )}
    </div>
  );
}

function AssetThumb({ projectDir, path }: { projectDir: string; path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path]);
  return (
    <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {dataUrl ? <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Text type="secondary">加载中</Text>}
    </div>
  );
}
