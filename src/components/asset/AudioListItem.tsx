/**
 * 音效/音乐列表项：名称、标签、播放/编辑/放置（设计器）或收藏/删除（素材库）
 */
import { Button, Space, Typography } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, EditOutlined, PlusOutlined, StarOutlined, StarFilled, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

function parseAudioTags(tagsStr: string | null | undefined): string[] {
  if (!tagsStr || !tagsStr.trim()) return [];
  return tagsStr.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
}

export interface AudioListItemAsset {
  id: string;
  path: string;
  type?: string;
  description?: string | null;
  tags?: string | null;
  is_favorite?: number;
}

export interface AudioListItemProps {
  asset: AudioListItemAsset;
  isPlaying: boolean;
  onPlay: () => void;
  onEdit: () => void;
  /** 设计器：放置到时间线 */
  onPlace?: () => void;
  placing?: boolean;
  /** 素材库：收藏、删除 */
  onFavorite?: () => void;
  onDelete?: () => void;
}

export function AudioListItem({
  asset,
  isPlaying,
  onPlay,
  onEdit,
  onPlace,
  placing,
  onFavorite,
  onDelete,
}: AudioListItemProps) {
  const name = asset.description || asset.path.split(/[/\\]/).pop() || asset.id;
  const tags = parseAudioTags(asset.tags);
  return (
    <div
      draggable={!!onPlace}
      onDragStart={
        onPlace
          ? (e) => {
              e.dataTransfer.setData('assetId', asset.id);
              e.dataTransfer.setData('assetDuration', '10');
              e.dataTransfer.setData('assetType', asset.type || '');
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', display: 'block' }} title={name}>
          {name}
        </Text>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <Space size={4}>
        <Button type="text" size="small" icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={(e) => { e.stopPropagation(); onPlay(); }} title={isPlaying ? '暂停' : '播放'} />
        <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onEdit(); }} title="编辑" />
        {onPlace && (
          <Button type="primary" size="small" icon={<PlusOutlined />} loading={placing} onClick={(e) => { e.stopPropagation(); onPlace(); }} title="放置">
            放置
          </Button>
        )}
        {onFavorite && (
          <Button type="text" size="small" icon={asset.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={(e) => { e.stopPropagation(); onFavorite(); }} title={asset.is_favorite ? '取消常用' : '设为常用'} />
        )}
        {onDelete && (
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="删除" />
        )}
      </Space>
    </div>
  );
}
