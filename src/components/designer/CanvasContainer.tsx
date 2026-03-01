/**
 * 工作区容器：视口缩放、播放/停止、超出显示 Toggle；画布按当前时间渲染关键帧插值（见功能文档 6.5、6.8、开发计划 2.10）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Space, Typography, Modal, Form, Select, Checkbox, Input, App, Tooltip, Slider } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ZoomInOutlined, ZoomOutOutlined, CompressOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { Canvas } from './Canvas';
import { CanvasSelectionOverlay } from './CanvasSelectionOverlay';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_LIBRARY_CATEGORIES } from '@/constants/assetCategories';
import { useKeyframeCRUD, type KeyframeRow } from '@/hooks/useKeyframeCRUD';
import { getInterpolatedTransform, getInterpolatedEffects } from '@/utils/keyframeTween';
import { computeBlockZIndex } from '@/utils/canvasZIndex';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import { COMPONENT_BLOCK_PREFIX, STANDALONE_COMPONENTS_CHARACTER_ID, STANDALONE_SPRITES_CHARACTER_ID } from '@/constants/project';
import { parseStateKeyframes, getEffectiveKeyframe } from '@/utils/stateKeyframes';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { SpriteSheetItem } from '@/components/character/SpriteSheetPanel';

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
  layer_type?: string;
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
  playback_fps?: number;
}

interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpriteDef {
  frames: SpriteFrameRect[];
  frame_count: number;
  playback_fps: number;
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
  /** 乐观更新（含 blur/opacity 等），用于画布（Canvas 有效区域）立即反映设置面板的修改 */
  pendingBlockUpdates?: Record<string, Partial<Pick<BlockRow, 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'blur' | 'opacity'>>>;
  setPendingBlockUpdates?: React.Dispatch<React.SetStateAction<Record<string, Partial<Pick<BlockRow, 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'blur' | 'opacity'>>>>>;
  /** 素材裁剪/抠图后传入 assetId，用于更新画布上引用该素材的 block 的 scale 以匹配新图片尺寸 */
  assetUpdatedId?: string | null;
  onAssetUpdatedProcessed?: () => void;
}

const DESIGN_WIDTH_LANDSCAPE = 1920;
const DESIGN_HEIGHT_LANDSCAPE = 1080;
const DESIGN_WIDTH_PORTRAIT = 1080;
const DESIGN_HEIGHT_PORTRAIT = 1920;
/** FIT 时与 viewport 的留白（每边 10px） */
const FIT_MARGIN = 10;

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
  assetUpdatedId,
  onAssetUpdatedProcessed,
}: CanvasContainerProps) {
  const { message } = App.useApp();
  const { getKeyframes, updateKeyframe, createKeyframe } = useKeyframeCRUD(project.project_dir);
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [keyframesByBlock, setKeyframesByBlock] = useState<Record<string, KeyframeRow[]>>({});
  const [blockDataUrls, setBlockDataUrls] = useState<Record<string, string>>({});
  const [blockAssetPaths, setBlockAssetPaths] = useState<Record<string, string>>({});
  const [blockAssetTypes, setBlockAssetTypes] = useState<Record<string, string>>({});
  const [componentInfoByBlock, setComponentInfoByBlock] = useState<Record<string, {
    characterId: string;
    group: GroupComponentItem;
    spriteSheets: SpriteSheetItem[];
    componentGroups: GroupComponentItem[];
    allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
  }>>({});
  const [spriteDefByPath, setSpriteDefByPath] = useState<Record<string, SpriteDef>>({});
  const [zoom, setZoom] = useState(0.5);
  const workspaceViewportRef = useRef<HTMLDivElement>(null);
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
      const availW = Math.max(0, containerW - FIT_MARGIN * 2);
      const availH = Math.max(0, containerH - FIT_MARGIN * 2);
      if (availW <= 0 || availH <= 0) return 0.5;
      const fit = Math.min(availW / designWidth, availH / designHeight);
      return Math.max(0.1, Math.min(2, fit));
    },
    [designWidth, designHeight]
  );

  const [fitToViewport, setFitToViewport] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const lastSliderUpdateRef = useRef(0);

  const handleFullscreenToggle = useCallback(() => {
    setFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (!playing) onPlayPause?.();
        setFitToViewport(true);
      }
      return next;
    });
  }, [playing, onPlayPause]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const handleFitToggle = useCallback(() => {
    setFitToViewport((prev) => {
      const next = !prev;
      if (next) {
        const el = workspaceViewportRef.current;
        if (el) {
          const { width, height } = el.getBoundingClientRect();
          setZoom(computeFitZoom(width, height));
        }
      }
      return next;
    });
  }, [computeFitZoom]);

  useEffect(() => {
    const el = workspaceViewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        if (fitToViewport) {
          setZoom(computeFitZoom(width, height));
        } else if (!initialFitDoneRef.current) {
          setZoom(computeFitZoom(width, height));
          initialFitDoneRef.current = true;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeFitZoom, fitToViewport, sceneId]);

  useEffect(() => {
    const el = workspaceViewportRef.current;
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
    const types: Record<string, string> = {};
    if (window.yiman.project.getAssetById && window.yiman.project.getAssetDataUrl) {
      for (const b of allBlocks) {
        if (!b.asset_id) continue;
        const asset = await window.yiman.project.getAssetById(projectDir, b.asset_id);
        if (asset?.path) {
          paths[b.id] = asset.path;
          types[b.id] = (asset as { type?: string }).type ?? '';
          const dataUrl = await window.yiman.project.getAssetDataUrl(projectDir, asset.path);
          if (dataUrl) urls[b.id] = dataUrl;
        }
      }
    }
    setBlockDataUrls(urls);
    setBlockAssetPaths(paths);
    setBlockAssetTypes(types);
    if (window.yiman?.project?.getCharacters) {
      const needsStandalone = allBlocks.some(
        (b) =>
          b.asset_id?.startsWith(COMPONENT_BLOCK_PREFIX) &&
          (b.asset_id.includes(STANDALONE_COMPONENTS_CHARACTER_ID) || b.asset_id.includes(STANDALONE_SPRITES_CHARACTER_ID))
      );
      if (needsStandalone) {
        await window.yiman.project.getOrCreateStandaloneSpritesCharacter?.(projectDir);
        await window.yiman.project.getOrCreateStandaloneComponentsCharacter?.(projectDir);
      }
      const chars = (await window.yiman.project.getCharacters(projectDir)) as { id: string; sprite_sheets?: string | null; component_groups?: string | null }[];
      const defs: Record<string, SpriteDef> = {};
      const compInfo: Record<string, {
        characterId: string;
        group: GroupComponentItem;
        spriteSheets: SpriteSheetItem[];
        componentGroups: GroupComponentItem[];
        allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
      }> = {};
      const allCharsData = chars.map((ch) => {
        let sheets: SpriteSheetItem[] = [];
        if (ch.id === STANDALONE_COMPONENTS_CHARACTER_ID) {
          const sp = chars.find((c) => c.id === STANDALONE_SPRITES_CHARACTER_ID);
          if (sp?.sprite_sheets) try { sheets = JSON.parse(sp.sprite_sheets) as SpriteSheetItem[]; } catch { /* ignore */ }
        } else if (ch.sprite_sheets) try { sheets = JSON.parse(ch.sprite_sheets) as SpriteSheetItem[]; } catch { /* ignore */ }
        return { characterId: ch.id, spriteSheets: Array.isArray(sheets) ? sheets : [] };
      });
      for (const c of chars) {
        try {
          const arr = c.sprite_sheets ? (JSON.parse(c.sprite_sheets) as { image_path?: string; frames?: SpriteFrameRect[]; frame_count?: number; playback_fps?: number }[]) : [];
          if (!Array.isArray(arr)) continue;
          for (const s of arr) {
            if (s.image_path && s.frames?.length) {
              defs[s.image_path] = {
                frames: s.frames,
                frame_count: s.frame_count ?? s.frames.length,
                playback_fps: s.playback_fps ?? 8,
              };
            }
          }
        } catch { /* ignore */ }
      }
      setSpriteDefByPath(defs);
      for (const b of allBlocks) {
        const aid = b.asset_id;
        if (!aid?.startsWith(COMPONENT_BLOCK_PREFIX)) continue;
        const rest = aid.slice(COMPONENT_BLOCK_PREFIX.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx < 0) continue;
        const characterId = rest.slice(0, colonIdx);
        const groupId = rest.slice(colonIdx + 1);
        const char = chars.find((ch) => ch.id === characterId);
        if (!char?.component_groups) continue;
        try {
          const groups = JSON.parse(char.component_groups) as GroupComponentItem[];
          const group = Array.isArray(groups) ? groups.find((g) => g.id === groupId) : null;
          if (!group) continue;
          let spriteSheets: SpriteSheetItem[] = [];
          if (characterId === STANDALONE_COMPONENTS_CHARACTER_ID) {
            const spritesChar = chars.find((ch) => ch.id === STANDALONE_SPRITES_CHARACTER_ID);
            if (spritesChar?.sprite_sheets) {
              try {
                spriteSheets = JSON.parse(spritesChar.sprite_sheets) as SpriteSheetItem[];
              } catch { /* ignore */ }
            }
          } else if (char.sprite_sheets) {
            spriteSheets = JSON.parse(char.sprite_sheets) as SpriteSheetItem[];
          }
          const componentGroups = (Array.isArray(groups) ? groups : []).filter((g) => g.id !== groupId);
          const allGroupsForNested: GroupComponentItem[] = [...componentGroups];
          for (const ch of chars) {
            if (ch.id === characterId || !ch.component_groups) continue;
            try {
              const otherGroups = JSON.parse(ch.component_groups) as GroupComponentItem[];
              if (Array.isArray(otherGroups)) allGroupsForNested.push(...otherGroups);
            } catch { /* ignore */ }
          }
          compInfo[b.id] = { characterId, group, spriteSheets: Array.isArray(spriteSheets) ? spriteSheets : [], componentGroups: allGroupsForNested, allCharactersData: allCharsData };
        } catch { /* ignore */ }
      }
      setComponentInfoByBlock(compInfo);
    }
    return allBlocks;
  }, [projectDir, sceneId]);

  useEffect(() => {
    loadLayersAndBlocks();
  }, [loadLayersAndBlocks, refreshKey]);

  /** 素材裁剪/抠图后，更新画布上引用该素材的 block 的 scale 以匹配新图片尺寸（见功能文档 6.8） */
  useEffect(() => {
    if (!assetUpdatedId || !sceneId || !onAssetUpdatedProcessed) return;
    const api = window.yiman?.project;
    if (!api?.getLayers || !api?.getTimelineBlocks || !api?.getAssetById || !api?.getAssetDataUrl || !api?.updateTimelineBlock) return;

    let cancelled = false;
    const run = async () => {
      const designW = landscape ? DESIGN_WIDTH_LANDSCAPE : DESIGN_WIDTH_PORTRAIT;
      const designH = landscape ? DESIGN_HEIGHT_LANDSCAPE : DESIGN_HEIGHT_PORTRAIT;
      const baseScale = 0.25;

      const loadImageDimensions = (dataUrl: string): Promise<{ w: number; h: number }> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = dataUrl;
        });

      const layerList = (await api.getLayers(projectDir, sceneId)) as LayerRow[];
      const blocksToUpdate: { blockId: string }[] = [];
      for (const layer of layerList) {
        const list = (await api.getTimelineBlocks(projectDir, layer.id)) as BlockRow[];
        for (const b of list) {
          if (b.asset_id === assetUpdatedId) blocksToUpdate.push({ blockId: b.id });
        }
      }
      if (blocksToUpdate.length === 0 || cancelled) {
        onAssetUpdatedProcessed();
        return;
      }

      const asset = (await api.getAssetById(projectDir, assetUpdatedId)) as { path?: string; type?: string } | null;
      if (!asset?.path || (asset.type ?? '') !== 'image') {
        onAssetUpdatedProcessed();
        return;
      }

      const dataUrl = await api.getAssetDataUrl(projectDir, asset.path);
      if (!dataUrl || cancelled) {
        onAssetUpdatedProcessed();
        return;
      }

      let imgW: number;
      let imgH: number;
      try {
        const dim = await loadImageDimensions(dataUrl);
        imgW = dim.w;
        imgH = dim.h;
      } catch {
        onAssetUpdatedProcessed();
        return;
      }
      if (imgW <= 0 || imgH <= 0 || cancelled) {
        onAssetUpdatedProcessed();
        return;
      }

      const frameAspect = imgW / imgH;
      const designAspect = designW / designH;
      let scale_x = baseScale;
      let scale_y = baseScale;
      if (frameAspect >= designAspect) {
        scale_x = baseScale;
        scale_y = baseScale * (designW / designH) / frameAspect;
      } else {
        scale_y = baseScale;
        scale_x = baseScale * (designH / designW) * frameAspect;
      }
      scale_x = Math.max(0.02, Math.min(1, scale_x));
      scale_y = Math.max(0.02, Math.min(1, scale_y));

      for (const { blockId } of blocksToUpdate) {
        if (cancelled) break;
        await api.updateTimelineBlock(projectDir, blockId, { scale_x, scale_y });
      }
      if (!cancelled) onAssetUpdatedProcessed();
    };
    run();
    return () => { cancelled = true; };
  }, [assetUpdatedId, sceneId, projectDir, landscape, onAssetUpdatedProcessed]);

  const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  const audioLayerIds = new Set(layers.filter((l) => l.layer_type === 'audio').map((l) => l.id));

  /** 预加载媒体：场景加载时为所有视频/音频块创建隐藏元素提前加载，保障播放流畅 */
  useEffect(() => {
    const toPreload = blocks.filter(
      (b) => b.asset_id && blockDataUrls[b.id] && (
        (audioLayerIds.has(b.layer_id) && visibleLayerIds.has(b.layer_id))
        || (visibleLayerIds.has(b.layer_id) && !audioLayerIds.has(b.layer_id) && /\.(mp4|webm|mov|avi|mkv)$/i.test(blockAssetPaths[b.id] ?? ''))
      )
    );
    if (toPreload.length === 0) return;
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;';
    toPreload.forEach((b) => {
      const url = blockDataUrls[b.id];
      if (!url) return;
      const isAudio = audioLayerIds.has(b.layer_id);
      const el = document.createElement(isAudio ? 'audio' : 'video');
      el.preload = 'auto';
      el.src = url;
      container.appendChild(el);
    });
    document.body.appendChild(container);
    return () => {
      if (container.parentNode) container.parentNode.removeChild(container);
    };
  }, [blocks, blockDataUrls, blockAssetPaths, audioLayerIds, visibleLayerIds]);

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

  const TIME_EPS = 1e-5;
  /** 仅显示当前时间在块区间内的素材；音效/音乐不在画布显示、无选中框（见功能文档 6.7）；合并 pendingBlockUpdates 实现拖拽时乐观更新；精灵图按帧播放；TIME_EPS 避免浮点边界不可见 */
  const blockItems: import('./Canvas').BlockItem[] = blocks
    .filter((b) => !audioLayerIds.has(b.layer_id) && visibleLayerIds.has(b.layer_id) && currentTime >= b.start_time - TIME_EPS && currentTime <= b.end_time + TIME_EPS)
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
      const assetPath = blockAssetPaths[b.id] ?? '';
      const assetType = blockAssetTypes[b.id] ?? '';
      const spriteDef = assetPath ? spriteDefByPath[assetPath] : null;
      const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(assetPath);
      const isTransparentVideo = assetType === 'transparent_video';
      const isSprite = !!spriteDef && !isVideo;
      return {
        ...b,
        pos_x: pending?.pos_x ?? transform.pos_x,
        pos_y: pending?.pos_y ?? transform.pos_y,
        scale_x: pending?.scale_x ?? transform.scale_x,
        scale_y: pending?.scale_y ?? transform.scale_y,
        rotation: pending?.rotation ?? transform.rotation,
        dataUrl: blockDataUrls[b.id] ?? null,
        isVideo,
        isTransparentVideo,
        lock_aspect: (b as BlockRow).lock_aspect ?? 1,
        opacity: pending?.opacity ?? effects.opacity,
        blur: pending?.blur ?? effects.blur,
        color: effects.color,
        zIndex: computeBlockZIndex(b.id, blocks, layers),
        ...(isSprite && spriteDef
          ? {
              spriteInfo: {
                frames: spriteDef.frames,
                frame_count: spriteDef.frame_count,
                playback_fps: (b as BlockRow).playback_fps ?? spriteDef.playback_fps,
                start_time: b.start_time,
                end_time: b.end_time,
              },
              currentTime,
            }
          : {}),
        ...(isVideo ? { currentTime, start_time: b.start_time, end_time: b.end_time } : {}),
        animationConfig: (() => {
          try {
            const raw = (b as { animation_config?: string | null }).animation_config;
            if (!raw) return null;
            return JSON.parse(raw) as BlockAnimationConfig;
          } catch {
            return null;
          }
        })(),
        currentTime,
        ...(componentInfoByBlock[b.id]
          ? (() => {
              const comp = componentInfoByBlock[b.id]!;
              const raw = (b as { state_keyframes?: string | null }).state_keyframes;
              const stateKfs = parseStateKeyframes(raw);
              const effectiveKf = getEffectiveKeyframe(stateKfs, currentTime);
              const tags = effectiveKf?.selectedTagsByGroupId
                ? Object.values(effectiveKf.selectedTagsByGroupId).filter(Boolean)
                : [];
              const selectedTagsBySpriteItemId = effectiveKf?.selectedTagsBySpriteItemId ?? undefined;
              return {
                componentInfo: {
                  ...comp,
                  tags,
                  selectedTagsBySpriteItemId,
                },
              };
            })()
          : {}),
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

  /** 叠加层拖拽结束：等待最后一次 DB 写入完成，重新加载数据后再清除乐观更新，避免先回原状再跳目标 */
  const handleOverlayDragEnd = useCallback(async () => {
    if (lastBlockUpdatePromiseRef.current) {
      await lastBlockUpdatePromiseRef.current;
      lastBlockUpdatePromiseRef.current = null;
    }
    const allBlocks = await loadLayersAndBlocks();
    setPendingBlockUpdates({});
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

  /** 播放时播放声音素材（拖拽时间轴不播放）；仅在 playing 时播放当前时间范围内的声音块 */
  const playingAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  useEffect(() => {
    if (!playing) {
      playingAudioRef.current.forEach((el) => { el.pause(); el.src = ''; });
      playingAudioRef.current.clear();
      return;
    }
    const active = blocks.filter(
      (b) => b.asset_id && audioLayerIds.has(b.layer_id) && visibleLayerIds.has(b.layer_id)
        && currentTime >= b.start_time - TIME_EPS && currentTime <= b.end_time + TIME_EPS
    );
    const activeIds = new Set(active.map((b) => b.id));
    playingAudioRef.current.forEach((el, id) => {
      if (!activeIds.has(id)) {
        el.pause();
        el.src = '';
        playingAudioRef.current.delete(id);
      }
    });
    active.forEach((b) => {
      const url = blockDataUrls[b.id];
      if (!url) return;
      let el = playingAudioRef.current.get(b.id);
      const localTime = Math.max(0, currentTime - b.start_time);
      const vol = (b as { volume?: number }).volume ?? 1;
      if (!el) {
        el = new Audio(url);
        playingAudioRef.current.set(b.id, el);
        el.onended = () => { /* 不删除，避免 effect 重跑时重建并重复播放 */ };
        el.onerror = () => { playingAudioRef.current.delete(b.id); };
        el.currentTime = localTime;
        el.volume = Math.max(0, Math.min(1, vol));
        el.play().catch(() => {});
      } else {
        el.volume = Math.max(0, Math.min(1, vol));
        if (el.paused && !el.ended) el.play().catch(() => {});
      }
    });
  }, [playing, currentTime, blocks, audioLayerIds, visibleLayerIds, blockDataUrls, TIME_EPS]);

  /** 播放时时间轴随进度向右移动（见功能文档 6.8）；壁钟 elapsed 保证匀速，避免 delta 累积导致卡顿 */
  const sceneDuration = blocks.length ? Math.max(...blocks.map((b) => b.end_time), 0) : 0;
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<{ wall: number; scene: number } | null>(null);
  const onPlayEndRef = useRef(onPlayEnd);
  onPlayEndRef.current = onPlayEnd;
  const sceneDurationRef = useRef(sceneDuration);
  sceneDurationRef.current = sceneDuration;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  /** 非播放时记录当前时间，确保拖动 slider 后点击播放使用正确的起始位置 */
  const lastStoppedTimeRef = useRef(currentTime);
  if (!playing) lastStoppedTimeRef.current = currentTime;

  /** 非播放时同步 slider 显示值，避免与 currentTime 脱节 */
  useEffect(() => {
    if (!playing) setSliderValue(currentTime);
  }, [playing, currentTime]);
  useEffect(() => {
    if (!playing || !setCurrentTime) return;
    let startScene = lastStoppedTimeRef.current;
    if (startScene >= sceneDurationRef.current - 0.01) {
      setCurrentTime(0);
      startScene = 0;
      lastStoppedTimeRef.current = 0;
    }
    playStartRef.current = { wall: performance.now(), scene: startScene };
    setSliderValue(startScene);
    const tick = (now: number) => {
      const start = playStartRef.current;
      if (!start) return;
      const elapsed = (now - start.wall) / 1000;
      const next = Math.min(start.scene + elapsed, sceneDurationRef.current);
      if (next >= sceneDurationRef.current) {
        onPlayEndRef.current?.();
        setCurrentTime(sceneDurationRef.current);
        setSliderValue(sceneDurationRef.current);
      } else {
        setCurrentTime(next);
        if (now - lastSliderUpdateRef.current > 80) {
          setSliderValue(next);
          lastSliderUpdateRef.current = now;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      playStartRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, setCurrentTime]);

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
      let duration = 10;
      let scale_x = 0.25;
      let scale_y = 0.25;
      const isVideoType = ['video', 'transparent_video'].includes(values.type || '');
      const isVideoExt = /\.(mp4|webm|mov|avi|mkv)$/i.test(filePath);
      if ((isVideoType || isVideoExt) && window.yiman?.project?.getAssetById) {
        const asset = (await window.yiman.project.getAssetById(projectDir, res.id)) as { path?: string; duration?: number; width?: number; height?: number } | null;
        if (asset) {
          const storedDuration = asset.duration;
          if (typeof storedDuration === 'number' && storedDuration > 0) {
            duration = Math.max(0.5, storedDuration);
          } else if (asset.path && window.yiman?.project?.getAssetDataUrl) {
            const url = await window.yiman.project.getAssetDataUrl(projectDir, asset.path);
            if (url) {
              const d = await new Promise<number>((resolve) => {
                const el = document.createElement('video');
                el.preload = 'metadata';
                el.onloadedmetadata = () => {
                  el.src = '';
                  resolve(Number.isFinite(el.duration) ? el.duration : 10);
                };
                el.onerror = () => resolve(10);
                el.src = url;
              });
              duration = Math.max(0.5, d);
            }
          }
          const w = asset.width;
          const h = asset.height;
          if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
            const designW = landscape ? 1920 : 1080;
            const designH = landscape ? 1080 : 1920;
            const baseScale = 0.25;
            const frameAspect = w / h;
            const designAspect = designW / designH;
            if (frameAspect >= designAspect) {
              scale_x = baseScale;
              scale_y = baseScale * (designW / designH) / frameAspect;
            } else {
              scale_y = baseScale;
              scale_x = baseScale * (designH / designW) * frameAspect;
            }
            scale_x = Math.max(0.02, Math.min(1, scale_x));
            scale_y = Math.max(0.02, Math.min(1, scale_y));
          }
        }
      }
      const br = await window.yiman.project.createTimelineBlock(projectDir, {
        id: blockId,
        layer_id: layerId,
        asset_id: res.id,
        start_time: 0,
        end_time: duration,
        pos_x: 0.5,
        pos_y: 0.5,
        scale_x,
        scale_y,
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

  const playerContent = (
    <>
      {/* 工作区：视口 + 画布（缩放内，导出有效区域）+ 选中态叠加层（缩放外，固定像素把手） */}
      <div
        ref={workspaceViewportRef}
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
            playing={playing}
            projectDir={projectDir}
            getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          />
        </div>
        {!fullscreen && (
          <CanvasSelectionOverlay
            viewportRef={workspaceViewportRef}
            zoom={zoom}
            designWidth={designWidth}
            designHeight={designHeight}
            selectedBlock={selectedBlockId ? (blockItems.find((b) => b.id === selectedBlockId) ?? null) : null}
            onResize={handleBlockResize}
            onRotate={handleBlockRotate}
            onBlockMove={handleBlockMove}
            onDragEnd={handleOverlayDragEnd}
          />
        )}
        {fullscreen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 99,
              pointerEvents: 'auto',
            }}
            aria-hidden
          />
        )}
      </div>

      {/* 画布下方工具条：全屏时显示播放进度、播放、缩放、FIT、全屏 */}
      <div style={{ flex: 'none', padding: '4px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {fullscreen && (
          <div style={{ width: '60%' }}>
            <Slider
              min={0}
              max={Math.max(0.001, sceneDuration)}
              step={0.01}
              value={Math.min(sliderValue, sceneDuration)}
              onChange={(v) => {
                const t = typeof v === 'number' ? v : v[0];
                const clamped = Math.max(0, Math.min(sceneDuration, t));
                if (playing && Math.abs(clamped - sliderValue) < 0.05) return;
                if (playing) onPlayPause?.();
                setCurrentTime?.(clamped);
                setSliderValue(clamped);
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
        <Button
          type="text"
          size="small"
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={() => onPlayPause?.()}
        >
          {playing ? '停止' : '播放'}
        </Button>
        <Space>
          <Button size="small" type="text" icon={<ZoomOutOutlined />} onClick={() => { setFitToViewport(false); setZoom((z) => Math.max(0.1, z - 0.05)); }} />
          <Text style={{ minWidth: 48 }}>{Math.round(zoom * 100)}%</Text>
          <Button size="small" type="text" icon={<ZoomInOutlined />} onClick={() => { setFitToViewport(false); setZoom((z) => Math.min(2, z + 0.05)); }} />
        </Space>
        <Tooltip title="适应视口">
          <Button color="default" variant={fitToViewport ? 'filled' : 'text'} size="small" icon={<CompressOutlined />} onClick={handleFitToggle} />
        </Tooltip>
        <Tooltip title={fullscreen ? '退出全屏' : '全屏播放'}>
          <Button type="text" size="small" icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={handleFullscreenToggle} />
        </Tooltip>
        </div>
      </div>
    </>
  );

  if (fullscreen) {
    return (
      <>
        {createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: '#2e2e2e',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {playerContent}
          </div>,
          document.body
        )}
        <Modal
          title="添加本地素材"
          open={addAssetModalOpen}
          onCancel={() => setAddAssetModalOpen(false)}
          onOk={handleAddLocalAsset}
          confirmLoading={uploading}
          okText="选择文件并添加"
        >
          <Form form={form} layout="vertical" initialValues={{ type: 'image', is_favorite: false, description: '' }}>
            <Form.Item name="type" label="分类" rules={[{ required: true }]}>
              <Select options={ASSET_LIBRARY_CATEGORIES.map((t) => ({ value: t.value, label: t.label }))} />
            </Form.Item>
            <Form.Item name="is_favorite" valuePropName="checked">
              <Checkbox>保存为常用</Checkbox>
            </Form.Item>
            <Form.Item name="description" label="描述（可选）">
              <TextArea rows={2} placeholder="素材描述" />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {playerContent}
      <Modal
        title="添加本地素材"
        open={addAssetModalOpen}
        onCancel={() => setAddAssetModalOpen(false)}
        onOk={handleAddLocalAsset}
        confirmLoading={uploading}
        okText="选择文件并添加"
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'image', is_favorite: false, description: '' }}>
          <Form.Item name="type" label="分类" rules={[{ required: true }]}>
            <Select options={ASSET_LIBRARY_CATEGORIES.map((t) => ({ value: t.value, label: t.label }))} />
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
