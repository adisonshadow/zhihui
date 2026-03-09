/**
 * 镜头框叠加层：选中镜头块时显示红色框，支持 pan（XY）和 scale（Z），不可旋转，不超出画布（见功能文档 6.6）
 * 镜头参数：pos_x/pos_y=中心，scale_x=景深/缩放（框尺寸=画布/scale）
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { BlockItem } from './Canvas';

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

/** 镜头框：中心 pos，尺寸 = designSize/scale，无旋转 */
function cameraFrameInViewport(
  block: BlockItem,
  designWidth: number,
  designHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
) {
  const scale = Math.max(0.1, block.scale_x ?? 1);
  const w = designWidth / scale;
  const h = designHeight / scale;
  let cx = (block.pos_x ?? 0.5) * designWidth;
  let cy = (block.pos_y ?? 0.5) * designHeight;
  const halfW = w / 2;
  const halfH = h / 2;
  cx = Math.max(halfW, Math.min(designWidth - halfW, cx));
  cy = Math.max(halfH, Math.min(designHeight - halfH, cy));
  const cornersDesign = [
    { x: cx - halfW, y: cy - halfH },
    { x: cx + halfW, y: cy - halfH },
    { x: cx + halfW, y: cy + halfH },
    { x: cx - halfW, y: cy + halfH },
  ];
  const cornersScreen = cornersDesign.map((p) =>
    designToViewport(p.x, p.y, viewportWidth, viewportHeight, designWidth, designHeight, zoom)
  );
  const centerScreen = designToViewport(cx, cy, viewportWidth, viewportHeight, designWidth, designHeight, zoom);
  return { cornersScreen, centerScreen, cx, cy, w, h };
}

export interface CameraFrameOverlayProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  designWidth: number;
  designHeight: number;
  selectedBlock: BlockItem | null;
  onBlockMove: (blockId: string, newPos_x: number, newPos_y: number) => Promise<void> | void;
  onResize: (blockId: string, data: { pos_x: number; pos_y: number; scale_x: number; scale_y: number }) => Promise<void> | void;
  onDragEnd?: () => void;
}

const CAMERA_BLOCK_ASSET_ID = '__camera__';

export function CameraFrameOverlay({
  viewportRef,
  zoom,
  designWidth,
  designHeight,
  selectedBlock,
  onBlockMove,
  onResize,
  onDragEnd,
}: CameraFrameOverlayProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<
    | { type: 'move'; startX: number; startY: number; initialPos_x: number; initialPos_y: number }
    | { type: 'scale'; startX: number; startY: number; initialScale: number; initialPos_x: number; initialPos_y: number }
    | null
  >(null);
  const [scaleLive, setScaleLive] = useState<number | null>(null);
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
    setScaleLive(null);
    if (lastMovePromiseRef.current) {
      await lastMovePromiseRef.current;
      lastMovePromiseRef.current = null;
    }
    onDragEnd?.();
  }, [onDragEnd]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !selectedBlock || viewportSize.width <= 0 || viewportSize.height <= 0) return;
      if (drag.type === 'move') {
        const scale = Math.max(0.01, zoom);
        const totalDeltaX = (e.clientX - drag.startX) / scale / designWidth;
        const totalDeltaY = (e.clientY - drag.startY) / scale / designHeight;
        const scaleVal = selectedBlock.scale_x ?? 1;
        const halfW = (designWidth / scaleVal) / 2 / designWidth;
        const halfH = (designHeight / scaleVal) / 2 / designHeight;
        const newX = Math.max(halfW, Math.min(1 - halfW, drag.initialPos_x + totalDeltaX));
        const newY = Math.max(halfH, Math.min(1 - halfH, drag.initialPos_y + totalDeltaY));
        const p = onBlockMove(selectedBlock.id, newX, newY);
        if (p) lastMovePromiseRef.current = p;
      } else if (drag.type === 'scale') {
        // 以镜头中心为锚点缩放：根据拖拽后的右下角位置反推 scale，中心保持不变
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerX = drag.initialPos_x * designWidth;
        const centerY = drag.initialPos_y * designHeight;
        const { x: cursorX, y: cursorY } = viewportToDesign(
          e.clientX - rect.left,
          e.clientY - rect.top,
          viewportSize.width,
          viewportSize.height,
          designWidth,
          designHeight,
          zoom
        );
        const dx = Math.max(0.01, cursorX - centerX);
        const dy = Math.max(0.01, cursorY - centerY);
        // 保持画布宽高比，取两轴 scale 的平均（或较小值以不超出画布）
        const scaleFromX = designWidth / (2 * dx);
        const scaleFromY = designHeight / (2 * dy);
        const newScale = Math.max(0.1, Math.min(5, (scaleFromX + scaleFromY) / 2));
        const halfW = (designWidth / newScale) / 2 / designWidth;
        const halfH = (designHeight / newScale) / 2 / designHeight;
        const pos_x = Math.max(halfW, Math.min(1 - halfW, drag.initialPos_x));
        const pos_y = Math.max(halfH, Math.min(1 - halfH, drag.initialPos_y));
        setScaleLive(newScale);
        const p = onResize(selectedBlock.id, { pos_x, pos_y, scale_x: newScale, scale_y: newScale });
        if (p) lastMovePromiseRef.current = p;
      }
    },
    [drag, selectedBlock, zoom, designWidth, designHeight, viewportSize, viewportRef, onBlockMove, onResize]
  );

  const isCameraBlock = selectedBlock && (selectedBlock as { asset_id?: string }).asset_id === CAMERA_BLOCK_ASSET_ID;
  if (!selectedBlock || !isCameraBlock || viewportSize.width <= 0 || viewportSize.height <= 0) return null;

  const scaleVal = scaleLive ?? (selectedBlock.scale_x ?? 1);
  const w = designWidth / scaleVal;
  const h = designHeight / scaleVal;
  let cx = (selectedBlock.pos_x ?? 0.5) * designWidth;
  let cy = (selectedBlock.pos_y ?? 0.5) * designHeight;
  const halfW = w / 2;
  const halfH = h / 2;
  cx = Math.max(halfW, Math.min(designWidth - halfW, cx));
  cy = Math.max(halfH, Math.min(designHeight - halfH, cy));

  const { cornersScreen } = cameraFrameInViewport(
    { ...selectedBlock, scale_x: scaleVal, pos_x: cx / designWidth, pos_y: cy / designHeight },
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
      initialPos_x: selectedBlock.pos_x ?? 0.5,
      initialPos_y: selectedBlock.pos_y ?? 0.5,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerDownScale = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      type: 'scale',
      startX: e.clientX,
      startY: e.clientY,
      initialScale: selectedBlock.scale_x ?? 1,
      initialPos_x: selectedBlock.pos_x ?? 0.5,
      initialPos_y: selectedBlock.pos_y ?? 0.5,
    });
    // 在父元素上 capture，使 onPointerMove 能收到拖拽事件
    (e.target as HTMLElement).parentElement?.setPointerCapture?.(e.pointerId);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: viewportLeft + (cx - halfW) * zoom,
          top: viewportTop + (cy - halfH) * zoom,
          width: w * zoom,
          height: h * zoom,
          border: '2px solid #ff4d4f',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          cursor: 'move',
        }}
        onPointerDown={handlePointerDownMove}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: '#ff4d4f',
            cursor: 'nwse-resize',
          }}
          onPointerDown={handlePointerDownScale}
        />
      </div>
    </div>
  );
}
