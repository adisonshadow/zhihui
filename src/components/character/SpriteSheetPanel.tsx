/**
 * 精灵动作图编辑面板：导入精灵图、ONNX RVM 抠图、预览动画
 * 注：原 spriteService（sharp 背景色+帧识别）已暂时停用，改为使用 onnxruntime-node RVM 模型抠图并重新排列
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, Button, Space, Typography, App, Input, InputNumber, Modal, Checkbox, Select, Slider } from 'antd';
import { UploadOutlined, PictureOutlined, ExpandOutlined } from '@ant-design/icons';

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
  /** 上次使用的抠图模型，保存后再次打开时恢复 */
  matting_model?: 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2';
  /** 精灵图预览播放速度（帧/秒），可保存 */
  playback_fps?: number;
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
  openFileDialog: () => Promise<string | undefined>;
  /** 已停用：原 spriteService sharp 背景色检测 */
  getSpriteBackgroundColor?: (projectDir: string, relativePath: string) => Promise<{ r: number; g: number; b: number; a: number } | null>;
  /** 已停用：原 spriteService sharp 帧识别，改用 processSpriteWithOnnx */
  getSpriteFrames?: (
    projectDir: string,
    relativePath: string,
    background: { r: number; g: number; b: number; a: number } | null,
    options?: { backgroundThreshold?: number; minGapPixels?: number }
  ) => Promise<{ raw: SpriteFrameRect[]; normalized: SpriteFrameRect[] }>;
  /** ONNX 抠图并重新排列为透明、等宽高、等间距的精灵图，支持 RVM 与 BiRefNet */
  processSpriteWithOnnx?: (
    projectDir: string,
    relativePath: string,
    options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2'; u2netpAlphaMatting?: boolean; debugDir?: string }
  ) => Promise<{ ok: boolean; path?: string; frames?: SpriteFrameRect[]; cover_path?: string; error?: string }>;
  /** 选择目录（用于调试输出） */
  openDirectoryDialog?: () => Promise<string | null>;
}

const PREVIEW_SIZE = 200;
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
  openFileDialog,
  getSpriteBackgroundColor: _getSpriteBackgroundColor,
  getSpriteFrames: _getSpriteFrames,
  processSpriteWithOnnx,
  openDirectoryDialog,
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
  const [onnxProcessing, setOnnxProcessing] = useState(false);
  const [downsampleRatio, setDownsampleRatio] = useState(0.5);
  const [forceRvm, setForceRvm] = useState(false);
  const [mattingModel, setMattingModel] = useState<'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2'>('rvm');
  const [playbackFps, setPlaybackFps] = useState(DEFAULT_PLAYBACK_FPS);
  const [u2netpAlphaMatting, setU2netpAlphaMatting] = useState(false);
  /** 调试输出：启用时抠图后保存中间结果到 debugDir/test/ */
  const [debugMatting, setDebugMatting] = useState(false);
  const [debugDir, setDebugDir] = useState<string | null>(null);
  /** 用于 ONNX 抠图的原始图路径（本地上传/素材库选择的资源），不随 ONNX 结果覆盖 */
  const [sourceImagePathForOnnx, setSourceImagePathForOnnx] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setItem(initialItem);
    if (initialItem) {
      setFrameCount(initialItem.frame_count ?? DEFAULT_FRAME_COUNT);
      setChromaEnabled(!!initialItem.chroma_key);
      setBackgroundColor(initialItem.background_color ?? null);
      setFrames(initialItem.frames ?? []);
      setRawFrames([]);
      setSourceImagePathForOnnx(initialItem.image_path);
      setMattingModel(initialItem.matting_model ?? 'rvm');
      setPlaybackFps(initialItem.playback_fps ?? DEFAULT_PLAYBACK_FPS);
    } else {
      setFrameCount(DEFAULT_FRAME_COUNT);
      setChromaEnabled(true);
      setBackgroundColor(null);
      setFrames([]);
      setRawFrames([]);
      setSourceImagePathForOnnx(null);
      setMattingModel('rvm');
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

  const handleSelectDebugDir = useCallback(async () => {
    if (!openDirectoryDialog) return;
    const dir = await openDirectoryDialog();
    if (dir) {
      setDebugDir(dir);
      setDebugMatting(true);
      message.success(`调试输出将保存到 ${dir}/test`);
    }
  }, [openDirectoryDialog, message]);

  const handleOnnxMatting = useCallback(async () => {
    const inputPath = sourceImagePathForOnnx ?? item?.image_path;
    if (!inputPath || !processSpriteWithOnnx) return;
    setOnnxProcessing(true);
    try {
      const res = await processSpriteWithOnnx(projectDir, inputPath, {
        frameCount,
        spacing: 4,
        downsampleRatio,
        forceRvm,
        mattingModel,
        u2netpAlphaMatting: mattingModel === 'u2netp' ? u2netpAlphaMatting : undefined,
        debugDir: debugMatting && debugDir ? debugDir : undefined,
      });
      if (!res.ok) {
        message.error(res.error || 'ONNX 抠图失败');
        return;
      }
      if (res.path && res.frames && item) {
        setItem((i) =>
          i
            ? {
                ...i,
                image_path: res.path!,
                frame_count: res.frames!.length,
                cover_path: res.cover_path ?? i.cover_path,
              }
            : i
        );
        setFrames(res.frames);
        setRawFrames([]);
        setChromaEnabled(false);
        const url = await getAssetDataUrl(projectDir, res.path);
        setImageDataUrl(url ?? null);
        if (url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => setImageElement(img);
          img.onerror = () => setImageElement(null);
          img.src = url;
        }
        message.success('ONNX 抠图完成');
      }
    } finally {
      setOnnxProcessing(false);
    }
  }, [projectDir, item, sourceImagePathForOnnx, frameCount, downsampleRatio, forceRvm, mattingModel, u2netpAlphaMatting, debugMatting, debugDir, processSpriteWithOnnx, getAssetDataUrl, message]);

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
      matting_model: mattingModel,
      playback_fps: playbackFps,
    };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('已保存');
    onClose();
  }, [item, frameCount, chromaEnabled, backgroundColor, frames, mattingModel, playbackFps, onSave, onClose, message]);

  const effectiveFrames = frames.length > 0 ? frames : null;
  const frameCountForDraw = effectiveFrames ? effectiveFrames.length : Math.max(1, frameCount);

  const drawPreviewFrame = useCallback(
    (ctx: CanvasRenderingContext2D, img: HTMLImageElement, frameIdx: number) => {
      const rect = effectiveFrames?.[frameIdx];
      const fw = rect ? rect.width : img.naturalWidth / Math.max(1, frameCount);
      const fh = rect ? rect.height : img.naturalHeight;
      const sx = rect ? rect.x : frameIdx * fw;
      const sy = rect ? rect.y : 0;
      const scale = Math.min(PREVIEW_SIZE / fw, PREVIEW_SIZE / fh, 1);
      const dw = fw * scale;
      const dh = fh * scale;
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
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
        ctx.drawImage(off, 0, 0, fw, fh, (PREVIEW_SIZE - dw) / 2, (PREVIEW_SIZE - dh) / 2, dw, dh);
      } else {
        ctx.drawImage(
          img,
          sx,
          sy,
          fw,
          fh,
          (PREVIEW_SIZE - dw) / 2,
          (PREVIEW_SIZE - dh) / 2,
          dw,
          dh
        );
      }
    },
    [frameCount, chromaEnabled, backgroundColor, effectiveFrames]
  );

  useEffect(() => {
    if (!open || !imageElement || !previewCanvasRef.current) return;
    const ctx = previewCanvasRef.current.getContext('2d');
    if (!ctx) return;
    drawPreviewFrame(ctx, imageElement, 0);
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
        drawPreviewFrame(ctx, imageElement, frameIndexRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, imageElement, frameCountForDraw, drawPreviewFrame, playbackFps]);

  return (
    <>
      <Drawer
        title={item ? `编辑精灵图：${item.name || item.id}` : '新建精灵图'}
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
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                名称
              </Text>
              <Input
                placeholder="如：待机、行走、攻击"
                value={item.name ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItem((i) => (i ? { ...i, name: e.target.value || undefined } : i))}
                style={{ width: 260 }}
              />
            </div>
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
              <Space wrap align="center" style={{ marginBottom: 8 }}>
                <Text strong>抠图模型</Text>
                <Select
                  value={mattingModel}
                  onChange={(v) => setMattingModel(v)}
                  style={{ width: 170 }}
                  options={[
                    { value: 'rvm', label: 'RVM（极低精度）' },
                    { value: 'birefnet', label: 'BiRefNet（中精度）' },
                    { value: 'mvanet', label: 'MVANet（中精度）' },
                    { value: 'u2netp', label: 'U2NetP（低精度）' },
                    { value: 'rmbg2', label: 'RMBG-2（高精度）' },
                  ]}
                />
                {mattingModel === 'u2netp' && (
                  <Checkbox checked={u2netpAlphaMatting} onChange={(e) => setU2netpAlphaMatting(e.target.checked)}>
                    Alpha Matting（边缘细化）
                  </Checkbox>
                )}
                <Space wrap style={{ marginTop: 4 }}>
                  {/* <Checkbox checked={debugMatting} onChange={(e) => setDebugMatting(e.target.checked)}>
                    调试输出
                  </Checkbox> */}
                  {debugMatting && (
                    <Button size="small" onClick={handleSelectDebugDir}>
                      选择目录（将创建 test/）
                    </Button>
                  )}
                  {debugDir && debugMatting && (
                    <Text type="secondary" style={{ fontSize: 12 }}>{debugDir}/test</Text>
                  )}
                </Space>
                {mattingModel === 'rvm' && (
                  <>
                    <Text strong>下采样比</Text>
                    <InputNumber
                      min={0.125}
                      max={1}
                      step={0.125}
                      value={downsampleRatio}
                      onChange={(v) => setDownsampleRatio(v ?? 0.5)}
                      style={{ width: 90 }}
                    />
                    <Checkbox checked={forceRvm} onChange={(e) => setForceRvm(e.target.checked)}>
                      强制 RVM（有背景色时默认 Chroma Key，下采样比无效）
                    </Checkbox>
                  </>
                )}
                <Button
                  type="primary"
                  onClick={handleOnnxMatting}
                  loading={onnxProcessing}
                  disabled={!item?.image_path || !processSpriteWithOnnx || onnxProcessing}
                >
                  抠图
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
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>播放速度</Text>
                <Slider
                  min={2}
                  max={24}
                  step={1}
                  value={playbackFps}
                  onChange={(v) => setPlaybackFps(typeof v === 'number' ? v : v[0] ?? DEFAULT_PLAYBACK_FPS)}
                  tooltip={{ formatter: (v) => `${v} 帧/秒` }}
                />
              </div>
              <div
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {imageElement ? (
                  <canvas
                    ref={previewCanvasRef}
                    width={PREVIEW_SIZE}
                    height={PREVIEW_SIZE}
                    style={{ display: 'block', width: '100%', height: '100%' }}
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
