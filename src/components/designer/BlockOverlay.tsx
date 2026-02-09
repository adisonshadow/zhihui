/**
 * 素材条拖拽时的预览组件（用于 DragOverlay）
 */
import React from 'react';

interface BlockOverlayProps {
  width: number;
  height: number;
}

export function BlockOverlay({ width, height }: BlockOverlayProps) {
  return (
    <div
      style={{
        width,
        height,
        background: 'rgba(23,119,255,0.6)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    />
  );
}
