/**
 * 非主轨道素材条：useDraggable（见功能文档 6.7，非主轨道可自由放置）
 * 音效/音乐条使用 WavesurferPlayer 显示波形，无需支持播放
 * 动画标记：出现靠左靠下、动作靠左靠上、消失靠右靠下，线段长度与动画时长一致
 */
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import WavesurferPlayer from '@wavesurfer/react';
import { getTimelineAnimationSegments } from '@/utils/timelineAnimationSegments';
import { CAMERA_BLOCK_ASSET_ID } from '@/constants/project';

interface KeyframeRow {
  id: string;
  block_id: string;
  time: number;
}

interface TimelineBlockDraggableProps {
  block: { id: string; layer_id: string; asset_id?: string | null; start_time: number; end_time: number; animation_config?: string | null; state_keyframes?: string | null };
  keyframes: KeyframeRow[];
  trackRowHeight: number;
  timeToX: (t: number) => number;
  currentTime: number;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onResizeBlock: (blockId: string, edge: 'left' | 'right', start: number, end: number, layerId: string) => void;
  onKeyframeClick?: (time: number) => void;
  /** 摄像机块不可 resize */
  resizable?: boolean;
  /** 镜头块不可拖动 */
  draggable?: boolean;
  /** 音效/音乐：音频 data URL，用于显示波形（无播放） */
  audioUrl?: string | null;
  /** 视频/精灵图原始时长（秒），超出时在素材条上显示循环分隔线 */
  nativeDuration?: number;
}

export function TimelineBlockDraggable({
  block,
  keyframes,
  trackRowHeight,
  timeToX,
  currentTime,
  selectedBlockId,
  onSelectBlock,
  onResizeBlock,
  onKeyframeClick,
  resizable = true,
  draggable = true,
  audioUrl,
  nativeDuration,
}: TimelineBlockDraggableProps) {
  const left = timeToX(block.start_time);
  const width = Math.max(12, timeToX(block.end_time - block.start_time));
  const resizerW = 4;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { blockId: block.id, layerId: block.layer_id },
    disabled: !draggable,
  });

  const isCameraBlock = block.asset_id === CAMERA_BLOCK_ASSET_ID;
  const style: React.CSSProperties = {
    position: 'absolute',
    left,
    top: 4,
    width,
    marginLeft: 1,
    height: trackRowHeight - 8,
    borderLeft: isCameraBlock ? '2px solid rgba(255,77,79,0.8)' : '1px solid rgb(23, 23, 23)',
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    background: isCameraBlock
      ? (isDragging ? 'rgba(255,77,79,0.5)' : selectedBlockId === block.id ? 'rgba(255,77,79,0.4)' : 'rgba(255,77,79,0.2)')
      : (isDragging ? 'rgba(23,119,255,0.5)' : selectedBlockId === block.id ? 'rgba(23,119,255,0.4)' : 'rgba(255,255,255,0.15)'),
    borderRadius: 4,
    cursor: 'pointer',
    opacity: isDragging ? 0.8 : 1,
  };

  const animSegments = (() => {
    try {
      const raw = block.animation_config;
      if (!raw) return { segments: [], hasAny: false };
      const cfg = JSON.parse(raw) as { appear?: { duration?: number }; action?: { duration?: number; repeatCount?: number }; disappear?: { duration?: number } };
      return getTimelineAnimationSegments(block.start_time, block.end_time, cfg);
    } catch {
      return { segments: [], hasAny: false };
    }
  })();

  const stateKeyframeTimes = (() => {
    try {
      const raw = block.state_keyframes;
      if (!raw?.trim()) return [];
      const arr = JSON.parse(raw) as { time?: number }[];
      return Array.isArray(arr) ? arr.map((k) => k.time).filter((t): t is number => typeof t === 'number').sort((a, b) => a - b) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); }}
      className={animSegments.hasAny ? 'timeline-block-draggable timeline-block-draggable--has-animation' : 'timeline-block-draggable'}
    >
      {animSegments.segments.map((seg) => (
        <div
          key={seg.type}
          className={`timeline-block-draggable__animation-indicator timeline-block-draggable__animation-indicator--${seg.type}`}
          style={{
            position: 'absolute',
            left: `${seg.leftPct}%`,
            width: `${seg.widthPct}%`,
            [seg.position]: 0,
            height: 2,
            background: 'rgba(255,122,0,0.9)',
            borderRadius: seg.position === 'top' ? '2px 2px 0 0' : '0 0 2px 2px',
            pointerEvents: 'none',
          }}
          aria-hidden
        />
      ))}
      {audioUrl ? (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 4, pointerEvents: 'none' }}>
          <WavesurferPlayer
            url={audioUrl}
            height={trackRowHeight - 8}
            waveColor="rgba(255,255,255,0.4)"
            progressColor="rgba(100,150,255,0.6)"
            interact={false}
          />
        </div>
      ) : null}
      {/* 视频/精灵图循环分隔线：block 时长超出原始素材时长时显示 */}
      {nativeDuration && nativeDuration > 0 && (block.end_time - block.start_time) > nativeDuration + 0.1 && (
        Array.from({ length: Math.ceil((block.end_time - block.start_time) / nativeDuration) - 1 }).map((_, i) => {
          const loopTime = block.start_time + nativeDuration * (i + 1);
          const pct = ((loopTime - block.start_time) / (block.end_time - block.start_time)) * 100;
          if (pct <= 0 || pct >= 100) return null;
          return (
            <div
              key={`loop_${i}`}
              aria-hidden
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.35)',
                pointerEvents: 'none',
              }}
            />
          );
        })
      )}
      {resizable && (
        <>
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: resizerW, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeBlock(block.id, 'left', block.start_time, block.end_time, block.layer_id); }}
          />
          <div
            style={{ position: 'absolute', right: 0, top: 0, width: resizerW, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeBlock(block.id, 'right', block.start_time, block.end_time, block.layer_id); }}
          />
        </>
      )}
      {selectedBlockId === block.id && [...new Set(keyframes.map((k) => k.time))].map((time) => {
        const blockDur = Math.max(0.001, block.end_time - block.start_time);
        const pct = Math.max(0, Math.min(100, ((time - block.start_time) / blockDur) * 100));
        const isSelected = Math.abs(timeToX(currentTime) - timeToX(time)) < 10;
        return (
          <div
            key={`t_${time}`}
            role="button"
            title={`${time.toFixed(1)}s`}
            style={{
              position: 'absolute',
              left: `max(0px, calc(${pct}% - 4px))`,
              top: '50%',
              marginTop: -4,
              width: 8,
              height: 8,
              transform: 'rotate(45deg)',
              background: isSelected ? 'rgba(0,229,255,0.9)' : 'rgba(250,173,20,0.9)',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
            onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); onKeyframeClick?.(time); }}
          />
        );
      })}
      {stateKeyframeTimes.length > 0 && (
        <>
          {stateKeyframeTimes.map((time) => {
            const blockDur = Math.max(0.001, block.end_time - block.start_time);
            const pct = Math.max(0, Math.min(100, ((time - block.start_time) / blockDur) * 100));
            const isSelected = Math.abs(timeToX(currentTime) - timeToX(time)) < 10;
            return (
              <div
                key={`sk_${time}`}
                role="button"
                title={`状态 ${time.toFixed(1)}s`}
                style={{
                  position: 'absolute',
                  left: `max(0px, calc(${pct}% - 4px))`,
                  bottom: 0,
                  width: 8,
                  height: 8,
                  transform: 'rotate(45deg)',
                  background: isSelected ? 'rgba(82,196,26,0.95)' : 'rgba(82,196,26,0.7)',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
                onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); onKeyframeClick?.(time); }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
