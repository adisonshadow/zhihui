/**
 * 图片素材预览 Drawer：预览图片、修改描述与 tags、裁剪、抠图、全部预览、删除
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Input, Button, App, Space, Typography, Tag, Modal, theme } from 'antd';
import { DeleteOutlined, PlusOutlined, ScissorOutlined, BorderOutlined, EyeOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';
import { CropPanel } from '@/components/character/CropPanel';
import { MattingSettingsPanel } from '@/components/character/MattingSettingsPanel';

const { Text } = Typography;

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
  tags?: string | null;
}

function parseTags(tagsStr: string | null | undefined): string[] {
  if (!tagsStr || !tagsStr.trim()) return [];
  return tagsStr.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
}

function serializeTags(tags: string[]): string | null {
  const s = tags.filter(Boolean).join(',');
  return s || null;
}

export interface ImagePreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  /** 裁剪/抠图后调用时传入 assetId，用于更新画布上引用该素材的 block 的 scale */
  onUpdate?: (opts?: { assetId?: string }) => void;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  saveAssetFromBase64?: (projectDir: string, base64Data: string, ext?: string, type?: string, options?: { replaceAssetId?: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  matteImageAndSave?: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number; replaceAssetId?: string }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
}

export function ImagePreviewDrawer({
  open,
  onClose,
  projectDir,
  asset,
  onUpdate,
  getAssetDataUrl,
  saveAssetFromBase64,
  matteImageAndSave,
}: ImagePreviewDrawerProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [cropPanelOpen, setCropPanelOpen] = useState(false);
  const [mattingPanelOpen, setMattingPanelOpen] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (!open || !asset?.path || !getAssetDataUrl) {
      setImageUrl(null);
      return;
    }
    getAssetDataUrl(projectDir, asset.path).then(setImageUrl);
  }, [open, projectDir, asset?.path, getAssetDataUrl]);

  useEffect(() => {
    if (asset) {
      setTags(parseTags(asset.tags));
      setName(asset.description ?? '');
    } else {
      setTags([]);
      setName('');
    }
  }, [asset]);

  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);

  const handleSave = useCallback(async () => {
    if (!asset || !window.yiman?.project?.updateAsset) return;
    setSaving(true);
    try {
      const res = await window.yiman.project.updateAsset(projectDir, asset.id, {
        tags: serializeTags(tags),
        description: name.trim() || null,
      });
      if (res?.ok) {
        message.success('已保存');
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectDir, asset, tags, name, message, onUpdate]);

  const handleCloseTag = (removedTag: string) => {
    setTags((prev) => prev.filter((t) => t !== removedTag));
  };

  const handleInputConfirm = () => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
    setInputVisible(false);
    setInputValue('');
  };

  const handleDelete = useCallback(() => {
    if (!asset || !window.yiman?.project?.deleteAsset) return;
    setDeleting(true);
    window.yiman.project
      .deleteAsset(projectDir, asset.id)
      .then((res) => {
        if (res?.ok) {
          message.success('已移除');
          onClose();
          onUpdate?.();
        } else message.error(res?.error || '删除失败');
      })
      .finally(() => setDeleting(false));
  }, [projectDir, asset, message, onClose, onUpdate]);

  const handleCropConfirm = useCallback(
    async (newPath: string) => {
      if (!asset || !window.yiman?.project?.updateAsset) return;
      const res = await window.yiman.project.updateAsset(projectDir, asset.id, { path: newPath });
      setCropPanelOpen(false);
      if (res?.ok) {
        onUpdate?.({ assetId: asset.id });
        getAssetDataUrl(projectDir, newPath).then(setImageUrl);
      }
    },
    [projectDir, asset, onUpdate, getAssetDataUrl]
  );

  const handlePathChange = useCallback(
    async (_itemId: string, newPath: string) => {
      if (!asset) return;
      const res = await window.yiman?.project?.updateAsset?.(projectDir, asset.id, { path: newPath });
      setMattingPanelOpen(false);
      if (res?.ok) {
        onUpdate?.({ assetId: asset.id });
        getAssetDataUrl(projectDir, newPath).then(setImageUrl);
      }
    },
    [projectDir, asset, onUpdate, getAssetDataUrl]
  );

  const saveAssetFromBase64Fn = saveAssetFromBase64 ?? (() => Promise.resolve({ ok: false, error: '未就绪' }));

  return (
    <>
      <Drawer
        title={
          asset ? (
            <EditableTitle
              value={name}
              onChange={(v) => setName(v)}
              placeholder={asset.path?.split(/[/\\]/).pop() || '图片'}
              prefix=""
            />
          ) : (
            '图片预览'
          )
        }
        open={open}
        onClose={onClose}
        width={420}
        destroyOnHidden
        extra={
          <Button type="primary" danger size="small" icon={<DeleteOutlined />} loading={deleting} onClick={handleDelete}>
            删除素材
          </Button>
        }
      >
        {asset && (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div
              style={{
                position: 'relative',
                aspectRatio: 1,
                maxHeight: 320,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  ...CHECKERBOARD_BACKGROUND,
                  pointerEvents: 'none',
                }}
              />
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">加载中</Text>
                </div>
              )}
            </div>

            <Space wrap>
              {saveAssetFromBase64 && (
                <Button size="small" icon={<BorderOutlined />} onClick={() => setCropPanelOpen(true)}>
                  裁剪
                </Button>
              )}
              {matteImageAndSave && saveAssetFromBase64 && (
                <Button size="small" icon={<ScissorOutlined />} onClick={() => setMattingPanelOpen(true)}>
                  抠图
                </Button>
              )}
              <Button size="small" icon={<EyeOutlined />} onClick={() => setFullPreviewOpen(true)}>
                全部预览
              </Button>
            </Space>

            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                标签
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {tags.map((tag) => (
                  <Tag
                    key={tag}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      handleCloseTag(tag);
                    }}
                  >
                    {tag}
                  </Tag>
                ))}
                {inputVisible ? (
                  <Input
                    ref={inputRef}
                    type="text"
                    size="small"
                    style={{ width: 78 }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleInputConfirm}
                    onPressEnter={handleInputConfirm}
                  />
                ) : (
                  <Tag onClick={() => setInputVisible(true)} style={{ background: token.colorBgContainer, borderStyle: 'dashed' }}>
                    <PlusOutlined /> 添加标签
                  </Tag>
                )}
              </div>
              <Button type="primary" size="small" onClick={handleSave} loading={saving}>
                保存
              </Button>
            </div>
          </Space>
        )}
      </Drawer>

      {asset && saveAssetFromBase64 && (
        <CropPanel
          open={cropPanelOpen}
          onClose={() => setCropPanelOpen(false)}
          projectDir={projectDir}
          imagePath={asset.path}
          getAssetDataUrl={getAssetDataUrl}
          saveAssetFromBase64={saveAssetFromBase64}
          onConfirm={handleCropConfirm}
          assetType="image"
          replaceAssetId={asset.id}
        />
      )}

      {asset && matteImageAndSave && saveAssetFromBase64 && (
        <MattingSettingsPanel
          open={mattingPanelOpen}
          onClose={() => setMattingPanelOpen(false)}
          itemId={asset.id}
          projectDir={projectDir}
          imagePath={asset.path}
          getAssetDataUrl={getAssetDataUrl}
          saveAssetFromBase64={saveAssetFromBase64}
          matteImageAndSave={matteImageAndSave}
          onPathChange={handlePathChange}
          replaceAssetId={asset.id}
        />
      )}

      <Modal
        title="全部预览"
        open={fullPreviewOpen}
        onCancel={() => setFullPreviewOpen(false)}
        footer={null}
        width="90vw"
        styles={{ body: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 } }}
      >
        {asset && imageUrl && (
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '80vh' }}>
            <div style={{ ...CHECKERBOARD_BACKGROUND, padding: 24, borderRadius: 8 }}>
              <img
                src={imageUrl}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
