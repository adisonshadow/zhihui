/**
 * 轨道 droppable 容器（见功能文档 6.7）
 */
import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface TrackDroppableProps {
  id: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onDragOverNative?: (e: React.DragEvent) => void;
  onDragLeaveNative?: () => void;
  onDropNative?: (e: React.DragEvent) => void;
}

export function TrackDroppable({
  id,
  children,
  style,
  onClick,
  onDragOverNative,
  onDragLeaveNative,
  onDropNative,
}: TrackDroppableProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isOver ? 'rgba(23,119,255,0.08)' : undefined,
      }}
      onClick={onClick}
      onDragOver={onDragOverNative}
      onDragLeave={onDragLeaveNative}
      onDrop={onDropNative}
    >
      {children}
    </div>
  );
}
