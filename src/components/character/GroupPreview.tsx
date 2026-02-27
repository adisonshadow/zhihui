/**
 * 元件组预览：递归渲染嵌套元件组，支持 tag 匹配状态
 * 无 tag 时默认显示第一个状态
 */
import { useState, useEffect } from 'react';
import { Typography } from 'antd';
import type { GroupComponentItem, GroupComponentState, GroupCanvasItem } from '@/types/groupComponent';
import { GROUP_CANVAS_SIZE } from '@/types/groupComponent';
import type { SpriteSheetItem } from './SpriteSheetPanel';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';

const { Text } = Typography;

export function findBestMatchingState(states: GroupComponentState[], tags: string[]): GroupComponentState | null {
  const tagSet = new Set(tags.map((t) => t.trim()).filter(Boolean));
  if (tagSet.size === 0) return states[0] ?? null;
  let best: GroupComponentState | null = null;
  let bestScore = -1;
  for (const s of states) {
    const stateTagSet = new Set(s.tags.map((t) => t.trim()).filter(Boolean));
    const matchCount = [...stateTagSet].filter((t) => tagSet.has(t)).length;
    const allMatch = [...stateTagSet].every((t) => tagSet.has(t));
    if (allMatch && matchCount > bestScore) {
      bestScore = matchCount;
      best = s;
    }
  }
  return best;
}

const MAX_PREVIEW_DEPTH = 10;

export interface GroupPreviewProps {
  projectDir: string;
  characterId: string;
  group: GroupComponentItem | null;
  tags: string[];
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  size: number;
  depth?: number;
  /** 是否显示棋盘格背景（仅根级画布背景，嵌套元件组用纯色） */
  showCheckerboard?: boolean;
}

/** 递归渲染元件组预览，支持 tag 向内传递；无 tag 时显示第一个状态 */
export function GroupPreview({
  projectDir,
  characterId,
  group,
  tags,
  spriteSheets,
  componentGroups,
  getAssetDataUrl,
  size: displaySize,
  depth = 0,
  showCheckerboard = true,
}: GroupPreviewProps) {
  if (depth >= MAX_PREVIEW_DEPTH) {
    return <Text type="secondary">嵌套过深</Text>;
  }
  if (!group) return <Text type="secondary">无元件组</Text>;
  const state = findBestMatchingState(group.states, tags);
  const scale = displaySize / GROUP_CANVAS_SIZE;
  /** 仅根级画布用棋盘格；嵌套元件/图片/精灵图不加任何背景和纹理 */
  const bgStyle = showCheckerboard ? CHECKERBOARD_BACKGROUND : {};
  if (!state || state.items.length === 0) {
    return (
      <div
        style={{
          width: displaySize,
          height: displaySize,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...bgStyle,
        }}
      >
        <Text type="secondary">无匹配状态或画板为空</Text>
      </div>
    );
  }
  return (
    <div
      style={{
        width: displaySize,
        height: displaySize,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 8,
        ...bgStyle,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: GROUP_CANVAS_SIZE,
          height: GROUP_CANVAS_SIZE,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {state.items.map((it) => (
          <GroupPreviewItem
            key={it.id}
            projectDir={projectDir}
            characterId={characterId}
            item={it}
            tags={tags}
            spriteSheets={spriteSheets}
            componentGroups={componentGroups}
            getAssetDataUrl={getAssetDataUrl}
            containerSize={GROUP_CANVAS_SIZE}
            depth={depth}
            showCheckerboard={showCheckerboard}
          />
        ))}
      </div>
    </div>
  );
}

function GroupPreviewItem({
  projectDir,
  characterId,
  item,
  tags,
  spriteSheets,
  componentGroups,
  getAssetDataUrl,
  containerSize,
  depth = 0,
  showCheckerboard = true,
}: {
  projectDir: string;
  characterId: string;
  item: GroupCanvasItem;
  tags: string[];
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  containerSize: number;
  depth?: number;
  showCheckerboard?: boolean;
}) {
  const pos_x = item.pos_x ?? 0.5;
  const pos_y = item.pos_y ?? 0.5;
  const scale_x = item.scale_x ?? 0.2;
  const scale_y = item.scale_y ?? 0.2;
  const rotation = item.rotation ?? 0;
  const flip_x = item.flip_x ?? false;
  const baseX = pos_x * containerSize;
  const baseY = pos_y * containerSize;
  const w = containerSize * scale_x;
  const h = containerSize * scale_y;
  if (item.type === 'image') {
    return (
      <ImagePreviewThumb
        projectDir={projectDir}
        path={item.path}
        getAssetDataUrl={getAssetDataUrl}
        baseX={baseX}
        baseY={baseY}
        width={w}
        height={h}
        rotation={rotation}
        flip_x={flip_x}
      />
    );
  }
  if (item.type === 'sprite') {
    const sprite = spriteSheets.find((s) => s.id === item.spriteId);
    if (!sprite?.cover_path && !sprite?.image_path) return null;
    return (
      <ImagePreviewThumb
        projectDir={projectDir}
        path={sprite.cover_path || sprite.image_path}
        getAssetDataUrl={getAssetDataUrl}
        baseX={baseX}
        baseY={baseY}
        width={w}
        height={h}
        rotation={rotation}
        flip_x={flip_x}
      />
    );
  }
  if (item.type === 'group') {
    const nested = componentGroups.find((g) => g.id === item.groupId);
    if (!nested) return null;
    return (
      <div
        style={{
          position: 'absolute',
          left: baseX - w / 2,
          top: baseY - h / 2,
          width: w,
          height: h,
          transform: `rotate(${rotation}deg)${flip_x ? ' scaleX(-1)' : ''}`,
        }}
      >
        <GroupPreview
          projectDir={projectDir}
          characterId={characterId}
          group={nested}
          tags={tags}
          spriteSheets={spriteSheets}
          componentGroups={componentGroups}
          getAssetDataUrl={getAssetDataUrl}
          size={Math.min(w, h)}
          depth={(depth ?? 0) + 1}
          showCheckerboard={false}
        />
      </div>
    );
  }
  return null;
}

function ImagePreviewThumb({
  projectDir,
  path,
  getAssetDataUrl,
  baseX,
  baseY,
  width,
  height,
  rotation,
  flip_x = false,
}: {
  projectDir: string;
  path: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  rotation: number;
  flip_x?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getAssetDataUrl]);
  if (!dataUrl) return <Text type="secondary" style={{ position: 'absolute', left: baseX, top: baseY, fontSize: 10 }}>加载中</Text>;
  return (
    <img
      src={dataUrl}
      alt=""
      style={{
        position: 'absolute',
        left: baseX - width / 2,
        top: baseY - height / 2,
        width,
        height,
        objectFit: 'contain',
        transform: `rotate(${rotation}deg)${flip_x ? ' scaleX(-1)' : ''}`,
      }}
    />
  );
}
