/**
 * DOM 画布：尺寸与项目横竖屏一致，素材位置/缩放/旋转归一化存储、渲染时换算为 px（见技术文档 4.2、开发计划 2.10）
 */
import React, { useRef, useCallback, useState } from 'react';

export interface BlockItem {
  id: string;
  layer_id: string;
  asset_id: string | null;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  dataUrl: string | null;
  isVideo?: boolean;
  /** 等比缩放：1=等比，0=自由；画布 resize 时据此决定是否拉伸到区域 */
  lock_aspect?: number;
  /** 关键帧插值效果（见功能文档 6.8） */
  opacity?: number;
  blur?: number;
  color?: string;
  /** 画布渲染 z-index（自动管理：分层从上到下越高，同层素材越靠后越高，见功能文档 6.7） */
  zIndex?: number;
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
}

export function Canvas({ designWidth, designHeight, zoom, blocks, selectedBlockId, onSelectBlock, onBlockMove, onBlockMoveEnd }: CanvasProps) {
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
        return (
          <div
            key={block.id}
            role="button"
            tabIndex={0}
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
              border: '1px solid rgba(255,255,255,0.2)',
              boxSizing: 'border-box',
            }}
            onPointerDown={(e) => handlePointerDown(e, block)}
          >
            {block.dataUrl && !block.isVideo ? (
              <img src={block.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: (block.lock_aspect !== 0) ? 'contain' : 'fill', pointerEvents: 'none' }} draggable={false} />
            ) : block.dataUrl && block.isVideo ? (
              <video src={block.dataUrl} style={{ width: '100%', height: '100%', objectFit: (block.lock_aspect !== 0) ? 'contain' : 'fill', pointerEvents: 'none' }} muted playsInline />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                素材
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
