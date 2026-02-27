/**
 * 精灵动作图编辑面板：导入精灵图、ONNX RVM 抠图、预览动画
 * 注：原 spriteService（sharp 背景色+帧识别）已暂时停用，改为使用 onnxruntime-node RVM 模型抠图并重新排列
 * 支持 AI 抠图（火山引擎）：配置了 aiMattingConfigs 时在模型列表中显示，选择后走云端
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, Button, Space, Typography, App, Modal, Slider } from 'antd';
import { UploadOutlined, PictureOutlined, ExpandOutlined, ScissorOutlined } from '@ant-design/icons';
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
  const { message } = App.useApp();
  const [item, setItem] = useState<SpriteSheetItem | null>(initialItem);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [frameCount, setFrameCount] = useState(DEFAULT_FRAME_COUNT);
  const [chromaEnabled, setChromaEnabled] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState<{ r: number; g: number; b: number; a: number } | null>(null);
  const [frames, setFrames] = useState<SpriteFrameRect[]>([]);
  const [rawFrames, setRawFrames] = useState<SpriteFrameRect[]>([]);
  const [frameInspectOpen, setFrameInspectOpen] = useState(false);
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
    } else {
      setFrameCount(DEFAULT_FRAME_COUNT);
      setChromaEnabled(true);
      setBackgroundColor(null);
      setFrames([]);
      setRawFrames([]);
      setSourceImagePathForOnnx(null);
      setPlaybackFps(DEFAULT_PLAYBACK_FPS);
    }
  }, [initialItem, open]);

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
    };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('已保存');
    onClose();
  }, [item, frameCount, chromaEnabled, backgroundColor, frames, playbackFps, onSave, onClose, message]);

  const effectiveFrames = frames.length > 0 ? frames : null;
  const frameCountForDraw = effectiveFrames ? effectiveFrames.length : Math.max(1, frameCount);

  const drawPreviewFrame = useCallback(
    (ctx: CanvasRenderingContext2D, img: HTMLImageElement, frameIdx: number, size: number = PREVIEW_SIZE) => {
      const rect = effectiveFrames?.[frameIdx];
      const fw = rect ? rect.width : img.naturalWidth / Math.max(1, frameCount);
      const fh = rect ? rect.height : img.naturalHeight;
      const sx = rect ? rect.x : frameIdx * fw;
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
    [frameCount, chromaEnabled, backgroundColor, effectiveFrames]
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
    const count = frameCountForDraw;
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
              <Button
                type="link"
                icon={<ExpandOutlined />}
                onClick={() => setFrameInspectOpen(true)}
                disabled={!imageElement}
                style={{ marginTop: 8, padding: 0 }}
              >
                查看帧范围
              </Button>
            </div>

            <Modal
              title="帧范围检测（蓝：原始 / 红：归一化）"
              open={frameInspectOpen}
              onCancel={() => setFrameInspectOpen(false)}
              footer={null}
              width="100%"
              style={{ top: 0, paddingBottom: 0, maxWidth: '100%' }}
              styles={{ body: { overflow: 'auto', maxHeight: 'calc(100vh - 110px)' } }}
            >
              {imageDataUrl && imageElement && (
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    lineHeight: 0,
                  }}
                >
                  <img
                    src={imageDataUrl}
                    alt="精灵图"
                    style={{
                      display: 'block',
                      width: imageElement.naturalWidth,
                      height: imageElement.naturalHeight,
                      maxWidth: 'none',
                    }}
                  />
                  {rawFrames.map((r, i) => (
                    <div
                      key={`raw-${i}`}
                      style={{
                        position: 'absolute',
                        left: r.x,
                        top: r.y,
                        width: r.width,
                        height: r.height,
                        border: '2px solid #1890ff',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
                  {frames.map((r, i) => (
                    <div
                      key={`norm-${i}`}
                      style={{
                        position: 'absolute',
                        left: r.x,
                        top: r.y,
                        width: r.width,
                        height: r.height,
                        border: '2px solid #ff4d4f',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
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
