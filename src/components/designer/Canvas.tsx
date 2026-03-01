/**
 * DOM 画布：尺寸与项目横竖屏一致，素材位置/缩放/旋转归一化存储、渲染时换算为 px（见技术文档 4.2、开发计划 2.10）
 * 精灵图按 currentTime 与 playback_fps 计算当前帧并裁剪渲染
 * 素材动画见 docs/08-素材动画功能技术方案.md
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import { getBlockAnimationState } from '@/hooks/useBlockAnimation';
import { GroupPreview } from '@/components/character/GroupPreview';

export interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlockItem {
  id: string;
  layer_id: string;
  asset_id: string | null;
  start_time?: number;
  end_time?: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  dataUrl: string | null;
  isVideo?: boolean;
  /** 透明视频（WebM 带 alpha），画布需支持透明通道显示 */
  isTransparentVideo?: boolean;
  /** 等比缩放：1=等比，0=自由；画布 resize 时据此决定是否拉伸到区域 */
  lock_aspect?: number;
  /** 关键帧插值效果（见功能文档 6.8） */
  opacity?: number;
  blur?: number;
  color?: string;
  /** 画布渲染 z-index（自动管理：分层从上到下越高，同层素材越靠后越高，见功能文档 6.7） */
  zIndex?: number;
  /** 精灵图：按帧 index 裁剪渲染，非整图 */
  spriteInfo?: {
    frames: SpriteFrameRect[];
    frame_count: number;
    playback_fps: number;
    start_time: number;
    end_time: number;
  };
  /** 当前时间（秒），用于精灵帧计算 */
  currentTime?: number;
  /** 动画配置，见 docs/08-素材动画功能技术方案.md */
  animationConfig?: BlockAnimationConfig | null;
  /** 元件块：characterId + group + spriteSheets + componentGroups + 状态关键帧 tags，用于 GroupPreview 渲染 */
  componentInfo?: {
    characterId: string;
    group: import('@/types/groupComponent').GroupComponentItem;
    spriteSheets: import('@/components/character/SpriteSheetPanel').SpriteSheetItem[];
    componentGroups: import('@/types/groupComponent').GroupComponentItem[];
    allCharactersData?: { characterId: string; spriteSheets: import('@/components/character/SpriteSheetPanel').SpriteSheetItem[] }[];
    /** 状态关键帧选中的 tags（用于 findBestMatchingState） */
    tags?: string[];
    /** 标签精灵的 tag 选择 */
    selectedTagsBySpriteItemId?: Record<string, Record<string, string>>;
  };
}

interface CanvasProps {
  designWidth: number;
  designHeight: number;
  zoom: number;
  blocks: BlockItem[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onBlockMove: (blockId: string, newPos_x: number, newPos_y: number) => Promise<void> | void;
  /** 拖拽结束（pointer up）时调用，用于刷新数据并同步到设置面板 */
  onBlockMoveEnd?: () => void;
  /** 是否处于播放模式（视频用 play() 流畅播放，非播放时仅 seek 显示帧） */
  playing?: boolean;
  /** 元件块渲染需要：项目目录与获取素材 dataUrl */
  projectDir?: string;
  getAssetDataUrl?: (projectDir: string, path: string) => Promise<string | null>;
}

/** 视频块：播放模式用 play() 流畅播放；拖拽时仅 seek 显示帧；透明视频需容器透明（见功能文档 6.5） */
function VideoBlock({
  dataUrl,
  currentTime = 0,
  startTime,
  endTime,
  lockAspect,
  isTransparentVideo,
  playing = false,
}: {
  dataUrl: string;
  currentTime?: number;
  startTime: number;
  endTime: number;
  lockAspect?: number;
  isTransparentVideo?: boolean;
  playing?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const duration = Math.max(0, endTime - startTime);
  const localTime = Math.max(0, Math.min(currentTime - startTime, duration));
  const lastPlayModeRef = useRef(false);

  /** 拖拽模式：仅 seek 到当前帧，不播放 */
  const syncSeek = useCallback(() => {
    const video = videoRef.current;
    if (!video || !dataUrl) return;
    if (Math.abs(video.currentTime - localTime) > 0.05) {
      video.currentTime = localTime;
    }
  }, [localTime, dataUrl]);

  /** 播放模式：seek 到起始位置后 play()，由视频自然播放至结束 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !dataUrl) return;
    if (playing) {
      if (!lastPlayModeRef.current) {
        video.currentTime = localTime;
        video.muted = false;
        video.play().catch(() => {});
      }
      lastPlayModeRef.current = true;
    } else {
      lastPlayModeRef.current = false;
      video.pause();
      video.muted = true;
      syncSeek();
    }
  }, [playing, localTime, dataUrl, syncSeek]);

  useEffect(() => {
    if (!playing) syncSeek();
  }, [playing, syncSeek]);

  return (
    <div style={{ width: '100%', height: '100%', background: isTransparentVideo ? 'transparent' : undefined }}>
      <video
        ref={videoRef}
        src={dataUrl}
        muted={!playing}
        playsInline
        preload="auto"
        onLoadedMetadata={() => { if (!playing) syncSeek(); }}
        onLoadedData={() => { if (!playing) syncSeek(); }}
        style={{ width: '100%', height: '100%', objectFit: (lockAspect !== 0) ? 'contain' : 'fill', pointerEvents: 'none' }}
      />
    </div>
  );
}

/** 精灵图单帧渲染：按帧 rect 从 sprite sheet 裁剪显示 */
function SpriteFrame({ dataUrl, frame, width, height }: { dataUrl: string; frame: SpriteFrameRect; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dataUrl || !frame || frame.width <= 0 || frame.height <= 0 || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
    };
    img.src = dataUrl;
    return () => { img.src = ''; };
  }, [dataUrl, frame.x, frame.y, frame.width, frame.height, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />;
}

export function Canvas({ designWidth, designHeight, zoom, blocks, selectedBlockId, onSelectBlock, onBlockMove, onBlockMoveEnd, playing = false, projectDir = '', getAssetDataUrl }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ blockId: string; startX: number; startY: number; initialPos_x: number; initialPos_y: number } | null>(null);
  const lastMovePromiseRef = useRef<Promise<void> | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, block: BlockItem) => {
      e.stopPropagation();
      onSelectBlock(block.id);
      setDragging({
        blockId: block.id,
        startX: e.clientX,
        startY: e.clientY,
        initialPos_x: block.pos_x,
        initialPos_y: block.pos_y,
      });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [onSelectBlock]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const scale = Math.max(0.01, zoom);
      const totalDeltaX = (e.clientX - dragging.startX) / scale / designWidth;
      const totalDeltaY = (e.clientY - dragging.startY) / scale / designHeight;
      const newX = Math.max(0, Math.min(1, dragging.initialPos_x + totalDeltaX));
      const newY = Math.max(0, Math.min(1, dragging.initialPos_y + totalDeltaY));
      const p = onBlockMove(dragging.blockId, newX, newY);
      if (p) lastMovePromiseRef.current = p;
    },
    [dragging, zoom, designWidth, designHeight, onBlockMove]
  );

  const handlePointerUp = useCallback(async () => {
    setDragging(null);
    if (lastMovePromiseRef.current) {
      await lastMovePromiseRef.current;
      lastMovePromiseRef.current = null;
    }
    onBlockMoveEnd?.();
  }, [onBlockMoveEnd]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: designWidth,
        height: designHeight,
        background: '#000000',
        overflow: 'hidden',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectBlock(null);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {blocks.map((block) => {
        const left = block.pos_x * designWidth - (block.scale_x * designWidth) / 2;
        const top = block.pos_y * designHeight - (block.scale_y * designHeight) / 2;
        const width = block.scale_x * designWidth;
        const height = block.scale_y * designHeight;
        const opacity = block.opacity != null ? block.opacity : 1;
        const blurPx = block.blur != null && block.blur > 0 ? block.blur : 0;
        const filterStyle = blurPx > 0 ? { filter: `blur(${blurPx}px)` as const } : undefined;
        const currentTime = block.currentTime ?? 0;
        const animState = block.animationConfig
          ? getBlockAnimationState(currentTime, block.start_time ?? 0, block.end_time ?? 0, block.animationConfig)
          : null;
        const animationClass = animState?.cssClass ? `magictime ${animState.cssClass}` : '';
        const animationStyle = animState
          ? {
              animationDuration: `${animState.duration}s`,
              ...(animState.delaySeconds != null ? { animationDelay: `${animState.delaySeconds}s` } : {}),
              ...(animState.repeatCount != null ? { animationIterationCount: animState.repeatCount } : {}),
            }
          : {};
        return (
          <div
            key={block.id}
            role="button"
            tabIndex={0}
            className="canvas-block"
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              zIndex: block.zIndex ?? 1,
              transform: `rotate(${block.rotation}deg)`,
              opacity,
              ...filterStyle,
              cursor: dragging?.blockId === block.id ? 'grabbing' : 'grab',
              boxSizing: 'border-box',
            }}
            onPointerDown={(e) => handlePointerDown(e, block)}
          >
            <div
              className={animationClass}
              style={{
                width: '100%',
                height: '100%',
                ...animationStyle,
              }}
            >
            {block.componentInfo && projectDir && getAssetDataUrl ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <GroupPreview
                  projectDir={projectDir}
                  characterId={block.componentInfo.characterId}
                  group={block.componentInfo.group}
                  tags={block.componentInfo.tags ?? []}
                  spriteSheets={block.componentInfo.spriteSheets}
                  componentGroups={block.componentInfo.componentGroups}
                  getAssetDataUrl={getAssetDataUrl}
                  size={Math.min(width, height)}
                  showCheckerboard={false}
                  selectedTagsBySpriteItemId={block.componentInfo.selectedTagsBySpriteItemId}
                  allCharactersData={block.componentInfo.allCharactersData}
                />
              </div>
            ) : block.spriteInfo && block.dataUrl ? (
              <SpriteFrame
                dataUrl={block.dataUrl}
                frame={
                  (() => {
                    const { frames, frame_count, playback_fps, start_time, end_time } = block.spriteInfo!;
                    const t = block.currentTime ?? 0;
                    const elapsed = Math.max(0, Math.min(t - start_time, end_time - start_time));
                    const idx = Math.min(
                      Math.floor(elapsed * playback_fps) % Math.max(1, frame_count),
                      frames.length - 1
                    );
                    return frames[Math.max(0, idx)] ?? frames[0] ?? { x: 0, y: 0, width: 100, height: 100 };
                  })()
                }
                width={width}
                height={height}
              />
            ) : block.dataUrl && !block.isVideo ? (
              <img src={block.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: (block.lock_aspect !== 0) ? 'contain' : 'fill', pointerEvents: 'none' }} draggable={false} />
            ) : block.dataUrl && block.isVideo ? (
              <VideoBlock
                dataUrl={block.dataUrl}
                currentTime={block.currentTime}
                startTime={block.start_time ?? 0}
                endTime={block.end_time ?? 0}
                lockAspect={block.lock_aspect}
                isTransparentVideo={block.isTransparentVideo}
                playing={playing}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                素材
              </div>
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
