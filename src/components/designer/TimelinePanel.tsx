/**
 * 时间线面板：时间尺 + 分层列表 + 时间线轨道/素材条/选中时间轴（见功能文档 6.7、开发计划 2.11）
 * 布局：timeline-header + timeline-tracks-viewport(Splitter: labels | tracks)，scroll 联动
 * 使用 @dnd-kit 实现素材条 drag/drop，主轨道 horizontal sortable
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Typography, Checkbox, Select, Slider, Splitter, App, Space } from 'antd';
import { LockOutlined, UnlockOutlined, ArrowUpOutlined, ArrowDownOutlined, ZoomOutOutlined, ZoomInOutlined, UndoOutlined, RedoOutlined, ExportOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { ProjectInfo } from '@/hooks/useProject';
import { TimelineBlockSortable } from './TimelineBlockSortable';
import { TimelineBlockDraggable } from './TimelineBlockDraggable';
import { BlockOverlay } from './BlockOverlay';
import { TrackDroppable } from './TrackDroppable';
import { BetweenDropZone } from './BetweenDropZone';

const { Text } = Typography;

const TIME_AXIS_WIDTH = 40;
const TRACK_HEIGHT = 32;
const RULER_HEIGHT = 24;
const DEFAULT_LABELS_WIDTH = 240;
/** 时间单位：1 秒 = timeZoom 像素；timeZoom 范围 10～200 */

interface LayerRow {
  id: string;
  scene_id: string;
  name: string;
  z_index: number;
  visible: number;
  locked: number;
  is_main: number;
  layer_type?: string; // 'video' | 'audio'
}

interface BlockRow {
  id: string;
  layer_id: string;
  asset_id: string | null;
  start_time: number;
  end_time: number;
}

interface KeyframeRow {
  id: string;
  block_id: string;
  time: number;
}

interface TimelinePanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onLayersChange?: () => void;
  /** 外部刷新（如放置素材后）时递增，触发重新拉取层与块 */
  refreshKey?: number;
  /** 导出视频按钮点击 */
  onExportClick?: () => void;
}

export function TimelinePanel({
  project,
  sceneId,
  currentTime,
  setCurrentTime,
  selectedBlockId,
  onSelectBlock,
  onLayersChange,
  refreshKey,
  onExportClick,
}: TimelinePanelProps) {
  const { message } = App.useApp();
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [blocksByLayer, setBlocksByLayer] = useState<Record<string, BlockRow[]>>({});
  const [keyframesByBlock, setKeyframesByBlock] = useState<Record<string, KeyframeRow[]>>({});
  const [timeZoom, setTimeZoom] = useState(50);
  const [compact, setCompact] = useState(false);
  const [activeBlock, setActiveBlock] = useState<BlockRow | null>(null);
  const [tracksScrollLeft, setTracksScrollLeft] = useState(0);
  const [dragExtraWidth, setDragExtraWidth] = useState(0);
  const projectDir = project.project_dir;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadLayersAndBlocks = useCallback(async () => {
    if (!sceneId || !window.yiman?.project?.getLayers) return;
    let layerList = (await window.yiman.project.getLayers(projectDir, sceneId)) as LayerRow[];
    if (layerList.length === 0 && window.yiman?.project?.createLayer) {
      const layerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await window.yiman.project.createLayer(projectDir, { id: layerId, scene_id: sceneId, name: '主轨道', z_index: 0, is_main: 1 });
      layerList = (await window.yiman.project.getLayers(projectDir, sceneId)) as LayerRow[];
    }
    setLayers(layerList.sort((a, b) => a.z_index - b.z_index));
    const blocks: Record<string, BlockRow[]> = {};
    const keyframes: Record<string, KeyframeRow[]> = {};
    if (window.yiman.project.getTimelineBlocks && window.yiman.project.getKeyframes) {
      for (const layer of layerList) {
        const list = (await window.yiman.project.getTimelineBlocks(projectDir, layer.id)) as BlockRow[];
        blocks[layer.id] = list;
        for (const b of list) {
          const kf = (await window.yiman.project.getKeyframes(projectDir, b.id)) as KeyframeRow[];
          keyframes[b.id] = kf;
        }
      }
    }
    setBlocksByLayer(blocks);
    setKeyframesByBlock(keyframes);
  }, [projectDir, sceneId]);

  useEffect(() => {
    loadLayersAndBlocks();
  }, [loadLayersAndBlocks, refreshKey]);

  const toggleVisible = async (layer: LayerRow) => {
    const res = await window.yiman?.project?.updateLayer(projectDir, layer.id, { visible: layer.visible ? 0 : 1 });
    if (res?.ok) {
      loadLayersAndBlocks();
      onLayersChange?.();
    } else message.error(res?.error || '操作失败');
  };

  const toggleLocked = async (layer: LayerRow) => {
    const res = await window.yiman?.project?.updateLayer(projectDir, layer.id, { locked: layer.locked ? 0 : 1 });
    if (res?.ok) loadLayersAndBlocks();
    else message.error(res?.error || '操作失败');
  };

  const setLayerType = async (layer: LayerRow, layerType: 'video' | 'audio') => {
    const res = await window.yiman?.project?.updateLayer(projectDir, layer.id, { layer_type: layerType });
    if (res?.ok) loadLayersAndBlocks();
  };
  const moveLayer = async (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= layers.length) return;
    const a = layers[index];
    const b = layers[next];
    const resA = await window.yiman?.project?.updateLayer(projectDir, a.id, { z_index: b.z_index });
    const resB = await window.yiman?.project?.updateLayer(projectDir, b.id, { z_index: a.z_index });
    if (resA?.ok && resB?.ok) {
      loadLayersAndBlocks();
      onLayersChange?.();
    } else message.error(resA?.error || resB?.error || '操作失败');
  };

  /** 删除素材条（见功能文档 6.7）；关键帧仅在功能面板创建 */
  const handleDeleteBlock = useCallback(async () => {
    if (!selectedBlockId || !window.yiman?.project?.deleteTimelineBlock) return;
    const res = await window.yiman.project.deleteTimelineBlock(projectDir, selectedBlockId);
    if (res?.ok) {
      message.success('已删除素材条');
      onSelectBlock(null);
      loadLayersAndBlocks();
      onLayersChange?.();
    } else message.error(res?.error || '删除失败');
  }, [projectDir, selectedBlockId, message, onSelectBlock, loadLayersAndBlocks, onLayersChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleDeleteBlock();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBlockId, handleDeleteBlock]);

  const timeToX = (t: number) => t * timeZoom;
  const xToTime = (x: number) => Math.max(0, x / timeZoom);

  /** 场景总时间：最后面一个素材的最后一帧时间（所有块 end_time 的最大值），精确到小数点后一位；播放与拖拽不可超过此时间 */
  const sceneTotalTimeRaw = React.useMemo(() => {
    let maxEnd = 0;
    for (const layerId of Object.keys(blocksByLayer)) {
      for (const b of blocksByLayer[layerId] ?? []) {
        if (b.end_time > maxEnd) maxEnd = b.end_time;
      }
    }
    return maxEnd;
  }, [blocksByLayer]);
  const sceneTotalTime = Math.round(sceneTotalTimeRaw * 10) / 10;

  const setCurrentTimeClamped = useCallback(
    (t: number) => setCurrentTime(Math.max(0, Math.min(sceneTotalTimeRaw, t))),
    [setCurrentTime, sceneTotalTimeRaw]
  );

  const tracksViewportRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const rulerLabelScrollRef = useRef<HTMLDivElement>(null);
  const rulerTicksWrapperRef = useRef<HTMLDivElement>(null);
  const layerLabelsBodyRef = useRef<HTMLDivElement>(null);
  const labelsContainerRef = useRef<HTMLDivElement>(null);

  const SNAP_PX = 10;
  const startPlayheadDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const tracksRect = tracksScrollRef.current?.getBoundingClientRect();
      const tracksEl = tracksScrollRef.current;
      if (!tracksRect) return;
      const onMove = (ev: MouseEvent) => {
        const scrollLeft = tracksEl?.scrollLeft ?? 0;
        const x = ev.clientX - tracksRect.left + scrollLeft;
        let t = xToTime(x);
        if (selectedBlockId) {
          const kfs = keyframesByBlock[selectedBlockId] ?? [];
          for (const kf of kfs) {
            const kfX = timeToX(kf.time);
            if (Math.abs(kfX - x) < SNAP_PX) {
              t = kf.time;
              break;
            }
          }
        }
        setCurrentTimeClamped(t);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [setCurrentTimeClamped, xToTime, timeToX, selectedBlockId, blocksByLayer, keyframesByBlock]
  );

  const mainLayerId = layers.find((l) => l.is_main)?.id ?? null;

  /** 调整右边缘时级联后移后续素材（见功能文档 6.7） */
  const handleResizeBlock = useCallback(
    (blockId: string, edge: 'left' | 'right', initialStart: number, initialEnd: number, layerId: string) => {
      const trackRect = tracksScrollRef.current?.getBoundingClientRect();
      if (!trackRect) return;
      const minDur = 0.5;
      const isMainTrack = layerId === mainLayerId;
      const onMove = (e: MouseEvent) => {
        const x = e.clientX - trackRect.left + (tracksScrollRef.current?.scrollLeft ?? 0);
        const t = xToTime(x);
        if (edge === 'right') {
          const newEnd = Math.max(initialStart + minDur, t);
          if (isMainTrack && window.yiman?.project?.resizeTimelineBlockWithCascade) {
            window.yiman.project.resizeTimelineBlockWithCascade(projectDir, blockId, newEnd);
          } else if (!isMainTrack && window.yiman?.project?.updateTimelineBlock) {
            window.yiman.project.updateTimelineBlock(projectDir, blockId, { end_time: newEnd });
          }
        } else if (edge === 'left' && window.yiman?.project?.updateTimelineBlock) {
          const newStart = Math.max(0, Math.min(t, initialEnd - minDur));
          window.yiman.project.updateTimelineBlock(projectDir, blockId, { start_time: newStart });
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        loadLayersAndBlocks();
        onLayersChange?.();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [projectDir, xToTime, mainLayerId, loadLayersAndBlocks, onLayersChange]
  );

  /** 检查非主轨道上 [start, end] 是否与已有块重叠（排除 blockId） */
  const hasOverlap = useCallback(
    (layerId: string, start: number, end: number, excludeBlockId?: string) => {
      const blocks = (blocksByLayer[layerId] ?? []).filter((b) => b.id !== excludeBlockId);
      return blocks.some((b) => !(end <= b.start_time || b.end_time <= start));
    },
    [blocksByLayer]
  );

  /** 非主轨道：若重叠小于 50px 且有空间，返回可紧靠的位置；否则 null */
  const SNAP_OVERLAP_PX = 50;
  const trySnapNonOverlap = useCallback(
    (layerId: string, dropTime: number, duration: number, excludeBlockId?: string): { start: number; end: number } | null => {
      const blocks = (blocksByLayer[layerId] ?? []).filter((b) => b.id !== excludeBlockId);
      const newStart = dropTime;
      const newEnd = dropTime + duration;
      const overlapping = blocks.filter((b) => !(newEnd <= b.start_time || b.end_time <= newStart));
      if (overlapping.length === 0) return { start: newStart, end: newEnd };
      const maxOverlapTime = Math.max(
        ...overlapping.map((b) => Math.min(newEnd, b.end_time) - Math.max(newStart, b.start_time))
      );
      if (maxOverlapTime * timeZoom >= SNAP_OVERLAP_PX) return null;
      const leftmost = overlapping.reduce((a, b) => (a.start_time < b.start_time ? a : b));
      const rightmost = overlapping.reduce((a, b) => (a.end_time > b.end_time ? a : b));
      const tryBefore: { start: number; end: number } = { start: leftmost.start_time - duration, end: leftmost.start_time };
      const tryAfter: { start: number; end: number } = { start: rightmost.end_time, end: rightmost.end_time + duration };
      const okBefore = tryBefore.start >= 0 && !blocks.some((b) => !(tryBefore.end <= b.start_time || b.end_time <= tryBefore.start));
      const okAfter = !blocks.some((b) => !(tryAfter.end <= b.start_time || b.end_time <= tryAfter.start));
      if (okBefore && okAfter) {
        return Math.abs(tryBefore.start - dropTime) <= Math.abs(tryAfter.start - dropTime) ? tryBefore : tryAfter;
      }
      if (okBefore) return tryBefore;
      if (okAfter) return tryAfter;
      return null;
    },
    [blocksByLayer, timeZoom]
  );

  const [dragOver, setDragOver] = useState<
    | { type: 'track'; layerId: string; insertTime: number; blockWidth?: number; placeStart?: number; placeEnd?: number }
    | { type: 'between'; afterIndex: number }
    | null
  >(null);

  const isScrollingFromTracksRef = useRef(false);
  const handleTracksScroll = useCallback(() => {
    const el = tracksScrollRef.current;
    if (!el) return;
    setTracksScrollLeft(el.scrollLeft);
    isScrollingFromTracksRef.current = true;
    rulerTicksWrapperRef.current && (rulerTicksWrapperRef.current.scrollLeft = el.scrollLeft);
    layerLabelsBodyRef.current && (layerLabelsBodyRef.current.scrollTop = el.scrollTop);
    queueMicrotask(() => { isScrollingFromTracksRef.current = false; });
  }, []);
  const handleRulerTicksScroll = useCallback(() => {
    if (isScrollingFromTracksRef.current) return;
    const ruler = rulerTicksWrapperRef.current;
    const tracks = tracksScrollRef.current;
    if (ruler && tracks) {
      tracks.scrollLeft = ruler.scrollLeft;
      setTracksScrollLeft(ruler.scrollLeft);
      layerLabelsBodyRef.current && (layerLabelsBodyRef.current.scrollTop = tracks.scrollTop);
    }
  }, []);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const ruler = rulerTicksWrapperRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const contentX = e.clientX - rect.left + ruler.scrollLeft;
      setCurrentTimeClamped(xToTime(Math.max(0, contentX)));
    },
    [setCurrentTimeClamped, xToTime]
  );

  const handleDropBlockData = useCallback(
    async (blockId: string, fromLayerId: string, toLayerId: string, dropTime: number) => {
      const block = (blocksByLayer[fromLayerId] ?? []).find((b) => b.id === blockId);
      const duration = block ? block.end_time - block.start_time : 10;

      if (fromLayerId === toLayerId) {
        if (toLayerId === mainLayerId && window.yiman?.project?.moveBlockToMainTrack) {
          const res = await window.yiman.project.moveBlockToMainTrack(projectDir, sceneId!, blockId, dropTime);
          if (res?.ok) {
            loadLayersAndBlocks();
            onLayersChange?.();
          } else message.error(res?.error || '移动失败');
        } else {
          let newStart = dropTime;
          let newEnd = dropTime + duration;
          if (hasOverlap(toLayerId, newStart, newEnd, blockId)) {
            const snapped = trySnapNonOverlap(toLayerId, dropTime, duration, blockId);
            if (snapped) {
              newStart = snapped.start;
              newEnd = snapped.end;
            } else {
              message.warning('该位置与已有素材重叠');
              return;
            }
          }
          const res = await window.yiman?.project?.updateTimelineBlock(projectDir, blockId, { start_time: newStart, end_time: newEnd });
          if (res?.ok) {
            loadLayersAndBlocks();
            onLayersChange?.();
          } else message.error(res?.error || '移动失败');
        }
        return;
      }
      if (toLayerId === mainLayerId && window.yiman?.project?.moveBlockToMainTrack) {
        const res = await window.yiman.project.moveBlockToMainTrack(projectDir, sceneId!, blockId, dropTime);
        if (res?.ok) {
          const fromBlocks = blocksByLayer[fromLayerId] ?? [];
          if (fromLayerId !== mainLayerId && fromBlocks.length === 1 && window.yiman?.project?.deleteLayer) {
            await window.yiman.project.deleteLayer(projectDir, fromLayerId);
          }
          loadLayersAndBlocks();
          onLayersChange?.();
        } else message.error(res?.error || '移动失败');
        return;
      }
      let finalStart = dropTime;
      let finalEnd = dropTime + duration;
      if (toLayerId !== mainLayerId && hasOverlap(toLayerId, dropTime, dropTime + duration)) {
        const snapped = trySnapNonOverlap(toLayerId, dropTime, duration, blockId);
        if (snapped) {
          finalStart = snapped.start;
          finalEnd = snapped.end;
        } else {
          message.warning('该位置与已有素材重叠');
          return;
        }
      }
      const res = await window.yiman?.project?.updateTimelineBlock(projectDir, blockId, { layer_id: toLayerId, start_time: finalStart, end_time: finalEnd });
      if (res?.ok) {
        const fromBlocks = blocksByLayer[fromLayerId] ?? [];
        if (fromLayerId !== mainLayerId && fromBlocks.length === 1 && window.yiman?.project?.deleteLayer) {
          await window.yiman.project.deleteLayer(projectDir, fromLayerId);
        }
        loadLayersAndBlocks();
        onLayersChange?.();
      } else message.error(res?.error || '移动失败');
    },
    [projectDir, sceneId, mainLayerId, blocksByLayer, hasOverlap, trySnapNonOverlap, loadLayersAndBlocks, onLayersChange, message]
  );

  const handleDropBlock = useCallback(
    async (toLayerId: string, dropTime: number, e: React.DragEvent) => {
      setDragOver(null);
      const blockId = e.dataTransfer.getData('blockId');
      const fromLayerId = e.dataTransfer.getData('fromLayerId');
      const assetId = e.dataTransfer.getData('assetId');
      const assetDuration = parseFloat(e.dataTransfer.getData('assetDuration') || '10');

      if (blockId && fromLayerId) {
        await handleDropBlockData(blockId, fromLayerId, toLayerId, dropTime);
        return;
      }

      if (assetId && toLayerId === mainLayerId && window.yiman?.project?.insertBlockAtMainTrack && mainLayerId) {
        const blockIdNew = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await window.yiman.project.insertBlockAtMainTrack(projectDir, sceneId!, {
          id: blockIdNew,
          asset_id: assetId,
          duration: assetDuration,
          insertAt: dropTime,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
        });
        if (res?.ok) {
          loadLayersAndBlocks();
          onLayersChange?.();
        } else message.error(res?.error || '放置失败');
        return;
      }
      if (assetId && toLayerId !== mainLayerId && window.yiman?.project?.createTimelineBlock) {
        let placeStart = dropTime;
        let placeEnd = dropTime + assetDuration;
        if (hasOverlap(toLayerId, dropTime, placeEnd)) {
          const snapped = trySnapNonOverlap(toLayerId, dropTime, assetDuration);
          if (snapped) {
            placeStart = snapped.start;
            placeEnd = snapped.end;
          } else {
            message.warning('该位置与已有素材重叠');
            return;
          }
        }
        const blockIdNew = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await window.yiman.project.createTimelineBlock(projectDir, {
          id: blockIdNew,
          layer_id: toLayerId,
          asset_id: assetId,
          start_time: placeStart,
          end_time: placeEnd,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
        });
        if (res?.ok) {
          loadLayersAndBlocks();
          onLayersChange?.();
        } else message.error(res?.error || '放置失败');
        return;
      }
    },
    [projectDir, sceneId, mainLayerId, blocksByLayer, hasOverlap, trySnapNonOverlap, loadLayersAndBlocks, onLayersChange, message]
  );

  const handleTrackDragOver = useCallback(
    (layerId: string, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setDragOver({ type: 'track', layerId, insertTime: xToTime(x) });
    },
    [xToTime]
  );

  const handleDndDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over, delta } = event;
      if (activeBlock) {
        return;
      }
      if (!over) {
        setDragOver(null);
        return;
      }
      const overId = String(over.id);
      if (overId.startsWith('between-')) {
        setDragExtraWidth(0);
        setDragOver({ type: 'between', afterIndex: parseInt(overId.slice(8), 10) });
        return;
      }
      if (overId.startsWith('track-')) {
        const toLayerId = overId.slice(6);
        const block = Object.values(blocksByLayer).flat().find((b) => b.id === active.id);
        const duration = block ? block.end_time - block.start_time : 0.5;
        const blockWidth = block ? timeToX(duration) : 24;
        const scrollLeft = tracksScrollRef.current?.scrollLeft ?? 0;
        let insertTime = 0;
        if (block && delta) {
          const startPx = timeToX(block.start_time);
          const newStartPx = startPx + (delta.x ?? 0);
          insertTime = xToTime(Math.max(0, newStartPx));
        } else {
          const overRect = over.rect;
          const initialRect = (active.rect?.current as { initial?: { left: number } })?.initial;
          if (overRect && initialRect && delta) {
            const finalLeft = initialRect.left + (delta.x ?? 0);
            const contentX = finalLeft - overRect.left + scrollLeft;
            insertTime = xToTime(Math.max(0, contentX));
          }
        }
        // 拖拽时若素材条右侧距内容右边缘 < 300px，则扩展 300px
        const maxTime = Math.max(5, ...Object.values(blocksByLayer).flat().map((b) => b.end_time || 0));
        const baseWidth = timeToX(maxTime + 30);
        const rightEdgePx = timeToX(insertTime) + blockWidth;
        setDragExtraWidth(baseWidth - rightEdgePx < 300 ? 300 : 0);
        // 判断有效落点：重叠且无法 snap 则不显示 placeholder
        let placeStart = insertTime;
        let placeEnd = insertTime + duration;
        let valid = true;
        const fromLayerId = (active.data?.current as { layerId?: string })?.layerId;
        const isMainReorder = toLayerId === mainLayerId && fromLayerId === mainLayerId && block;
        if (!isMainReorder && block) {
          if (hasOverlap(toLayerId, placeStart, placeEnd, block.id)) {
            const snapped = trySnapNonOverlap(toLayerId, insertTime, duration, block.id);
            if (snapped) {
              placeStart = snapped.start;
              placeEnd = snapped.end;
            } else {
              valid = false;
            }
          }
        }
        setDragOver(valid ? { type: 'track', layerId: toLayerId, insertTime, blockWidth, placeStart, placeEnd } : null);
        return;
      }
      // over 为另一个素材条（主轨道 Sortable 时常见），collision 返回 block id 非 track-id，需视为该轨道并实时更新 placeholder
      const overBlock = Object.values(blocksByLayer).flat().find((b) => b.id === overId);
      if (overBlock) {
        const toLayerId = overBlock.layer_id;
        const block = Object.values(blocksByLayer).flat().find((b) => b.id === active.id);
        const duration = block ? block.end_time - block.start_time : 0.5;
        const blockWidth = block ? timeToX(duration) : 24;
        const scrollLeft = tracksScrollRef.current?.scrollLeft ?? 0;
        let insertTime = 0;
        if (block && delta) {
          const startPx = timeToX(block.start_time);
          const newStartPx = startPx + (delta.x ?? 0);
          insertTime = xToTime(Math.max(0, newStartPx));
        } else {
          const overRect = over.rect;
          const initialRect = (active.rect?.current as { initial?: { left: number } })?.initial;
          if (overRect && initialRect && delta) {
            const finalLeft = initialRect.left + (delta.x ?? 0);
            const contentX = finalLeft - overRect.left + scrollLeft;
            insertTime = xToTime(Math.max(0, contentX));
          }
        }
        const maxTime = Math.max(5, ...Object.values(blocksByLayer).flat().map((b) => b.end_time || 0));
        const baseWidth = timeToX(maxTime + 30);
        const rightEdgePx = timeToX(insertTime) + blockWidth;
        setDragExtraWidth(baseWidth - rightEdgePx < 300 ? 300 : 0);
        let placeStart = insertTime;
        let placeEnd = insertTime + duration;
        let valid = true;
        const fromLayerId = (active.data?.current as { layerId?: string })?.layerId;
        const isMainReorder = toLayerId === mainLayerId && fromLayerId === mainLayerId && block;
        if (!isMainReorder && block) {
          if (hasOverlap(toLayerId, placeStart, placeEnd, block.id)) {
            const snapped = trySnapNonOverlap(toLayerId, insertTime, duration, block.id);
            if (snapped) {
              placeStart = snapped.start;
              placeEnd = snapped.end;
            } else {
              valid = false;
            }
          }
        }
        setDragOver(valid ? { type: 'track', layerId: toLayerId, insertTime, blockWidth, placeStart, placeEnd } : null);
        return;
      }
      setDragExtraWidth(0);
      setDragOver(null);
    },
    [activeBlock, blocksByLayer, timeToX, xToTime, mainLayerId, hasOverlap, trySnapNonOverlap]
  );

  const handleBetweenDragOver = useCallback((afterIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver({ type: 'between', afterIndex });
  }, []);

  const createLayerAndDrop = useCallback(
    async (afterIndex: number, dropTime: number, e: React.DragEvent) => {
      const blockId = e.dataTransfer.getData('blockId');
      const fromLayerId = e.dataTransfer.getData('fromLayerId');
      const assetId = e.dataTransfer.getData('assetId');
      const assetDuration = parseFloat(e.dataTransfer.getData('assetDuration') || '10');
      if (!sceneId || !window.yiman?.project?.createLayer) return;
      const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let newZ = 0;
      if (layers.length === 0) {
        newZ = 0;
      } else if (afterIndex < 0) {
        newZ = (layers[0]?.z_index ?? 0) - 1;
      } else if (afterIndex >= layers.length - 1) {
        newZ = (layers[layers.length - 1]?.z_index ?? 0) + 1;
      } else {
        const a = layers[afterIndex];
        const b = layers[afterIndex + 1];
        newZ = ((a?.z_index ?? 0) + (b?.z_index ?? 0)) / 2;
      }
      const cr = await window.yiman.project.createLayer(projectDir, { id: newLayerId, scene_id: sceneId, name: '图层', z_index: newZ });
      if (!cr?.ok) {
        message.error(cr?.error || '创建图层失败');
        return;
      }
      if (blockId && fromLayerId && window.yiman?.project?.updateTimelineBlock) {
        const block = (blocksByLayer[fromLayerId] ?? []).find((b) => b.id === blockId);
        const duration = block ? (block.end_time - block.start_time) : 10;
        const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { layer_id: newLayerId, start_time: dropTime, end_time: dropTime + duration });
        if (res?.ok) {
          const fromBlocks = blocksByLayer[fromLayerId] ?? [];
          if (fromLayerId !== mainLayerId && fromBlocks.length === 1 && window.yiman?.project?.deleteLayer) {
            await window.yiman.project.deleteLayer(projectDir, fromLayerId);
          }
          loadLayersAndBlocks();
          onLayersChange?.();
        } else message.error(res?.error || '移动失败');
      } else if (assetId && window.yiman?.project?.createTimelineBlock) {
        const blockIdNew = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await window.yiman.project.createTimelineBlock(projectDir, {
          id: blockIdNew,
          layer_id: newLayerId,
          asset_id: assetId,
          start_time: dropTime,
          end_time: dropTime + assetDuration,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
        });
        if (res?.ok) {
          loadLayersAndBlocks();
          onLayersChange?.();
        } else message.error(res?.error || '放置失败');
      }
    },
    [projectDir, sceneId, layers, mainLayerId, blocksByLayer, loadLayersAndBlocks, onLayersChange, message]
  );

  /** 素材条拖到 between zone 时创建新分层并移动块（见功能文档 6.7） */
  const createLayerAndDropBlock = useCallback(
    async (blockId: string, fromLayerId: string, afterIndex: number, dropTime: number) => {
      if (!sceneId || !window.yiman?.project?.createLayer) return;
      const block = (blocksByLayer[fromLayerId] ?? []).find((b) => b.id === blockId);
      const duration = block ? block.end_time - block.start_time : 10;
      const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let newZ = 0;
      if (layers.length === 0) {
        newZ = 0;
      } else if (afterIndex < 0) {
        newZ = (layers[0]?.z_index ?? 0) - 1;
      } else if (afterIndex >= layers.length - 1) {
        newZ = (layers[layers.length - 1]?.z_index ?? 0) + 1;
      } else {
        const a = layers[afterIndex];
        const b = layers[afterIndex + 1];
        newZ = ((a?.z_index ?? 0) + (b?.z_index ?? 0)) / 2;
      }
      const cr = await window.yiman.project.createLayer(projectDir, { id: newLayerId, scene_id: sceneId, name: '图层', z_index: newZ });
      if (!cr?.ok) {
        message.error(cr?.error || '创建图层失败');
        return;
      }
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { layer_id: newLayerId, start_time: dropTime, end_time: dropTime + duration });
      if (res?.ok) {
        const fromBlocks = blocksByLayer[fromLayerId] ?? [];
        if (fromLayerId !== mainLayerId && fromBlocks.length === 1 && window.yiman?.project?.deleteLayer) {
          await window.yiman.project.deleteLayer(projectDir, fromLayerId);
        }
        loadLayersAndBlocks();
        onLayersChange?.();
      } else message.error(res?.error || '移动失败');
    },
    [projectDir, sceneId, layers, mainLayerId, blocksByLayer, loadLayersAndBlocks, onLayersChange, message]
  );

  const dragGrabOffsetXRef = useRef<number>(0);

  const handleDndDragStart = useCallback(
    (event: DragStartEvent) => {
      const blockId = event.active.id as string;
      const allBlocks = Object.values(blocksByLayer).flat();
      const block = allBlocks.find((b) => b.id === blockId);
      if (block) {
        setActiveBlock(block);
        const ev = event.activatorEvent as { clientX?: number };
        const el = tracksScrollRef.current;
        if (el && typeof ev?.clientX === 'number') {
          const rect = el.getBoundingClientRect();
          const contentXGrab = ev.clientX - rect.left + el.scrollLeft;
          const blockLeftInitial = timeToX(block.start_time);
          dragGrabOffsetXRef.current = contentXGrab - blockLeftInitial;
        } else {
          dragGrabOffsetXRef.current = 0;
        }
      }
      setDragExtraWidth(0);
    },
    [blocksByLayer, timeToX]
  );

  /** 拖拽时用指针实际位置实时更新 placeholder，placeholder x 与素材条 left 一致（见功能文档） */
  const trackRowHeightNum = compact ? TRACK_HEIGHT : TRACK_HEIGHT + 8;
  useEffect(() => {
    if (!activeBlock) return;
    const block = activeBlock;
    const duration = block.end_time - block.start_time;
    const blockWidth = timeToX(duration);
    const fromLayerId = block.layer_id;
    const CREATE_LAYER = 44;
    const BETWEEN = 10;
    const rowHeight = trackRowHeightNum + BETWEEN;

    const onPointerMove = (e: PointerEvent) => {
      const el = tracksScrollRef.current;
      if (!el || layers.length === 0) return;
      const rect = el.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setDragOver(null);
        return;
      }
      const scrollLeft = el.scrollLeft;
      const scrollTop = el.scrollTop;
      const contentX = e.clientX - rect.left + scrollLeft;
      const contentY = e.clientY - rect.top + scrollTop;
      const blockLeft = contentX - dragGrabOffsetXRef.current;
      const insertTime = xToTime(Math.max(0, blockLeft));

      const seg = contentY - CREATE_LAYER;
      if (seg < 0) {
        setDragOver({ type: 'between', afterIndex: -1 });
        setDragExtraWidth(0);
        return;
      }
      const i = Math.floor(seg / rowHeight);
      const inRow = seg % rowHeight;
      if (inRow >= trackRowHeightNum) {
        const afterIdx = i;
        setDragOver({ type: 'between', afterIndex: afterIdx });
        setDragExtraWidth(0);
        return;
      }
      if (i >= layers.length) {
        setDragOver(null);
        return;
      }
      const toLayerId = layers[i].id;

      const maxTime = Math.max(5, ...Object.values(blocksByLayer).flat().map((b) => b.end_time || 0));
      const baseWidth = timeToX(maxTime + 30);
      const rightEdgePx = timeToX(insertTime) + blockWidth;
      setDragExtraWidth(baseWidth - rightEdgePx < 300 ? 300 : 0);

      let placeStart = insertTime;
      let placeEnd = insertTime + duration;
      let valid = true;
      const isMainReorder = toLayerId === mainLayerId && fromLayerId === mainLayerId;
      if (!isMainReorder) {
        if (hasOverlap(toLayerId, placeStart, placeEnd, block.id)) {
          const snapped = trySnapNonOverlap(toLayerId, insertTime, duration, block.id);
          if (snapped) {
            placeStart = snapped.start;
            placeEnd = snapped.end;
          } else {
            valid = false;
          }
        }
      }
      setDragOver(valid ? { type: 'track', layerId: toLayerId, insertTime, blockWidth, placeStart, placeEnd } : null);
    };

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [
    activeBlock,
    compact,
    layers,
    trackRowHeightNum,
    blocksByLayer,
    hasOverlap,
    trySnapNonOverlap,
    mainLayerId,
    timeToX,
    xToTime,
  ]);

  const handleDndDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveBlock(null);
      setDragOver(null);
      setDragExtraWidth(0);
      const { active, over } = event;
      const blockId = active.id as string;
      const fromLayerId = (active.data?.current as { layerId?: string })?.layerId;
      if (!over) return;
      if (!fromLayerId) return;

      const overId = String(over.id);
      let toLayerId: string;
      let dropTime: number;

      if (overId.startsWith('between-')) {
        const afterIndex = parseInt(overId.slice(8), 10);
        const overRect = over.rect;
        const initialRect = (active.rect?.current as { initial?: { left: number; width: number } })?.initial;
        if (overRect && initialRect && event.delta) {
          const finalLeft = initialRect.left + event.delta.x;
          dropTime = xToTime(Math.max(0, finalLeft - overRect.left));
        } else {
          dropTime = 0;
        }
        await createLayerAndDropBlock(blockId, fromLayerId, afterIndex, dropTime);
        return;
      }

      if (overId.startsWith('track-')) {
        toLayerId = overId.slice(6);
        const block = Object.values(blocksByLayer).flat().find((b) => b.id === blockId);
        if (block && event.delta) {
          const startPx = timeToX(block.start_time);
          const newStartPx = startPx + (event.delta.x ?? 0);
          dropTime = xToTime(Math.max(0, newStartPx));
        } else {
          const overRect = over.rect;
          const initialRect = (active.rect?.current as { initial?: { left: number } })?.initial;
          if (overRect && initialRect && event.delta) {
            const finalLeft = initialRect.left + (event.delta.x ?? 0);
            dropTime = xToTime(Math.max(0, finalLeft - overRect.left));
          } else {
            dropTime = 0;
          }
        }
      } else {
        const overBlock = Object.values(blocksByLayer).flat().find((b) => b.id === overId);
        if (!overBlock) return;
        toLayerId = overBlock.layer_id;
        dropTime = overBlock.start_time;
      }

      if (fromLayerId === toLayerId && toLayerId === mainLayerId) {
        const mainBlocks = (blocksByLayer[mainLayerId] ?? []).map((b) => b.id);
        const oldIdx = mainBlocks.indexOf(blockId);
        const overIdx = mainBlocks.indexOf(overId);
        if (oldIdx >= 0 && overIdx >= 0 && oldIdx !== overIdx) {
          const newOrder = arrayMove(mainBlocks, oldIdx, overIdx);
          const newIdx = newOrder.indexOf(blockId);
          let insertAt = 0;
          for (let i = 0; i < newIdx; i++) {
            const b = (blocksByLayer[mainLayerId] ?? []).find((x) => x.id === newOrder[i]);
            if (b) insertAt = b.end_time;
          }
          const res = await window.yiman?.project?.moveBlockToMainTrack(projectDir, sceneId!, blockId, insertAt);
          if (res?.ok) {
            loadLayersAndBlocks();
            onLayersChange?.();
          } else message.error(res?.error || '移动失败');
        }
        return;
      }

      await handleDropBlockData(blockId, fromLayerId, toLayerId, dropTime);
    },
    [blocksByLayer, mainLayerId, projectDir, sceneId, xToTime, handleDropBlockData, createLayerAndDropBlock, loadLayersAndBlocks, onLayersChange, message]
  );

  if (!sceneId) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <Text type="secondary">请先选择场景</Text>
      </div>
    );
  }

  const maxTime = Math.max(5, ...Object.values(blocksByLayer).flat().map((b) => b.end_time || 0));
  const baseAxisWidth = Math.max(400, timeToX(maxTime + 30));
  const axisWidth = baseAxisWidth + dragExtraWidth;
  const trackRowHeight = compact ? TRACK_HEIGHT : TRACK_HEIGHT + 8;

  // 时间尺刻度步长：保证相邻刻度至少约 50px，避免挤在一起
  const MIN_PX_PER_TICK = 50;
  const NICE_STEPS = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120];
  const rawStep = MIN_PX_PER_TICK / timeZoom;
  const rulerStep = NICE_STEPS.find((s) => s >= rawStep) ?? Math.ceil(rawStep);
  const rulerTicks: number[] = [];
  for (let t = 0; t <= maxTime; t += rulerStep) rulerTicks.push(t);
  const lastTickCeil = Math.ceil(maxTime);
  if (rulerTicks[rulerTicks.length - 1] !== lastTickCeil) rulerTicks.push(lastTickCeil);

  // 素材条水平移动时可超出可见区域，限制在轨道（父元素=scroll container 内容）内
  const modifiers = [restrictToParentElement];
  const CREATE_LAYER_ZONE_HEIGHT = 44;
  const betweenZoneHeight = 10;

  return (
    <div className="timeline-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0 }}>
      {/* 行1：timeline-header 固定高度 */}
      <div className="timeline-header" style={{ flexShrink: 0, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Space>
          <Button type="text" icon={<UndoOutlined />} disabled title="撤销" />
          <Button type="text" icon={<RedoOutlined />} disabled title="重做" />
          <Text style={{ fontSize: 12, minWidth: 88 }}>当前时间 <strong>{currentTime.toFixed(1)}</strong> / <strong>{sceneTotalTime.toFixed(1)}</strong> s</Text>
          {selectedBlockId && (
            <Text type="secondary" style={{ fontSize: 12 }}>Delete 删除素材条 · 关键帧在右侧功能面板创建</Text>
          )}
        </Space>
        <Space>
          {onExportClick && (
            <Button color="default" variant='filled' size="small" icon={<ExportOutlined />} onClick={onExportClick}>
              导出
            </Button>
          )}
        
          {/* 时间线精度放缩：参考图样式，左缩小图标 + 滑块 + 右放大图标 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              size="small"
              icon={<ZoomOutOutlined />}
              onClick={() => setTimeZoom((z) => Math.max(10, z * 0.8))}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                color: 'rgba(255,255,255,0.85)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="缩小"
            />
            <Slider
              min={10}
              max={200}
              value={timeZoom}
              onChange={(v) => setTimeZoom(typeof v === 'number' ? v : v[0])}
              style={{ width: 60, margin: 0 }}
              styles={{
                track: { background: 'rgba(255,255,255,0.35)' },
                // rail: { background: 'rgba(255,255,255,0.12)' },
                // handle: {
                //   width: 10,
                //   height: 18,
                //   borderRadius: 5,
                //   border: 'none',
                //   background: '#fff',
                //   boxShadow: 'none',
                // },
              }}
              tooltip={{ formatter: (v) => `${v} px/s` }}
            />
            <Button
              type="text"
              size="small"
              icon={<ZoomInOutlined />}
              onClick={() => setTimeZoom((z) => Math.min(200, z * 1.25))}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                color: 'rgba(255,255,255,0.85)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="放大"
            />
          </div>
          {/* <Button type={compact ? 'primary' : 'default'} size="small" onClick={() => setCompact(!compact)}>紧凑</Button> */}
          
        </Space>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        modifiers={modifiers}
        onDragStart={handleDndDragStart}
        onDragOver={handleDndDragOver}
        onDragEnd={handleDndDragEnd}
      >
      {/* 行2：timeline-tracks-viewport，宽度=屏幕，高度=剩余，不可超出 */}
      <div
        ref={tracksViewportRef}
        className="timeline-tracks-viewport"
        style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <Splitter style={{ flex: 1, minHeight: 0 }} orientation="horizontal">
          {/* 左列：timeline-layer-labels-container，默认 240px */}
          <Splitter.Panel defaultSize={DEFAULT_LABELS_WIDTH} min={160} max={400}>
            <div
              ref={labelsContainerRef}
              className="timeline-layer-labels-container"
              style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* 行1：timeline-ruler-label，固定不滚动 */}
              <div
                ref={rulerLabelScrollRef}
                className="timeline-ruler-label"
                style={{ flexShrink: 0, height: RULER_HEIGHT, overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="timeline-ruler-label-content" style={{ padding: '0 8px', display: 'flex', alignItems: 'center', height: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                </div>
              </div>
              {/* 行2：overflow auto，与 tracks 垂直联动 */}
              <div
                ref={layerLabelsBodyRef}
                className="timeline-layer-labels-body"
                style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
              >
                <div className="timeline-layer-label-spacer" style={{ height: CREATE_LAYER_ZONE_HEIGHT, flexShrink: 0 }} />
                {layers.flatMap((layer, index) => [
                  index > 0 ? <div key={`between-label-${index - 1}`} className="timeline-layer-label-spacer" style={{ height: betweenZoneHeight, flexShrink: 0 }} /> : null,
                  <div
                    key={layer.id}
                    className="timeline-layer-label-row"
                    style={{
                      height: trackRowHeight,
                      flexShrink: 0,
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Checkbox
                      checked={!!layer.visible}
                      onChange={() => toggleVisible(layer)}
                      title={layer.visible ? '隐藏' : '显示'}
                    />
                    <Button type="text" size="small" icon={layer.locked ? <LockOutlined /> : <UnlockOutlined />} onClick={() => toggleLocked(layer)} title={layer.locked ? '解锁' : '锁定'} />
                    <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveLayer(index, -1)} title="上移" />
                    <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === layers.length - 1} onClick={() => moveLayer(index, 1)} title="下移" />
                    {layer.is_main ? (
                      <Text ellipsis style={{ flex: 1, fontSize: 12, minWidth: 0 }}>主层</Text>
                    ) : (
                      <Select
                        size="small"
                        value={layer.layer_type === 'audio' ? 'audio' : 'video'}
                        onChange={(v) => setLayerType(layer, v as 'video' | 'audio')}
                        options={[
                          { value: 'video', label: '图层' },
                          { value: 'audio', label: '音层' },
                        ]}
                        style={{ flex: 1, minWidth: 0, fontSize: 12 }}
                        variant="borderless"
                      />
                    )}
                  </div>,
                ])}
                <div className="timeline-layer-label-spacer" style={{ height: CREATE_LAYER_ZONE_HEIGHT, flexShrink: 0 }} />
              </div>
            </div>
          </Splitter.Panel>
          {/* 右列：timeline-tracks-container */}
          <Splitter.Panel min={200}>
            <div className="timeline-tracks-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
              {/* 行1：timeline-ruler-ticks-wrapper，固定高度，水平 overflow，与 scroll-area 联动 */}
              <div
                ref={rulerTicksWrapperRef}
                className="timeline-ruler-ticks-wrapper"
                style={{ flexShrink: 0, height: RULER_HEIGHT, overflowX: 'auto', overflowY: 'hidden', minWidth: 0, cursor: 'pointer' }}
                onScroll={handleRulerTicksScroll}
                onClick={handleRulerClick}
              >
                <div
                  className="timeline-ruler-ticks"
                  style={{ minWidth: axisWidth, height: RULER_HEIGHT, position: 'relative', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {rulerTicks.map((t) => (
                    <span
                      key={t}
                      style={{
                        position: 'absolute',
                        left: timeToX(t) + 2,
                        top: 2,
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {Math.abs(t - Math.round(t)) < 1e-6 ? Math.round(t) : t.toFixed(1)}s
                    </span>
                  ))}
                </div>
              </div>
              {/* 行2：timeline-tracks-body，高度=剩余，内含 scroll-area + playhead */}
              <div
                className="timeline-tracks-body"
                style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}
              >
                {/* DOM 1：timeline-tracks-scroll-area，虚拟滚动（无固定宽高），水平/垂直 overflow，scroll 时联动 ruler-label 与 layer-labels-body */}
                <div
                  ref={tracksScrollRef}
                  className="timeline-tracks-scroll-area"
                  style={{ position: 'absolute', inset: 0, overflow: 'auto' }}
                  onScroll={handleTracksScroll}
                >
                  <div className="timeline-tracks-content" style={{ minWidth: axisWidth, position: 'relative' }}>
              {/* 最上方 44px drop zone */}
                <BetweenDropZone
                  id="between--1"
                  height={CREATE_LAYER_ZONE_HEIGHT}
                  minWidth={axisWidth}
                  isHighlighted={dragOver?.type === 'between' && dragOver.afterIndex === -1}
                  onDragOverNative={(e) => handleBetweenDragOver(-1, e)}
                  onDragLeaveNative={() => setDragOver(null)}
                  onDropNative={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    createLayerAndDrop(-1, xToTime(Math.max(0, x)), e);
                  }}
                  onClickNative={(e) => {
                    onSelectBlock(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    setCurrentTimeClamped(xToTime(Math.max(0, x)));
                  }}
                />
                {/* 分层 + 轨道 */}
                {layers.flatMap((layer, index) => {
                  const afterIndex = index - 1;
                  const dropZoneAbove = index > 0 ? (
                    <BetweenDropZone
                      key={`between-${afterIndex}`}
                      id={`between-${afterIndex}`}
                      height={betweenZoneHeight}
                      minWidth={axisWidth}
                      isHighlighted={dragOver?.type === 'between' && dragOver.afterIndex === afterIndex}
                      onDragOverNative={(e) => handleBetweenDragOver(afterIndex, e)}
                      onDragLeaveNative={() => setDragOver(null)}
                      onDropNative={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        createLayerAndDrop(afterIndex, xToTime(Math.max(0, x)), e);
                      }}
                      onClickNative={(e) => {
                        onSelectBlock(null);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        setCurrentTimeClamped(xToTime(Math.max(0, x)));
                      }}
                    />
                  ) : null;
                  return [
                    dropZoneAbove,
                    <TrackDroppable
                      key={layer.id}
                      id={`track-${layer.id}`}
                      style={{
                        height: trackRowHeight,
                        position: 'relative',
                        minWidth: axisWidth,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.2)',
                        display: layer.id === mainLayerId ? 'flex' : 'block',
                        flexDirection: layer.id === mainLayerId ? 'row' : undefined,
                      }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  let t = xToTime(x);
                  if (selectedBlockId) {
                    const kfs = keyframesByBlock[selectedBlockId] ?? [];
                    for (const kf of kfs) {
                      if (Math.abs(timeToX(kf.time) - x) < SNAP_PX) {
                        t = kf.time;
                        break;
                      }
                    }
                  }
                  setCurrentTimeClamped(t);
                }}
                onDragOverNative={(e) => handleTrackDragOver(layer.id, e)}
                onDragLeaveNative={() => setDragOver(null)}
                onDropNative={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  handleDropBlock(layer.id, xToTime(x), e);
                }}
              >
                {layer.id === mainLayerId ? (
                  <SortableContext
                    items={(blocksByLayer[layer.id] ?? []).map((b) => b.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {(blocksByLayer[layer.id] ?? []).map((block) => (
                      <TimelineBlockSortable
                        key={block.id}
                        block={block}
                        keyframes={keyframesByBlock[block.id] ?? []}
                        trackRowHeight={trackRowHeight}
                        timeToX={timeToX}
                        currentTime={currentTime}
                        selectedBlockId={selectedBlockId}
                        onSelectBlock={(id) => onSelectBlock(id)}
                        onResizeBlock={handleResizeBlock}
                        onKeyframeClick={(t) => setCurrentTimeClamped(t)}
                      />
                    ))}
                  </SortableContext>
                ) : (
                  (blocksByLayer[layer.id] ?? []).map((block) => (
                    <TimelineBlockDraggable
                      key={block.id}
                      block={block}
                      keyframes={keyframesByBlock[block.id] ?? []}
                      trackRowHeight={trackRowHeight}
                      timeToX={timeToX}
                      currentTime={currentTime}
                      selectedBlockId={selectedBlockId}
                      onSelectBlock={(id) => onSelectBlock(id)}
                      onResizeBlock={handleResizeBlock}
                      onKeyframeClick={(t) => setCurrentTimeClamped(t)}
                    />
                  ))
                )}
                {dragOver?.type === 'track' && dragOver.layerId === layer.id && (
                  <div
                    className="timeline-drop-placeholder"
                    style={{
                      position: 'absolute',
                      left: timeToX(dragOver.placeStart ?? dragOver.insertTime),
                      top: 4,
                      width: Math.max(12, dragOver.placeStart != null && dragOver.placeEnd != null
                        ? timeToX(dragOver.placeEnd - dragOver.placeStart)
                        : (dragOver.blockWidth ?? 24)),
                      height: trackRowHeight - 8,
                      marginLeft: 1,
                      background: 'rgba(255, 200, 0, 0.9)',
                      zIndex: 10,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      border: '2px dashed rgba(255,100,0,0.9)',
                    }}
                  />
                )}
              </TrackDroppable>
            ];
          })}
                {/* 最下方 44px drop zone（below last） */}
                {layers.length > 0 && (
                <BetweenDropZone
                  id={`between-${layers.length - 1}`}
                  height={CREATE_LAYER_ZONE_HEIGHT}
                  minWidth={axisWidth}
                  isHighlighted={dragOver?.type === 'between' && dragOver.afterIndex === layers.length - 1}
                  onDragOverNative={(e) => handleBetweenDragOver(layers.length - 1, e)}
                  onDragLeaveNative={() => setDragOver(null)}
                  onDropNative={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    createLayerAndDrop(layers.length - 1, xToTime(Math.max(0, x)), e);
                  }}
                  onClickNative={(e) => {
                    onSelectBlock(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    setCurrentTimeClamped(xToTime(Math.max(0, x)));
                  }}
                />
                )}
                  </div>
                </div>
                {/* DOM 2：timeline-playhead */}
                <div
                  role="slider"
                  aria-label="选中时间轴"
                  className="timeline-playhead"
                  style={{
                    position: 'absolute',
                    left: timeToX(currentTime) - 1 - tracksScrollLeft,
                    top: 0,
                    width: 2,
                    height: '100%',
                    background: '#ff4d4f',
                    cursor: 'ew-resize',
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={startPlayheadDrag}
                />
              </div>
            </div>
          </Splitter.Panel>
        </Splitter>
      </div>

      <DragOverlay modifiers={modifiers} dropAnimation={null}>
        {activeBlock ? (
          <BlockOverlay
            width={Math.max(12, timeToX(activeBlock.end_time - activeBlock.start_time))}
            height={trackRowHeight - 8}
          />
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}
