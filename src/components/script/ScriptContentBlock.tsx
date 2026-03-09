/**
 * 剧本时间线内容条：可拖拽、可调整左右边缘
 */
import React, { useCallback, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { SceneContentItem } from '@/types/script';
import { SCENE_CONTENT_TYPE_LABELS } from '@/types/script';

interface ScriptContentBlockProps {
  block: SceneContentItem;
  timeToX: (t: number) => number;
  trackHeight: number;
  selected: boolean;
  onSelect: () => void;
  onResize: (edge: 'left' | 'right', start: number, end: number) => void;
  isDragging?: boolean;
}

function getBlockPreviewText(block: SceneContentItem): string {
  if (block.type === 'dialogue' || block.type === 'narration') {
    const t = (block.text ?? '').slice(0, 12);
    return t ? (t.length >= 12 ? t + '…' : t) : '(空)';
  }
  if (block.description) {
    const d = block.description.slice(0, 12);
    return d.length >= 12 ? d + '…' : d;
  }
  return SCENE_CONTENT_TYPE_LABELS[block.type];
}

export function ScriptContentBlock({
  block,
  timeToX,
  trackHeight,
  selected,
  onSelect,
  onResize,
  isDragging,
}: ScriptContentBlockProps) {
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: block.id,
    data: { block },
    disabled: !!resizing,
  });

  const left = timeToX(block.startTime);
  const width = Math.max(24, timeToX(block.endTime - block.startTime));

  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent, edge: 'left' | 'right') => {
      e.stopPropagation();
      e.preventDefault();
      setResizing(edge);
      const startX = e.clientX;
      const startPointerId = e.pointerId;
      const startStart = block.startTime;
      const startEnd = block.endTime;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== startPointerId) return;
        const deltaPx = ev.clientX - startX;
        const deltaT = deltaPx / 40;
        if (edge === 'left') {
          const newStart = Math.max(0, Math.min(startStart + deltaT, startEnd - 0.5));
          onResize('left', newStart, startEnd);
        } else {
          const newEnd = Math.max(startStart + 0.5, startEnd + deltaT);
          onResize('right', startStart, newEnd);
        }
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== startPointerId) return;
        setResizing(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [block, onResize]
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left,
        top: 2,
        width,
        height: trackHeight - 4,
        marginLeft: 1,
        transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
        background: isDragging ? 'rgba(23,119,255,0.5)' : selected ? 'rgba(23,119,255,0.4)' : 'rgba(255,255,255,0.2)',
        borderRadius: 4,
        border: '1px solid rgba(255,255,255,0.2)',
        cursor: resizing ? 'ew-resize' : 'grab',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        fontSize: 11,
        color: 'rgba(255,255,255,0.9)',
      }}
      {...(resizing ? {} : { ...attributes, ...listeners })}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div
        onPointerDown={(e) => handlePointerDownResize(e, 'left')}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          flexShrink: 0,
          touchAction: 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          padding: '0 8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {getBlockPreviewText(block)}
      </span>
      <div
        onPointerDown={(e) => handlePointerDownResize(e, 'right')}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          flexShrink: 0,
          touchAction: 'none',
        }}
      />
    </div>
  );
}
