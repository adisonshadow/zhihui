/**
 * 视频/透明视频预览 Drawer：预览视频、修改 tags、删除素材
 * 透明视频使用深色棋盘格背景以展示透明通道
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';
import { Drawer, Input, Button, App, Space, Typography, Tag, theme } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';

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

interface VideoPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  onUpdate: () => void;
}

export function VideoPreviewDrawer({ open, onClose, projectDir, asset, onUpdate }: VideoPreviewDrawerProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<InputRef>(null);

  const isTransparent = asset?.type === 'transparent_video';

  useEffect(() => {
    if (!open || !asset?.path || !window.yiman?.project?.getAssetDataUrl) {
      setVideoUrl(null);
      return;
    }
    window.yiman.project.getAssetDataUrl(projectDir, asset.path).then(setVideoUrl);
  }, [open, projectDir, asset?.path]);

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

  const handleSaveTags = useCallback(async () => {
    if (!asset || !window.yiman?.project?.updateAsset) return;
    setSaving(true);
    try {
      const res = await window.yiman.project.updateAsset(projectDir, asset.id, {
        tags: serializeTags(tags),
        description: name.trim() || null,
      });
      if (res?.ok) {
        message.success('已保存');
        onUpdate();
      } else message.error(res?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectDir, asset, tags, name, message, onUpdate]);

  const handleCloseTag = (removedTag: string) => {
    const next = tags.filter((t) => t !== removedTag);
    setTags(next);
  };

  const handleInputConfirm = () => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
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
          onUpdate();
        } else message.error(res?.error || '删除失败');
      })
      .finally(() => setDeleting(false));
  }, [projectDir, asset, message, onClose, onUpdate]);

  return (
    <Drawer
      title={
        asset ? (
          <EditableTitle
            value={name}
            onChange={(v) => setName(v)}
            placeholder={asset.path?.split(/[/\\]/).pop() || '视频'}
            prefix=""
          />
        ) : (
          '视频预览'
        )
      }
      open={open}
      onClose={onClose}
      width={480}
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
              aspectRatio: '16/9',
              maxHeight: 280,
              borderRadius: 8,
              overflow: 'hidden',
              background: isTransparent
                ? undefined
                : 'rgba(255,255,255,0.06)',
            }}
          >
            {isTransparent && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  ...CHECKERBOARD_BACKGROUND,
                  pointerEvents: 'none',
                }}
              />
            )}
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
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
            <Button type="primary" size="small" onClick={handleSaveTags} loading={saving}>
              保存
            </Button>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
