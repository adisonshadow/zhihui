/**
 * 统一素材/人物列表卡片：素材页（图片/视频/精灵图/元件）、人物页（骨骼/精灵动作/元件）
 * 音乐/音效使用 AudioListItem，不在此统一
 */
import { useState, useEffect } from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { DeleteOutlined, StarOutlined, StarFilled, ExportOutlined } from '@ant-design/icons';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import type { CharacterAngle } from '@/types/skeleton';

const { Text } = Typography;

const CARD_BODY_STYLE = {
  display: 'flex' as const,
  flexDirection: 'column' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 8,
  paddingBottom: 8,
};

const TITLE_STYLE = {
  width: '80%' as const,
  maxWidth: '80%' as const,
  marginTop: 8,
  fontSize: 12,
  marginBottom: 0,
  minHeight: 38,
};

/** 缩略图：支持图片/视频封面 */
export function AssetThumb({
  projectDir,
  path,
  coverPath,
  size = 80,
}: {
  projectDir: string;
  path: string;
  coverPath?: string | null;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const ext = path.split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext ?? '');
    const isAudio = ['mp3', 'wav'].includes(ext ?? '');
    if (isVideo && coverPath) {
      window.yiman?.project?.getAssetDataUrl(projectDir, coverPath).then(setDataUrl);
    } else if (!isAudio && !isVideo) {
      window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setDataUrl);
    } else {
      setDataUrl(null);
    }
  }, [projectDir, path, coverPath]);
  const ext = path.split('.').pop()?.toLowerCase();
  const isMediaPlaceholder = ['mp3', 'wav', 'mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext ?? '') && !dataUrl;
  if (isMediaPlaceholder) {
    return (
      <div style={{ width: size, height: size, background: 'rgba(255,255,255,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary">音/视频</Text>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
      {dataUrl ? (
        <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary">加载中</Text>
        </div>
      )}
    </div>
  );
}

/** 图片/视频等资产卡片（素材页） */
export interface AssetCardAsset {
  id: string;
  path: string;
  type: string;
  is_favorite: number;
  description: string | null;
  cover_path?: string | null;
}

export const IMAGE_TYPES = ['image', 'character', 'scene_bg', 'prop', 'sticker'];

export function AssetCard({
  projectDir,
  asset,
  onFavorite,
  onDelete,
  onVideoPreview,
  onAudioPreview,
  onImagePreview,
}: {
  projectDir: string;
  asset: AssetCardAsset;
  onFavorite: () => void;
  onDelete: () => void;
  onVideoPreview?: () => void;
  onAudioPreview?: () => void;
  onImagePreview?: () => void;
}) {
  const isVideo = asset.type === 'video' || asset.type === 'transparent_video';
  const isAudio = asset.type === 'sfx' || asset.type === 'music';
  const isImage = IMAGE_TYPES.includes(asset.type);
  const handleCardClick =
    (isVideo && onVideoPreview ? onVideoPreview : isAudio && onAudioPreview ? onAudioPreview : isImage && onImagePreview ? onImagePreview : undefined);

  return (
    <div style={{ padding: 8 }}>
      <Card
        size="small"
        className="asset-card-hover"
        style={{ width: '100%', minWidth: 0, cursor: handleCardClick ? 'pointer' : undefined }}
        styles={{ body: CARD_BODY_STYLE }}
        onClick={handleCardClick}
      >
        <AssetThumb projectDir={projectDir} path={asset.path} coverPath={asset.cover_path} size={120} />
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={TITLE_STYLE}>
          {asset.description || asset.path.split(/[/\\]/).pop() || asset.path}
        </Typography.Paragraph>
        <Space style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <Button type="text" size="small" icon={asset.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={onFavorite} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
        </Space>
      </Card>
    </div>
  );
}

/** 精灵图/精灵动作卡片（素材页精灵图、人物页精灵动作） */
export interface SpriteCardAsset {
  id: string;
  is_favorite?: number;
}

export function SpriteCard({
  projectDir,
  sprite,
  asset,
  onEdit,
  onFavorite,
  onDelete,
  onExport,
}: {
  projectDir: string;
  sprite: SpriteSheetItem;
  asset?: SpriteCardAsset;
  onEdit: () => void;
  onFavorite?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    const path = sprite.cover_path || sprite.image_path;
    if (!path) return;
    window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setThumb);
  }, [projectDir, sprite.cover_path, sprite.image_path]);

  const subtitle = sprite.frame_count ? `${sprite.frame_count} 帧` : sprite.image_path ? '未抠图' : '未导入';

  return (
    <div style={{ padding: 8 }}>
      <Card
        size="small"
        className="asset-card-hover"
        style={{ width: '100%', minWidth: 0, cursor: 'pointer' }}
        styles={{ body: CARD_BODY_STYLE }}
        onClick={onEdit}
      >
        <div
          style={{
            aspectRatio: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {thumb ? (
            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>未导入</Text>
          )}
        </div>
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={TITLE_STYLE}>
          {sprite.name || '未命名'}
        </Typography.Paragraph>
        <Text type="secondary" style={{ fontSize: 11 }}>{subtitle}</Text>
        <Space style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          {onFavorite && (
            <Button
              type="text"
              size="small"
              icon={asset?.is_favorite ? <StarFilled /> : <StarOutlined />}
              onClick={onFavorite}
              title={asset?.is_favorite ? '取消常用' : '设为常用'}
            />
          )}
          {onExport && (
            <Button type="text" size="small" icon={<ExportOutlined />} onClick={onExport} title="导出" />
          )}
          {onDelete && (
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} title="删除" />
          )}
        </Space>
      </Card>
    </div>
  );
}

/** 元件封面路径 */
export function getGroupCoverPath(item: GroupComponentItem, spriteSheets: SpriteSheetItem[]): string | null {
  const firstItem = item.states?.[0]?.items?.[0];
  if (!firstItem) return null;
  if (firstItem.type === 'image') return firstItem.path;
  if (firstItem.type === 'sprite') {
    const sp = spriteSheets.find((s) => s.id === firstItem.spriteId);
    return sp?.cover_path || sp?.image_path || null;
  }
  return null;
}

function GroupComponentCardThumb({ projectDir, path }: { projectDir: string; path: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setDataUrl(null);
      return;
    }
    window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path]);
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: 1,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无封面</Text>
      )}
    </div>
  );
}

/** 元件卡片（素材页元件、人物页元件） */
export interface GroupComponentCardAsset {
  id: string;
  is_favorite?: number;
}

export function GroupComponentCard({
  projectDir,
  item,
  spriteSheets,
  onEdit,
  onDelete,
  onFavorite,
  asset,
}: {
  projectDir: string;
  item: GroupComponentItem;
  spriteSheets: SpriteSheetItem[];
  onEdit: () => void;
  onDelete: () => void;
  onFavorite?: () => void;
  asset?: GroupComponentCardAsset;
}) {
  const coverPath = getGroupCoverPath(item, spriteSheets);

  return (
    <div style={{ padding: 8 }}>
      <Card
        size="small"
        className="asset-card-hover"
        style={{ width: '100%', minWidth: 0, cursor: 'pointer' }}
        styles={{ body: CARD_BODY_STYLE }}
        onClick={onEdit}
      >
        <GroupComponentCardThumb projectDir={projectDir} path={coverPath} />
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={TITLE_STYLE}>
          {item.name || '未命名'}
        </Typography.Paragraph>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {item.states?.length ?? 0} 个状态
        </Text>
        <Space style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          {onFavorite && (
            <Button
              type="text"
              size="small"
              icon={asset?.is_favorite ? <StarFilled /> : <StarOutlined />}
              onClick={onFavorite}
              title={asset?.is_favorite ? '取消常用' : '设为常用'}
            />
          )}
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="删除" />
        </Space>
      </Card>
    </div>
  );
}

/** 骨骼角度卡片（人物页骨骼） */
export function SkeletonAngleCard({
  projectDir,
  angle,
  characterImagePath,
  onClick,
}: {
  projectDir: string;
  angle: CharacterAngle;
  characterImagePath: string | null;
  onClick: () => void;
}) {
  const imgPath = angle.image_path || characterImagePath;
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imgPath) {
      setDataUrl(null);
      return;
    }
    window.yiman?.project?.getAssetDataUrl(projectDir, imgPath).then(setDataUrl);
  }, [projectDir, imgPath]);

  const title = angle.display_name ? `${angle.display_name} ${angle.name}` : angle.name;

  return (
    <div style={{ padding: 8 }}>
      <Card
        size="small"
        className="asset-card-hover"
        style={{ width: '100%', minWidth: 0, cursor: 'pointer' }}
        styles={{ body: CARD_BODY_STYLE }}
        onClick={onClick}
      >
        <div
          style={{
            width: '100%',
            aspectRatio: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {dataUrl ? (
            <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无封面</Text>
          )}
        </div>
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={TITLE_STYLE}>
          {title}
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
