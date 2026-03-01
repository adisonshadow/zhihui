/**
 * 元件预览：递归渲染嵌套元件，支持 tag 匹配状态
 * 无 tag 时默认显示第一个状态；标签精灵支持按 tag 过滤显示帧
 */
import { useState, useEffect, useRef } from 'react';
import { Typography } from 'antd';
import type { GroupComponentItem, GroupComponentState, GroupCanvasItem } from '@/types/groupComponent';
import { GROUP_CANVAS_SIZE } from '@/types/groupComponent';
import type { SpriteSheetItem } from './SpriteSheetPanel';
import type { SpriteFrameRect } from './SpriteSheetPanel';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';

const { Text } = Typography;

export function findBestMatchingState(states: GroupComponentState[], tags: string[]): GroupComponentState | null {
  if (!states?.length) return null;
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
  /** 是否显示棋盘格背景（仅根级画布背景，嵌套元件用纯色） */
  showCheckerboard?: boolean;
  /** 标签精灵模式下，每个 sprite 画布项选中的 tag 值，用于过滤显示帧 */
  selectedTagsBySpriteItemId?: Record<string, Record<string, string>>;
  /** 跨人物时，用于解析 sprite 的精灵图列表 */
  allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
}

/** 递归渲染元件预览，支持 tag 向内传递；无 tag 时显示第一个状态 */
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
  selectedTagsBySpriteItemId,
  allCharactersData,
}: GroupPreviewProps) {
  if (depth >= MAX_PREVIEW_DEPTH) {
    return <Text type="secondary">嵌套过深</Text>;
  }
  if (!group) return <Text type="secondary">无元件</Text>;
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
            selectedTagsBySpriteItemId={selectedTagsBySpriteItemId}
            allCharactersData={allCharactersData}
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
  selectedTagsBySpriteItemId,
  allCharactersData,
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
  selectedTagsBySpriteItemId?: Record<string, Record<string, string>>;
  allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
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
    const resolveSheets = () =>
      item.characterId === characterId
        ? spriteSheets
        : allCharactersData?.find((c) => c.characterId === item.characterId)?.spriteSheets ?? [];
    const sheets = resolveSheets();
    const sprite = sheets.find((s) => s.id === item.spriteId);
    if (!sprite?.cover_path && !sprite?.image_path) return null;
    const selectedTags = selectedTagsBySpriteItemId?.[item.id];
    const isTaggedWithSelection =
      sprite.is_tagged_sprite &&
      sprite.property_tags?.length &&
      sprite.frames?.length &&
      selectedTags &&
      Object.values(selectedTags).some((v) => v?.trim());
    let frameIndices: number[] = [];
    if (isTaggedWithSelection && sprite.frames && sprite.frame_tags && sprite.property_tags) {
      frameIndices = sprite.frames
        .map((_, i) => i)
        .filter((i) => {
          const ft = sprite.frame_tags![i] ?? {};
          for (const [prop, val] of Object.entries(selectedTags ?? {})) {
            if (!val?.trim()) continue;
            const frameVals = ft[prop] ?? [];
            if (!frameVals.some((v) => v?.trim() === val.trim())) return false;
          }
          return true;
        });
    }
    if (frameIndices.length > 0 && sprite.frames && sprite.frames.length > 0) {
      const playbackFps = sprite.playback_fps ?? 8;
      return (
        <TaggedSpritePlaybackThumb
          projectDir={projectDir}
          path={sprite.image_path}
          frames={sprite.frames}
          frameIndices={frameIndices}
          playbackFps={playbackFps}
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
    const nestedCharId = item.characterId;
    const nestedSpriteSheets =
      nestedCharId === characterId
        ? spriteSheets
        : allCharactersData?.find((c) => c.characterId === nestedCharId)?.spriteSheets ?? spriteSheets;
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
          characterId={nestedCharId}
          group={nested}
          tags={tags}
          spriteSheets={nestedSpriteSheets}
          componentGroups={componentGroups}
          getAssetDataUrl={getAssetDataUrl}
          size={Math.min(w, h)}
          depth={(depth ?? 0) + 1}
          showCheckerboard={false}
          selectedTagsBySpriteItemId={selectedTagsBySpriteItemId}
          allCharactersData={allCharactersData}
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

const DEFAULT_PLAYBACK_FPS = 8;

/** 标签精灵帧循环播放：按 frameIndices 依次渲染，按 playbackFps 速度循环 */
function TaggedSpritePlaybackThumb({
  projectDir,
  path,
  frames,
  frameIndices,
  playbackFps,
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
  frames: SpriteFrameRect[];
  frameIndices: number[];
  playbackFps: number;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  rotation: number;
  flip_x?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const rafRef = useRef<number>(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getAssetDataUrl]);
  useEffect(() => {
    if (!dataUrl || frameIndices.length === 0 || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    imgRef.current = img;
    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      const idx = frameIndexRef.current % frameIndices.length;
      const actualIdx = frameIndices[idx] ?? 0;
      const frame = frames[actualIdx];
      if (frame && frame.width > 0 && frame.height > 0) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
      }
    };
    img.src = dataUrl;
    return () => {
      img.src = '';
      imgRef.current = null;
    };
  }, [dataUrl, frameIndices, frames, width, height]);
  useEffect(() => {
    if (!dataUrl || frameIndices.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fps = Math.max(1, playbackFps || DEFAULT_PLAYBACK_FPS);
    const interval = 1000 / fps;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      if (now - last >= interval) {
        last = now;
        frameIndexRef.current = (frameIndexRef.current + 1) % frameIndices.length;
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) {
          const idx = frameIndexRef.current;
          const actualIdx = frameIndices[idx] ?? 0;
          const frame = frames[actualIdx];
          if (frame && frame.width > 0 && frame.height > 0) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dataUrl, frameIndices, frames, width, height, playbackFps]);
  if (!dataUrl) return <Text type="secondary" style={{ position: 'absolute', left: baseX, top: baseY, fontSize: 10 }}>加载中</Text>;
  return (
    <div
      style={{
        position: 'absolute',
        left: baseX - width / 2,
        top: baseY - height / 2,
        width,
        height,
        transform: `rotate(${rotation}deg)${flip_x ? ' scaleX(-1)' : ''}`,
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
    </div>
  );
}
