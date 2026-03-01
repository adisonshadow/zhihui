/**
 * 通用变换叠加层：选中框、四角缩放把手、底部旋转把手
 * 支持拖拽移动、resize、旋转，使用 resizeLive 避免异步更新导致的显示跳变
 * 参考 CanvasSelectionOverlay，可复用于设计器画布、元件画板等
 */
import React, { useState, useCallback, useRef } from 'react';

const HANDLE_RADIUS = 7;
const ROTATION_HANDLE_OFFSET = 28;
const ROTATION_ICON_SIZE = 20;
const BOX_BORDER = 2;

/** 变换项：中心归一化、尺寸比例、旋转、可选水平翻转 */
export interface TransformItem {
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  flip_x?: boolean;
}

/** 设计坐标转叠加层坐标 */
export type DesignToScreen = (designX: number, designY: number) => { x: number; y: number };

/** 屏幕坐标转设计坐标（用于 pointer 事件） */
export type ScreenToDesign = (clientX: number, clientY: number) => { x: number; y: number };

export interface TransformOverlayProps {
  /** 设计画布尺寸（如 1024） */
  designSize: number;
  /** 设计坐标转叠加层坐标 */
  designToScreen: DesignToScreen;
  /** 屏幕坐标转设计坐标 */
  screenToDesign: ScreenToDesign;
  /** 当前选中的变换项 */
  item: TransformItem;
  onMove: (pos_x: number, pos_y: number) => void;
  onResize: (data: { pos_x: number; pos_y: number; scale_x: number; scale_y: number }) => void;
  onRotate: (rotation: number) => void;
  onDragEnd?: () => void;
  /** 最小尺寸（设计空间像素） */
  minSize?: number;
  /** 最大 scale */
  maxScale?: number;
  /** 等比例缩放（scale_x = scale_y），用于元件、精灵图 */
  uniformScale?: boolean;
}

/** 点 P 关于过 C 且方向为 D 的直线的反射（D 为单位向量） */
function reflectPoint(px: number, py: number, cx: number, cy: number, dx: number, dy: number): { x: number; y: number } {
  const dot = (px - cx) * dx + (py - cy) * dy;
  return { x: px - 2 * dot * dx, y: py - 2 * dot * dy };
}

/** 从 (cx, cy, w, h, rotation) 计算四角设计坐标；flip_x 时沿旋转后的局部 y 轴反射 */
function cornersFromBox(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotation: number,
  flip_x: boolean
): { x: number; y: number }[] {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const w2 = w / 2;
  const h2 = h / 2;
  let corners = [
    { x: cx - w2 * cos + h2 * sin, y: cy - w2 * sin - h2 * cos },
    { x: cx + w2 * cos + h2 * sin, y: cy + w2 * sin - h2 * cos },
    { x: cx + w2 * cos - h2 * sin, y: cy + w2 * sin + h2 * cos },
    { x: cx - w2 * cos - h2 * sin, y: cy - w2 * sin + h2 * cos },
  ];
  if (flip_x) {
    const dx = -sin;
    const dy = cos;
    corners = corners.map((c) => reflectPoint(c.x, c.y, cx, cy, dx, dy));
  }
  return corners;
}

/** 从 (cx, cy, w, h, rotation) 计算底部中心与旋转把手设计坐标；flip_x 时沿局部 y 轴反射 */
function rotationHandleFromBox(
  cx: number,
  cy: number,
  h: number,
  rotation: number,
  flip_x: boolean
): { x: number; y: number } {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const h2 = h / 2;
  let bottomCenter = { x: cx - h2 * sin, y: cy + h2 * cos };
  if (flip_x) {
    bottomCenter = reflectPoint(bottomCenter.x, bottomCenter.y, cx, cy, -sin, cos);
  }
  const downX = -sin;
  const downY = cos;
  const offset = flip_x ? -ROTATION_HANDLE_OFFSET : ROTATION_HANDLE_OFFSET;
  return {
    x: bottomCenter.x + downX * offset,
    y: bottomCenter.y + downY * offset,
  };
}

export function TransformOverlay({
  designSize,
  designToScreen,
  screenToDesign,
  item,
  onMove,
  onResize,
  onRotate,
  onDragEnd,
  minSize = 20,
  maxScale = 1,
  uniformScale = false,
}: TransformOverlayProps) {
  const flip_x = item.flip_x ?? false;
  const cx = item.pos_x * designSize;
  const cy = item.pos_y * designSize;
  const w = item.scale_x * designSize;
  const h = item.scale_y * designSize;
  const r = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  const [drag, setDrag] = useState<
    | { type: 'move'; startX: number; startY: number; initPos_x: number; initPos_y: number }
    | {
        type: 'resize';
        cornerIndex: number;
        fixed: { x: number; y: number };
        initialW: number;
        initialH: number;
      }
    | { type: 'rotate'; startAngle: number; initRotation: number }
    | null
  >(null);
  const [resizeLive, setResizeLive] = useState<{ w: number; h: number; cx: number; cy: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onPointerUp = useCallback(() => {
    setDrag(null);
    setResizeLive(null);
    onDragEnd?.();
  }, [onDragEnd]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const design = screenToDesign(e.clientX, e.clientY);
      const vx = design.x;
      const vy = design.y;

      if (drag.type === 'move') {
        const designNow = screenToDesign(e.clientX, e.clientY);
        const designStart = screenToDesign(drag.startX, drag.startY);
        const deltaX = designNow.x - designStart.x;
        const deltaY = designNow.y - designStart.y;
        const newX = Math.max(0.01, Math.min(0.99, drag.initPos_x + deltaX / designSize));
        const newY = Math.max(0.01, Math.min(0.99, drag.initPos_y + deltaY / designSize));
        onMove(newX, newY);
        setDrag({ ...drag, startX: e.clientX, startY: e.clientY, initPos_x: newX, initPos_y: newY });
      } else if (drag.type === 'resize') {
        const fx = drag.fixed.x;
        const fy = drag.fixed.y;
        const nx = vx;
        const ny = vy;
        const midX = (fx + nx) / 2;
        const midY = (fy + ny) / 2;
        const dx = (nx - fx) / 2;
        const dy = (ny - fy) / 2;
        const w2 = dx * cos + dy * sin;
        const h2 = -dx * sin + dy * cos;
        let newW = Math.max(minSize, Math.abs(w2) * 2);
        let newH = Math.max(minSize, Math.abs(h2) * 2);
        if (uniformScale) {
          const s = Math.max(newW, newH);
          newW = s;
          newH = s;
        }
        const pos_x = Math.max(0.05, Math.min(0.95, midX / designSize));
        const pos_y = Math.max(0.05, Math.min(0.95, midY / designSize));
        const scale_x = Math.max(0.05, Math.min(maxScale, newW / designSize));
        const scale_y = Math.max(0.05, Math.min(maxScale, newH / designSize));
        if (uniformScale) {
          const s = Math.max(scale_x, scale_y);
          onResize({ pos_x, pos_y, scale_x: s, scale_y: s });
        } else {
          onResize({ pos_x, pos_y, scale_x, scale_y });
        }
        setResizeLive({ w: newW, h: newH, cx: midX, cy: midY });
        setDrag({ ...drag, fixed: drag.fixed, initialW: drag.initialW, initialH: drag.initialH });
      } else if (drag.type === 'rotate') {
        const angle = Math.atan2(vy - cy, vx - cx) * (180 / Math.PI);
        let delta = angle - drag.startAngle;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const rotation = drag.initRotation + delta;
        onRotate(rotation);
        setDrag({ ...drag, startAngle: angle, initRotation: rotation });
      }
    },
    [drag, cx, cy, cos, sin, designSize, minSize, maxScale, uniformScale, screenToDesign, onMove, onResize, onRotate]
  );

  const displayW = drag?.type === 'resize' && resizeLive ? resizeLive.w : w;
  const displayH = drag?.type === 'resize' && resizeLive ? resizeLive.h : h;
  const displayCx = drag?.type === 'resize' && resizeLive ? resizeLive.cx : cx;
  const displayCy = drag?.type === 'resize' && resizeLive ? resizeLive.cy : cy;

  const cornersDesign = cornersFromBox(displayCx, displayCy, displayW, displayH, item.rotation, flip_x);
  const cornersScreen = cornersDesign.map((p) => designToScreen(p.x, p.y));
  const rotHandleDesign = rotationHandleFromBox(displayCx, displayCy, displayH, item.rotation, flip_x);
  const rotHandleScreen = designToScreen(rotHandleDesign.x, rotHandleDesign.y);
  const boxLeft = designToScreen(displayCx - displayW / 2, displayCy - displayH / 2);
  const boxWidth =
    designToScreen(displayCx + displayW / 2, displayCy).x - designToScreen(displayCx - displayW / 2, displayCy).x;
  const boxHeight =
    designToScreen(displayCx, displayCy + displayH / 2).y - designToScreen(displayCx, displayCy - displayH / 2).y;

  const pointerHandlers = { onPointerMove, onPointerUp, onPointerLeave: onPointerUp };

  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      initPos_x: item.pos_x,
      initPos_y: item.pos_y,
    });
    overlayRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerDownResize = (e: React.PointerEvent, cornerIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fixedIdx = (cornerIndex + 2) % 4;
    const fixed = cornersDesign[fixedIdx]!;
    setResizeLive({ w, h, cx, cy });
    setDrag({
      type: 'resize',
      cornerIndex,
      fixed: { x: fixed.x, y: fixed.y },
      initialW: w,
      initialH: h,
    });
    overlayRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerDownRotate = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const design = screenToDesign(e.clientX, e.clientY);
    const dx = design.x - cx;
    const dy = design.y - cy;
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    setDrag({ type: 'rotate', startAngle, initRotation: item.rotation });
    overlayRef.current?.setPointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
      {...pointerHandlers}
    >
      {/* 选中框：pointerEvents 穿透，点击由下层 CanvasItemBlock 处理，重叠时可选中小图 */}
      <div
        style={{
          position: 'absolute',
          left: boxLeft.x,
          top: boxLeft.y,
          width: boxWidth,
          height: boxHeight,
          border: `${BOX_BORDER}px solid #fff`,
          boxSizing: 'border-box',
          transform: `rotate(${item.rotation}deg)${flip_x ? ' scaleX(-1)' : ''}`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      />
      {cornersScreen.map((pos, i) => (
        <div
          key={i}
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
            cursor: ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'][i],
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => handlePointerDownResize(e, i)}
          {...pointerHandlers}
        />
      ))}
      <div
        role="button"
        tabIndex={0}
        style={{
          position: 'absolute',
          left: rotHandleScreen.x - ROTATION_ICON_SIZE / 2,
          top: rotHandleScreen.y - ROTATION_ICON_SIZE / 2,
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
          fontSize: 12,
          pointerEvents: 'auto',
        }}
        onPointerDown={handlePointerDownRotate}
        {...pointerHandlers}
      >
        ↻
      </div>
    </div>
  );
}
