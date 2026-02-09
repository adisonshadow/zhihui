/**
 * 画布容器：视口缩放、播放/停止、超出显示 Toggle；画布按当前时间渲染关键帧插值（见功能文档 6.5、6.8、开发计划 2.10）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Dropdown, Space, Typography, Modal, Form, Select, Checkbox, Input, App } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ZoomInOutlined, ZoomOutOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Canvas } from './Canvas';
import { CanvasSelectionOverlay } from './CanvasSelectionOverlay';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_TYPES } from '@/constants/assetTypes';
import { useKeyframeCRUD, type KeyframeRow } from '@/hooks/useKeyframeCRUD';
import { getInterpolatedTransform, getInterpolatedEffects } from '@/utils/keyframeTween';
import { computeBlockZIndex } from '@/utils/canvasZIndex';

const { TextArea } = Input;
const { Text } = Typography;

const KF_TOLERANCE = 0.02;

interface LayerRow {
  id: string;
  scene_id: string;
  name: string;
  z_index: number;
  visible: number;
  locked: number;
}

interface BlockRow {
  id: string;
  layer_id: string;
  asset_id: string | null;
  start_time: number;
  end_time: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  lock_aspect?: number;
  blur?: number;
  opacity?: number;
}

interface CanvasContainerProps {
  project: ProjectInfo;
  sceneId: string | null;
  landscape: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  refreshKey?: number;
  /** 当前时间（秒）；用于关键帧插值与播放时时间轴联动 */
  currentTime?: number;
  setCurrentTime?: React.Dispatch<React.SetStateAction<number>>;
  playing?: boolean;
  onPlayPause?: () => void;
  onUpdate?: () => void;
  /** 播放到场景末尾时调用（用于停止播放） */
  onPlayEnd?: () => void;
  /** 乐观更新（含 blur/opacity 等），用于画布立即反映设置面板的修改 */
  pendingBlockUpdates?: Record<string, Partial<Pick<BlockRow, 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'blur' | 'opacity'>>>;
  setPendingBlockUpdates?: React.Dispatch<React.SetStateAction<Record<string, Partial<Pick<BlockRow, 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'blur' | 'opacity'>>>>>;
}

const DESIGN_WIDTH_LANDSCAPE = 1920;
const DESIGN_HEIGHT_LANDSCAPE = 1080;
const DESIGN_WIDTH_PORTRAIT = 1080;
const DESIGN_HEIGHT_PORTRAIT = 1920;

export function CanvasContainer({
  project,
  sceneId,
  landscape,
  selectedBlockId: selectedBlockIdProp,
  onSelectBlock: onSelectBlockProp,
  refreshKey,
  currentTime = 0,
  setCurrentTime,
  playing = false,
  onPlayPause,
  onUpdate,
  onPlayEnd,
  pendingBlockUpdates: pendingBlockUpdatesProp,
  setPendingBlockUpdates: setPendingBlockUpdatesProp,
}: CanvasContainerProps) {
  const { message } = App.useApp();
  const { getKeyframes, updateKeyframe, createKeyframe } = useKeyframeCRUD(project.project_dir);
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [keyframesByBlock, setKeyframesByBlock] = useState<Record<string, KeyframeRow[]>>({});
  const [blockDataUrls, setBlockDataUrls] = useState<Record<string, string>>({});
  const [blockAssetPaths, setBlockAssetPaths] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(0.5);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const initialFitDoneRef = useRef(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [selectedBlockIdLocal, setSelectedBlockIdLocal] = useState<string | null>(null);
  const selectedBlockId = onSelectBlockProp != null ? (selectedBlockIdProp ?? null) : selectedBlockIdLocal;
  const setSelectedBlockId = useCallback(
    (id: string | null) => {
      if (onSelectBlockProp) onSelectBlockProp(id);
      else setSelectedBlockIdLocal(id);
    },
    [onSelectBlockProp]
  );
  const [addAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm<{ type: string; is_favorite: boolean; description: string }>();
  const projectDir = project.project_dir;
  /** 拖拽时乐观更新，避免每次 move/resize/rotate 都 loadLayersAndBlocks 导致卡顿；可来自外部用于 blur/opacity 立即反映 */
  const [pendingBlockUpdatesLocal, setPendingBlockUpdatesLocal] = useState<Record<string, Partial<Pick<BlockRow, 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'blur' | 'opacity'>>>>({});
  const pendingBlockUpdates = pendingBlockUpdatesProp ?? pendingBlockUpdatesLocal;
  const setPendingBlockUpdates = setPendingBlockUpdatesProp ?? setPendingBlockUpdatesLocal;

  const designWidth = landscape ? DESIGN_WIDTH_LANDSCAPE : DESIGN_WIDTH_PORTRAIT;
  const designHeight = landscape ? DESIGN_HEIGHT_LANDSCAPE : DESIGN_HEIGHT_PORTRAIT;

  const computeFitZoom = useCallback(
    (containerW: number, containerH: number) => {
      if (containerW <= 0 || containerH <= 0) return 0.5;
      const fit = Math.min(containerW / designWidth, containerH / designHeight);
      return Math.max(0.1, Math.min(2, fit));
    },
    [designWidth, designHeight]
  );

  const handleFitToWindow = useCallback(() => {
    const el = stageViewportRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setZoom(computeFitZoom(width, height));
  }, [computeFitZoom]);

  useEffect(() => {
    const el = stageViewportRef.current;
    if (!el || initialFitDoneRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || initialFitDoneRef.current) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setZoom(computeFitZoom(width, height));
        initialFitDoneRef.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeFitZoom, sceneId]);

  useEffect(() => {
    const el = stageViewportRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const scale = d / pinchRef.current.distance;
        const newZoom = Math.max(0.1, Math.min(2, pinchRef.current.zoom * scale));
        setZoom(newZoom);
      }
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const loadLayersAndBlocks = useCallback(async () => {
    if (!sceneId || !window.yiman?.project?.getLayers) return [];
    const layerList = (await window.yiman.project.getLayers(projectDir, sceneId)) as LayerRow[];
    setLayers(layerList);
    const allBlocks: BlockRow[] = [];
    if (window.yiman.project.getTimelineBlocks) {
      for (const layer of layerList) {
        const list = (await window.yiman.project.getTimelineBlocks(projectDir, layer.id)) as BlockRow[];
        allBlocks.push(...list);
      }
    }
    setBlocks(allBlocks);
    const urls: Record<string, string> = {};
    const paths: Record<string, string> = {};
    if (window.yiman.project.getAssetById && window.yiman.project.getAssetDataUrl) {
      for (const b of allBlocks) {
        if (!b.asset_id) continue;
        const asset = await window.yiman.project.getAssetById(projectDir, b.asset_id);
        if (asset?.path) {
          paths[b.id] = asset.path;
          const dataUrl = await window.yiman.project.getAssetDataUrl(projectDir, asset.path);
          if (dataUrl) urls[b.id] = dataUrl;
        }
      }
    }
    setBlockDataUrls(urls);
    setBlockAssetPaths(paths);
    return allBlocks;
  }, [projectDir, sceneId]);

  useEffect(() => {
    loadLayersAndBlocks();
  }, [loadLayersAndBlocks, refreshKey]);

  /** 加载所有块的关键帧（用于画布按当前时间插值渲染） */
  useEffect(() => {
    if (!blocks.length || !getKeyframes) return;
    let cancelled = false;
    const load = async () => {
      const next: Record<string, KeyframeRow[]> = {};
      for (const b of blocks) {
        const kf = await getKeyframes(b.id);
        if (!cancelled) next[b.id] = kf ?? [];
      }
      if (!cancelled) setKeyframesByBlock(next);
    };
    load();
    return () => { cancelled = true; };
  }, [blocks, getKeyframes, refreshKey]);

  const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  /** 仅显示当前时间在块区间内的素材，并用关键帧插值得到位置/缩放/旋转/透明度等（见功能文档 6.8）；合并 pendingBlockUpdates 实现拖拽时乐观更新 */
  const blockItems: import('./Canvas').BlockItem[] = blocks
    .filter((b) => visibleLayerIds.has(b.layer_id) && currentTime >= b.start_time && currentTime <= b.end_time)
    .map((b) => {
      const pending = pendingBlockUpdates[b.id];
      const kfs = keyframesByBlock[b.id] ?? [];
      const base = {
        start_time: b.start_time,
        end_time: b.end_time,
        pos_x: b.pos_x,
        pos_y: b.pos_y,
        scale_x: b.scale_x,
        scale_y: b.scale_y,
        rotation: b.rotation,
        blur: (b as BlockRow).blur ?? 0,
        opacity: (b as BlockRow).opacity ?? 1,
      };
      const transform = getInterpolatedTransform(base, kfs, currentTime);
      const effects = getInterpolatedEffects(base, kfs, currentTime);
      return {
        ...b,
        pos_x: pending?.pos_x ?? transform.pos_x,
        pos_y: pending?.pos_y ?? transform.pos_y,
        scale_x: pending?.scale_x ?? transform.scale_x,
        scale_y: pending?.scale_y ?? transform.scale_y,
        rotation: pending?.rotation ?? transform.rotation,
        dataUrl: blockDataUrls[b.id] ?? null,
        isVideo: /\.(mp4|webm)$/i.test(blockAssetPaths[b.id] ?? ''),
        lock_aspect: (b as BlockRow).lock_aspect ?? 1,
        opacity: pending?.opacity ?? effects.opacity,
        blur: pending?.blur ?? effects.blur,
        color: effects.color,
        zIndex: computeBlockZIndex(b.id, blocks, layers),
      };
    });

  /** 最后一次 DB 更新的 Promise，drop 时需 await 确保写入完成再 load（见 drop 后位置不对） */
  const lastBlockUpdatePromiseRef = useRef<Promise<void> | null>(null);

  /** 画布拖拽移动素材时：更新 DB + 乐观更新 pending，不触发 loadLayersAndBlocks（拖拽结束由 onDragEnd 刷新）；接收绝对位置避免异步 base 错乱 */
  /** 有关键帧时插值优先于 block，需在 currentTime 创建或更新 pos 关键帧，否则 drop 后位置会被关键帧插值覆盖 */
  const handleBlockMove = useCallback(
    async (blockId: string, newPos_x: number, newPos_y: number) => {
      if (!window.yiman?.project?.updateTimelineBlock) return;
      const newX = Math.max(0, Math.min(1, newPos_x));
      const newY = Math.max(0, Math.min(1, newPos_y));
      const run = async () => {
        const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { pos_x: newX, pos_y: newY });
        if (res?.ok) {
          const kfList = await getKeyframes(blockId);
          const posKfs = kfList.filter((k) => (k.property || 'pos') === 'pos');
          const posKfAtTime = posKfs.find((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (posKfAtTime) {
            await updateKeyframe(posKfAtTime.id, { pos_x: newX, pos_y: newY });
          } else if (posKfs.length > 0 && window.yiman?.project?.createKeyframe) {
            await createKeyframe({
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              block_id: blockId,
              time: currentTime,
              property: 'pos',
              pos_x: newX,
              pos_y: newY,
            });
          }
          setPendingBlockUpdates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], pos_x: newX, pos_y: newY } }));
        }
      };
      const p = run();
      lastBlockUpdatePromiseRef.current = p;
      await p;
    },
    [projectDir, currentTime, getKeyframes, updateKeyframe, createKeyframe]
  );

  /** 叠加层 resize：更新 DB + 乐观更新，不触发 loadLayersAndBlocks；有关键帧时需在 currentTime 创建或更新 pos/scale 关键帧 */
  const handleBlockResize = useCallback(
    async (blockId: string, data: { pos_x: number; pos_y: number; scale_x: number; scale_y: number }) => {
      if (!window.yiman?.project?.updateTimelineBlock) return;
      const run = async () => {
        const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, data);
        if (res?.ok) {
          const kfList = await getKeyframes(blockId);
          const posKfs = kfList.filter((k) => (k.property || 'pos') === 'pos');
          const posKfAtTime = posKfs.find((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (posKfAtTime) {
            await updateKeyframe(posKfAtTime.id, { pos_x: data.pos_x, pos_y: data.pos_y });
          } else if (posKfs.length > 0 && window.yiman?.project?.createKeyframe) {
            await createKeyframe({
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              block_id: blockId,
              time: currentTime,
              property: 'pos',
              pos_x: data.pos_x,
              pos_y: data.pos_y,
            });
          }
          const scaleKfs = kfList.filter((k) => k.property === 'scale');
          const scaleKfAtTime = scaleKfs.find((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (scaleKfAtTime) {
            await updateKeyframe(scaleKfAtTime.id, { scale_x: data.scale_x, scale_y: data.scale_y });
          } else if (scaleKfs.length > 0 && window.yiman?.project?.createKeyframe) {
            await createKeyframe({
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              block_id: blockId,
              time: currentTime,
              property: 'scale',
              scale_x: data.scale_x,
              scale_y: data.scale_y,
            });
          }
          setPendingBlockUpdates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], ...data } }));
        }
      };
      const p = run();
      lastBlockUpdatePromiseRef.current = p;
      await p;
    },
    [projectDir, currentTime, getKeyframes, updateKeyframe, createKeyframe]
  );

  /** 叠加层旋转：更新 DB + 乐观更新，不触发 loadLayersAndBlocks；有关键帧时需在 currentTime 创建或更新 rotation 关键帧 */
  const handleBlockRotate = useCallback(
    async (blockId: string, rotation: number) => {
      if (!window.yiman?.project?.updateTimelineBlock) return;
      const run = async () => {
        const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { rotation });
        if (res?.ok) {
          const kfList = await getKeyframes(blockId);
          const rotKfs = kfList.filter((k) => k.property === 'rotation');
          const rotKfAtTime = rotKfs.find((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (rotKfAtTime) {
            await updateKeyframe(rotKfAtTime.id, { rotation });
          } else if (rotKfs.length > 0 && window.yiman?.project?.createKeyframe) {
            await createKeyframe({
              id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              block_id: blockId,
              time: currentTime,
              property: 'rotation',
              rotation,
            });
          }
          setPendingBlockUpdates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], rotation } }));
        }
      };
      const p = run();
      lastBlockUpdatePromiseRef.current = p;
      await p;
    },
    [projectDir, currentTime, getKeyframes, updateKeyframe, createKeyframe]
  );

  /** 叠加层拖拽结束：等待最后一次 DB 写入完成，再清除乐观更新、重新加载数据、同步到设置面板 */
  const handleOverlayDragEnd = useCallback(async () => {
    if (lastBlockUpdatePromiseRef.current) {
      await lastBlockUpdatePromiseRef.current;
      lastBlockUpdatePromiseRef.current = null;
    }
    setPendingBlockUpdates({});
    const allBlocks = await loadLayersAndBlocks();
    // 强制重新加载关键帧数据，确保使用最新的关键帧数据（修复 drop 后位置不对的问题）
    if (allBlocks && allBlocks.length > 0) {
      const next: Record<string, KeyframeRow[]> = {};
      for (const b of allBlocks) {
        const kf = await getKeyframes(b.id);
        next[b.id] = kf ?? [];
      }
      setKeyframesByBlock(next);
    }
    onUpdate?.();
  }, [loadLayersAndBlocks, onUpdate, getKeyframes]);

  /** 播放时时间轴随进度向右移动（见功能文档 6.8）；用 ref 避免 effect 因 onPlayEnd/sceneDuration 每帧重启导致时间倒退 */
  const sceneDuration = blocks.length ? Math.max(...blocks.map((b) => b.end_time), 0) : 0;
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const onPlayEndRef = useRef(onPlayEnd);
  onPlayEndRef.current = onPlayEnd;
  const sceneDurationRef = useRef(sceneDuration);
  sceneDurationRef.current = sceneDuration;
  useEffect(() => {
    if (!playing || !setCurrentTime) return;
    const tick = (now: number) => {
      const prevTime = lastTimeRef.current;
      const delta = prevTime > 0 ? (now - prevTime) / 1000 : 0;
      lastTimeRef.current = now;
      setCurrentTime((prev) => {
        const next = Math.max(prev, prev + delta);
        const sd = sceneDurationRef.current;
        if (next >= sd) {
          onPlayEndRef.current?.();
          return sd;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, setCurrentTime]);

  const addMenuItems: MenuProps['items'] = [
    { key: 'bg', label: '背景' },
    { key: 'fx', label: '前景特效' },
    { key: 'motion', label: '场景运动' },
  ];

  const handleAddLocalAsset = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values || !sceneId) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '素材', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'] }],
    });
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    setUploading(true);
    try {
      const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, values.type, {
        description: values.description?.trim() || null,
        is_favorite: values.is_favorite ? 1 : 0,
      });
      if (!res?.ok || !res.id) {
        message.error(res?.error || '上传失败');
        return;
      }
      let layerList = layers;
      if (layerList.length === 0 && window.yiman?.project?.createLayer) {
        const layerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const cr = await window.yiman.project.createLayer(projectDir, { id: layerId, scene_id: sceneId, name: '主轨道', z_index: 0, is_main: 1 });
        if (cr?.ok) {
          await loadLayersAndBlocks();
          layerList = (await window.yiman.project.getLayers(projectDir, sceneId)) as LayerRow[];
        }
      }
      const layerId = layerList[0]?.id;
      if (!layerId || !window.yiman?.project?.createTimelineBlock) return;
      const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      // 本地上传为图片，无播放时长默认 10 秒（见功能文档 6）
      const br = await window.yiman.project.createTimelineBlock(projectDir, {
        id: blockId,
        layer_id: layerId,
        asset_id: res.id,
        start_time: 0,
        end_time: 10,
        pos_x: 0.5,
        pos_y: 0.5,
        scale_x: 0.25,
        scale_y: 0.25,
        rotation: 0,
      });
      if (br?.ok) {
        message.success('已添加至画布');
        setAddAssetModalOpen(false);
        form.resetFields();
        loadLayersAndBlocks();
      } else message.error(br?.error || '添加失败');
    } finally {
      setUploading(false);
    }
  };

  if (!sceneId) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2e2e2e' }}>
        <Text type="secondary">请先在左侧选择场景</Text>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 画布上方 Panel */}
      <div style={{ flex: 'none', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button
          type="text"
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={() => onPlayPause?.()}
        >
          {playing ? '停止' : '播放'}
        </Button>
        <Space>
          <Button type="text" icon={<ZoomOutOutlined />} onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} />
          <Text style={{ minWidth: 48 }}>{Math.round(zoom * 100)}%</Text>
          <Button type="text" icon={<ZoomInOutlined />} onClick={() => setZoom((z) => Math.min(2, z + 0.1))} />
        </Space>
        <Dropdown menu={{ items: addMenuItems }} trigger={['click']}>
          <Button type="default" icon={<PlusOutlined />}>
          </Button>
        </Dropdown>
        <Button type="default" onClick={handleFitToWindow}>
          Fit
        </Button>
        <Button type={overflowVisible ? 'primary' : 'default'} onClick={() => setOverflowVisible(!overflowVisible)}>
          Overflow
        </Button>
        <Button type="primary" icon={<UploadOutlined />} onClick={() => setAddAssetModalOpen(true)} />
      </div>

      {/* 舞台：视口 + 画布（缩放内）+ 选中态叠加层（缩放外，固定像素把手） */}
      <div
        ref={stageViewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: overflowVisible ? 'auto' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2e2e2e',
          position: 'relative',
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
            pinchRef.current = { distance: d, zoom };
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinchRef.current = null;
        }}
        onTouchCancel={(e) => {
          if (e.touches.length < 2) pinchRef.current = null;
        }}
      >
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          <Canvas
            designWidth={designWidth}
            designHeight={designHeight}
            zoom={zoom}
            blocks={blockItems}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onBlockMove={handleBlockMove}
            onBlockMoveEnd={handleOverlayDragEnd}
          />
        </div>
        <CanvasSelectionOverlay
          viewportRef={stageViewportRef}
          zoom={zoom}
          designWidth={designWidth}
          designHeight={designHeight}
          selectedBlock={selectedBlockId ? (blockItems.find((b) => b.id === selectedBlockId) ?? null) : null}
          onResize={handleBlockResize}
          onRotate={handleBlockRotate}
          onBlockMove={handleBlockMove}
          onDragEnd={handleOverlayDragEnd}
        />
      </div>

      <Modal
        title="添加本地素材"
        open={addAssetModalOpen}
        onCancel={() => setAddAssetModalOpen(false)}
        onOk={handleAddLocalAsset}
        confirmLoading={uploading}
        okText="选择文件并添加"
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'scene_bg', is_favorite: false, description: '' }}>
          <Form.Item name="type" label="分类" rules={[{ required: true }]}>
            <Select options={ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
          <Form.Item name="is_favorite" valuePropName="checked">
            <Checkbox>保存为常用</Checkbox>
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <TextArea rows={2} placeholder="素材描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
