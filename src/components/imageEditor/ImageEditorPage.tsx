/**
 * 图片编辑器页面：状态、模态框、导出与素材操作
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Modal, Form, InputNumber, Select, Input, Spin, Space, Radio, Switch, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  IMAGE_EDITOR_PRESETS,
  IMAGE_EDITOR_DEFAULT_DOC_BACKGROUND,
  editorImageFillDocument,
  imageFitsInsideDoc,
  imageLayerNaturalAt,
  imageLayerNaturalCentered,
  imageLayerContainAt,
  imageLayerContainCentered,
  defaultText,
  editorDefaultFontFamily,
  defaultEditorPathFromTrace,
  type EditorObject,
  type EditorImageObject,
  type EditorShapeObject,
} from './editorTypes';
import { cloneDocSnapshot, type EditorDocSnapshot } from './editorHistory';
import { renderShapeMaskedImagePng } from './editorShapeMask';
import { traceDataUrlToSvgPathResult } from '@/utils/potraceCore';
import { EditorHeader } from './EditorHeader';
import { EditorWorkspace } from './EditorWorkspace';
import { EditorInspector } from './EditorInspector';
import { EditorCanvas, type EditorCanvasHandle, type EditorSelectAction } from './EditorCanvas';
import type { EditorFontFaceInfo } from './textAppearance';
import { alignSelectedObjects, distributeSelectedObjects, type AlignKind, type DistributeKind } from './editorAlignDistribute';
import { ImageCropOverlay, type ImageCropSession } from './ImageCropOverlay';
import { CanvasCropOverlay, type CanvasEditSession } from './CanvasCropOverlay';
import {
  applyZoomAroundCenter,
  cropDocRectsApproxEqual,
  getFullImageDisplayFrameInDoc,
  getInitialCropDocRectFromLayer,
  mapDocCropRectToSourceCrop,
} from './imageCropHelpers';
import { generateDrawerImageForEditor } from './imageEditorAi';
import { removeWhiteBackdropFromDataUrl } from '@/utils/instantTransparencyMatting';
import { useAgentModel } from '@/components/AIChat/hooks/useAgentModel';
import { MattingSettingsPanel } from '@/components/character/MattingSettingsPanel';
import type { AIModelConfig } from '@/types/settings';
import './imageEditor.css';
import { zoomAroundScreenPoint } from './editorViewGestures';
import { useImageEditorZoomHeaderDisplay } from './useImageEditorZoomHeader';
import { getEditorObjectsDocBounds } from './editorContentBounds';
import { computeImageFitToCanvasLayout, getImageIntrinsicAspectRatio } from './imageEditorFitHelpers';
import {
  FitContentToolbar,
  FitImageToCanvasToolbar,
  LamaEraseAdjustToolbar,
  PotraceAdjustToolbar,
  POTRACE_PRESETS,
  type PotracePresetId,
  PotracePreviewOverlay,
  RemoveWhiteAdjustToolbar,
  ZoomBlurAdjustToolbar,
} from './ImageEditorAdjustToolbars';
import { ZoomBlurOriginOverlay } from './ZoomBlurOriginOverlay';
import { LamaErasePaintOverlay, type LamaErasePaintOverlayHandle } from './LamaErasePaintOverlay';
import { inpaintViaLamaCleaner } from './lamaInpaintApi';
import { renderZoomBlurDataUrl, ZOOM_BLUR_SAMPLE_STEPS_DEFAULT } from './zoomBlurImage';
import { createShapeFromPreset, type ShapePresetId } from './editorShapePresets';
import { computeImageTrimTransparentPaddingPatch } from './imageTrimTransparentEdges';

interface ProjectRow {
  id: string;
  name: string;
  project_dir: string;
}

type RemoveWhiteAdjustSession = {
  objectId: string;
  tolerance: number;
  originalSrc: string;
  /** 仅对白/浅灰合成色做反解，缩小作用域 */
  whiteGrayOnly: boolean;
};

type PotraceSession = {
  objectId: string;
  originalSrc: string;
  threshold: number;
  useOtsu: boolean;
  turdSize: number;
  simplifyEpsilon: number;
  curveTension: number;
  /** °，邻边转角 ≥ 此值则打断平滑；0 为整圈旧版 Catmull-Rom */
  cornerAngleThreshold: number;
  adaptiveSimplify: boolean;
  /** 保留原图颜色填充矢量（pattern） */
  preserveColor: boolean;
  /** 矢量化时强制高亮像素为背景 */
  ignoreWhite: boolean;
  previewPathData: string | null;
  traceW: number;
  traceH: number;
  docRect: { x: number; y: number; width: number; height: number };
};

type ZoomBlurAdjustSession = {
  objectId: string;
  originalSrc: string;
  /** 进入会话时图层的 sourceCrop 快照（预览/应用均以此为准） */
  sourceCrop?: EditorImageObject['sourceCrop'];
  /** 相对图层局部宽高的缩放原点 0…1 */
  originXN: number;
  originYN: number;
  /** 模糊强度 0…100（百分比） */
  radiusPercent: number;
  /** 径向采样步数上限（越大越细腻、越慢） */
  sampleStepsMax: number;
};

type LamaEraseAdjustSession = {
  objectId: string;
  /** 进入时的位图，inpaint 始终以此为输入 */
  originalSrc: string;
  sourceCrop?: EditorImageObject['sourceCrop'];
  imagePixelW: number;
  imagePixelH: number;
  brushRadiusPx: number;
  baseUrl: string;
};

type FitImageToCanvasAdjustSession = {
  objectId: string;
  edgePadding: number;
  maintainAspect: boolean;
  snapshot: { x: number; y: number; width: number; height: number };
  intrinsicAspect: number;
};

type FitContentAdjustSession = {
  edgePadding: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  snapshot: { docWidth: number; docHeight: number; objects: EditorObject[] };
};

type LargeImageInsertChoice =
  | { kind: 'original'; autoEnlargeCanvas: boolean }
  | { kind: 'fit' };

type InsertLoadedImageResult = {
  layer: EditorImageObject;
  docW: number;
  docH: number;
  /** 大图且选「原始尺寸」插入后，将视口设为适合画布（与打开本地图一致） */
  zoomFitViewport?: boolean;
};

function stripDataUrlToBase64(s: string): string {
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}

/** 导出默认名用：不含年份，精确到秒（月日_时分秒） */
function formatExportUnnamedStem(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `未命名_${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeExportBasename(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return t.length > 0 ? t : '未命名';
}

function stripImageExtension(name: string): string {
  return name.replace(/\.(png|jpe?g|gif|webp|bmp)$/i, '');
}

/** 本地路径或文件名 → 导出用主文件名（无扩展名） */
function filePathOrNameToExportStem(pathOrName: string): string {
  const base = pathOrName.split(/[/\\]/).pop() ?? pathOrName;
  return sanitizeExportBasename(stripImageExtension(base));
}

async function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => reject(new Error('load fail'));
    i.src = src;
  });
}

export const ImageEditorPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const canvasRef = useRef<EditorCanvasHandle>(null);

  const [docWidth, setDocWidth] = useState(1024);
  const [docHeight, setDocHeight] = useState(768);
  const [docBackgroundColor, setDocBackgroundColor] = useState<string>(IMAGE_EDITOR_DEFAULT_DOC_BACKGROUND);
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const onSelectChange = useCallback((action: EditorSelectAction) => {
    setSelectedIds((prev) => {
      switch (action.type) {
        case 'set':
          return action.ids;
        case 'toggle':
          return prev.includes(action.id) ? prev.filter((x) => x !== action.id) : [...prev, action.id];
        case 'add':
          return [...new Set([...prev, ...action.ids])];
        default:
          return prev;
      }
    });
  }, []);
  const [zoomMode, setZoomMode] = useState<'fit' | 'fixed'>('fixed');
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0.5);
  /** 相对「居中」原点的屏幕像素平移（触控板双指滑动 / 触摸） */
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewPanRef = useRef(viewPan);
  viewPanRef.current = viewPan;

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [assetProjectDir, setAssetProjectDir] = useState<string | null>(null);
  const [mattingPanel, setMattingPanel] = useState<{ objectId: string } | null>(null);

  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [assetPickOpen, setAssetPickOpen] = useState(false);
  /** 导出对话框默认文件名（不含 .png） */
  const [exportDefaultStem, setExportDefaultStem] = useState(() => formatExportUnnamedStem());
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objectId: string } | null>(null);

  const [fonts, setFonts] = useState<string[]>([
    editorDefaultFontFamily(),
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ]);
  const [fontFaces, setFontFaces] = useState<EditorFontFaceInfo[]>([]);

  const [settingsModels, setSettingsModels] = useState<AIModelConfig[] | undefined>();
  const drawerModelCheck = useAgentModel('drawer', settingsModels);

  const [formNew] = Form.useForm<{ preset: string; w: number; h: number }>();
  const [formAi] = Form.useForm<{ prompt: string }>();
  const [formSave] = Form.useForm<{ projectDir: string }>();
  const [formLargeInsert] = Form.useForm<{
    insertMode: 'original' | 'fit';
    autoEnlargeCanvas: boolean;
  }>();
  const [largeInsertModalOpen, setLargeInsertModalOpen] = useState(false);
  const [largeInsertInfo, setLargeInsertInfo] = useState<{
    iw: number;
    ih: number;
    docW: number;
    docH: number;
  } | null>(null);
  const largeInsertResolveRef = useRef<((v: LargeImageInsertChoice | null) => void) | null>(null);
  const [saveToAssetOpen, setSaveToAssetOpen] = useState(false);
  const [imageCropSession, setImageCropSession] = useState<ImageCropSession | null>(null);
  const [canvasEditSession, setCanvasEditSession] = useState<CanvasEditSession | null>(null);
  const [removeWhiteSession, setRemoveWhiteSession] = useState<RemoveWhiteAdjustSession | null>(null);
  const [removeWhitePreviewTick, setRemoveWhitePreviewTick] = useState(0);
  /** 每张图上次「应用」移除白色时的选项，供再次打开调整条时恢复 */
  const lastRemoveWhiteAdjustByIdRef = useRef<Record<string, { tolerance: number; whiteGrayOnly: boolean }>>({});
  const rwPreviewReqIdRef = useRef(0);
  const removeWhitePreviewRef = useRef<RemoveWhiteAdjustSession | null>(null);
  removeWhitePreviewRef.current = removeWhiteSession;
  const [potraceSession, setPotraceSession] = useState<PotraceSession | null>(null);
  const [potracePreviewTick, setPotracePreviewTick] = useState(0);
  const potraceSessionRef = useRef<PotraceSession | null>(null);
  potraceSessionRef.current = potraceSession;
  const potraceReqIdRef = useRef(0);
  const [fitImageSession, setFitImageSession] = useState<FitImageToCanvasAdjustSession | null>(null);
  const [fitContentSession, setFitContentSession] = useState<FitContentAdjustSession | null>(null);
  const [shapeMaskLoading, setShapeMaskLoading] = useState(false);
  const [zoomBlurSession, setZoomBlurSession] = useState<ZoomBlurAdjustSession | null>(null);
  const zoomBlurReqIdRef = useRef(0);
  const zoomBlurSessionRef = useRef<ZoomBlurAdjustSession | null>(null);
  zoomBlurSessionRef.current = zoomBlurSession;
  const lastZoomBlurByIdRef = useRef<
    Record<
      string,
      { originXN: number; originYN: number; radiusPercent: number; sampleStepsMax: number }
    >
  >({});

  const [lamaEraseSession, setLamaEraseSession] = useState<LamaEraseAdjustSession | null>(null);
  const [lamaEraseResultUrl, setLamaEraseResultUrl] = useState<string | null>(null);
  const [lamaEraseBusy, setLamaEraseBusy] = useState(false);
  const [lamaInstallModalOpen, setLamaInstallModalOpen] = useState(false);
  const [lamaHasMask, setLamaHasMask] = useState(false);
  const lamaPendingIdRef = useRef<string | null>(null);
  const lamaPaintRef = useRef<LamaErasePaintOverlayHandle | null>(null);

  const exitLamaEraseSession = useCallback(() => {
    setLamaEraseSession(null);
    setLamaEraseResultUrl(null);
    setLamaHasMask(false);
  }, []);

  const closeZoomBlurDiscardPreview = useCallback(() => {
    const zb = zoomBlurSessionRef.current;
    if (!zb) return;
    zoomBlurReqIdRef.current += 1;
    setObjects((prev) =>
      prev.map((o) =>
        o.id === zb.objectId && o.type === 'image'
          ? {
              ...o,
              src: zb.originalSrc,
              sourceCrop: zb.sourceCrop ? { ...zb.sourceCrop } : undefined,
            }
          : o
      )
    );
    setZoomBlurSession(null);
  }, []);

  const docStateRef = useRef({
    docWidth,
    docHeight,
    docBackgroundColor,
    objects,
  });
  useEffect(() => {
    docStateRef.current = { docWidth, docHeight, docBackgroundColor, objects };
  });

  const isUndoRedoRef = useRef(false);
  const historyPastRef = useRef<EditorDocSnapshot[]>([]);
  const historyFutureRef = useRef<EditorDocSnapshot[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const recordHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    const s = docStateRef.current;
    historyPastRef.current = [
      ...historyPastRef.current.slice(-49),
      cloneDocSnapshot({
        docWidth: s.docWidth,
        docHeight: s.docHeight,
        docBackgroundColor: s.docBackgroundColor,
        objects: s.objects,
      }),
    ];
    historyFutureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const clearHistoryStacks = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const applySnapshot = useCallback((snap: EditorDocSnapshot) => {
    isUndoRedoRef.current = true;
    const s = cloneDocSnapshot(snap);
    setDocWidth(s.docWidth);
    setDocHeight(s.docHeight);
    setDocBackgroundColor(s.docBackgroundColor);
    setObjects(s.objects);
    queueMicrotask(() => {
      isUndoRedoRef.current = false;
    });
  }, []);

  const undo = useCallback(() => {
    const past = historyPastRef.current;
    if (past.length === 0) return;
    const prevSnap = past[past.length - 1]!;
    historyPastRef.current = past.slice(0, -1);
    const cur = docStateRef.current;
    historyFutureRef.current = [
      cloneDocSnapshot({
        docWidth: cur.docWidth,
        docHeight: cur.docHeight,
        docBackgroundColor: cur.docBackgroundColor,
        objects: cur.objects,
      }),
      ...historyFutureRef.current,
    ].slice(0, 50);
    applySnapshot(prevSnap);
    setSelectedIds([]);
    setHistoryTick((t) => t + 1);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const fut = historyFutureRef.current;
    if (fut.length === 0) return;
    const nextSnap = fut[0]!;
    historyFutureRef.current = fut.slice(1);
    const cur = docStateRef.current;
    historyPastRef.current = [
      ...historyPastRef.current.slice(-49),
      cloneDocSnapshot({
        docWidth: cur.docWidth,
        docHeight: cur.docHeight,
        docBackgroundColor: cur.docBackgroundColor,
        objects: cur.objects,
      }),
    ];
    applySnapshot(nextSnap);
    setSelectedIds([]);
    setHistoryTick((t) => t + 1);
  }, [applySnapshot]);

  void historyTick;
  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFutureRef.current.length > 0;

  const selected = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return objects.find((o) => o.id === selectedIds[0]) ?? null;
  }, [objects, selectedIds]);

  const onAlignMulti = useCallback(
    (kind: AlignKind) => {
      recordHistory();
      setObjects((prev) => alignSelectedObjects(prev, selectedIds, kind));
    },
    [selectedIds, recordHistory]
  );

  const onDistributeMulti = useCallback(
    (kind: DistributeKind) => {
      if (selectedIds.length < 3) {
        message.warning('分布至少需要选中 3 个对象');
        return;
      }
      recordHistory();
      setObjects((prev) => distributeSelectedObjects(prev, selectedIds, kind));
    },
    [selectedIds, message, recordHistory]
  );

  const shapeMaskEligible = useMemo(() => {
    if (selectedIds.length !== 2) return false;
    const a = objects.find((o) => o.id === selectedIds[0]);
    const b = objects.find((o) => o.id === selectedIds[1]);
    if (!a || !b) return false;
    const hasImage = a.type === 'image' || b.type === 'image';
    const hasShape = a.type === 'shape' || b.type === 'shape';
    return hasImage && hasShape;
  }, [selectedIds, objects]);

  const applyShapeMaskFromSelection = useCallback(async () => {
    if (selectedIds.length !== 2) {
      message.warning('请恰好选中一张图片和一个形状');
      return;
    }
    const picked = selectedIds
      .map((id) => objects.find((o) => o.id === id))
      .filter((o): o is EditorObject => !!o);
    if (picked.length !== 2) return;
    const img = picked.find((o): o is EditorImageObject => o.type === 'image');
    const shp = picked.find((o): o is EditorShapeObject => o.type === 'shape');
    if (!img || !shp) {
      message.warning('请恰好选中一张图片和一个形状');
      return;
    }
    closeZoomBlurDiscardPreview();
    exitLamaEraseSession();
    setShapeMaskLoading(true);
    try {
      const pr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      const r = await renderShapeMaskedImagePng(img, shp, docWidth, docHeight, pr);
      if (!r) {
        message.warning('无法生成蒙版（请确认形状与画布相交）');
        return;
      }
      // 避免「移除白底 / 矢量化预览」等异步任务在蒙版完成后仍用旧 src 覆盖结果
      rwPreviewReqIdRef.current += 1;
      potraceReqIdRef.current += 1;
      zoomBlurReqIdRef.current += 1;
      setImageCropSession(null);
      setCanvasEditSession(null);
      setRemoveWhiteSession(null);
      setFitImageSession(null);
      setFitContentSession(null);
      setPotraceSession(null);
      setZoomBlurSession(null);
      recordHistory();
      setObjects((prev) => {
        const cur = prev.find((o) => o.id === img.id);
        if (!cur || cur.type !== 'image') return prev;
        const nextImg: EditorImageObject = {
          ...cur,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          rotation: 0,
          src: r.dataUrl,
          sourceCrop: undefined,
          naturalW: undefined,
          naturalH: undefined,
        };
        // 形状若叠在图片之上会遮住 destination-in 后的透明衬底上的图像；蒙版结果仅来自栅格化 PNG，故移除蒙版用形状并顶置图片
        return [...prev.filter((o) => o.id !== shp.id && o.id !== img.id), nextImg];
      });
      setSelectedIds([img.id]);
      message.success('已按形状应用蒙版');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setShapeMaskLoading(false);
    }
  }, [selectedIds, objects, docWidth, docHeight, message, recordHistory, closeZoomBlurDiscardPreview, exitLamaEraseSession]);

  const cropTargetImage = useMemo(() => {
    if (!imageCropSession) return null;
    const o = objects.find((x) => x.id === imageCropSession.objectId);
    return o?.type === 'image' ? o : null;
  }, [imageCropSession, objects]);

  const zoomBlurTargetImage = useMemo(() => {
    if (!zoomBlurSession) return null;
    const o = objects.find((x): x is EditorImageObject => x.id === zoomBlurSession.objectId && x.type === 'image');
    return o ?? null;
  }, [zoomBlurSession, objects]);

  const lamaEraseLiveLayer = useMemo(() => {
    if (!lamaEraseSession) return null;
    const o = objects.find((x): x is EditorImageObject => x.id === lamaEraseSession.objectId && x.type === 'image');
    return o ?? null;
  }, [lamaEraseSession, objects]);

  const lamaPaintImageLayer = useMemo((): EditorImageObject | null => {
    if (!lamaEraseSession || !lamaEraseLiveLayer) return null;
    return {
      ...lamaEraseLiveLayer,
      naturalW: lamaEraseSession.imagePixelW,
      naturalH: lamaEraseSession.imagePixelH,
      sourceCrop: lamaEraseSession.sourceCrop,
    };
  }, [lamaEraseSession, lamaEraseLiveLayer]);

  /** 遮罩模式下整图（含预览缩放）在文档中的外接框，用于浮层约束与映射 */
  const cropEditFrame = useMemo(() => {
    if (!cropTargetImage || !imageCropSession) return null;
    const F = getFullImageDisplayFrameInDoc(cropTargetImage);
    return applyZoomAroundCenter(F, imageCropSession.imageZoom);
  }, [cropTargetImage, imageCropSession]);

  const fitZoom = useMemo(() => {
    if (viewport.w <= 0 || viewport.h <= 0 || docWidth <= 0 || docHeight <= 0) return 0.5;
    const pad = 0.98;
    const z = Math.min((viewport.w * pad) / docWidth, (viewport.h * pad) / docHeight);
    return Math.min(4, Math.max(0.05, z));
  }, [viewport, docWidth, docHeight]);

  useEffect(() => {
    if (zoomMode !== 'fit') return;
    setZoom((z) => (Math.abs(z - fitZoom) < 1e-6 ? z : fitZoom));
  }, [zoomMode, fitZoom]);

  const onViewportSize = useCallback((w: number, h: number) => {
    setViewport((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  const { zoomPercentRounded, zoomSelectValue, zoomTooltipTitle } = useImageEditorZoomHeaderDisplay({
    zoom,
    zoomMode,
    fitZoom,
  });

  const canvasInset = useMemo(() => {
    const cx0 = Math.max(0, (viewport.w - docWidth * zoom) / 2);
    const cy0 = Math.max(0, (viewport.h - docHeight * zoom) / 2);
    return { cx: cx0 + viewPan.x, cy: cy0 + viewPan.y };
  }, [viewport.w, viewport.h, docWidth, docHeight, zoom, viewPan]);

  const onViewPanGestureDelta = useCallback((dx: number, dy: number) => {
    setZoomMode('fixed');
    setViewPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const onZoomGestureAt = useCallback(
    (newZoom: number, screenX: number, screenY: number, vw: number, vh: number) => {
      if (vw <= 0 || vh <= 0) return;
      setZoomMode('fixed');
      const r = zoomAroundScreenPoint({
        viewportW: vw,
        viewportH: vh,
        docW: docWidth,
        docH: docHeight,
        zoom: zoomRef.current,
        viewPan: viewPanRef.current,
        screenX,
        screenY,
        newZoom,
      });
      setZoom(r.zoom);
      setViewPan(r.viewPan);
    },
    [docWidth, docHeight]
  );

  const onImageNaturalSize = useCallback((id: string, nw: number, nh: number) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id && o.type === 'image' && (o.naturalW !== nw || o.naturalH !== nh) ? { ...o, naturalW: nw, naturalH: nh } : o))
    );
  }, []);

  const fitContentPreview = useMemo(() => {
    if (!fitContentSession) return { w: 0, h: 0 };
    const b = fitContentSession.bounds;
    const p = fitContentSession.edgePadding;
    return {
      w: Math.max(16, b.maxX - b.minX + 2 * p),
      h: Math.max(16, b.maxY - b.minY + 2 * p),
    };
  }, [fitContentSession]);

  /** 适合画布：随留白 / 等比选项实时更新图层几何 */
  useEffect(() => {
    if (!fitImageSession) return;
    const layout = computeImageFitToCanvasLayout(
      docWidth,
      docHeight,
      fitImageSession.edgePadding,
      fitImageSession.maintainAspect,
      fitImageSession.intrinsicAspect
    );
    setObjects((prev) =>
      prev.map((o) => (o.id === fitImageSession.objectId && o.type === 'image' ? { ...o, ...layout } : o))
    );
  }, [
    fitImageSession?.objectId,
    fitImageSession?.edgePadding,
    fitImageSession?.maintainAspect,
    fitImageSession?.intrinsicAspect,
    docWidth,
    docHeight,
  ]);

  const adjustOverlayLock =
    !!removeWhiteSession ||
    !!fitImageSession ||
    !!fitContentSession ||
    !!potraceSession ||
    !!zoomBlurSession ||
    !!lamaEraseSession;

  const enterLamaEraseSession = useCallback(
    async (id: string, baseUrl: string) => {
      const o = objects.find((x): x is EditorImageObject => x.id === id && x.type === 'image');
      if (!o) return;
      if (Math.abs(o.rotation) > 1e-3) {
        message.warning('请先复位旋转为 0° 再使用 Lama 擦除');
        return;
      }
      const { w, h } = await loadImageSize(o.src);
      closeZoomBlurDiscardPreview();
      setImageCropSession(null);
      setCanvasEditSession(null);
      setRemoveWhiteSession(null);
      setFitImageSession(null);
      setFitContentSession(null);
      setPotraceSession(null);
      setZoomBlurSession(null);
      setLamaEraseResultUrl(null);
      setLamaHasMask(false);
      setLamaEraseSession({
        objectId: id,
        originalSrc: o.src,
        sourceCrop: o.sourceCrop ? { ...o.sourceCrop } : undefined,
        imagePixelW: w,
        imagePixelH: h,
        brushRadiusPx: 28,
        baseUrl,
      });
      setSelectedIds([]);
    },
    [objects, message, closeZoomBlurDiscardPreview]
  );

  const onStartLamaEraseAdjust = useCallback(
    async (id: string) => {
      const plug = window.yiman?.plugins;
      if (!plug?.lamaCleanerEnsure) {
        message.error('请在芝绘桌面版中使用擦除（Lama Cleaner）');
        return;
      }
      lamaPendingIdRef.current = id;
      const r = await plug.lamaCleanerEnsure();
      if (r.ok) {
        await enterLamaEraseSession(id, r.baseUrl);
        return;
      }
      if ('needInstall' in r && r.needInstall) {
        setLamaInstallModalOpen(true);
        return;
      }
      message.error('error' in r ? r.error : '无法连接 Lama Cleaner');
    },
    [enterLamaEraseSession, message]
  );

  const runLamaInpaint = useCallback(async () => {
    const sess = lamaEraseSession;
    if (!sess) return;
    const mask = lamaPaintRef.current?.exportMaskPngDataUrl();
    if (!mask) {
      message.warning('请先涂抹要擦除的区域');
      return;
    }
    setLamaEraseBusy(true);
    try {
      const out = await inpaintViaLamaCleaner(sess.baseUrl, sess.originalSrc, mask);
      setLamaEraseResultUrl(out);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '擦除失败');
    } finally {
      setLamaEraseBusy(false);
    }
  }, [lamaEraseSession, message]);

  const clearLamaErasePaint = useCallback(() => {
    lamaPaintRef.current?.clearMask();
    setLamaHasMask(false);
    setLamaEraseResultUrl(null);
  }, []);

  const applyLamaErase = useCallback(() => {
    if (!lamaEraseSession || !lamaEraseResultUrl) return;
    recordHistory();
    const id = lamaEraseSession.objectId;
    const url = lamaEraseResultUrl;
    setObjects((prev) =>
      prev.map((o) =>
        o.id === id && o.type === 'image'
          ? { ...o, src: url, sourceCrop: undefined, naturalW: undefined, naturalH: undefined }
          : o
      )
    );
    exitLamaEraseSession();
    message.success('已应用擦除结果');
  }, [lamaEraseSession, lamaEraseResultUrl, recordHistory, exitLamaEraseSession, message]);

  const openLamaInstallInTerminal = useCallback(async () => {
    const plug = window.yiman?.plugins;
    if (!plug?.lamaCleanerOpenInstallTerminal) return;
    const x = await plug.lamaCleanerOpenInstallTerminal();
    if (!x.ok) message.error(x.error ?? '打开终端失败');
    else message.info('已打开终端：可按提示输入环境相关 shell（空行继续安装）；完成后可点「重试连接」');
  }, [message]);

  const retryLamaConnection = useCallback(async () => {
    const plug = window.yiman?.plugins;
    const id = lamaPendingIdRef.current;
    if (!plug?.lamaCleanerEnsure || !id) return;
    const r = await plug.lamaCleanerEnsure();
    if (r.ok) {
      setLamaInstallModalOpen(false);
      await enterLamaEraseSession(id, r.baseUrl);
    } else {
      message.warning('error' in r ? r.error : '仍未就绪，请确认安装成功且服务已监听 9380 端口');
    }
  }, [enterLamaEraseSession, message]);

  useEffect(() => {
    if (lamaEraseSession && !lamaEraseLiveLayer) exitLamaEraseSession();
  }, [lamaEraseSession, lamaEraseLiveLayer, exitLamaEraseSession]);

  const trimImageTransparentEdges = useCallback(
    async (id: string) => {
      const o = objects.find((x): x is EditorImageObject => x.id === id && x.type === 'image');
      if (!o) return;
      if (Math.abs(o.rotation) > 1e-3) {
        message.warning('请先复位旋转为 0° 再移除透明四周');
        return;
      }
      const nw = o.naturalW;
      const nh = o.naturalH;
      if (!nw || !nh) {
        message.warning('请等待图片解码完成后再试');
        return;
      }
      const result = await computeImageTrimTransparentPaddingPatch(o, { paddingPx: 10 });
      if (!result.ok) {
        message.warning(result.reason);
        return;
      }
      recordHistory();
      setObjects((prev) =>
        prev.map((p) => (p.id === id && p.type === 'image' ? ({ ...p, ...result.patch } as EditorImageObject) : p))
      );
      setSelectedIds([]);
      requestAnimationFrame(() => {
        setSelectedIds([id]);
      });
      message.success('已按透明边裁剪');
    },
    [objects, message, recordHistory]
  );

  const startRemoveWhiteAdjust = useCallback((id: string) => {
    const o = objects.find((x): x is EditorImageObject => x.id === id && x.type === 'image');
    if (!o) return;
    closeZoomBlurDiscardPreview();
    exitLamaEraseSession();
    recordHistory();
    setImageCropSession(null);
    setCanvasEditSession(null);
    setFitImageSession(null);
    setFitContentSession(null);
    setPotraceSession(null);
    const last = lastRemoveWhiteAdjustByIdRef.current[id];
    setRemoveWhiteSession({
      objectId: id,
      tolerance: last?.tolerance ?? 60,
      whiteGrayOnly: last?.whiteGrayOnly ?? false,
      originalSrc: o.src,
    });
    setSelectedIds([]);
  }, [objects, recordHistory, closeZoomBlurDiscardPreview, exitLamaEraseSession]);

  const cancelRemoveWhiteAdjust = useCallback(() => {
    rwPreviewReqIdRef.current += 1;
    setRemoveWhiteSession((sess) => {
      if (sess) {
        setObjects((prev) =>
          prev.map((o) => (o.id === sess.objectId && o.type === 'image' ? { ...o, src: sess.originalSrc } : o))
        );
      }
      return null;
    });
  }, []);

  const applyRemoveWhiteAdjust = useCallback(async () => {
    if (!removeWhiteSession) return;
    const { objectId, tolerance, originalSrc, whiteGrayOnly } = removeWhiteSession;
    rwPreviewReqIdRef.current += 1;
    setImageProcessing(true);
    try {
      const b64 = await removeWhiteBackdropFromDataUrl(originalSrc, tolerance, whiteGrayOnly);
      const url = `data:image/png;base64,${b64}`;
      setObjects((prev) => prev.map((o) => (o.id === objectId ? { ...o, src: url } : o)));
      lastRemoveWhiteAdjustByIdRef.current[objectId] = { tolerance, whiteGrayOnly };
      setRemoveWhiteSession(null);
      message.success('已按白底线性反解：平滑 Alpha + 还原前景色');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '处理失败');
    } finally {
      setImageProcessing(false);
    }
  }, [removeWhiteSession, message]);

  /** 打开调整条或滑块拖拽结束（tick）后：按 originalSrc + 当前容差生成预览，不在滑块拖动过程中重复计算 */
  useEffect(() => {
    if (!removeWhiteSession) return;
    const sess = removeWhitePreviewRef.current;
    if (!sess) return;
    const { objectId, originalSrc, tolerance, whiteGrayOnly } = sess;
    const reqId = ++rwPreviewReqIdRef.current;
    let cancelled = false;
    (async () => {
      try {
        setImageProcessing(true);
        const b64 = await removeWhiteBackdropFromDataUrl(originalSrc, tolerance, whiteGrayOnly);
        if (cancelled || reqId !== rwPreviewReqIdRef.current) return;
        const url = `data:image/png;base64,${b64}`;
        setObjects((prev) =>
          prev.map((o) => (o.id === objectId && o.type === 'image' ? { ...o, src: url } : o))
        );
      } catch (e) {
        if (!cancelled && reqId === rwPreviewReqIdRef.current) {
          message.error(e instanceof Error ? e.message : '预览失败');
        }
      } finally {
        if (!cancelled && reqId === rwPreviewReqIdRef.current) {
          setImageProcessing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    removeWhiteSession?.objectId,
    removeWhiteSession?.originalSrc,
    removeWhiteSession?.whiteGrayOnly,
    removeWhitePreviewTick,
    message,
  ]);

  const startPotraceAdjust = useCallback((id: string) => {
    const o = objects.find((x): x is EditorImageObject => x.id === id && x.type === 'image');
    if (!o) return;
    closeZoomBlurDiscardPreview();
    exitLamaEraseSession();
    setImageCropSession(null);
    setCanvasEditSession(null);
    setRemoveWhiteSession(null);
    setFitImageSession(null);
    setFitContentSession(null);
    setPotraceSession({
      objectId: id,
      originalSrc: o.src,
      threshold: 128,
      useOtsu: true,
      turdSize: 16,
      simplifyEpsilon: 1.6,
      curveTension: 0.5,
      cornerAngleThreshold: 38,
      adaptiveSimplify: false,
      preserveColor: true,
      ignoreWhite: true,
      previewPathData: null,
      traceW: 1,
      traceH: 1,
      docRect: { x: o.x, y: o.y, width: o.width, height: o.height },
    });
    setPotracePreviewTick((t) => t + 1);
    setSelectedIds([]);
  }, [objects, closeZoomBlurDiscardPreview, exitLamaEraseSession]);

  const cancelPotraceAdjust = useCallback(() => {
    potraceReqIdRef.current += 1;
    setPotraceSession(null);
  }, []);

  const cancelZoomBlurAdjust = closeZoomBlurDiscardPreview;

  const startZoomBlurAdjust = useCallback(
    (id: string) => {
      const o = objects.find((x): x is EditorImageObject => x.id === id && x.type === 'image');
      if (!o) return;
      closeZoomBlurDiscardPreview();
      exitLamaEraseSession();
      recordHistory();
      setImageCropSession(null);
      setCanvasEditSession(null);
      setRemoveWhiteSession(null);
      setFitImageSession(null);
      setFitContentSession(null);
      setPotraceSession(null);
      const last = lastZoomBlurByIdRef.current[id];
      const sc = o.sourceCrop ? { ...o.sourceCrop } : undefined;
      setZoomBlurSession({
        objectId: id,
        originalSrc: o.src,
        sourceCrop: sc,
        originXN: last?.originXN ?? 0.5,
        originYN: last?.originYN ?? 0.5,
        radiusPercent: last?.radiusPercent ?? 28,
        sampleStepsMax: last?.sampleStepsMax ?? ZOOM_BLUR_SAMPLE_STEPS_DEFAULT,
      });
      setSelectedIds([]);
    },
    [objects, recordHistory, closeZoomBlurDiscardPreview, exitLamaEraseSession]
  );

  const applyZoomBlurAdjust = useCallback(async () => {
    const zb = zoomBlurSession;
    if (!zb) return;
    zoomBlurReqIdRef.current += 1;
    const token = zoomBlurReqIdRef.current;
    setImageProcessing(true);
    try {
      const url = await renderZoomBlurDataUrl(zb.originalSrc, {
        originXN: zb.originXN,
        originYN: zb.originYN,
        radiusPercent: zb.radiusPercent,
        sourceCrop: zb.sourceCrop,
        sampleStepsMax: zb.sampleStepsMax,
        maxSide: undefined,
      });
      if (token !== zoomBlurReqIdRef.current) return;
      setObjects((prev) =>
        prev.map((o) =>
          o.id === zb.objectId && o.type === 'image'
            ? { ...o, src: url, sourceCrop: undefined, naturalW: undefined, naturalH: undefined }
            : o
        )
      );
      lastZoomBlurByIdRef.current[zb.objectId] = {
        originXN: zb.originXN,
        originYN: zb.originYN,
        radiusPercent: zb.radiusPercent,
        sampleStepsMax: zb.sampleStepsMax,
      };
      setZoomBlurSession(null);
      message.success('已应用缩放模糊');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '处理失败');
    } finally {
      setImageProcessing(false);
    }
  }, [zoomBlurSession, message]);

  const applyPotraceAdjust = useCallback(async () => {
    if (!potraceSession) return;
    recordHistory();
    const s = potraceSession;
    potraceReqIdRef.current += 1;
    setImageProcessing(true);
    try {
      const r = await traceDataUrlToSvgPathResult(s.originalSrc, {
        threshold: s.useOtsu ? -1 : s.threshold,
        turdSize: s.turdSize,
        simplifyEpsilon: s.simplifyEpsilon,
        curveTension: s.curveTension,
        cornerAngleThreshold: s.cornerAngleThreshold,
        adaptiveSimplify: s.adaptiveSimplify,
        ignoreWhite: s.ignoreWhite,
        maxTraceSide: 2048,
      });
      if (!r.pathData.trim()) {
        message.warning('未得到有效路径，可尝试调整阈值或去噪');
        return;
      }
      const pathObj = defaultEditorPathFromTrace({
        pathData: r.pathData,
        naturalW: r.width,
        naturalH: r.height,
        x: s.docRect.x,
        y: s.docRect.y,
        width: s.docRect.width,
        height: s.docRect.height,
        preserveColor: s.preserveColor,
        patternSrc: s.preserveColor ? s.originalSrc : undefined,
      });
      setObjects((prev) => [...prev, pathObj]);
      setPotraceSession(null);
      message.success('已添加矢量图层');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '矢量化失败');
    } finally {
      setImageProcessing(false);
    }
  }, [potraceSession, message, recordHistory]);

  useEffect(() => {
    if (!potraceSession) return;
    const reqId = ++potraceReqIdRef.current;
    let cancelled = false;
    (async () => {
      try {
        setImageProcessing(true);
        const cur = potraceSessionRef.current;
        if (!cur) return;
        const r = await traceDataUrlToSvgPathResult(cur.originalSrc, {
          threshold: cur.useOtsu ? -1 : cur.threshold,
          turdSize: cur.turdSize,
          simplifyEpsilon: cur.simplifyEpsilon,
          curveTension: cur.curveTension,
          cornerAngleThreshold: cur.cornerAngleThreshold,
          adaptiveSimplify: cur.adaptiveSimplify,
          ignoreWhite: cur.ignoreWhite,
        });
        if (cancelled || reqId !== potraceReqIdRef.current) return;
        setPotraceSession((prev) =>
          prev && prev.objectId === cur.objectId
            ? { ...prev, previewPathData: r.pathData, traceW: r.width, traceH: r.height }
            : prev
        );
      } catch (e) {
        if (!cancelled && reqId === potraceReqIdRef.current) {
          message.error(e instanceof Error ? e.message : '矢量化预览失败');
        }
      } finally {
        if (reqId === potraceReqIdRef.current) setImageProcessing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    potraceSession?.objectId,
    potraceSession?.originalSrc,
    potraceSession?.ignoreWhite,
    potracePreviewTick,
    message,
  ]);

  /** 缩放模糊：实时预览（限长边以控制耗时） */
  useEffect(() => {
    if (!zoomBlurSession) return;
    const zb = { ...zoomBlurSession };
    const reqId = ++zoomBlurReqIdRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const url = await renderZoomBlurDataUrl(zb.originalSrc, {
          originXN: zb.originXN,
          originYN: zb.originYN,
          radiusPercent: zb.radiusPercent,
          sourceCrop: zb.sourceCrop,
          sampleStepsMax: zb.sampleStepsMax,
          maxSide: 720,
        });
        if (cancelled || reqId !== zoomBlurReqIdRef.current) return;
        setObjects((prev) =>
          prev.map((o) =>
            o.id === zb.objectId && o.type === 'image'
              ? {
                  ...o,
                  src: url,
                  // 预览图已是裁切后的位图，若保留旧 sourceCrop（原图坐标）会与低分辨率 src 错配，导致整图外接框算错、画面异常缩小
                  ...(zb.sourceCrop ? { sourceCrop: undefined } : {}),
                }
              : o
          )
        );
      } catch {
        /* 预览失败时保留当前帧 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoomBlurSession]);

  const startFitImageToCanvas = useCallback(
    (id: string) => {
      const o = objects.find((x) => x.id === id && x.type === 'image') as EditorImageObject | undefined;
      if (!o) return;
      if (Math.abs(o.rotation) > 1e-3) {
        message.warning('请先复位旋转为 0° 再使用适合画布');
        return;
      }
      closeZoomBlurDiscardPreview();
      exitLamaEraseSession();
      const intrinsicAspect = getImageIntrinsicAspectRatio(o);
      recordHistory();
      setImageCropSession(null);
      setCanvasEditSession(null);
      setRemoveWhiteSession(null);
      setFitContentSession(null);
      setPotraceSession(null);
      setFitImageSession({
        objectId: id,
        edgePadding: 0,
        maintainAspect: true,
        snapshot: { x: o.x, y: o.y, width: o.width, height: o.height },
        intrinsicAspect,
      });
      setSelectedIds([]);
    },
    [objects, message, recordHistory, closeZoomBlurDiscardPreview, exitLamaEraseSession]
  );

  const cancelFitImageToCanvas = useCallback(() => {
    setFitImageSession((sess) => {
      if (sess) {
        setObjects((prev) =>
          prev.map((o) => (o.id === sess.objectId && o.type === 'image' ? { ...o, ...sess.snapshot } : o))
        );
      }
      return null;
    });
  }, []);

  const applyFitImageToCanvas = useCallback(() => {
    if (!fitImageSession) return;
    setFitImageSession(null);
    message.success('已适合画布');
  }, [fitImageSession, message]);

  const startFitContentAdjust = useCallback(() => {
    const bounds = getEditorObjectsDocBounds(objects);
    if (!bounds) {
      message.warning('先添加图层后再试');
      return;
    }
    closeZoomBlurDiscardPreview();
    exitLamaEraseSession();
    recordHistory();
    setImageCropSession(null);
    setCanvasEditSession(null);
    setRemoveWhiteSession(null);
    setFitImageSession(null);
    setPotraceSession(null);
    setFitContentSession({
      edgePadding: 0,
      bounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
      snapshot: {
        docWidth,
        docHeight,
        objects: objects.map((o) => ({ ...o })),
      },
    });
    setSelectedIds([]);
  }, [objects, docWidth, docHeight, message, recordHistory, closeZoomBlurDiscardPreview, exitLamaEraseSession]);

  const cancelFitContentAdjust = useCallback(() => {
    setFitContentSession((sess) => {
      if (sess) {
        setDocWidth(sess.snapshot.docWidth);
        setDocHeight(sess.snapshot.docHeight);
        setObjects(sess.snapshot.objects.map((o) => ({ ...o })));
      }
      return null;
    });
  }, []);

  const applyFitContentAdjust = useCallback(() => {
    if (!fitContentSession) return;
    const { bounds, edgePadding: pad } = fitContentSession;
    const nw = Math.max(16, Math.round(bounds.maxX - bounds.minX + 2 * pad));
    const nh = Math.max(16, Math.round(bounds.maxY - bounds.minY + 2 * pad));
    const dx = pad - bounds.minX;
    const dy = pad - bounds.minY;
    setDocWidth(nw);
    setDocHeight(nh);
    setObjects((prev) => prev.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })));
    setFitContentSession(null);
    message.success('已按内容调整画布');
  }, [fitContentSession, message]);

  const startImageCrop = useCallback(
    (id: string) => {
      const o = objects.find((x) => x.id === id && x.type === 'image') as EditorImageObject | undefined;
      if (!o) return;
      if (Math.abs(o.rotation) > 1e-3) {
        message.warning('请先复位旋转为 0° 再使用遮罩裁切');
        return;
      }
      if (!o.naturalW || !o.naturalH) {
        message.warning('请等待图片加载完成后再试');
        return;
      }
      closeZoomBlurDiscardPreview();
      exitLamaEraseSession();
      const rect = getInitialCropDocRectFromLayer(o);
      setRemoveWhiteSession(null);
      setFitImageSession(null);
      setFitContentSession(null);
      setPotraceSession(null);
      setCanvasEditSession(null);
      setImageCropSession({
        objectId: id,
        rect: { ...rect },
        initialRect: { ...rect },
        imageZoom: 1,
      });
    },
    [objects, message, closeZoomBlurDiscardPreview, exitLamaEraseSession]
  );

  const cancelImageCrop = useCallback(() => setImageCropSession(null), []);

  const openCanvasEdit = useCallback(() => {
    closeZoomBlurDiscardPreview();
    exitLamaEraseSession();
    setImageCropSession(null);
    setRemoveWhiteSession(null);
    setFitImageSession(null);
    setFitContentSession(null);
    setPotraceSession(null);
    setSelectedIds([]);
    setCanvasEditSession({
      rect: { x: 0, y: 0, w: docWidth, h: docHeight },
      initialRect: { x: 0, y: 0, w: docWidth, h: docHeight },
    });
  }, [docWidth, docHeight, closeZoomBlurDiscardPreview, exitLamaEraseSession]);

  const cancelCanvasEdit = useCallback(() => setCanvasEditSession(null), []);

  const applyCanvasEdit = useCallback(() => {
    if (!canvasEditSession) return;
    const r = canvasEditSession.rect;
    const nx = Math.round(r.x);
    const ny = Math.round(r.y);
    const nw = Math.min(8192, Math.max(16, Math.round(r.w)));
    const nh = Math.min(8192, Math.max(16, Math.round(r.h)));
    const applied = { x: nx, y: ny, w: nw, h: nh };
    if (cropDocRectsApproxEqual(applied, canvasEditSession.initialRect)) {
      setCanvasEditSession(null);
      return;
    }
    recordHistory();
    setObjects((prev) => prev.map((o) => ({ ...o, x: o.x - nx, y: o.y - ny })));
    setDocWidth(nw);
    setDocHeight(nh);
    setCanvasEditSession(null);
    message.success('已应用画布裁剪');
  }, [canvasEditSession, message, recordHistory]);

  const applyImageCrop = useCallback(() => {
    if (!imageCropSession) return;
    const sess = imageCropSession;
    if (cropDocRectsApproxEqual(sess.rect, sess.initialRect)) {
      setImageCropSession(null);
      return;
    }
    recordHistory();
    setObjects((prev) => {
      const o = prev.find((x) => x.id === sess.objectId);
      if (!o || o.type !== 'image' || !o.naturalW || !o.naturalH) return prev;
      const F = getFullImageDisplayFrameInDoc(o);
      const Fz = applyZoomAroundCenter(F, sess.imageZoom);
      const sourceCrop = mapDocCropRectToSourceCrop(sess.rect, Fz, o.naturalW, o.naturalH);
      const { x: rx, y: ry, w: rw, h: rh } = sess.rect;
      return prev.map((p) =>
        p.id === o.id ? { ...p, x: rx, y: ry, width: Math.max(1, rw), height: Math.max(1, rh), sourceCrop } : p
      );
    });
    setImageCropSession(null);
    message.success('已应用裁切');
  }, [imageCropSession, message, recordHistory]);

  const onZoomSelect = useCallback((v: string) => {
    if (v === 'fit') {
      setZoomMode('fit');
      setViewPan({ x: 0, y: 0 });
      return;
    }
    setZoomMode('fixed');
    const pct = Number(v);
    if (!Number.isFinite(pct) || pct <= 0) return;
    setZoom(Math.min(4, Math.max(0.05, pct / 100)));
  }, []);

  /** 文件菜单：新建 / 打开本地图 / 从素材库打开后自动适合画布 */
  const zoomToFitCanvas = useCallback(() => {
    setZoomMode('fit');
    setViewPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    window.yiman?.settings?.get().then((s) => setSettingsModels(s.models));
  }, []);

  useEffect(() => {
    window.yiman?.projects?.list().then((list) => {
      if (list) setProjects(list as ProjectRow[]);
    });
    window.yiman?.system?.getFontFaces?.().then((rows) => {
      if (rows?.length) {
        setFontFaces(rows);
        const u = new Set(rows.map((r) => r.familyName));
        setFonts(Array.from(u).sort((a, b) => a.localeCompare(b, 'zh', { sensitivity: 'base' })));
      } else {
        window.yiman?.system?.getFonts?.().then((f) => f?.length && setFonts(f));
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        recordHistory();
        setObjects((prev) => prev.filter((o) => !selectedIds.includes(o.id)));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedIds, recordHistory]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      const menu = document.getElementById('yiman-image-editor-ctx-menu');
      if (menu?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [contextMenu]);

  const onUpdateObject = useCallback((id: string, patch: Partial<EditorObject>) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? ({ ...o, ...patch } as EditorObject) : o)));
  }, []);

  const addObject = useCallback(
    (o: EditorObject) => {
      recordHistory();
      setObjects((prev) => [...prev, o]);
      setSelectedIds([o.id]);
    },
    [recordHistory]
  );

  const addShapeFromPreset = useCallback(
    (presetId: ShapePresetId) => {
      addObject(createShapeFromPreset(presetId, docWidth, docHeight));
    },
    [addObject, docWidth, docHeight]
  );

  const moveLayer = useCallback((id: string, dir: 'up' | 'down' | 'top' | 'bottom') => {
    recordHistory();
    setObjects((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      if (!item) return prev;
      let insertAt = idx;
      if (dir === 'up') insertAt = Math.min(idx + 1, next.length);
      else if (dir === 'down') insertAt = Math.max(idx - 1, 0);
      else if (dir === 'top') insertAt = next.length;
      else insertAt = 0;
      next.splice(insertAt, 0, item);
      return next;
    });
  }, [recordHistory]);

  const toggleLayerVisibility = useCallback((id: string) => {
    recordHistory();
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, layerVisible: o.layerVisible === false ? true : false } : o))
    );
  }, [recordHistory]);

  const contextDelete = useCallback((id: string) => {
    recordHistory();
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedIds((prev) => prev.filter((pid) => pid !== id));
    setContextMenu(null);
  }, [recordHistory]);

  const promptLargeImageInsert = useCallback(
    (iw: number, ih: number, docW: number, docH: number): Promise<LargeImageInsertChoice | null> => {
      setLargeInsertInfo({ iw, ih, docW, docH });
      formLargeInsert.setFieldsValue({ insertMode: 'original', autoEnlargeCanvas: true });
      setLargeInsertModalOpen(true);
      return new Promise((resolve) => {
        largeInsertResolveRef.current = resolve;
      });
    },
    [formLargeInsert]
  );

  const confirmLargeInsertModal = useCallback(async () => {
    try {
      const v = await formLargeInsert.validateFields();
      const resolve = largeInsertResolveRef.current;
      largeInsertResolveRef.current = null;
      setLargeInsertModalOpen(false);
      setLargeInsertInfo(null);
      if (!resolve) return;
      if (v.insertMode === 'fit') resolve({ kind: 'fit' });
      else resolve({ kind: 'original', autoEnlargeCanvas: !!v.autoEnlargeCanvas });
    } catch {
      /* 校验未通过 */
    }
  }, [formLargeInsert]);

  const cancelLargeInsertModal = useCallback(() => {
    largeInsertResolveRef.current?.(null);
    largeInsertResolveRef.current = null;
    setLargeInsertModalOpen(false);
    setLargeInsertInfo(null);
  }, []);

  const insertLoadedImage = useCallback(
    async (
      src: string,
      nw: number,
      nh: number,
      docW: number,
      docH: number,
      placeAt: { x: number; y: number } | null
    ): Promise<InsertLoadedImageResult | null> => {
      if (imageFitsInsideDoc(nw, nh, docW, docH)) {
        const layer = placeAt
          ? imageLayerNaturalAt(src, nw, nh, placeAt.x, placeAt.y)
          : imageLayerNaturalCentered(src, nw, nh, docW, docH);
        return { layer, docW, docH };
      }
      const choice = await promptLargeImageInsert(nw, nh, docW, docH);
      if (!choice) return null;
      if (choice.kind === 'fit') {
        const layer = placeAt
          ? imageLayerContainAt(src, nw, nh, docW, docH, placeAt.x, placeAt.y)
          : imageLayerContainCentered(src, nw, nh, docW, docH);
        return { layer, docW, docH };
      }
      if (choice.autoEnlargeCanvas) {
        const newW = Math.max(docW, nw);
        const newH = Math.max(docH, nh);
        const layer = imageLayerNaturalCentered(src, nw, nh, newW, newH);
        return { layer, docW: newW, docH: newH, zoomFitViewport: true };
      }
      const layer = placeAt
        ? imageLayerNaturalAt(src, nw, nh, placeAt.x, placeAt.y)
        : imageLayerNaturalCentered(src, nw, nh, docW, docH);
      return { layer, docW, docH, zoomFitViewport: true };
    },
    [promptLargeImageInsert]
  );

  const handleInsertImageFromSrc = useCallback(
    async (src: string, suggestedExportStem?: string): Promise<boolean> => {
      try {
        if (suggestedExportStem) setExportDefaultStem(sanitizeExportBasename(suggestedExportStem));
        const { w, h } = await loadImageSize(src);
        const r = await insertLoadedImage(src, w, h, docWidth, docHeight, null);
        if (!r) return false;
        if (r.docW !== docWidth || r.docH !== docHeight) {
          recordHistory();
          setDocWidth(r.docW);
          setDocHeight(r.docH);
          setObjects((prev) => [...prev, r.layer]);
          setSelectedIds([r.layer.id]);
        } else {
          addObject(r.layer);
        }
        if (r.zoomFitViewport) zoomToFitCanvas();
        return true;
      } catch {
        message.error('无法加载图片');
        return false;
      }
    },
    [addObject, docWidth, docHeight, message, recordHistory, insertLoadedImage, zoomToFitCanvas]
  );

  const onDropImageFiles = useCallback(
    async (files: File[], docPoint: { x: number; y: number }) => {
      const imageFiles = files.filter(
        (f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)
      );
      if (!imageFiles.length) return;
      let curDocW = docWidth;
      let curDocH = docHeight;
      let x = docPoint.x;
      let y = docPoint.y;
      const newLayers: EditorImageObject[] = [];
      let zoomFitAfterDrop = false;
      for (let fi = 0; fi < imageFiles.length; fi++) {
        const f = imageFiles[fi]!;
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsDataURL(f);
          });
          const { w, h } = await loadImageSize(dataUrl);
          const r = await insertLoadedImage(dataUrl, w, h, curDocW, curDocH, { x, y });
          if (!r) {
            x += 20;
            y += 20;
            continue;
          }
          newLayers.push(r.layer);
          if (r.zoomFitViewport) zoomFitAfterDrop = true;
          curDocW = r.docW;
          curDocH = r.docH;
          if (fi === 0) setExportDefaultStem(filePathOrNameToExportStem(f.name));
          x += 20;
          y += 20;
        } catch {
          message.error(`无法加载：${f.name}`);
        }
      }
      if (!newLayers.length) return;
      recordHistory();
      if (curDocW !== docWidth || curDocH !== docHeight) {
        setDocWidth(curDocW);
        setDocHeight(curDocH);
      }
      setObjects((prev) => [...prev, ...newLayers]);
      setSelectedIds([newLayers[newLayers.length - 1]!.id]);
      if (zoomFitAfterDrop) zoomToFitCanvas();
    },
    [docWidth, docHeight, message, recordHistory, insertLoadedImage, zoomToFitCanvas]
  );

  const onInsertImageClick = useCallback(async () => {
    const path = await window.yiman?.dialog.openFile({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (!path) return;
    const dataUrl = await window.yiman?.fs.readFileAsDataUrl(path);
    if (!dataUrl) {
      message.error('读取文件失败');
      return;
    }
    await handleInsertImageFromSrc(dataUrl, filePathOrNameToExportStem(path));
  }, [handleInsertImageFromSrc, message]);

  const onOpenLocalImage = useCallback(async () => {
    const path = await window.yiman?.dialog.openFile({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (!path) return;
    const dataUrl = await window.yiman?.fs.readFileAsDataUrl(path);
    if (!dataUrl) {
      message.error('读取文件失败');
      return;
    }
    try {
      const { w, h } = await loadImageSize(dataUrl);
      clearHistoryStacks();
      setExportDefaultStem(filePathOrNameToExportStem(path));
      const layer = editorImageFillDocument(dataUrl, w, h);
      setDocWidth(w);
      setDocHeight(h);
      setObjects([layer]);
      setSelectedIds([layer.id]);
      zoomToFitCanvas();
    } catch {
      message.error('打开图片失败');
    }
  }, [clearHistoryStacks, message, zoomToFitCanvas]);

  const onExport = useCallback(async () => {
    const dataUrl = canvasRef.current?.exportDocPngDataUrl(2);
    if (!dataUrl) {
      message.error('导出失败');
      return;
    }
    const raw = stripDataUrlToBase64(dataUrl);
    const chosenPath = await window.yiman?.dialog.saveFile({
      defaultPath: `${exportDefaultStem}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (!chosenPath) return;
    const fsApi = window.yiman?.fs;
    if (!fsApi?.getSafeFilePath || !fsApi?.writeBase64File) {
      message.error('当前环境不支持文件写入');
      return;
    }
    const savePath = await fsApi.getSafeFilePath(chosenPath);
    if (!savePath) {
      message.error('路径无效');
      return;
    }
    const res = await fsApi.writeBase64File(savePath, raw);
    if (!res?.ok) message.error(res?.error ?? '写入失败');
    else {
      const basename = savePath.split(/[/\\]/).pop() ?? savePath;
      message.success(
        savePath === chosenPath ? '已导出' : `已导出为「${basename}」（同名已存在，已自动编号）`
      );
    }
  }, [message, exportDefaultStem]);

  const openSaveToAsset = useCallback(() => {
    const first = projects[0]?.project_dir;
    formSave.setFieldsValue({
      projectDir: assetProjectDir ?? first ?? '',
    });
    setSaveToAssetOpen(true);
  }, [assetProjectDir, formSave, projects]);

  const confirmSaveToAsset = useCallback(async () => {
    const v = await formSave.validateFields().catch(() => null);
    if (!v?.projectDir) return;
    const dataUrl = canvasRef.current?.exportDocPngDataUrl(2);
    if (!dataUrl) {
      message.error('导出失败');
      return;
    }
    const raw = stripDataUrlToBase64(dataUrl);
    const yp = window.yiman?.project;
    if (!yp?.saveAssetFromBase64) return;
    const res = await yp.saveAssetFromBase64(v.projectDir, raw, '.png', 'prop');
    if (!res?.ok) message.error(res?.error ?? '保存失败');
    else {
      setAssetProjectDir(v.projectDir);
      setSaveToAssetOpen(false);
      message.success('已保存到素材库');
    }
  }, [formSave, message]);

  const onImageOpenMatting = useCallback((objectId: string) => {
    const obj = objects.find((o) => o.id === objectId && o.type === 'image');
    if (!obj || obj.type !== 'image') return;
    if (!window.yiman?.project?.matteImageFromDataUrl) {
      message.warning('当前环境不支持抠图主进程接口');
      return;
    }
    setMattingPanel({ objectId });
  }, [objects, message]);

  const confirmNewCanvas = useCallback(() => {
    formNew
      .validateFields()
      .then((v) => {
        let w = Number(v.w);
        let h = Number(v.h);
        if (v.preset !== 'custom') {
          const p = IMAGE_EDITOR_PRESETS.find((x) => `${x.w}x${x.h}` === v.preset);
          if (p) {
            w = p.w;
            h = p.h;
          }
        }
        clearHistoryStacks();
        setDocWidth(w);
        setDocHeight(h);
        setDocBackgroundColor(IMAGE_EDITOR_DEFAULT_DOC_BACKGROUND);
        setObjects([]);
        setSelectedIds([]);
        setExportDefaultStem(formatExportUnnamedStem());
        setNewCanvasOpen(false);
        zoomToFitCanvas();
        message.success('已新建画布');
      })
      .catch(() => {});
  }, [formNew, message, zoomToFitCanvas, clearHistoryStacks]);

  const mattingImageLayer = mattingPanel
    ? (objects.find((o) => o.id === mattingPanel.objectId && o.type === 'image') as EditorImageObject | undefined)
    : undefined;

  const mattingStandalone = useMemo(() => {
    if (!mattingPanel || !mattingImageLayer?.src || !window.yiman?.project?.matteImageFromDataUrl) return null;
    const srcSnapshot = mattingImageLayer.src;
    return {
      sourceDataUrl: srcSnapshot,
      onApply: (itemId: string, dataUrl: string) => {
        recordHistory();
        setObjects((p) => p.map((o) => (o.id === itemId ? { ...o, src: dataUrl } : o)));
      },
      matteImageFromDataUrl: (u: string, o?: { mattingModel?: string; downsampleRatio?: number }) =>
        window.yiman!.project.matteImageFromDataUrl(u, o),
    };
  }, [mattingPanel?.objectId, mattingImageLayer?.src, recordHistory]);

  useEffect(() => {
    if (mattingPanel && !mattingImageLayer) setMattingPanel(null);
  }, [mattingPanel, mattingImageLayer]);

  return (
    <div className="yiman-image-editor">
      <EditorHeader
        onBack={() => navigate('/')}
        zoomPercentRounded={zoomPercentRounded}
        zoomSelectValue={zoomSelectValue}
        zoomTooltipTitle={zoomTooltipTitle}
        onZoomSelect={onZoomSelect}
        onInsertImage={onInsertImageClick}
        onInsertShapePreset={addShapeFromPreset}
        onInsertText={() => addObject(defaultText())}
        onAiGenerate={() => setAiOpen(true)}
        aiDisabled={!drawerModelCheck.hasValidModel}
        aiDisabledReason={
          drawerModelCheck.missingCapabilityLabels.length ? '请在设置中添加具备「绘图」能力且已填 API 的模型' : undefined
        }
        onExport={onExport}
        onSaveToAsset={openSaveToAsset}
        saveToAssetDisabled={projects.length === 0}
        onOpenNewCanvas={() => setNewCanvasOpen(true)}
        onOpenLocalImage={onOpenLocalImage}
        onOpenFromLibrary={() => setAssetPickOpen(true)}
        libraryDisabled={projects.length === 0}
        onUndo={undo}
        onRedo={redo}
        undoDisabled={!canUndo}
        redoDisabled={!canRedo}
      />
      <div className="yiman-image-editor-body">
        <EditorWorkspace
          objects={objects}
          selectedIds={selectedIds}
          onPickLayer={onSelectChange}
          onMoveLayer={moveLayer}
          onToggleLayerVisibility={toggleLayerVisibility}
        />
        <EditorCanvas
          ref={canvasRef}
          docWidth={docWidth}
          docHeight={docHeight}
          docBackgroundColor={docBackgroundColor}
          fontFaces={fontFaces}
          objects={objects}
          onObjectsChange={setObjects}
          selectedIds={selectedIds}
          onSelectChange={onSelectChange}
          zoom={zoom}
          viewPan={viewPan}
          onViewPanGestureDelta={onViewPanGestureDelta}
          onZoomGestureAt={onZoomGestureAt}
          onContextMenu={(e) => setContextMenu(e)}
          onViewportSize={onViewportSize}
          imageCropModeId={imageCropSession?.objectId ?? null}
          imageCropPreviewZoom={imageCropSession?.imageZoom ?? 1}
          canvasEditMode={!!canvasEditSession}
          adjustOverlayLock={adjustOverlayLock}
          canvasEditRect={canvasEditSession?.rect ?? null}
          onImageNaturalSize={onImageNaturalSize}
          onBeforeObjectGesture={recordHistory}
          onDropImageFiles={onDropImageFiles}
          cropOverlay={
            <>
              {imageCropSession && cropTargetImage && cropEditFrame ? (
                <ImageCropOverlay
                  session={imageCropSession}
                  imageBounds={cropEditFrame}
                  cx={canvasInset.cx}
                  cy={canvasInset.cy}
                  zoom={zoom}
                  onSessionChange={setImageCropSession}
                  onDone={applyImageCrop}
                  onCancel={cancelImageCrop}
                />
              ) : null}
              {canvasEditSession && !imageCropSession ? (
                <CanvasCropOverlay
                  session={canvasEditSession}
                  cx={canvasInset.cx}
                  cy={canvasInset.cy}
                  zoom={zoom}
                  onSessionChange={setCanvasEditSession}
                  onCancel={cancelCanvasEdit}
                />
              ) : null}
              {potraceSession ? (
                <PotracePreviewOverlay
                  show
                  cx={canvasInset.cx}
                  cy={canvasInset.cy}
                  zoom={zoom}
                  docRect={potraceSession.docRect}
                  pathD={potraceSession.previewPathData}
                  traceW={potraceSession.traceW}
                  traceH={potraceSession.traceH}
                  preserveColor={potraceSession.preserveColor}
                  patternSrc={potraceSession.preserveColor ? potraceSession.originalSrc : null}
                />
              ) : null}
              {zoomBlurSession && zoomBlurTargetImage ? (
                <ZoomBlurOriginOverlay
                  imageLayer={zoomBlurTargetImage}
                  originXN={zoomBlurSession.originXN}
                  originYN={zoomBlurSession.originYN}
                  onOriginChange={(nx, ny) =>
                    setZoomBlurSession((s) => (s ? { ...s, originXN: nx, originYN: ny } : s))
                  }
                  cx={canvasInset.cx}
                  cy={canvasInset.cy}
                  zoom={zoom}
                />
              ) : null}
              {removeWhiteSession ? (
                <RemoveWhiteAdjustToolbar
                  tolerance={removeWhiteSession.tolerance}
                  whiteGrayOnly={removeWhiteSession.whiteGrayOnly}
                  onToleranceChange={(tolerance) =>
                    setRemoveWhiteSession((s) => (s ? { ...s, tolerance } : s))
                  }
                  onToleranceChangeComplete={(tolerance) => {
                    setRemoveWhiteSession((s) => (s ? { ...s, tolerance } : s));
                    setRemoveWhitePreviewTick((t) => t + 1);
                  }}
                  onWhiteGrayOnlyChange={(whiteGrayOnly) => {
                    setRemoveWhiteSession((s) => (s ? { ...s, whiteGrayOnly } : s));
                    setRemoveWhitePreviewTick((t) => t + 1);
                  }}
                  onCancel={cancelRemoveWhiteAdjust}
                  onApply={() => void applyRemoveWhiteAdjust()}
                  loading={imageProcessing}
                />
              ) : null}
              {fitImageSession ? (
                <FitImageToCanvasToolbar
                  edgePadding={fitImageSession.edgePadding}
                  maintainAspect={fitImageSession.maintainAspect}
                  onEdgePaddingChange={(edgePadding) =>
                    setFitImageSession((s) => (s ? { ...s, edgePadding } : s))
                  }
                  onMaintainAspectChange={(maintainAspect) =>
                    setFitImageSession((s) => (s ? { ...s, maintainAspect } : s))
                  }
                  onCancel={cancelFitImageToCanvas}
                  onApply={applyFitImageToCanvas}
                />
              ) : null}
              {fitContentSession ? (
                <FitContentToolbar
                  edgePadding={fitContentSession.edgePadding}
                  previewW={fitContentPreview.w}
                  previewH={fitContentPreview.h}
                  onEdgePaddingChange={(edgePadding) =>
                    setFitContentSession((s) => (s ? { ...s, edgePadding } : s))
                  }
                  onCancel={cancelFitContentAdjust}
                  onApply={applyFitContentAdjust}
                />
              ) : null}
              {potraceSession ? (
                <PotraceAdjustToolbar
                  threshold={potraceSession.threshold}
                  useOtsu={potraceSession.useOtsu}
                  turdSize={potraceSession.turdSize}
                  simplifyEpsilon={potraceSession.simplifyEpsilon}
                  curveTension={potraceSession.curveTension}
                  cornerAngleThreshold={potraceSession.cornerAngleThreshold}
                  adaptiveSimplify={potraceSession.adaptiveSimplify}
                  preserveColor={potraceSession.preserveColor}
                  ignoreWhite={potraceSession.ignoreWhite}
                  onThresholdChange={(threshold) =>
                    setPotraceSession((s) => (s ? { ...s, threshold } : s))
                  }
                  onUseOtsuChange={(useOtsu) => {
                    setPotraceSession((s) => (s ? { ...s, useOtsu } : s));
                    setPotracePreviewTick((t) => t + 1);
                  }}
                  onTurdSizeChange={(turdSize) =>
                    setPotraceSession((s) => (s ? { ...s, turdSize } : s))
                  }
                  onSimplifyChange={(simplifyEpsilon) =>
                    setPotraceSession((s) => (s ? { ...s, simplifyEpsilon } : s))
                  }
                  onCurveTensionChange={(curveTension) =>
                    setPotraceSession((s) => (s ? { ...s, curveTension } : s))
                  }
                  onCornerAngleThresholdChange={(cornerAngleThreshold) =>
                    setPotraceSession((s) => (s ? { ...s, cornerAngleThreshold } : s))
                  }
                  onAdaptiveSimplifyChange={(adaptiveSimplify) =>
                    setPotraceSession((s) => (s ? { ...s, adaptiveSimplify } : s))
                  }
                  onPreserveColorChange={(preserveColor) => {
                    setPotraceSession((s) => (s ? { ...s, preserveColor } : s));
                    setPotracePreviewTick((t) => t + 1);
                  }}
                  onIgnoreWhiteChange={(ignoreWhite) => {
                    setPotraceSession((s) => (s ? { ...s, ignoreWhite } : s));
                    setPotracePreviewTick((t) => t + 1);
                  }}
                  onPresetChange={(presetId: PotracePresetId) => {
                    const preset = POTRACE_PRESETS[presetId];
                    if (preset) {
                      setPotraceSession((s) =>
                        s ? { ...s, ...preset.config } : s
                      );
                      setPotracePreviewTick((t) => t + 1);
                    }
                  }}
                  onParamCommit={() => setPotracePreviewTick((t) => t + 1)}
                  onCancel={cancelPotraceAdjust}
                  onApply={() => void applyPotraceAdjust()}
                  loading={imageProcessing}
                />
              ) : null}
              {zoomBlurSession ? (
                <ZoomBlurAdjustToolbar
                  radiusPercent={zoomBlurSession.radiusPercent}
                  onRadiusChange={(radiusPercent) =>
                    setZoomBlurSession((s) => (s ? { ...s, radiusPercent } : s))
                  }
                  sampleStepsMax={zoomBlurSession.sampleStepsMax}
                  onSampleStepsMaxChange={(sampleStepsMax) =>
                    setZoomBlurSession((s) => (s ? { ...s, sampleStepsMax } : s))
                  }
                  onCancel={cancelZoomBlurAdjust}
                  onApply={() => void applyZoomBlurAdjust()}
                  loading={imageProcessing}
                />
              ) : null}
              {lamaEraseSession && lamaPaintImageLayer ? (
                <LamaErasePaintOverlay
                  ref={lamaPaintRef}
                  imageLayer={lamaPaintImageLayer}
                  cx={canvasInset.cx}
                  cy={canvasInset.cy}
                  zoom={zoom}
                  imagePixelW={lamaEraseSession.imagePixelW}
                  imagePixelH={lamaEraseSession.imagePixelH}
                  brushRadiusPx={lamaEraseSession.brushRadiusPx}
                  paintingLocked={lamaEraseBusy}
                  resultPreviewUrl={lamaEraseResultUrl}
                  onMaskDirty={() => setLamaHasMask(lamaPaintRef.current?.hasMask() ?? false)}
                />
              ) : null}
              {lamaEraseSession ? (
                <LamaEraseAdjustToolbar
                  brushRadiusPx={lamaEraseSession.brushRadiusPx}
                  onBrushRadiusChange={(brushRadiusPx) =>
                    setLamaEraseSession((s) => (s ? { ...s, brushRadiusPx } : s))
                  }
                  hasMask={lamaHasMask}
                  onClearEraser={clearLamaErasePaint}
                  onStartErase={() => void runLamaInpaint()}
                  resultReady={!!lamaEraseResultUrl}
                  onDiscardResult={() => setLamaEraseResultUrl(null)}
                  onApply={applyLamaErase}
                  onExitAdjust={exitLamaEraseSession}
                  eraseLoading={lamaEraseBusy}
                />
              ) : null}
            </>
          }
        />
        <EditorInspector
          selected={selected}
          selectedIds={selectedIds}
          onAlignMulti={onAlignMulti}
          onDistributeMulti={onDistributeMulti}
          docWidth={docWidth}
          docHeight={docHeight}
          docBackgroundColor={docBackgroundColor}
          onDocBackgroundColorChange={setDocBackgroundColor}
          recordHistory={recordHistory}
          shapeMaskEligible={shapeMaskEligible}
          onApplyShapeMask={() => void applyShapeMaskFromSelection()}
          shapeMaskLoading={shapeMaskLoading}
          systemFonts={fonts}
          fontFaces={fontFaces}
          onUpdate={onUpdateObject}
          onImageOpenMatting={onImageOpenMatting}
          onStartRemoveWhiteAdjust={startRemoveWhiteAdjust}
          onTrimImageTransparentEdges={trimImageTransparentEdges}
          onStartPotraceAdjust={startPotraceAdjust}
          onStartZoomBlurAdjust={startZoomBlurAdjust}
          onStartLamaEraseAdjust={onStartLamaEraseAdjust}
          onStartFitImageToCanvas={startFitImageToCanvas}
          onStartFitContent={startFitContentAdjust}
          imageSidebarToolsLocked={
            !!imageCropSession ||
            !!canvasEditSession ||
            !!removeWhiteSession ||
            !!potraceSession ||
            !!zoomBlurSession ||
            !!fitImageSession ||
            !!fitContentSession ||
            !!lamaEraseSession
          }
          fitContentDisabled={
            objects.length === 0 ||
            !!canvasEditSession ||
            !!fitContentSession ||
            !!imageCropSession ||
            !!removeWhiteSession ||
            !!potraceSession ||
            !!zoomBlurSession ||
            !!fitImageSession ||
            !!lamaEraseSession
          }
          onStartImageCrop={startImageCrop}
          onOpenCanvasEdit={openCanvasEdit}
          canvasEditSession={canvasEditSession}
          setCanvasEditSession={setCanvasEditSession}
          onApplyCanvasEdit={applyCanvasEdit}
          onCancelCanvasEdit={cancelCanvasEdit}
        />
      </div>

      {contextMenu && (
        <div
          id="yiman-image-editor-ctx-menu"
          className="yiman-image-editor-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={() => contextDelete(contextMenu.objectId)}>
            删除
          </button>
          <button type="button" onClick={() => moveLayer(contextMenu.objectId, 'top')}>
            置于顶层
          </button>
          <button type="button" onClick={() => moveLayer(contextMenu.objectId, 'up')}>
            上移一层
          </button>
          <button type="button" onClick={() => moveLayer(contextMenu.objectId, 'down')}>
            下移一层
          </button>
          <button type="button" onClick={() => moveLayer(contextMenu.objectId, 'bottom')}>
            置于底层
          </button>
        </div>
      )}

      <Modal
        title="安装 IOPaint（智能擦除）"
        open={lamaInstallModalOpen}
        onCancel={() => setLamaInstallModalOpen(false)}
        destroyOnHidden
        footer={[
          <Button key="close" onClick={() => setLamaInstallModalOpen(false)}>
            稍后
          </Button>,
          <Button key="term" type="primary" onClick={() => void openLamaInstallInTerminal()}>
            在终端安装并启动
          </Button>,
          <Button key="retry" onClick={() => void retryLamaConnection()}>
            重试连接
          </Button>,
        ]}
      >
        <p style={{ marginBottom: 0, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          未在芝绘专用虚拟环境中检测到 IOPaint（PyPI 包名 <code style={{ color: 'rgba(255,255,255,0.9)' }}>iopaint</code>
          ，旧名 lama-cleaner）。请点击「在终端安装并启动」：终端会先让你按需输入环境设置（代理、镜像等，每行一条 shell；不需要则直接回车），再<strong style={{ fontWeight: 600 }}>仅使用本机已安装的 Python 3.10</strong>
          （<code style={{ color: 'rgba(255,255,255,0.9)' }}>python3.10</code>
          ）创建 venv，依次安装 PyTorch（含 macOS MPS）与 <code style={{ color: 'rgba(255,255,255,0.9)' }}>iopaint</code>
          并启动。
          在 <strong style={{ fontWeight: 600 }}>Apple Silicon</strong> 上会使用 <strong style={{ fontWeight: 600 }}>MPS</strong> 加速；应用自动拉起服务时同样会在 Apple Silicon 上使用 MPS。
          若日志里出现 <code style={{ color: 'rgba(255,255,255,0.9)' }}>python3.11</code>
          、<code style={{ color: 'rgba(255,255,255,0.9)' }}>python3.13</code>
          等路径或 Pillow 构建失败，说明旧 venv 不是 3.10：请先关闭终端，在访达或终端中删除目录
          <code style={{ color: 'rgba(255,255,255,0.9)' }}>~/Library/Application Support/芝绘/yiman/venv-lama-cleaner</code>
          （若数据在备用路径则为 <code style={{ color: 'rgba(255,255,255,0.9)' }}>~/.yiman/venv-lama-cleaner</code>
          ），并确保已安装 <code style={{ color: 'rgba(255,255,255,0.9)' }}>python3.10</code>
          （如 <code style={{ color: 'rgba(255,255,255,0.9)' }}>brew install python@3.10</code>
          ），再点「在终端安装并启动」。
          首次拉取模型可能较慢，完成后请点击「重试连接」。安装过程中请勿关闭本窗口。
        </p>
      </Modal>

      <Modal
        title="图片大于当前画布"
        open={largeInsertModalOpen}
        onOk={() => void confirmLargeInsertModal()}
        onCancel={cancelLargeInsertModal}
        destroyOnHidden
        okText="确定"
        cancelText="取消"
      >
        {largeInsertInfo ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            画布 {largeInsertInfo.docW}×{largeInsertInfo.docH}，图片 {largeInsertInfo.iw}×{largeInsertInfo.ih}
          </div>
        ) : null}
        <Form form={formLargeInsert} layout="vertical" initialValues={{ insertMode: 'original', autoEnlargeCanvas: true }}>
          <Form.Item name="insertMode" label="插入方式">
            <Radio.Group>
              <Space orientation="vertical" size="middle">
                <Radio value="original">使用图片原始尺寸</Radio>
                <Form.Item noStyle dependencies={['insertMode']}>
                  {() =>
                    formLargeInsert.getFieldValue('insertMode') === 'original' ? (
                      <Form.Item
                        name="autoEnlargeCanvas"
                        valuePropName="checked"
                        style={{ marginBottom: 0, marginLeft: 24 }}
                      >
                        <Space>
                          <span style={{ color: 'rgba(255,255,255,0.85)' }}>自动放大画布</span>
                          <Switch defaultChecked />
                        </Space>
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Radio value="fit">等比缩放到画布</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="保存到素材库"
        open={saveToAssetOpen}
        onOk={() => void confirmSaveToAsset()}
        onCancel={() => setSaveToAssetOpen(false)}
        destroyOnHidden
        okText="保存"
      >
        <Form form={formSave} layout="vertical">
          <Form.Item name="projectDir" label="保存到漫剧项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select
              placeholder="选择项目"
              options={projects.map((p) => ({ value: p.project_dir, label: p.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建空白画布" open={newCanvasOpen} onOk={confirmNewCanvas} onCancel={() => setNewCanvasOpen(false)} destroyOnHidden>
        <Form form={formNew} layout="vertical" initialValues={{ preset: '1024x768', w: 1024, h: 768 }}>
          <Form.Item name="preset" label="预设">
            <Select
              options={[
                ...IMAGE_EDITOR_PRESETS.map((p) => ({ value: `${p.w}x${p.h}`, label: p.label })),
                { value: 'custom', label: '自定义宽高' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.preset !== b.preset}>
            {() =>
              formNew.getFieldValue('preset') === 'custom' ? (
                <Space>
                  <Form.Item name="w" label="宽" rules={[{ required: true }]}>
                    <InputNumber min={16} max={8192} />
                  </Form.Item>
                  <Form.Item name="h" label="高" rules={[{ required: true }]}>
                    <InputNumber min={16} max={8192} />
                  </Form.Item>
                </Space>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <AssetPickModal
        open={assetPickOpen}
        onCancel={() => setAssetPickOpen(false)}
        projects={projects}
        initialProjectDir={assetProjectDir}
        onPick={async (projectDir, dataUrl, assetPath) => {
          setAssetPickOpen(false);
          setAssetProjectDir(projectDir);
          if (await handleInsertImageFromSrc(dataUrl, filePathOrNameToExportStem(assetPath))) zoomToFitCanvas();
        }}
      />

      {mattingPanel && mattingStandalone ? (
        <MattingSettingsPanel
          open
          onClose={() => setMattingPanel(null)}
          itemId={mattingPanel.objectId}
          standalone={mattingStandalone}
        />
      ) : null}

      <Modal
        title="AI 生成图片"
        open={aiOpen}
        confirmLoading={aiLoading}
        onOk={async () => {
          const v = await formAi.validateFields().catch(() => null);
          if (!v || !drawerModelCheck.model) return;
          setAiLoading(true);
          try {
            const res = await generateDrawerImageForEditor(drawerModelCheck.model, v.prompt, {
              docWidth,
              docHeight,
              aspectRatio: 'canvas',
            });
            if (!res.ok) {
              message.error(res.error);
              return;
            }
            await handleInsertImageFromSrc(res.url, formatExportUnnamedStem());
            setAiOpen(false);
            formAi.resetFields();
            message.success('已插入画布');
          } finally {
            setAiLoading(false);
          }
        }}
        onCancel={() => setAiOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={aiLoading}>
          <Form form={formAi} layout="vertical">
            <Form.Item name="prompt" label="描述画面" rules={[{ required: true, message: '请输入内容' }]}>
              <Input.TextArea rows={4} placeholder="例如：阳光下的卡通小猫，扁平插画" />
            </Form.Item>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              出图比例将尽量接近当前画布 {docWidth}×{docHeight}
            </div>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

function AssetThumb({ projectDir, path }: { projectDir: string; path: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    window.yiman?.project.getAssetDataUrl(projectDir, path).then((u) => {
      if (!cancelled && u) setSrc(u);
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir, path]);
  if (!src) return <div style={{ width: '100%', height: '100%', background: '#2a2a2a' }} />;
  return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}

function AssetPickModal({
  open,
  onCancel,
  projects,
  initialProjectDir,
  onPick,
}: {
  open: boolean;
  onCancel: () => void;
  projects: ProjectRow[];
  initialProjectDir: string | null;
  onPick: (projectDir: string, dataUrl: string, assetPath: string) => void;
}) {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [assets, setAssets] = useState<{ id: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (open && initialProjectDir) setProjectDir(initialProjectDir);
  }, [open, initialProjectDir]);

  useEffect(() => {
    if (!open || !projectDir) {
      setAssets([]);
      return;
    }
    setLoading(true);
    window.yiman?.project
      ?.getAssets(projectDir)
      .then((list) => {
        const imgs = (list ?? []).filter((a: { path: string }) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path));
        setAssets(imgs);
      })
      .finally(() => setLoading(false));
  }, [open, projectDir]);

  return (
    <Modal title="从素材库插入图片" open={open} onCancel={onCancel} footer={null} width={560} destroyOnHidden>
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Select
          style={{ width: '100%' }}
          placeholder="选择漫剧项目"
          value={projectDir ?? undefined}
          onChange={(v) => setProjectDir(v)}
          options={projects.map((p) => ({ value: p.project_dir, label: p.name }))}
        />
        <Spin spinning={loading}>
          <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                style={{
                  width: 88,
                  height: 88,
                  padding: 0,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: '#1f1f1f',
                }}
                onClick={async () => {
                  if (!projectDir) return;
                  const url = await window.yiman?.project.getAssetDataUrl(projectDir, a.path);
                  if (!url) {
                    message.error('读取素材失败');
                    return;
                  }
                  onPick(projectDir, url, a.path);
                }}
              >
                <AssetThumb projectDir={projectDir!} path={a.path} />
              </button>
            ))}
          </div>
        </Spin>
      </Space>
    </Modal>
  );
}
