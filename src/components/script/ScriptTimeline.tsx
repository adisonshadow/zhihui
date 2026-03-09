/**
 * 剧本场景时间线：按类型分层，内容条类似素材条，支持拖拽与自动分层（见 docs/短漫剧剧本元素说明.md 15.0.1）
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import type { SceneContentItem, SceneContentType } from '@/types/script';
import { SCENE_CONTENT_TYPE_LABELS } from '@/types/script';
import { ScriptTimelineRuler } from './ScriptTimelineRuler';
import { ScriptContentBlock } from './ScriptContentBlock';

const TRACK_HEIGHT = 28;
const RULER_HEIGHT = 24;
const TIME_ZOOM = 40;
/** 时间线余量阈值：余量少于此值时自动扩展 */
const MIN_BUFFER = 10;
const TYPES_ORDER: SceneContentType[] = [
  'dialogue',
  'action',
  'narration',
  'stage',
  'prop',
  'foreground',
  'music',
  'sfx',
];

/** 检测 [a1,a2] 与 [b1,b2] 是否重叠 */
function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return !(a2 <= b1 || b2 <= a1);
}

/** 自动分层：同类型内按时间分配 layerIndex，避免重叠 */
function computeLayerIndices(items: SceneContentItem[]): SceneContentItem[] {
  const byType = new Map<SceneContentType, SceneContentItem[]>();
  for (const it of items) {
    const list = byType.get(it.type) ?? [];
    list.push(it);
    byType.set(it.type, list);
  }

  const result: SceneContentItem[] = [];
  for (const type of TYPES_ORDER) {
    const list = (byType.get(type) ?? []).sort((a, b) => a.startTime - b.startTime);
    const layers: SceneContentItem[][] = [];

    for (const item of list) {
      let placed = false;
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        const hasOverlap = layer.some((o) => overlaps(item.startTime, item.endTime, o.startTime, o.endTime));
        if (!hasOverlap) {
          layer.push(item);
          result.push({ ...item, layerIndex: li });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const newLayer = [item];
        layers.push(newLayer);
        result.push({ ...item, layerIndex: layers.length - 1 });
      }
    }
  }
  return result;
}

/** 按类型+layerIndex 分组，用于渲染轨道 */
function groupByTypeAndLayer(items: SceneContentItem[]): Map<string, SceneContentItem[]> {
  const withLayers = computeLayerIndices(items);
  const map = new Map<string, SceneContentItem[]>();
  for (const it of withLayers) {
    const key = `${it.type}_${it.layerIndex ?? 0}`;
    const list = map.get(key) ?? [];
    list.push(it);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startTime - b.startTime);
  }
  return map;
}

interface ScriptTimelineProps {
  items: SceneContentItem[];
  sceneIndex: number;
  epIndex: number;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onUpdateItems: (items: SceneContentItem[]) => void;
}

export function ScriptTimeline({
  items,
  sceneIndex,
  epIndex,
  selectedItemId,
  onSelectItem,
  onUpdateItems,
}: ScriptTimelineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extraTime, setExtraTime] = useState(0);
  const dragStartRef = useRef<{ startTime: number; endTime: number } | null>(null);
  const hasExtendedRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { layers, baseMaxTime } = useMemo(() => {
    const grouped = groupByTypeAndLayer(items);
    const maxT = items.length > 0 ? Math.max(...items.map((it) => it.endTime)) : 5;
    const layers: { key: string; type: SceneContentType; layerIndex: number; blocks: SceneContentItem[] }[] = [];
    for (const type of TYPES_ORDER) {
      let li = 0;
      let hasAny = false;
      while (true) {
        const key = `${type}_${li}`;
        const blocks = grouped.get(key) ?? [];
        if (blocks.length > 0) hasAny = true;
        if (blocks.length === 0 && (hasAny || li > 0)) break;
        layers.push({ key, type, layerIndex: li, blocks });
        if (blocks.length === 0) break;
        li++;
      }
    }
    return { layers, baseMaxTime: Math.max(5, maxT + MIN_BUFFER) };
  }, [items]);

  const maxTime = baseMaxTime + extraTime;

  const timeToX = useCallback((t: number) => t * TIME_ZOOM, []);
  const xToTime = useCallback((x: number) => Math.max(0, x / TIME_ZOOM), []);

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      setActiveId(e.active.id as string);
      setExtraTime(0);
      hasExtendedRef.current = false;
      const block = items.find((it) => it.id === e.active.id);
      if (block) dragStartRef.current = { startTime: block.startTime, endTime: block.endTime };
    },
    [items]
  );

  const handleDragMove = useCallback(
    (e: DragMoveEvent) => {
      if (!e.delta?.x) return;
      const block = items.find((it) => it.id === e.active.id);
      if (!block) return;
      const duration = block.endTime - block.startTime;
      const projectedStart = block.startTime + e.delta.x / TIME_ZOOM;
      const projectedEnd = projectedStart + duration;
      const currentMax = baseMaxTime + extraTime;
      if (projectedEnd > currentMax - MIN_BUFFER && !hasExtendedRef.current) {
        hasExtendedRef.current = true;
        setExtraTime((prev) => prev + MIN_BUFFER);
      }
    },
    [items, baseMaxTime, extraTime]
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      setExtraTime(0);
      hasExtendedRef.current = false;
      dragStartRef.current = null;
      const { active, delta } = e;
      if (!delta?.x) return;
      const block = items.find((it) => it.id === active.id);
      if (!block) return;

      const duration = block.endTime - block.startTime;
      const newStart = block.startTime + delta.x / TIME_ZOOM;
      const newStartClamped = Math.max(0, newStart);
      const newEnd = newStartClamped + duration;

      const sameTypeBlocks = items.filter((it) => it.type === block.type && it.id !== block.id);
      const sameLayerBlocks = sameTypeBlocks.filter((it) => (it.layerIndex ?? 0) === (block.layerIndex ?? 0));

      let finalStart = newStartClamped;
      for (const o of sameLayerBlocks) {
        if (overlaps(finalStart, finalStart + duration, o.startTime, o.endTime)) {
          finalStart = o.endTime;
        }
      }

      const next = items.map((it) =>
        it.id === block.id
          ? { ...it, startTime: finalStart, endTime: finalStart + duration }
          : it
      );
      const withLayers = computeLayerIndices(next);
      onUpdateItems(withLayers);
    },
    [items, onUpdateItems]
  );

  const handleResizeBlock = useCallback(
    (itemId: string, edge: 'left' | 'right', newStart: number, newEnd: number) => {
      const block = items.find((it) => it.id === itemId);
      if (!block) return;
      const sameTypeBlocks = items.filter((it) => it.type === block.type && it.id !== itemId);
      const sameLayerBlocks = sameTypeBlocks.filter((it) => (it.layerIndex ?? 0) === (block.layerIndex ?? 0));

      let start = newStart;
      let end = newEnd;
      if (edge === 'left') {
        for (const o of sameLayerBlocks) {
          if (overlaps(start, end, o.startTime, o.endTime) && o.endTime <= start) {
            start = Math.max(start, o.endTime);
          }
        }
      } else {
        for (const o of sameLayerBlocks) {
          if (overlaps(start, end, o.startTime, o.endTime) && o.startTime >= end) {
            end = Math.min(end, o.startTime);
          }
        }
      }

      const next = items.map((it) =>
        it.id === itemId ? { ...it, startTime: start, endTime: end } : it
      );
      const withLayers = computeLayerIndices(next);
      onUpdateItems(withLayers);
    },
    [items, onUpdateItems]
  );

  const axisWidth = timeToX(maxTime);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 200,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <ScriptTimelineRuler maxTime={maxTime} timeToX={timeToX} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setExtraTime(0);
            hasExtendedRef.current = false;
          }}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        >
          <div style={{ minWidth: axisWidth, position: 'relative' }}>
            {layers.map(({ key, type, layerIndex, blocks }) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: TRACK_HEIGHT,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  paddingLeft: 100,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: 96,
                    paddingLeft: 8,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {SCENE_CONTENT_TYPE_LABELS[type]}
                  {layerIndex > 0 ? ` ${layerIndex + 1}` : ''}
                </div>
                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    height: TRACK_HEIGHT - 4,
                    marginLeft: 4,
                  }}
                  onClick={() => onSelectItem(null)}
                >
                  {blocks.map((block) => (
                    <ScriptContentBlock
                      key={block.id}
                      block={block}
                      timeToX={timeToX}
                      trackHeight={TRACK_HEIGHT}
                      selected={selectedItemId === block.id}
                      onSelect={() => onSelectItem(block.id)}
                      onResize={(edge, start, end) => handleResizeBlock(block.id, edge, start, end)}
                      isDragging={activeId === block.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}
