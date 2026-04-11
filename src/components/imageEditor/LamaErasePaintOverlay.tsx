/**
 * Lama 擦除：在整图源图框上绘制半透明蓝色笔触，内部维护与源图同尺寸的 mask
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { EditorImageObject } from './editorTypes';
import { getFullImageDisplayFrameInDoc } from './imageCropHelpers';
import { docPointToSourcePixel } from './lamaEraseDocGeometry';

function clientToDoc(
  clientX: number,
  clientY: number,
  wrapRect: DOMRect,
  cx: number,
  cy: number,
  zoom: number
): { x: number; y: number } {
  const rx = clientX - wrapRect.left;
  const ry = clientY - wrapRect.top;
  return { x: (rx - cx) / zoom, y: (ry - cy) / zoom };
}

export type LamaErasePaintOverlayHandle = {
  exportMaskPngDataUrl: () => string | null;
  hasMask: () => boolean;
  clearMask: () => void;
};

export type LamaErasePaintOverlayProps = {
  imageLayer: EditorImageObject;
  cx: number;
  cy: number;
  zoom: number;
  /** 与 originalSrc 位图一致 */
  imagePixelW: number;
  imagePixelH: number;
  brushRadiusPx: number;
  /** 有擦除结果时禁止继续涂抹 */
  paintingLocked?: boolean;
  /** 擦除结果覆盖预览 */
  resultPreviewUrl?: string | null;
  /** 涂抹结束，用于刷新「开始擦除」是否可点 */
  onMaskDirty?: () => void;
};

/** 预览层固定透明度（叠涂只写在 mask 上，再整体染色，避免 source-over 累加成实色） */
const MASK_PREVIEW = 'rgba(64, 169, 255, 0.6)';

export const LamaErasePaintOverlay = forwardRef<LamaErasePaintOverlayHandle, LamaErasePaintOverlayProps>(
  function LamaErasePaintOverlay(
    { imageLayer, cx, cy, zoom, imagePixelW, imagePixelH, brushRadiusPx, paintingLocked, resultPreviewUrl, onMaskDirty },
    ref
  ) {
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPixelRef = useRef<{ px: number; py: number } | null>(null);

    const F = getFullImageDisplayFrameInDoc({
      x: imageLayer.x,
      y: imageLayer.y,
      width: imageLayer.width,
      height: imageLayer.height,
      naturalW: imageLayer.naturalW,
      naturalH: imageLayer.naturalH,
      sourceCrop: imageLayer.sourceCrop,
    });

    const left = cx + F.x * zoom;
    const top = cy + F.y * zoom;
    const sw = Math.max(1, F.w * zoom);
    const sh = Math.max(1, F.h * zoom);

    /** 由 mask 生成单一透明度的蓝色预览（重叠笔触不会变实） */
    const refreshDisplayFromMask = useCallback(() => {
      const maskEl = maskCanvasRef.current;
      const displayEl = displayCanvasRef.current;
      if (!maskEl || !displayEl) return;
      const dctx = displayEl.getContext('2d');
      if (!dctx) return;
      const w = maskEl.width;
      const h = maskEl.height;
      if (w < 1 || h < 1) return;
      dctx.clearRect(0, 0, w, h);
      dctx.globalAlpha = 1;
      dctx.globalCompositeOperation = 'source-over';
      dctx.drawImage(maskEl, 0, 0);
      dctx.globalCompositeOperation = 'source-in';
      dctx.fillStyle = MASK_PREVIEW;
      dctx.fillRect(0, 0, w, h);
      dctx.globalCompositeOperation = 'source-over';
    }, []);

    const syncCanvasSize = useCallback(() => {
      const m = maskCanvasRef.current;
      const d = displayCanvasRef.current;
      const w = Math.max(1, Math.round(imagePixelW));
      const h = Math.max(1, Math.round(imagePixelH));
      if (m && (m.width !== w || m.height !== h)) {
        const prev = m.getContext('2d')?.getImageData(0, 0, m.width, m.height);
        m.width = w;
        m.height = h;
        if (prev && prev.width === w && prev.height === h) {
          m.getContext('2d')?.putImageData(prev, 0, 0);
        }
      }
      if (d && (d.width !== w || d.height !== h)) {
        const dctx = d.getContext('2d');
        const prevD = dctx?.getImageData(0, 0, d.width, d.height);
        d.width = w;
        d.height = h;
        if (prevD && prevD.width === w && prevD.height === h) {
          dctx?.putImageData(prevD, 0, 0);
        }
      }
      refreshDisplayFromMask();
    }, [imagePixelW, imagePixelH, refreshDisplayFromMask]);

    useEffect(() => {
      syncCanvasSize();
    }, [syncCanvasSize]);

    const drawStroke = useCallback(
      (x0: number, y0: number, x1: number, y1: number, r: number) => {
        const m = maskCanvasRef.current?.getContext('2d');
        if (!m) return;
        m.save();
        m.globalCompositeOperation = 'source-over';
        m.strokeStyle = 'rgba(255,255,255,1)';
        m.lineWidth = r * 2;
        m.lineCap = 'round';
        m.lineJoin = 'round';
        m.beginPath();
        m.moveTo(x0, y0);
        m.lineTo(x1, y1);
        m.stroke();
        m.restore();
        refreshDisplayFromMask();
      },
      [refreshDisplayFromMask]
    );

    const paintAtDoc = useCallback(
      (docX: number, docY: number) => {
        if (paintingLocked || resultPreviewUrl) return;
        const pt = docPointToSourcePixel(imageLayer, docX, docY);
        if (!pt) return;
        syncCanvasSize();
        const { px, py } = pt;
        const prev = lastPixelRef.current;
        const r = Math.max(1, brushRadiusPx);
        if (prev) {
          drawStroke(prev.px, prev.py, px, py, r);
        } else {
          drawStroke(px, py, px, py, r);
        }
        lastPixelRef.current = { px, py };
      },
      [imageLayer, brushRadiusPx, drawStroke, syncCanvasSize, paintingLocked, resultPreviewUrl]
    );

    useImperativeHandle(ref, () => ({
      exportMaskPngDataUrl: () => {
        const c = maskCanvasRef.current;
        if (!c || c.width < 1 || c.height < 1) return null;
        try {
          return c.toDataURL('image/png');
        } catch {
          return null;
        }
      },
      hasMask: () => {
        const c = maskCanvasRef;
        const ctx = c.current?.getContext('2d');
        if (!ctx || !c.current) return false;
        const { width, height } = c.current;
        if (width < 1 || height < 1) return false;
        const data = ctx.getImageData(0, 0, width, height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 8) return true;
        }
        return false;
      },
      clearMask: () => {
        const m = maskCanvasRef.current;
        const d = displayCanvasRef.current;
        lastPixelRef.current = null;
        if (m) m.getContext('2d')?.clearRect(0, 0, m.width, m.height);
        if (d) d.getContext('2d')?.clearRect(0, 0, d.width, d.height);
      },
    }));

    const onPointerDown = (e: React.PointerEvent) => {
      if (paintingLocked || resultPreviewUrl) return;
      const wrap = (e.currentTarget as HTMLElement).closest('[data-yiman-canvas-wrap]') as HTMLElement | null;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      drawingRef.current = true;
      lastPixelRef.current = null;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const d = clientToDoc(e.clientX, e.clientY, rect, cx, cy, zoom);
      paintAtDoc(d.x, d.y);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const wrap = (e.currentTarget as HTMLElement).closest('[data-yiman-canvas-wrap]') as HTMLElement | null;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const d = clientToDoc(e.clientX, e.clientY, rect, cx, cy, zoom);
      paintAtDoc(d.x, d.y);
    };

    const onPointerUp = () => {
      if (drawingRef.current) onMaskDirty?.();
      drawingRef.current = false;
      lastPixelRef.current = null;
    };

    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 19,
          pointerEvents: 'none',
        }}
      >
        <div
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'absolute',
            left,
            top,
            width: sw,
            height: sh,
            pointerEvents: paintingLocked || resultPreviewUrl ? 'none' : 'auto',
            cursor: 'crosshair',
          }}
        >
          {/* 浏览用 display；mask 不插入 DOM，仅 ref */}
          <canvas
            ref={displayCanvasRef}
            width={imagePixelW}
            height={imagePixelH}
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          />
          <canvas ref={maskCanvasRef} width={imagePixelW} height={imagePixelH} style={{ display: 'none' }} aria-hidden />
          {resultPreviewUrl ? (
            <img
              src={resultPreviewUrl}
              alt=""
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                pointerEvents: 'none',
                opacity: 0.97,
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }
);
