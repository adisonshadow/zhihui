/**
 * 精灵动作图编辑面板：导入精灵图、ONNX RVM 抠图、预览动画
 * 注：原 spriteService（sharp 背景色+帧识别）已暂时停用，改为使用 onnxruntime-node RVM 模型抠图并重新排列
 * 支持 AI 抠图（火山引擎）：配置了 aiMattingConfigs 时在模型列表中显示，选择后走云端
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, Button, Space, Typography, App, Modal, Slider, Switch, Tag, Input, Popover, Radio } from 'antd';
import { UploadOutlined, PictureOutlined, BuildOutlined, ScissorOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { MattingSettingsPanel } from './MattingSettingsPanel';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';

const { Text } = Typography;

export interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteSheetItem {
  id: string;
  name?: string;
  image_path: string;
  /** 精灵图封面（第 1 帧），多帧时自动生成 */
  cover_path?: string;
  frame_count?: number;
  chroma_key?: string;
  /** 左上 2x2 平均 RGBA，由 sharp 读取 */
  background_color?: { r: number; g: number; b: number; a: number };
  /** 由 sharp 自动识别的帧矩形，保存后复用 */
  frames?: SpriteFrameRect[];
  /** 上次使用的抠图模型，保存后再次打开时恢复；本地模型或 AI 抠图配置 id */
  matting_model?: 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2' | string;
  /** 精灵图预览播放速度（帧/秒），可保存 */
  playback_fps?: number;
  /** 是否需要抠图：false 表示已抠好，仅识别帧 */
  need_matting?: boolean;
  /** 是否为标签精灵：选中后支持属性 tag 与帧 tag */
  is_tagged_sprite?: boolean;
  /** 属性 tag 名称列表，如 ["表情", "状态"] */
  property_tags?: string[];
  /** 每帧的 tag 值：frame_tags[i][propertyName] = ["悲伤","伤心"] */
  frame_tags?: Array<Record<string, string[]>>;
}

export interface SpriteSheetPanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  characterId: string;
  item: SpriteSheetItem | null;
  onSave: (item: SpriteSheetItem) => void;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  getAssets: (projectDir: string) => Promise<{ id: string; path: string; type: string }[]>;
  saveAssetFromFile: (projectDir: string, filePath: string, type: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveAssetFromBase64?: (projectDir: string, base64Data: string, ext?: string, type?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  openFileDialog: () => Promise<string | undefined>;
  matteImageAndSave?: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** 已停用：原 spriteService sharp 背景色检测 */
  getSpriteBackgroundColor?: (projectDir: string, relativePath: string) => Promise<{ r: number; g: number; b: number; a: number } | null>;
  /** 已停用：原 spriteService sharp 帧识别，改用 processSpriteWithOnnx */
  getSpriteFrames?: (
    projectDir: string,
    relativePath: string,
    background: { r: number; g: number; b: number; a: number } | null,
    options?: { backgroundThreshold?: number; minGapPixels?: number; useTransparentBackground?: boolean }
  ) => Promise<{ raw: SpriteFrameRect[]; normalized: SpriteFrameRect[] }>;
  /** ONNX 抠图并重新排列为透明、等宽高、等间距的精灵图，支持 RVM 与 BiRefNet */
  processSpriteWithOnnx?: (
    projectDir: string,
    relativePath: string,
    options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: string; u2netpAlphaMatting?: boolean; debugDir?: string }
  ) => Promise<{ ok: boolean; path?: string; frames?: SpriteFrameRect[]; cover_path?: string; error?: string }>;
  /** 选择目录（用于调试输出） */
  openDirectoryDialog?: () => Promise<string | null>;
  /** 从精灵图提取第一帧并保存为封面（无需抠图时使用） */
  extractSpriteCover?: (
    projectDir: string,
    relativePath: string,
    frame: SpriteFrameRect
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
}

const PREVIEW_SIZE = 300;
const DEFAULT_FRAME_COUNT = 8;

const DEFAULT_PLAYBACK_FPS = 8;
const CHROMA_THRESHOLD = 120;

/** Ant Design Tag preset 颜色，按顺序分配给属性 tag */
const TAG_PRESET_COLORS = ['magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'] as const;

function applyChromaKey(
  imageData: ImageData,
  targetR: number,
  targetG: number,
  targetB: number,
  threshold: number
): void {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const dist =
      Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
    if (dist < threshold) d[i + 3] = 0;
  }
}

export function SpriteSheetPanel({
  open,
  onClose,
  projectDir,
  item: initialItem,
  onSave,
  getAssetDataUrl,
  getAssets,
  saveAssetFromFile,
  saveAssetFromBase64,
  openFileDialog,
  matteImageAndSave,
  getSpriteBackgroundColor: _getSpriteBackgroundColor,
  processSpriteWithOnnx: _processSpriteWithOnnx,
  openDirectoryDialog: _openDirectoryDialog,
  getSpriteFrames: _getSpriteFrames,
  extractSpriteCover,
}: SpriteSheetPanelProps) {
  const { message, modal } = App.useApp();
  const [item, setItem] = useState<SpriteSheetItem | null>(initialItem);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [frameCount, setFrameCount] = useState(DEFAULT_FRAME_COUNT);
  const [chromaEnabled, setChromaEnabled] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState<{ r: number; g: number; b: number; a: number } | null>(null);
  const [frames, setFrames] = useState<SpriteFrameRect[]>([]);
  const [rawFrames, setRawFrames] = useState<SpriteFrameRect[]>([]);
  const [frameInspectOpen, setFrameInspectOpen] = useState(false);
  const [frameEditZoom, setFrameEditZoom] = useState(1);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const dragStateRef = useRef<{ frameIndex: number; startX: number; startY: number; rectX: number; rectY: number } | null>(null);
  const resizeStateRef = useRef<{
    handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    frameIndex: number;
    rectX: number;
    rectY: number;
    rectW: number;
    rectH: number;
  } | null>(null);
  const resizeResultRef = useRef<{ width: number; height: number } | null>(null);
  const didDragRef = useRef(false);
  const frameEditContainerRef = useRef<HTMLDivElement>(null);

  const RESIZE_HANDLE_SIZE = 8;
  const MIN_FRAME_SIZE = 8;
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<{ id: string; path: string; type: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [recognizeFramesLoading, setRecognizeFramesLoading] = useState(false);
  const [playbackFps, setPlaybackFps] = useState(DEFAULT_PLAYBACK_FPS);
  const [mattingPanelOpen, setMattingPanelOpen] = useState(false);
  /** 用于 ONNX 抠图的原始图路径（本地上传/素材库选择的资源），不随 ONNX 结果覆盖 */
  const [sourceImagePathForOnnx, setSourceImagePathForOnnx] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!open) setMattingPanelOpen(false);
  }, [open]);

  const [isTaggedSprite, setIsTaggedSprite] = useState(false);
  const [propertyTags, setPropertyTags] = useState<string[]>([]);
  const [frameTags, setFrameTags] = useState<Array<Record<string, string[]>>>([]);
  /** 标签精灵模式下，按属性选中的 tag 值，用于过滤播放帧 */
  const [selectedTagsByProperty, setSelectedTagsByProperty] = useState<Record<string, string>>({});
  const [propertyTagInput, setPropertyTagInput] = useState('');
  const [frameTagPopoverOpen, setFrameTagPopoverOpen] = useState<number | null>(null);
  const [frameTagAddInputByProp, setFrameTagAddInputByProp] = useState<Record<string, string>>({});

  useEffect(() => {
    setItem(initialItem);
    if (initialItem) {
      setFrameCount(initialItem.frame_count ?? DEFAULT_FRAME_COUNT);
      setChromaEnabled(!!initialItem.chroma_key);
      setBackgroundColor(initialItem.background_color ?? null);
      setFrames(initialItem.frames ?? []);
      setRawFrames([]);
      setSourceImagePathForOnnx(initialItem.image_path);
      setPlaybackFps(initialItem.playback_fps ?? DEFAULT_PLAYBACK_FPS);
      setIsTaggedSprite(!!initialItem.is_tagged_sprite);
      setPropertyTags(initialItem.property_tags ?? []);
      setFrameTags(initialItem.frame_tags ?? []);
    } else {
      setFrameCount(DEFAULT_FRAME_COUNT);
      setChromaEnabled(true);
      setBackgroundColor(null);
      setFrames([]);
      setRawFrames([]);
      setSourceImagePathForOnnx(null);
      setPlaybackFps(DEFAULT_PLAYBACK_FPS);
      setIsTaggedSprite(false);
      setPropertyTags([]);
      setFrameTags([]);
    }
  }, [initialItem, open]);

  /** 标签精灵：默认选中第一个属性的第一个 tag 值 */
  useEffect(() => {
    if (!isTaggedSprite || propertyTags.length === 0) return;
    const firstProp = propertyTags[0];
    if (!firstProp || selectedTagsByProperty[firstProp] != null) return;
    const values = new Set<string>();
    for (const ft of frameTags) {
      for (const v of ft[firstProp] ?? []) {
        if (v?.trim()) values.add(v.trim());
      }
    }
    const firstVal = [...values][0];
    if (firstVal) setSelectedTagsByProperty((p) => ({ ...p, [firstProp]: firstVal }));
  }, [isTaggedSprite, propertyTags, frameTags, selectedTagsByProperty]);

  /** 帧数量变化时同步 frame_tags 数组长度 */
  useEffect(() => {
    if (frames.length === 0) return;
    setFrameTags((prev) => {
      const next = [...prev];
      while (next.length < frames.length) next.push({});
      return next.slice(0, frames.length);
    });
  }, [frames.length]);

  useEffect(() => {
    if (!open || !initialItem?.image_path) {
      setImageDataUrl(null);
      setImageElement(null);
      return;
    }
    getAssetDataUrl(projectDir, initialItem.image_path).then((url) => {
      setImageDataUrl(url ?? null);
      if (url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImageElement(img);
        img.onerror = () => setImageElement(null);
        img.src = url;
      } else {
        setImageElement(null);
      }
    });
  }, [open, projectDir, initialItem?.image_path, getAssetDataUrl]);

  // 已停用：原 spriteService（getSpriteBackgroundColor + getSpriteFrames）帧识别，改用 processSpriteWithOnnx
  // useEffect(() => { ... getSpriteBackgroundColor/getSpriteFrames ... }, [...]);

  const handleUpload = useCallback(async () => {
    const filePath = await openFileDialog();
    if (!filePath || !saveAssetFromFile) return;
    const res = await saveAssetFromFile(projectDir, filePath, 'character');
    if (!res?.ok) {
      message.error(res?.error || '上传失败');
      return;
    }
    if (res.path && item) {
      setItem((i) => (i ? { ...i, image_path: res.path! } : i));
      setSourceImagePathForOnnx(res.path);
      const url = await getAssetDataUrl(projectDir, res.path);
      setImageDataUrl(url ?? null);
      if (url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImageElement(img);
        img.onerror = () => setImageElement(null);
        img.src = url;
      }
      message.success('已导入精灵图');
    }
  }, [projectDir, saveAssetFromFile, getAssetDataUrl, openFileDialog, message, item]);

  const openAssetPicker = useCallback(() => {
    setAssetPickerOpen(true);
    getAssets(projectDir).then(setAssets);
  }, [projectDir, getAssets]);

  const handleMattingPathChange = useCallback(
    (itemId: string, newPath: string) => {
      if (!item || item.id !== itemId) return;
      setItem((i) => (i ? { ...i, image_path: newPath } : i));
      setSourceImagePathForOnnx(newPath);
      getAssetDataUrl(projectDir, newPath).then((url) => {
        setImageDataUrl(url ?? null);
        if (url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => setImageElement(img);
          img.onerror = () => setImageElement(null);
          img.src = url;
        }
      });
    },
    [projectDir, item, getAssetDataUrl]
  );

  const handleRecognizeFrames = useCallback(async () => {
    const imgPath = sourceImagePathForOnnx ?? item?.image_path;
    if (!imgPath || !_getSpriteFrames) return;
    setRecognizeFramesLoading(true);
    try {
      const res = await _getSpriteFrames(projectDir, imgPath, null, {
        useTransparentBackground: true,
        minGapPixels: 6,
      });
      if (res.normalized.length > 0) {
        setFrames(res.normalized);
        setRawFrames(res.raw);
        setFrameCount(res.normalized.length);
        setChromaEnabled(false);
        let cover_path: string | undefined;
        try {
          if (extractSpriteCover && res.normalized.length >= 1) {
            const coverRes = await extractSpriteCover(projectDir, imgPath, res.normalized[0]!);
            if (coverRes.ok && coverRes.path) {
              cover_path = coverRes.path;
            } else if (coverRes.error) {
              message.warning(`封面保存失败：${coverRes.error}`);
            }
          } else if (!extractSpriteCover) {
            message.warning('未配置封面提取，请更新应用');
          }
        } catch (e) {
          message.warning(`封面保存失败：${e instanceof Error ? e.message : '未知错误'}`);
        }
        setItem((i) =>
          i ? { ...i, frame_count: res.normalized.length, cover_path: cover_path ?? i.cover_path } : i
        );
        message.success(`已识别 ${res.normalized.length} 帧`);
      } else {
        message.warning('未识别到有效帧，请确认图片为透明背景的精灵图');
      }
    } catch {
      message.error('识别帧失败');
    } finally {
      setRecognizeFramesLoading(false);
    }
  }, [projectDir, item, sourceImagePathForOnnx, _getSpriteFrames, extractSpriteCover, message]);

  const handleFrameDelete = useCallback(() => {
    if (selectedFrameIndex == null || frames.length <= 1) return;
    setFrames((prev) => prev.filter((_, i) => i !== selectedFrameIndex));
    setFrameCount((c) => Math.max(1, c - 1));
    setSelectedFrameIndex(null);
  }, [selectedFrameIndex, frames.length]);

  const handleResizeApplyToAll = useCallback(
    (newWidth: number, newHeight: number) => {
      setFrames((prev) =>
        prev.map((f) => ({ ...f, width: newWidth, height: newHeight }))
      );
    },
    []
  );

  useEffect(() => {
    if (!frameInspectOpen) return;
    const onMouseMove = (e: MouseEvent) => {
      const box = frameEditContainerRef.current?.getBoundingClientRect();
      const scale = frameEditZoom;
      const imgW = imageElement?.naturalWidth ?? 0;
      const imgH = imageElement?.naturalHeight ?? 0;

      const rs = resizeStateRef.current;
      if (rs && box && imageElement) {
        didDragRef.current = true;
        const imageX = (e.clientX - box.left) / scale;
        const imageY = (e.clientY - box.top) / scale;
        let newX = rs.rectX;
        let newY = rs.rectY;
        let newW = rs.rectW;
        let newH = rs.rectH;
        const { handle } = rs;
        if (handle.includes('e')) newW = Math.max(MIN_FRAME_SIZE, Math.min(imgW - newX, imageX - newX));
        if (handle.includes('w')) {
          newX = Math.max(0, Math.min(rs.rectX + rs.rectW - MIN_FRAME_SIZE, imageX));
          newW = rs.rectX + rs.rectW - newX;
        }
        if (handle.includes('s')) newH = Math.max(MIN_FRAME_SIZE, Math.min(imgH - newY, imageY - newY));
        if (handle.includes('n')) {
          newY = Math.max(0, Math.min(rs.rectY + rs.rectH - MIN_FRAME_SIZE, imageY));
          newH = rs.rectY + rs.rectH - newY;
        }
        resizeResultRef.current = { width: newW, height: newH };
        setFrames((prev) => {
          const next = [...prev];
          if (next[rs.frameIndex]) next[rs.frameIndex] = { x: newX, y: newY, width: newW, height: newH };
          return next;
        });
        return;
      }

      const ds = dragStateRef.current;
      if (!ds || !imageElement) return;
      didDragRef.current = true;
      const dx = (e.clientX - ds.startX) / scale;
      const dy = (e.clientY - ds.startY) / scale;
      setFrames((prev) => {
        const r = prev[ds.frameIndex];
        if (!r) return prev;
        const newX = Math.max(0, Math.min(imageElement.naturalWidth - r.width, ds.rectX + dx));
        const newY = Math.max(0, Math.min(imageElement.naturalHeight - r.height, ds.rectY + dy));
        const next = [...prev];
        next[ds.frameIndex] = { ...r, x: newX, y: newY };
        return next;
      });
    };
    const onMouseUp = () => {
      const rs = resizeStateRef.current;
      if (rs) {
        const result = resizeResultRef.current;
        const changed = result && (result.width !== rs.rectW || result.height !== rs.rectH);
        if (changed) {
          modal.confirm({
            title: '确认应用',
            content: '改变帧宽高后将改变该精灵图的所有帧宽高，是否确认？',
            okText: '确认',
            cancelText: '取消',
            onOk: () => {
              handleResizeApplyToAll(result!.width, result!.height);
            },
            onCancel: () => {
              setFrames((prev) => {
                const next = [...prev];
                if (next[rs.frameIndex])
                  next[rs.frameIndex] = { x: rs.rectX, y: rs.rectY, width: rs.rectW, height: rs.rectH };
                return next;
              });
            },
          });
        } else {
          setFrames((prev) => {
            const next = [...prev];
            if (next[rs.frameIndex])
              next[rs.frameIndex] = { x: rs.rectX, y: rs.rectY, width: rs.rectW, height: rs.rectH };
            return next;
          });
        }
        resizeStateRef.current = null;
        resizeResultRef.current = null;
      }
      dragStateRef.current = null;
      setTimeout(() => { didDragRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [frameInspectOpen, frameEditZoom, imageElement, modal, handleResizeApplyToAll]);

  useEffect(() => {
    if (!frameInspectOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const active = document.activeElement as HTMLElement | null;
      const isEditable =
        active?.tagName === 'INPUT' ||
        active?.tagName === 'TEXTAREA' ||
        active?.isContentEditable ||
        active?.closest?.('input, textarea, [contenteditable="true"]');
      if (isEditable) return;
      e.preventDefault();
      handleFrameDelete();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frameInspectOpen, handleFrameDelete]);

  const handlePickAsset = useCallback(
    async (path: string) => {
      if (item) {
        setItem((i) => (i ? { ...i, image_path: path } : i));
        setSourceImagePathForOnnx(path);
        const url = await getAssetDataUrl(projectDir, path);
        setImageDataUrl(url ?? null);
        if (url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => setImageElement(img);
          img.onerror = () => setImageElement(null);
          img.src = url;
        }
        setAssetPickerOpen(false);
        message.success('已选择精灵图');
      }
    },
    [projectDir, getAssetDataUrl, message, item]
  );

  const handleAddPropertyTag = useCallback(() => {
    const v = propertyTagInput.trim();
    if (!v || propertyTags.includes(v)) return;
    setPropertyTags((p) => [...p, v]);
    setPropertyTagInput('');
  }, [propertyTagInput, propertyTags]);

  const handleRemovePropertyTag = useCallback((name: string) => {
    setPropertyTags((p) => p.filter((t) => t !== name));
    setFrameTags((prev) =>
      prev.map((ft) => {
        const next = { ...ft };
        delete next[name];
        return next;
      })
    );
    setSelectedTagsByProperty((p) => {
      const next = { ...p };
      delete next[name];
      return next;
    });
  }, []);

  const handleUpdateFrameTags = useCallback((frameIndex: number, prop: string, values: string[]) => {
    setFrameTags((prev) => {
      const next = [...prev];
      if (!next[frameIndex]) next[frameIndex] = {};
      next[frameIndex] = { ...next[frameIndex], [prop]: values.filter((v) => v?.trim()) };
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!item) return;
    const next: SpriteSheetItem = {
      ...item,
      name: item.name?.trim() || undefined,
      frame_count: frameCount,
      chroma_key: chromaEnabled ? '#00ff00' : undefined,
      background_color: backgroundColor ?? undefined,
      frames: frames.length > 0 ? frames : undefined,
      playback_fps: playbackFps,
      is_tagged_sprite: isTaggedSprite || undefined,
      property_tags: isTaggedSprite && propertyTags.length > 0 ? propertyTags : undefined,
      frame_tags: isTaggedSprite && frameTags.length > 0 ? frameTags : undefined,
    };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('已保存');
    onClose();
  }, [item, frameCount, chromaEnabled, backgroundColor, frames, playbackFps, isTaggedSprite, propertyTags, frameTags, onSave, onClose, message]);

  const effectiveFrames = frames.length > 0 ? frames : null;

  /** 标签精灵模式下，根据选中的 tag 过滤帧索引 */
  const filteredFrameIndices = useCallback(() => {
    if (!isTaggedSprite || !effectiveFrames || propertyTags.length === 0) return null;
    const selected = selectedTagsByProperty;
    const hasAnySelection = Object.values(selected).some((v) => v?.trim());
    if (!hasAnySelection) return null;
    return effectiveFrames
      .map((_, i) => i)
      .filter((i) => {
        const ft = frameTags[i] ?? {};
        for (const [prop, val] of Object.entries(selected)) {
          if (!val?.trim()) continue;
          const frameVals = ft[prop] ?? [];
          if (!frameVals.some((v) => v?.trim() === val.trim())) return false;
        }
        return true;
      });
  }, [isTaggedSprite, effectiveFrames, propertyTags, selectedTagsByProperty, frameTags]);

  const indices = filteredFrameIndices();
  const effectiveFramesForPlayback =
    indices != null && indices.length > 0
      ? indices.map((i) => effectiveFrames![i]!)
      : effectiveFrames;
  const effectiveFrameIndicesForPlayback =
    indices != null && indices.length > 0 ? indices : (effectiveFrames ? effectiveFrames.map((_, i) => i) : null);
  const frameCountForDraw = effectiveFramesForPlayback ? effectiveFramesForPlayback.length : Math.max(1, frameCount);

  const drawPreviewFrame = useCallback(
    (ctx: CanvasRenderingContext2D, img: HTMLImageElement, frameIdx: number, size: number = PREVIEW_SIZE) => {
      const actualIdx = effectiveFrameIndicesForPlayback?.[frameIdx] ?? frameIdx;
      const rect = effectiveFrames?.[actualIdx];
      const fw = rect ? rect.width : img.naturalWidth / Math.max(1, frameCount);
      const fh = rect ? rect.height : img.naturalHeight;
      const sx = rect ? rect.x : actualIdx * fw;
      const sy = rect ? rect.y : 0;
      const scale = Math.min(size / fw, size / fh, 1);
      const dw = fw * scale;
      const dh = fh * scale;
      ctx.clearRect(0, 0, size, size);
      if (chromaEnabled && (backgroundColor || !effectiveFrames)) {
        const off = document.createElement('canvas');
        off.width = fw;
        off.height = fh;
        const octx = off.getContext('2d');
        if (!octx) return;
        octx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
        const id = octx.getImageData(0, 0, fw, fh);
        applyChromaKey(
          id,
          backgroundColor?.r ?? 0,
          backgroundColor?.g ?? 255,
          backgroundColor?.b ?? 0,
          CHROMA_THRESHOLD
        );
        octx.putImageData(id, 0, 0);
        ctx.drawImage(off, 0, 0, fw, fh, (size - dw) / 2, (size - dh) / 2, dw, dh);
      } else {
        ctx.drawImage(img, sx, sy, fw, fh, (size - dw) / 2, (size - dh) / 2, dw, dh);
      }
    },
    [frameCount, chromaEnabled, backgroundColor, effectiveFrames, effectiveFrameIndicesForPlayback]
  );

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !open) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(PREVIEW_SIZE * dpr);
    canvas.height = Math.floor(PREVIEW_SIZE * dpr);
    canvas.style.width = `${PREVIEW_SIZE}px`;
    canvas.style.height = `${PREVIEW_SIZE}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [open, imageElement]);

  useEffect(() => {
    if (!open || !imageElement || !previewCanvasRef.current) return;
    const ctx = previewCanvasRef.current.getContext('2d');
    if (!ctx) return;
    drawPreviewFrame(ctx, imageElement, 0, PREVIEW_SIZE);
  }, [open, imageElement, frameCount, chromaEnabled, drawPreviewFrame]);

  useEffect(() => {
    if (!open || !imageElement || !previewCanvasRef.current) return;
    const ctx = previewCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const count = Math.max(1, frameCountForDraw);
    let last = performance.now();
    const interval = 1000 / playbackFps;
    const tick = () => {
      const now = performance.now();
      if (now - last >= interval) {
        last = now;
        frameIndexRef.current = (frameIndexRef.current + 1) % count;
        drawPreviewFrame(ctx, imageElement, frameIndexRef.current, PREVIEW_SIZE);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, imageElement, frameCountForDraw, drawPreviewFrame, playbackFps]);

  return (
    <>
      <Drawer
        title={
          item ? (
            <EditableTitle
              value={item.name ?? ''}
              onChange={(v) => setItem((i) => (i ? { ...i, name: v || undefined } : i))}
              placeholder="精灵动作"
              prefix="编辑精灵图："
            />
          ) : (
            '新建精灵图'
          )
        }
        placement="right"
        size={480}
        open={open}
        onClose={onClose}
        extra={
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        }
        maskClosable={false}
        // footer={
        //   <Space>
        //     <Button onClick={onClose}>取消</Button>
        //     <Button type="primary" onClick={handleSave} loading={saving}>
        //       保存
        //     </Button>
        //   </Space>
        // }
      >
        {!item ? (
          <Text type="secondary">请先保存新建项后再编辑。</Text>
        ) : (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                精灵图
              </Text>
              <Space wrap>
                <Button type="default" icon={<UploadOutlined />} onClick={handleUpload}>
                  本地上传
                </Button>
                <Button type="default" icon={<PictureOutlined />} onClick={openAssetPicker}>
                  从素材库选择
                </Button>
              </Space>
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                预览
                {effectiveFrames && (
                  <Text type="secondary" style={{ fontWeight: 'normal', marginLeft: 8 }}>
                    已识别 {effectiveFrames.length} 帧
                  </Text>
                )}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                <Space align="center">
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>标签精灵</Text>
                  <Switch
                    checked={isTaggedSprite}
                    onChange={(v) => setIsTaggedSprite(v)}
                  />
                </Space>
                <Space align="center" style={{ flex: 1, minWidth: 160 }}>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>播放速度</Text>
                  <Slider
                    min={2}
                    max={24}
                    step={1}
                    value={playbackFps}
                    onChange={(v) => setPlaybackFps(typeof v === 'number' ? v : v[0] ?? DEFAULT_PLAYBACK_FPS)}
                    tooltip={{ formatter: (v) => `${v} 帧/秒` }}
                    style={{ flex: 1, minWidth: 80 }}
                  />
                </Space>
                <Space>
                  <Button
                    icon={<ScissorOutlined />}
                    onClick={() => setMattingPanelOpen(true)}
                    disabled={!item?.image_path || !(matteImageAndSave || saveAssetFromBase64)}
                  >
                    抠图
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleRecognizeFrames}
                    loading={recognizeFramesLoading}
                    disabled={!item?.image_path || !_getSpriteFrames || recognizeFramesLoading}
                  >
                    识别帧
                  </Button>
                  <Button
                    type="primary"
                    icon={<BuildOutlined />}
                    onClick={() => {
                      setFrameInspectOpen(true);
                      setSelectedFrameIndex(null);
                      setFrameEditZoom(1);
                    }}
                    disabled={!imageElement}
                  >
                    帧编辑
                  </Button>
                </Space>
              </div>
              <div
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...CHECKERBOARD_BACKGROUND,
                }}
              >
                {imageElement ? (
                  <canvas
                    ref={previewCanvasRef}
                    style={{ display: 'block', width: PREVIEW_SIZE, height: PREVIEW_SIZE, maxWidth: '100%' }}
                  />
                ) : (
                  <Text type="secondary">请先导入精灵图</Text>
                )}
              </div>
              {isTaggedSprite && (
                <>
                  <div style={{ marginTop: 8 }}>
                    <Space wrap align="center">
                      <Text strong>属性 tag</Text>
                      {propertyTags.map((name, idx) => (
                        <Tag
                          key={name}
                          color={TAG_PRESET_COLORS[idx % TAG_PRESET_COLORS.length]}
                          closable
                          onClose={() => handleRemovePropertyTag(name)}
                        >
                          {name}
                        </Tag>
                      ))}
                      <Space.Compact size="small">
                        <Input
                          placeholder="添加属性"
                          value={propertyTagInput}
                          onChange={(e) => setPropertyTagInput(e.target.value)}
                          onPressEnter={handleAddPropertyTag}
                          style={{ width: 100 }}
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddPropertyTag} />
                      </Space.Compact>
                    </Space>
                  </div>
                  {propertyTags.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {/* <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
                        按属性选择播放帧
                      </Text> */}
                      {propertyTags.map((prop) => {
                        const values = new Set<string>();
                        for (const ft of frameTags) {
                          for (const v of ft[prop] ?? []) {
                            if (v?.trim()) values.add(v.trim());
                          }
                        }
                        const options = [...values];
                        if (options.length === 0) return null;
                        return (
                          <div key={prop} style={{ marginBottom: 8 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                              {prop}
                            </Text>
                            <Radio.Group
                              value={selectedTagsByProperty[prop] ?? ''}
                              optionType="button"
                              buttonStyle="solid"
                              onChange={(e) =>
                                setSelectedTagsByProperty((p) => ({ ...p, [prop]: e.target.value }))
                              }
                              options={[{ label: '不限', value: '' }, ...options.map((t) => ({ label: t, value: t }))]}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <Modal
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span>帧编辑</span>
                  <Space align="center">
                    <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>标签精灵</Text>
                    <Switch checked={isTaggedSprite} onChange={(v) => setIsTaggedSprite(v)} />
                  </Space>
                  <Space align="center" style={{ minWidth: 200 }}>
                    <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>缩放</Text>
                    <Slider
                      min={0.25}
                      max={2}
                      step={0.25}
                      value={frameEditZoom}
                      onChange={(v) => setFrameEditZoom(typeof v === 'number' ? v : v[0] ?? 1)}
                      tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }}
                      style={{ flex: 1, minWidth: 100 }}
                    />
                  </Space>
                  {frames.length > 0 && selectedFrameIndex != null && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleFrameDelete}
                      disabled={frames.length <= 1}
                    >
                      删除选中帧
                    </Button>
                  )}
                </div>
              }
              open={frameInspectOpen}
              onCancel={() => setFrameInspectOpen(false)}
              footer={
                (isTaggedSprite || frames.length > 0) ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      {isTaggedSprite && (
                        <Space wrap align="center">
                          <Text type="secondary" style={{ fontSize: 12 }}>属性 tag</Text>
                          {propertyTags.map((name, idx) => (
                            <Tag
                              key={name}
                              color={TAG_PRESET_COLORS[idx % TAG_PRESET_COLORS.length]}
                              closable
                              onClose={() => handleRemovePropertyTag(name)}
                            >
                              {name}
                            </Tag>
                          ))}
                          <Space.Compact>
                            <Input
                              placeholder="添加属性"
                              value={propertyTagInput}
                              onChange={(e) => setPropertyTagInput(e.target.value)}
                              onPressEnter={handleAddPropertyTag}
                              style={{ width: 100 }}
                            />
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddPropertyTag} />
                          </Space.Compact>
                        </Space>
                      )}
                    </div>
                    {frames.length > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>绿框可选中、拖拽、调整大小、删除（Delete 键）；蓝虚线为原始识别；调整大小后将统一应用到所有帧</Text>
                    )}
                  </div>
                ) : null
              }
              width="100%"
              style={{ top: 0, paddingBottom: 0, maxWidth: '100%' }}
              styles={{ body: { overflow: 'auto', maxHeight: 'calc(100vh - 140px)', ...CHECKERBOARD_BACKGROUND } }}
            >
              {imageDataUrl && imageElement && (
                <div
                  ref={frameEditContainerRef}
                  role="presentation"
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    lineHeight: 0,
                    width: imageElement.naturalWidth * frameEditZoom,
                    height: imageElement.naturalHeight * frameEditZoom,
                  }}
                  onClick={() => setSelectedFrameIndex(null)}
                >
                  <img
                    src={imageDataUrl}
                    alt="精灵图"
                    style={{
                      display: 'block',
                      width: imageElement.naturalWidth * frameEditZoom,
                      height: imageElement.naturalHeight * frameEditZoom,
                      maxWidth: 'none',
                    }}
                  />
                  {rawFrames.map((r, i) => (
                    <div
                      key={`raw-${i}`}
                      style={{
                        position: 'absolute',
                        left: r.x * frameEditZoom,
                        top: r.y * frameEditZoom,
                        width: r.width * frameEditZoom,
                        height: r.height * frameEditZoom,
                        border: '2px dotted #1890ff',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
                  {frames.map((r, i) => {
                    const w = r.width * frameEditZoom;
                    const h = r.height * frameEditZoom;
                    const hs = RESIZE_HANDLE_SIZE;
                    const isSelected = selectedFrameIndex === i;
                    const handles: { key: string; handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'; style: React.CSSProperties }[] = [
                      { key: 'n', handle: 'n', style: { left: w / 2 - hs / 2, top: -hs / 2, width: hs, height: hs } },
                      { key: 's', handle: 's', style: { left: w / 2 - hs / 2, top: h - hs / 2, width: hs, height: hs } },
                      { key: 'e', handle: 'e', style: { left: w - hs / 2, top: h / 2 - hs / 2, width: hs, height: hs } },
                      { key: 'w', handle: 'w', style: { left: -hs / 2, top: h / 2 - hs / 2, width: hs, height: hs } },
                      { key: 'ne', handle: 'ne', style: { left: w - hs / 2, top: -hs / 2, width: hs, height: hs } },
                      { key: 'nw', handle: 'nw', style: { left: -hs / 2, top: -hs / 2, width: hs, height: hs } },
                      { key: 'se', handle: 'se', style: { left: w - hs / 2, top: h - hs / 2, width: hs, height: hs } },
                      { key: 'sw', handle: 'sw', style: { left: -hs / 2, top: h - hs / 2, width: hs, height: hs } },
                    ];
                    const cursorMap: Record<string, string> = {
                      n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
                      ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
                    };
                    const ft = frameTags[i] ?? {};
                    const allTagsForFrame = propertyTags.flatMap((p) => (ft[p] ?? []).filter(Boolean));
                    const frameContent = (
                      <div
                        key={`norm-${i}`}
                        role="button"
                        style={{
                          position: 'absolute',
                          left: r.x * frameEditZoom,
                          top: r.y * frameEditZoom,
                          width: w,
                          height: h,
                          border: `2px solid ${isSelected ? '#52c41a' : '#389e0d'}`,
                          boxSizing: 'border-box',
                          cursor: 'move',
                          backgroundColor: isSelected ? 'rgba(82,196,26,0.15)' : 'transparent',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!didDragRef.current) {
                            setSelectedFrameIndex(i);
                            if (isTaggedSprite && propertyTags.length > 0) setFrameTagPopoverOpen(i);
                          }
                          didDragRef.current = false;
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          didDragRef.current = false;
                          if (!imageElement) return;
                          const rect = frames[i];
                          if (!rect) return;
                          dragStateRef.current = {
                            frameIndex: i,
                            startX: e.clientX,
                            startY: e.clientY,
                            rectX: rect.x,
                            rectY: rect.y,
                          };
                        }}
                      >
                        {isTaggedSprite && allTagsForFrame.length > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 2,
                              top: 2,
                              right: 2,
                              maxHeight: h - 4,
                              overflow: 'hidden',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 2,
                              alignContent: 'flex-start',
                              pointerEvents: 'none',
                            }}
                          >
                            {allTagsForFrame.map((t) => (
                              <Tag key={t} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                                {t}
                              </Tag>
                            ))}
                          </div>
                        )}
                        {isSelected &&
                          handles.map(({ key, handle, style }) => (
                            <div
                              key={key}
                              role="presentation"
                              style={{
                                position: 'absolute',
                                ...style,
                                cursor: cursorMap[handle],
                                backgroundColor: '#52c41a',
                                border: '1px solid #fff',
                                borderRadius: 2,
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                didDragRef.current = false;
                                const rect = frames[i];
                                if (!rect) return;
                                resizeResultRef.current = { width: rect.width, height: rect.height };
                                resizeStateRef.current = {
                                  handle,
                                  frameIndex: i,
                                  rectX: rect.x,
                                  rectY: rect.y,
                                  rectW: rect.width,
                                  rectH: rect.height,
                                };
                              }}
                            />
                          ))}
                      </div>
                    );
                    return isTaggedSprite && propertyTags.length > 0 ? (
                      <Popover
                        key={`norm-popover-${i}`}
                        open={frameTagPopoverOpen === i}
                        onOpenChange={(open) => {
                          if (!open) {
                            setFrameTagPopoverOpen(null);
                            setFrameTagAddInputByProp({});
                          }
                        }}
                        getPopupContainer={(trigger) => trigger.parentElement ?? document.body}
                        // getPopupContainer={(trigger) => trigger?.closest('.ant-modal') ?? document.body}
                        styles={{ content: {backgroundColor: '#333', borderRadius: 8 }, arrow: { color: '#333' } }}
                        trigger="click"
                        // autoFocus={false}
                        content={
                          <div style={{ width: 260, maxHeight: 320, padding: 20, overflow: 'auto' }}>
                            <Space orientation="vertical" style={{ width: '100%' }} size="small">
                              {propertyTags.map((prop, pidx) => {
                                const vals = ft[prop] ?? [];
                                const addVal = frameTagAddInputByProp[prop] ?? '';
                                return (
                                  <div key={prop}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{prop}</Text>
                                    <div style={{ marginTop: 4 }}>
                                      <Space wrap size={4} style={{ marginBottom: 4 }}>
                                        {vals.map((v) => (
                                          <Tag
                                            key={v}
                                            color={TAG_PRESET_COLORS[pidx % TAG_PRESET_COLORS.length]}
                                            closable
                                            onClose={() =>
                                              handleUpdateFrameTags(
                                                i,
                                                prop,
                                                vals.filter((x) => x !== v)
                                              )
                                            }
                                          >
                                            {v}
                                          </Tag>
                                        ))}
                                      </Space>
                                      <Space.Compact style={{ width: '100%' }}>
                                        <Input
                                          placeholder="输入后添加"
                                          value={addVal}
                                          onChange={(e) =>
                                            setFrameTagAddInputByProp((p) => ({ ...p, [prop]: e.target.value }))
                                          }
                                          onPressEnter={() => {
                                            const v = addVal.trim();
                                            if (v && !vals.includes(v)) {
                                              handleUpdateFrameTags(i, prop, [...vals, v]);
                                              setFrameTagAddInputByProp((p) => ({ ...p, [prop]: '' }));
                                            }
                                          }}
                                          size="small"
                                        />
                                        <Button
                                          size="small"
                                          type="primary"
                                          onClick={() => {
                                            const v = addVal.trim();
                                            if (v && !vals.includes(v)) {
                                              handleUpdateFrameTags(i, prop, [...vals, v]);
                                              setFrameTagAddInputByProp((p) => ({ ...p, [prop]: '' }));
                                            }
                                          }}
                                        >
                                          添加
                                        </Button>
                                      </Space.Compact>
                                    </div>
                                  </div>
                                );
                              })}
                            </Space>
                          </div>
                        }
                      >
                        {frameContent}
                      </Popover>
                    ) : (
                      frameContent
                    );
                  })}
                </div>
              )}
            </Modal>
          </Space>
        )}
      </Drawer>

      {mattingPanelOpen &&
        item?.image_path &&
        (matteImageAndSave || saveAssetFromBase64) && (
          <MattingSettingsPanel
            open={mattingPanelOpen}
            onClose={() => setMattingPanelOpen(false)}
            itemId={item.id}
            projectDir={projectDir}
            imagePath={item.image_path}
            getAssetDataUrl={getAssetDataUrl}
            saveAssetFromBase64={saveAssetFromBase64 ?? (() => Promise.resolve({ ok: false, error: '未就绪' }))}
            matteImageAndSave={matteImageAndSave ?? (async () => ({ ok: false, error: '未就绪' }))}
            onPathChange={handleMattingPathChange}
          />
        )}

      {assetPickerOpen && (
        <Drawer
          title="从素材库选择精灵图"
          placement="right"
          width={400}
          open={assetPickerOpen}
          onClose={() => setAssetPickerOpen(false)}
        >
          <div style={{ maxHeight: '80vh', overflow: 'auto' }}>
            {assets.length === 0 ? (
              <Text type="secondary">暂无素材。</Text>
            ) : (
              <Space wrap size="middle">
                {assets.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      width: 80,
                      cursor: 'pointer',
                      textAlign: 'center',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                    onClick={() => handlePickAsset(a.path)}
                  >
                    <AssetThumb projectDir={projectDir} path={a.path} getDataUrl={getAssetDataUrl} />
                    <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.path}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

function AssetThumb({
  projectDir,
  path,
  getDataUrl,
}: {
  projectDir: string;
  path: string;
  getDataUrl: (projectDir: string, path: string) => Promise<string | null>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getDataUrl]);
  return (
    <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {dataUrl ? (
        <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Text type="secondary">加载中</Text>
      )}
    </div>
  );
}
