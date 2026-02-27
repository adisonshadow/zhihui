/**
 * 通用裁剪面板：可拖拽 header、拖拽/resize 裁剪区域预览，确认后应用裁剪
 * 遮罩用 Canvas 绘制，拖拽时零 React 重渲染
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Typography, App } from 'antd';
import { CloseOutlined, CheckOutlined } from '@ant-design/icons';

const PREVIEW_SIZE = 360;
const HANDLE_SIZE = 12;
/** 四周留白，避免 resize 把手被裁剪 */
const CROP_PADDING = 20;
const CANVAS_SIZE = PREVIEW_SIZE + 2 * CROP_PADDING;

export interface CropPanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  imagePath: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  saveAssetFromBase64: (projectDir: string, base64Data: string, ext?: string, type?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** 裁剪确认后回调，传入新图片路径 */
  onConfirm: (newPath: string) => void;
  /** 保存时的素材类型，默认 character */
  assetType?: string;
}

/** 裁剪区域（图片像素坐标） */
interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CropPanel({
  open,
  onClose,
  projectDir,
  imagePath,
  getAssetDataUrl,
  saveAssetFromBase64,
  onConfirm,
  assetType = 'character',
}: CropPanelProps) {
  const { message } = App.useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [pos, setPos] = useState({ x: 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCropDragging, setIsCropDragging] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const cropDragRef = useRef<{
    startX: number;
    startY: number;
    initRect: CropRect;
    imgW: number;
    imgH: number;
    scale: { x: number; y: number };
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 显示参数：图片在容器中的位置与尺寸，用于坐标转换 */
  const displayParamsRef = useRef<{
    offsetX: number;
    offsetY: number;
    imgDisplayW: number;
    imgDisplayH: number;
    imgW: number;
    imgH: number;
  } | null>(null);
  /** 拖拽期间的实时 rect，不触发 React 更新 */
  const liveCropRectRef = useRef<CropRect | null>(null);

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !imagePath) {
      setDataUrl(null);
      setImgSize(null);
      setCropRect(null);
      setError(null);
      displayParamsRef.current = null;
      return;
    }
    setError(null);
    getAssetDataUrl(projectDir, imagePath).then((url) => {
      if (!url) {
        setError('无法加载图片');
        return;
      }
      setDataUrl(url);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(PREVIEW_SIZE / w, PREVIEW_SIZE / h);
        const imgDisplayW = w * scale;
        const imgDisplayH = h * scale;
        setImgSize({ w, h });
        const rect = { x: 0, y: 0, width: w, height: h };
        setCropRect(rect);
        displayParamsRef.current = {
          offsetX: CROP_PADDING + (PREVIEW_SIZE - imgDisplayW) / 2,
          offsetY: CROP_PADDING + (PREVIEW_SIZE - imgDisplayH) / 2,
          imgDisplayW,
          imgDisplayH,
          imgW: w,
          imgH: h,
        };
      };
      img.src = url;
    });
  }, [open, projectDir, imagePath, getAssetDataUrl]);

  const drawOverlay = useCallback((rect: CropRect) => {
    const canvas = canvasRef.current;
    const dp = displayParamsRef.current;
    if (!canvas || !dp) return;
    const { offsetX, offsetY, imgDisplayW, imgDisplayH, imgW, imgH } = dp;
    const left = offsetX + (rect.x / imgW) * imgDisplayW;
    const top = offsetY + (rect.y / imgH) * imgDisplayH;
    const width = (rect.width / imgW) * imgDisplayW;
    const height = (rect.height / imgH) * imgDisplayH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CANVAS_SIZE, top);
    ctx.fillRect(0, top + height, CANVAS_SIZE, CANVAS_SIZE - top - height);
    ctx.fillRect(0, top, left, height);
    ctx.fillRect(left + width, top, CANVAS_SIZE - left - width, height);
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = '#1890ff';
    const corners: [number, number][] = [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ];
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, []);

  useEffect(() => {
    if (cropRect && !liveCropRectRef.current) {
      drawOverlay(cropRect);
    }
  }, [cropRect, drawOverlay]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y };
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const updateCanvasCursor = useCallback((px: number, py: number) => {
    const canvas = canvasRef.current;
    const dp = displayParamsRef.current;
    const rect = liveCropRectRef.current ?? cropRect;
    if (!canvas || !dp || !rect) return;
    const left = dp.offsetX + (rect.x / dp.imgW) * dp.imgDisplayW;
    const top = dp.offsetY + (rect.y / dp.imgH) * dp.imgDisplayH;
    const width = (rect.width / dp.imgW) * dp.imgDisplayW;
    const height = (rect.height / dp.imgH) * dp.imgDisplayH;
    const hs = HANDLE_SIZE / 2;
    const hit = (cx: number, cy: number) => (px - cx) ** 2 + (py - cy) ** 2 <= hs * hs;
    const cursors: Record<string, string> = {
      nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
      n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize', move: 'grab',
    };
    if (hit(left, top)) canvas.style.cursor = cursors.nw;
    else if (hit(left + width, top)) canvas.style.cursor = cursors.ne;
    else if (hit(left + width, top + height)) canvas.style.cursor = cursors.se;
    else if (hit(left, top + height)) canvas.style.cursor = cursors.sw;
    else if (py >= top - hs && py <= top + hs && px >= left && px <= left + width) canvas.style.cursor = cursors.n;
    else if (py >= top + height - hs && py <= top + height + hs && px >= left && px <= left + width) canvas.style.cursor = cursors.s;
    else if (px >= left - hs && px <= left + hs && py >= top && py <= top + height) canvas.style.cursor = cursors.w;
    else if (px >= left + width - hs && px <= left + width + hs && py >= top && py <= top + height) canvas.style.cursor = cursors.e;
    else if (px >= left && px <= left + width && py >= top && py <= top + height) canvas.style.cursor = cursors.move;
    else canvas.style.cursor = 'default';
  }, [cropRect]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPos({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
      }
      if (cropDragRef.current && imgSize) {
        const { startX, startY, initRect, imgW, imgH, scale, mode } = cropDragRef.current;
        // scale.x/y = 图片像素/屏幕像素，即 1 屏幕像素 = scale 图片像素
        const dx = (e.clientX - startX) * scale.x;
        const dy = (e.clientY - startY) * scale.y;
        const minSize = 20;
        let nx = initRect.x,
          ny = initRect.y,
          nw = initRect.width,
          nh = initRect.height;
        if (mode === 'move') {
          nx = Math.max(0, Math.min(imgW - initRect.width, initRect.x + dx));
          ny = Math.max(0, Math.min(imgH - initRect.height, initRect.y + dy));
        } else if (mode === 'nw') {
          nx = Math.max(0, Math.min(initRect.x + initRect.width - minSize, initRect.x + dx));
          ny = Math.max(0, Math.min(initRect.y + initRect.height - minSize, initRect.y + dy));
          nw = initRect.width + (initRect.x - nx);
          nh = initRect.height + (initRect.y - ny);
        } else if (mode === 'ne') {
          ny = Math.max(0, Math.min(initRect.y + initRect.height - minSize, initRect.y + dy));
          nw = Math.max(minSize, initRect.width + dx);
          nh = initRect.height + (initRect.y - ny);
        } else if (mode === 'sw') {
          nx = Math.max(0, Math.min(initRect.x + initRect.width - minSize, initRect.x + dx));
          nw = initRect.width + (initRect.x - nx);
          nh = Math.max(minSize, initRect.height + dy);
        } else if (mode === 'se') {
          nw = Math.max(minSize, initRect.width + dx);
          nh = Math.max(minSize, initRect.height + dy);
        } else if (mode === 'n') {
          ny = Math.max(0, Math.min(initRect.y + initRect.height - minSize, initRect.y + dy));
          nh = initRect.height + (initRect.y - ny);
        } else if (mode === 's') {
          nh = Math.max(minSize, initRect.height + dy);
        } else if (mode === 'e') {
          nw = Math.max(minSize, initRect.width + dx);
        } else if (mode === 'w') {
          nx = Math.max(0, Math.min(initRect.x + initRect.width - minSize, initRect.x + dx));
          nw = initRect.width + (initRect.x - nx);
        }
        const newRect: CropRect = { x: nx, y: ny, width: nw, height: nh };
        liveCropRectRef.current = newRect;
        drawOverlay(newRect);
      } else if (!cropDragRef.current && canvasRef.current) {
        const r = canvasRef.current.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const px = ((e.clientX - r.left) / Math.max(1, r.width)) * CANVAS_SIZE;
          const py = ((e.clientY - r.top) / Math.max(1, r.height)) * CANVAS_SIZE;
          updateCanvasCursor(px, py);
        } else {
          canvasRef.current.style.cursor = 'default';
        }
      }
    },
    [imgSize, drawOverlay, updateCanvasCursor]
  );

  const handlePointerUp = useCallback(() => {
    if (cropDragRef.current && liveCropRectRef.current) {
      setCropRect(liveCropRectRef.current);
      liveCropRectRef.current = null;
    }
    dragRef.current = null;
    cropDragRef.current = null;
    setIsDragging(false);
    setIsCropDragging(null);
  }, []);

  const startCropDrag = useCallback(
    (e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w') => {
      e.preventDefault();
      e.stopPropagation();
      const dp = displayParamsRef.current;
      const rect = liveCropRectRef.current ?? cropRect;
      if (!imgSize || !rect || !dp) return;
      // 使用实际渲染的 img 尺寸计算 scale，避免与 displayParams 不一致
      const imgRect = imgRef.current?.getBoundingClientRect();
      const scaleX = imgRect ? imgSize.w / Math.max(1, imgRect.width) : imgSize.w / Math.max(1, dp.imgDisplayW);
      const scaleY = imgRect ? imgSize.h / Math.max(1, imgRect.height) : imgSize.h / Math.max(1, dp.imgDisplayH);
      setIsCropDragging(mode);
      cropDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initRect: { ...rect },
        imgW: imgSize.w,
        imgH: imgSize.h,
        scale: { x: scaleX, y: scaleY },
        mode,
      };
      panelRef.current?.setPointerCapture?.(e.pointerId);
    },
    [imgSize, cropRect]
  );

  const handleCropCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const dp = displayParamsRef.current;
      const rect = liveCropRectRef.current ?? cropRect;
      if (!rect || !dp) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      // 将屏幕坐标转为 canvas 内部坐标（处理 CSS 缩放）
      const px = ((e.clientX - r.left) / Math.max(1, r.width)) * CANVAS_SIZE;
      const py = ((e.clientY - r.top) / Math.max(1, r.height)) * CANVAS_SIZE;
      const left = dp.offsetX + (rect.x / dp.imgW) * dp.imgDisplayW;
      const top = dp.offsetY + (rect.y / dp.imgH) * dp.imgDisplayH;
      const width = (rect.width / dp.imgW) * dp.imgDisplayW;
      const height = (rect.height / dp.imgH) * dp.imgDisplayH;
      const hs = HANDLE_SIZE / 2;
      const hit = (cx: number, cy: number) => (px - cx) ** 2 + (py - cy) ** 2 <= hs * hs;
      if (hit(left, top)) return startCropDrag(e, 'nw');
      if (hit(left + width, top)) return startCropDrag(e, 'ne');
      if (hit(left + width, top + height)) return startCropDrag(e, 'se');
      if (hit(left, top + height)) return startCropDrag(e, 'sw');
      if (py >= top - hs && py <= top + hs && px >= left && px <= left + width) return startCropDrag(e, 'n');
      if (py >= top + height - hs && py <= top + height + hs && px >= left && px <= left + width) return startCropDrag(e, 's');
      if (px >= left - hs && px <= left + hs && py >= top && py <= top + height) return startCropDrag(e, 'w');
      if (px >= left + width - hs && px <= left + width + hs && py >= top && py <= top + height) return startCropDrag(e, 'e');
      if (px >= left && px <= left + width && py >= top && py <= top + height) return startCropDrag(e, 'move');
    },
    [cropRect, startCropDrag]
  );

  const handleConfirm = useCallback(async () => {
    if (!dataUrl || !cropRect || !imgSize) return;
    setLoading(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cropRect.width);
      canvas.height = Math.round(cropRect.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布');
      ctx.drawImage(
        img,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      if (!base64) throw new Error('导出失败');
      const res = await saveAssetFromBase64(projectDir, base64, '.png', assetType);
      if (res.ok && res.path) {
        onConfirm(res.path);
        message.success('裁剪已应用');
        onClose();
      } else {
        message.error(res.error ?? '保存失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '裁剪失败');
    } finally {
      setLoading(false);
    }
  }, [dataUrl, cropRect, imgSize, projectDir, saveAssetFromBase64, onConfirm, onClose, message, assetType]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="裁剪"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1050,
        width: CANVAS_SIZE + 40,
        background: 'rgba(30, 30, 30, 0.98)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        style={{
          padding: '8px 12px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onPointerDown={handleHeaderPointerDown}
      >
        <Typography.Text strong>裁剪</Typography.Text>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        />
      </div>

      <div style={{ padding: 12 }}>
        <div
          ref={containerRef}
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            overflow: 'visible',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {error ? (
            <Typography.Text type="secondary">{error}</Typography.Text>
          ) : dataUrl ? (
            <>
              <img
                ref={imgRef}
                src={dataUrl}
                alt="裁剪预览"
                style={{
                  maxWidth: PREVIEW_SIZE,
                  maxHeight: PREVIEW_SIZE,
                  objectFit: 'contain',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
              {cropRect && (
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: CANVAS_SIZE,
                    height: CANVAS_SIZE,
                    cursor: isCropDragging === 'move' ? 'grabbing' : 'grab',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={handleCropCanvasPointerDown}
                />
              )}
            </>
          ) : (
            <Typography.Text type="secondary">加载中…</Typography.Text>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirm} loading={loading} disabled={!cropRect}>
            确认裁剪
          </Button>
        </div>
      </div>
    </div>
  );
}
