/**
 * 轨道之间的 drop zone，用于创建新分层（见功能文档 6.7）
 * 使用 useDroppable 以接收 @dnd-kit 拖拽的素材条
 * 用于轨道区域（timeline-tracks-container）内，不含左侧标记头
 */
import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface BetweenDropZoneProps {
  id: string;
  height: number;
  minWidth: number;
  isHighlighted: boolean;
  onDragOverNative?: (e: React.DragEvent) => void;
  onDragLeaveNative?: () => void;
  onDropNative?: (e: React.DragEvent) => void;
  /** 点击空白处移动时间轴到点击位置；亦用于取消选中素材 */
  onClickNative?: (e: React.MouseEvent) => void;
}

export function BetweenDropZone({
  id,
  height,
  minWidth,
  isHighlighted,
  onDragOverNative,
  onDragLeaveNative,
  onDropNative,
  onClickNative,
}: BetweenDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const showHighlight = isHighlighted || isOver;

  return (
    <div
      ref={setNodeRef}
      className="timeline-between-drop-zone"
      draggable={false}
      style={{
        height,
        minWidth,
        background: showHighlight ? 'rgba(23,119,255,0.2)' : 'transparent',
        borderRadius: 2,
      }}
      onDragOver={onDragOverNative}
      onDragLeave={onDragLeaveNative}
      onDrop={onDropNative}
      onClick={onClickNative}
    />
  );
}
