/**
 * 主轨道素材条：useSortable，水平排序（见功能文档 6.7）
 * 动画标记：出现靠左靠下、动作靠左靠上、消失靠右靠下，线段长度与动画时长一致
 */
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getTimelineAnimationSegments } from '@/utils/timelineAnimationSegments';

interface KeyframeRow {
  id: string;
  block_id: string;
  time: number;
}

interface TimelineBlockSortableProps {
  block: { id: string; layer_id: string; start_time: number; end_time: number; animation_config?: string | null };
  keyframes: KeyframeRow[];
  trackRowHeight: number;
  timeToX: (t: number) => number;
  currentTime: number;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onResizeBlock: (blockId: string, edge: 'left' | 'right', start: number, end: number, layerId: string) => void;
  onKeyframeClick?: (time: number) => void;
  /** 精灵图不可 resize */
  resizable?: boolean;
}

export function TimelineBlockSortable({
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
}: TimelineBlockSortableProps) {
  const left = timeToX(block.start_time);
  const width = Math.max(12, timeToX(block.end_time - block.start_time));
  const resizerW = 4;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { blockId: block.id, layerId: block.layer_id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'absolute' as const,
    left,
    top: 4,
    width,
    marginLeft: 1,
    height: trackRowHeight - 8,
    borderLeft: '1px solid rgb(23, 23, 23)',
    background: isDragging ? 'rgba(23,119,255,0.5)' : selectedBlockId === block.id ? 'rgba(23,119,255,0.4)' : 'rgba(255,255,255,0.15)',
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); }}
      className={animSegments.hasAny ? 'timeline-block-sortable timeline-block-sortable--has-animation' : 'timeline-block-sortable'}
    >
      {animSegments.segments.map((seg) => (
        <div
          key={seg.type}
          className={`timeline-block-sortable__animation-indicator timeline-block-sortable__animation-indicator--${seg.type}`}
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
      {resizable && (
        <>
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: resizerW, height: '100%', cursor: 'ew-resize' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeBlock(block.id, 'left', block.start_time, block.end_time, block.layer_id); }}
          />
          <div
            style={{ position: 'absolute', right: 0, top: 0, width: resizerW, height: '100%', cursor: 'ew-resize' }}
            onClick={(e) => e.stopPropagation()}
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
    </div>
  );
}
