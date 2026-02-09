/**
 * 画布选中态叠加层：选中框、四角缩放把手、底部旋转把手（参考图）
 * 在缩放层外渲染，使用视口坐标 + 固定像素把手，避免舞台缩小后无法点选（见功能文档 6.8）
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UndoOutlined } from '@ant-design/icons';
import type { BlockItem } from './Canvas';

const HANDLE_RADIUS = 7;
const ROTATION_HANDLE_OFFSET = 28;
const ROTATION_ICON_SIZE = 20;
const BOX_BORDER = 2;

function designToViewport(
  designX: number,
  designY: number,
  viewportWidth: number,
  viewportHeight: number,
  designWidth: number,
  designHeight: number,
  zoom: number
): { x: number; y: number } {
  const viewportLeft = (viewportWidth - designWidth * zoom) / 2;
  const viewportTop = (viewportHeight - designHeight * zoom) / 2;
  return {
    x: viewportLeft + designX * zoom,
    y: viewportTop + designY * zoom,
  };
}

function viewportToDesign(
  viewportX: number,
  viewportY: number,
  viewportWidth: number,
  viewportHeight: number,
  designWidth: number,
  designHeight: number,
  zoom: number
): { x: number; y: number } {
  const viewportLeft = (viewportWidth - designWidth * zoom) / 2;
  const viewportTop = (viewportHeight - designHeight * zoom) / 2;
  return {
    x: (viewportX - viewportLeft) / zoom,
    y: (viewportY - viewportTop) / zoom,
  };
}

/** 块在设计稿中的包围盒（中心 + 半宽高 + 旋转），用于计算四角与旋转把手位置 */
function blockCornersInViewport(
  block: BlockItem,
  designWidth: number,
  designHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
) {
  const cx = block.pos_x * designWidth;
  const cy = block.pos_y * designHeight;
  const w = block.scale_x * designWidth;
  const h = block.scale_y * designHeight;
  const r = (block.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const w2 = w / 2;
  const h2 = h / 2;
  const cornersDesign = [
    { x: cx - w2 * cos + h2 * sin, y: cy - w2 * sin - h2 * cos },
    { x: cx + w2 * cos + h2 * sin, y: cy + w2 * sin - h2 * cos },
    { x: cx + w2 * cos - h2 * sin, y: cy + w2 * sin + h2 * cos },
    { x: cx - w2 * cos - h2 * sin, y: cy - w2 * sin + h2 * cos },
  ];
  const cornersScreen = cornersDesign.map((p) =>
    designToViewport(p.x, p.y, viewportWidth, viewportHeight, designWidth, designHeight, zoom)
  );
  const centerScreen = designToViewport(cx, cy, viewportWidth, viewportHeight, designWidth, designHeight, zoom);
  const bottomCenterDesign = { x: cx - h2 * sin, y: cy + h2 * cos };
  const bottomCenterScreen = designToViewport(
    bottomCenterDesign.x,
    bottomCenterDesign.y,
    viewportWidth,
    viewportHeight,
    designWidth,
    designHeight,
    zoom
  );
  const downX = -sin;
  const downY = cos;
  const rotationHandleScreen = {
    x: bottomCenterScreen.x + downX * ROTATION_HANDLE_OFFSET,
    y: bottomCenterScreen.y + downY * ROTATION_HANDLE_OFFSET,
  };
  return { cornersScreen, centerScreen, rotationHandleScreen, cx, cy, w, h, r, cos, sin };
}

export interface CanvasSelectionOverlayProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  designWidth: number;
  designHeight: number;
  selectedBlock: BlockItem | null;
  onResize: (blockId: string, data: { pos_x: number; pos_y: number; scale_x: number; scale_y: number }) => Promise<void> | void;
  onRotate: (blockId: string, rotation: number) => Promise<void> | void;
  onBlockMove: (blockId: string, newPos_x: number, newPos_y: number) => Promise<void> | void;
  /** 拖拽结束（pointer up）时调用，用于刷新数据并同步到设置面板 */
  onDragEnd?: () => void;
}

export function CanvasSelectionOverlay({
  viewportRef,
  zoom,
  designWidth,
  designHeight,
  selectedBlock,
  onResize,
  onRotate,
  onBlockMove,
  onDragEnd,
}: CanvasSelectionOverlayProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<
    | { type: 'move'; startX: number; startY: number; initialPos_x: number; initialPos_y: number }
    | { type: 'resize'; cornerIndex: number; startX: number; startY: number; fixedCorner: { x: number; y: number }; initialW: number; initialH: number }
    | { type: 'rotate'; startAngle: number; startRotation: number }
    | null
  >(null);
  /** resize 拖拽时的实时尺寸（设计空间），避免依赖异步 block 更新导致的显示跳变 */
  const [resizeLive, setResizeLive] = useState<{ w: number; h: number; cx: number; cy: number } | null>(null);
  const lastMovePromiseRef = useRef<Promise<void> | null>(null);

  const measureViewport = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setViewportSize({ width, height });
  }, [viewportRef]);

  useEffect(() => {
    measureViewport();
    const ro = new ResizeObserver(measureViewport);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [measureViewport, viewportRef]);

  const onPointerUp = useCallback(async () => {
    setDrag(null);
    setResizeLive(null);
    if (lastMovePromiseRef.current) {
      await lastMovePromiseRef.current;
      lastMovePromiseRef.current = null;
    }
    onDragEnd?.();
  }, [onDragEnd]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !selectedBlock || viewportSize.width <= 0 || viewportSize.height <= 0) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      if (drag.type === 'move') {
        const scale = Math.max(0.01, zoom);
        const totalDeltaX = (e.clientX - drag.startX) / scale / designWidth;
        const totalDeltaY = (e.clientY - drag.startY) / scale / designHeight;
        const newX = Math.max(0, Math.min(1, drag.initialPos_x + totalDeltaX));
        const newY = Math.max(0, Math.min(1, drag.initialPos_y + totalDeltaY));
        const p = onBlockMove(selectedBlock.id, newX, newY);
        if (p) lastMovePromiseRef.current = p;
      } else if (drag.type === 'resize') {
        const newCorner = viewportToDesign(
          vx,
          vy,
          viewportSize.width,
          viewportSize.height,
          designWidth,
          designHeight,
          zoom
        );
        const fx = drag.fixedCorner.x;
        const fy = drag.fixedCorner.y;
        const nx = newCorner.x;
        const ny = newCorner.y;
        const midX = (fx + nx) / 2;
        const midY = (fy + ny) / 2;
        const dx = (nx - fx) / 2;
        const dy = (ny - fy) / 2;
        const { cos, sin } = blockCornersInViewport(
          selectedBlock,
          designWidth,
          designHeight,
          viewportSize.width,
          viewportSize.height,
          zoom
        );
        const w2 = dx * cos + dy * sin;
        const h2 = -dx * sin + dy * cos;
        const minSize = Math.max(4, Math.min(designWidth, designHeight) * 0.02);
        let newW = Math.max(minSize, Math.abs(w2) * 2);
        let newH = Math.max(minSize, Math.abs(h2) * 2);
        const lockAspect = (selectedBlock as { lock_aspect?: number }).lock_aspect !== 0;
        if (lockAspect && drag.type === 'resize' && 'initialW' in drag) {
          const { initialW, initialH } = drag;
          const aspect = initialH > 1e-6 ? initialW / initialH : 1;
          if (aspect > 1e-6) {
            if (newH < 1e-6) newH = minSize;
            if (newW / newH > aspect) {
              newW = newH * aspect;
            } else {
              newH = newW / aspect;
            }
            newW = Math.max(minSize, newW);
            newH = Math.max(minSize, newH);
          }
        }
        const pos_x = Math.max(0, Math.min(1, midX / designWidth));
        const pos_y = Math.max(0, Math.min(1, midY / designHeight));
        const scale_x = Math.max(0.01, Math.min(2, newW / designWidth));
        const scale_y = Math.max(0.01, Math.min(2, newH / designHeight));
        setResizeLive({ w: newW, h: newH, cx: midX, cy: midY });
        const p = onResize(selectedBlock.id, { pos_x, pos_y, scale_x, scale_y });
        if (p) lastMovePromiseRef.current = p;
        setDrag({ ...drag, startX: e.clientX, startY: e.clientY, fixedCorner: drag.fixedCorner, initialW: drag.initialW, initialH: drag.initialH });
      } else if (drag.type === 'rotate') {
        const { centerScreen } = blockCornersInViewport(
          selectedBlock,
          designWidth,
          designHeight,
          viewportSize.width,
          viewportSize.height,
          zoom
        );
        const dx = vx - centerScreen.x;
        const dy = vy - centerScreen.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        let delta = angle - drag.startAngle;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const rotation = drag.startRotation + delta;
        const p = onRotate(selectedBlock.id, rotation);
        if (p) lastMovePromiseRef.current = p;
      }
    },
    [
      drag,
      selectedBlock,
      zoom,
      designWidth,
      designHeight,
      viewportSize,
      viewportRef,
      onBlockMove,
      onResize,
      onRotate,
    ]
  );

  if (!selectedBlock || viewportSize.width <= 0 || viewportSize.height <= 0) return null;

  const { cornersScreen, centerScreen, rotationHandleScreen, cx, cy, w, h } = blockCornersInViewport(
    selectedBlock,
    designWidth,
    designHeight,
    viewportSize.width,
    viewportSize.height,
    zoom
  );

  const viewportLeft = (viewportSize.width - designWidth * zoom) / 2;
  const viewportTop = (viewportSize.height - designHeight * zoom) / 2;

  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      initialPos_x: selectedBlock.pos_x,
      initialPos_y: selectedBlock.pos_y,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerDownResize = (e: React.PointerEvent, cornerIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fixedIndex = (cornerIndex + 2) % 4;
    const fixedDesign = viewportToDesign(
      cornersScreen[fixedIndex].x,
      cornersScreen[fixedIndex].y,
      viewportSize.width,
      viewportSize.height,
      designWidth,
      designHeight,
      zoom
    );
    const initialW = w;
    const initialH = h;
    setResizeLive({ w: initialW, h: initialH, cx, cy });
    setDrag({
      type: 'resize',
      cornerIndex,
      startX: e.clientX,
      startY: e.clientY,
      fixedCorner: fixedDesign,
      initialW,
      initialH,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerDownRotate = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const dx = vx - centerScreen.x;
    const dy = vy - centerScreen.y;
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    setDrag({ type: 'rotate', startAngle, startRotation: selectedBlock.rotation });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const displayW = drag?.type === 'resize' && resizeLive ? resizeLive.w : w;
  const displayH = drag?.type === 'resize' && resizeLive ? resizeLive.h : h;
  const displayCx = drag?.type === 'resize' && resizeLive ? resizeLive.cx : cx;
  const displayCy = drag?.type === 'resize' && resizeLive ? resizeLive.cy : cy;
  const boxLeft = viewportLeft + (displayCx - displayW / 2) * zoom;
  const boxTop = viewportTop + (displayCy - displayH / 2) * zoom;
  const boxWidth = displayW * zoom;
  const boxHeight = displayH * zoom;

  const pointerHandlers = { onPointerMove, onPointerUp, onPointerLeave: onPointerUp };

  const cornerClassNames = ['canvas-resize-handle--top-left', 'canvas-resize-handle--top-right', 'canvas-resize-handle--bottom-right', 'canvas-resize-handle--bottom-left'];

  return (
    <div
      className="canvas-selection-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {/* 白边选中框（与素材同位置同缩放）；仅框与把手可点，其余点击穿透到画布 */}
      <div
        className="canvas-selection-box"
        style={{
          position: 'absolute',
          left: boxLeft,
          top: boxTop,
          width: boxWidth,
          height: boxHeight,
          border: `${BOX_BORDER}px solid #fff`,
          boxSizing: 'border-box',
          transform: `rotate(${selectedBlock.rotation}deg)`,
          transformOrigin: 'center center',
          cursor: drag?.type === 'move' ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
        }}
        onPointerDown={handlePointerDownMove}
        {...pointerHandlers}
      />
      {/* 四角缩放把手：固定像素大小，不随舞台缩放 */}
      {cornersScreen.map((pos, i) => (
        <div
          key={i}
          className={`canvas-resize-handle ${cornerClassNames[i] ?? ''}`}
          role="button"
          tabIndex={0}
          style={{
            position: 'absolute',
            left: pos.x - HANDLE_RADIUS,
            top: pos.y - HANDLE_RADIUS,
            width: HANDLE_RADIUS * 2,
            height: HANDLE_RADIUS * 2,
            borderRadius: '50%',
            background: 'rgba(220,220,220,0.95)',
            border: '1px solid rgba(0,0,0,0.3)',
            cursor: i === 0 ? 'nwse-resize' : i === 1 ? 'nesw-resize' : i === 2 ? 'nwse-resize' : 'nesw-resize',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => handlePointerDownResize(e, i)}
          {...pointerHandlers}
        />
      ))}
      {/* 底部旋转把手：白底黑边 + 旋转图标 */}
      <div
        className="canvas-rotation-handle"
        role="button"
        tabIndex={0}
        style={{
          position: 'absolute',
          left: rotationHandleScreen.x - ROTATION_ICON_SIZE / 2,
          top: rotationHandleScreen.y - ROTATION_ICON_SIZE / 2,
          width: ROTATION_ICON_SIZE,
          height: ROTATION_ICON_SIZE,
          borderRadius: '50%',
          background: '#fff',
          border: '2px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          color: '#333',
          pointerEvents: 'auto',
        }}
        onPointerDown={handlePointerDownRotate}
        {...pointerHandlers}
      >
        <UndoOutlined style={{ fontSize: 12 }} />
      </div>
    </div>
  );
}
