/**
 * 角色形象面板：多形象列表、添加、删除、预览、描述、AI 按钮
 * 使用 Image.PreviewGroup 支持多图一起预览
 */
import { useState, useEffect } from 'react';
import { Button, Space, Typography, Input, Image } from 'antd';
import { PlusOutlined, DeleteOutlined, RobotFilled } from '@ant-design/icons';

const { Text } = Typography;

export interface CharacterImageItem {
  id: string;
  path: string;
  description: string;
}

export interface CharacterImagesPanelProps {
  projectDir: string;
  images: CharacterImageItem[];
  onAdd: () => void;
  onDelete: (item: CharacterImageItem) => void;
  onUpdateDescription: (item: CharacterImageItem, description: string) => void;
  onAiClick: (item: CharacterImageItem) => void;
}

function CharacterImageCard({
  projectDir,
  item,
  onDelete,
  onUpdateDescription,
  onAiClick,
}: {
  projectDir: string;
  item: CharacterImageItem;
  onDelete: () => void;
  onUpdateDescription: (description: string) => void;
  onAiClick: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(item.description);

  useEffect(() => {
    if (!item.path || !window.yiman?.project?.getAssetDataUrl) return;
    window.yiman.project.getAssetDataUrl(projectDir, item.path).then(setDataUrl);
  }, [projectDir, item.path]);

  useEffect(() => {
    setDescValue(item.description);
  }, [item.description]);

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (descValue !== item.description) onUpdateDescription(descValue);
  };

  return (
    <div
      style={{
        width: 120,
        flexShrink: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {dataUrl ? (
          <Image
            src={dataUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            preview={{ mask: '预览' }}
          />
        ) : (
          <Text type="secondary">加载中</Text>
        )}
      </div>
      <div style={{ padding: '6px 6px 4px' }}>
        {editingDesc ? (
          <Input
            size="small"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={handleDescBlur}
            onPressEnter={handleDescBlur}
            placeholder="一句话描述"
            autoFocus
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setEditingDesc(true)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingDesc(true)}
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
              minHeight: 24,
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {typeof item.description === 'string' ? item.description || '点击添加描述' : '点击添加描述'}
          </div>
        )}
        <Space size={4} style={{ marginTop: 4, justifyContent: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <Button
            type="text"
            size="small"
            icon={<RobotFilled />}
            onClick={onAiClick}
            style={{ padding: '0 4px', minWidth: 24, color: 'rgba(255,255,255,0.7)' }}
            title="AI（暂未实现）"
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={onDelete}
            style={{ padding: '0 4px', minWidth: 24 }}
            title="删除"
          />
        </Space>
      </div>
    </div>
  );
}

export function CharacterImagesPanel({
  projectDir,
  images,
  onAdd,
  onDelete,
  onUpdateDescription,
  onAiClick,
}: CharacterImagesPanelProps) {
  return (
    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      <Image.PreviewGroup>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {images.map((item) => (
            <CharacterImageCard
              key={item.id}
              projectDir={projectDir}
              item={item}
              onDelete={() => onDelete(item)}
              onUpdateDescription={(desc) => onUpdateDescription(item, desc)}
              onAiClick={() => onAiClick(item)}
            />
          ))}
        <div
          role="button"
          tabIndex={0}
          onClick={onAdd}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          style={{
            width: 120,
            height: 120,
            borderRadius: 8,
            border: '1px dashed rgba(255,255,255,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <PlusOutlined style={{ fontSize: 24, color: 'rgba(255,255,255,0.4)' }} />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
            添加形象
          </Text>
        </div>
        </div>
      </Image.PreviewGroup>
    </Space>
  );
}
