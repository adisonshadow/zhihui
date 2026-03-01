/**
 * 音效/音乐预览 Drawer：使用 wavesurfer 波形预览、修改名称与 tags、删除素材（支持 AAC 等格式）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Input, Button, App, Space, Typography, Tag, theme } from 'antd';
import { DeleteOutlined, PlusOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';
import WavesurferPlayer from '@wavesurfer/react';

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

interface AudioPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  onUpdate: () => void;
}

export function AudioPreviewDrawer({ open, onClose, projectDir, asset, onUpdate }: AudioPreviewDrawerProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<InputRef>(null);
  const wavesurferRef = useRef<{ playPause: () => void } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!open || !asset?.path || !window.yiman?.project?.getAssetDataUrl) {
      setAudioUrl(null);
      wavesurferRef.current = null;
      setIsPlaying(false);
      return;
    }
    wavesurferRef.current = null;
    setIsPlaying(false);
    window.yiman.project.getAssetDataUrl(projectDir, asset.path).then(setAudioUrl);
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
        onUpdate();
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
            placeholder={asset.path?.split(/[/\\]/).pop() || '音频'}
            prefix=""
          />
        ) : (
          '音频预览'
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
              padding: 16,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            {audioUrl ? (
              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                <WavesurferPlayer
                  height={80}
                  waveColor="rgba(255,255,255,0.4)"
                  progressColor="rgba(100,150,255,0.8)"
                  url={audioUrl}
                  onReady={(ws) => {
                    wavesurferRef.current = ws;
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <Button
                  type="primary"
                  size="small"
                  icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => wavesurferRef.current?.playPause?.()}
                >
                  {isPlaying ? '暂停' : '播放'}
                </Button>
              </Space>
            ) : (
              <div style={{ padding: 24, textAlign: 'center' }}>
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
            <Button type="primary" size="small" onClick={handleSave} loading={saving}>
              保存
            </Button>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
