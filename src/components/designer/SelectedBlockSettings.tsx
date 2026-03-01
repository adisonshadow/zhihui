/**
 * 选中素材设置（列 3 手风琴）：信息与素材自带设置、位置大小（缩放/位置/旋转）、关键帧（见功能文档 6.8、开发计划 2.12）
 * 关键帧按属性独立：位置/缩放/旋转各自独立；设置自动保存，无保存按钮
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, Input, InputNumber, Button, Typography, Space, Switch, Slider, App, Radio } from 'antd';
import type { FormInstance } from 'antd';
import type { ProjectInfo } from '@/hooks/useProject';
import { KeyframeButton } from './KeyframeButton';
import { useKeyframeCRUD, type KeyframeProperty, type KeyframeRow } from '@/hooks/useKeyframeCRUD';
import { getInterpolatedTransform, getInterpolatedEffects } from '@/utils/keyframeTween';
import { ASSET_CATEGORIES } from '@/constants/assetCategories';
import { COMPONENT_BLOCK_PREFIX } from '@/constants/project';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import { AnimationSettingsPanel } from './AnimationSettingsPanel';
import { StateSettingsPanel } from './StateSettingsPanel';
import { parseStateKeyframes } from '@/utils/stateKeyframes';
import { STANDALONE_COMPONENTS_CHARACTER_ID, STANDALONE_SPRITES_CHARACTER_ID } from '@/constants/project';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { SpriteSheetItem } from '@/components/character/SpriteSheetPanel';

const { Text } = Typography;

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
  playback_count?: number;
  animation_config?: string | null;
  state_keyframes?: string | null;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
}

export type BlockSettingsTab = 'base' | 'sprite' | 'audio' | 'animation' | 'state';

interface SelectedBlockSettingsProps {
  project: ProjectInfo;
  blockId: string | null;
  currentTime: number;
  refreshKey?: number;
  onUpdate?: () => void;
  onJumpToTime?: (t: number) => void;
  /** 乐观更新 blur/opacity/pos/scale，画布立即反映 */
  onBlockUpdate?: (blockId: string, data: Partial<{ blur: number; opacity: number; pos_x: number; pos_y: number; scale_x: number; scale_y: number }>) => void;
  /** 选中素材时是否为精灵图/音效音乐/元件（用于 header 切换）；frameCount 用于精灵图时长计算 */
  onBlockInfo?: (info: { isSprite: boolean; frameCount?: number; isAudio?: boolean; isComponent?: boolean }) => void;
  /** 当前设置 tab（基础设置 | 精灵图设置），由父组件控制 */
  settingsTab?: BlockSettingsTab;
  /** 是否为精灵图（精灵图基础设置无播放时间、素材条不可 resize） */
  isSpriteBlock?: boolean;
  /** 是否为音效/音乐（仅显示声音设置：音量、渐入、渐出） */
  isAudioBlock?: boolean;
}

const KF_TOLERANCE = 0.02;
const AUTO_SAVE_DEBOUNCE_MS = 400;
/** 数值显示精度：时间 1 位，缩放/位置/旋转 2 位 */
const PRECISION_TIME = 1;
const PRECISION_TRANSFORM = 2;

const DESIGN_WIDTH_LANDSCAPE = 1920;
const DESIGN_HEIGHT_LANDSCAPE = 1080;
const DESIGN_WIDTH_PORTRAIT = 1080;
const DESIGN_HEIGHT_PORTRAIT = 1920;

/** 获取素材显示尺寸（图片/视频用原始尺寸，精灵图用首帧尺寸） */
async function getAssetDimensions(
  projectDir: string,
  asset: { path: string; type: string },
  isSpriteBlock: boolean
): Promise<{ w: number; h: number } | null> {
  const api = window.yiman?.project;
  if (!api?.getAssetDataUrl) return null;
  const dataUrl = await api.getAssetDataUrl(projectDir, asset.path);
  if (!dataUrl) return null;

  const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(asset.path);
  if (isVideo) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({ w: video.videoWidth, h: video.videoHeight });
        video.src = '';
      };
      video.onerror = () => resolve(null);
      video.src = dataUrl;
    });
  }

  if (isSpriteBlock && api.getSpriteFrames) {
    try {
      const bg = await api.getSpriteBackgroundColor?.(projectDir, asset.path) ?? null;
      const { raw } = await api.getSpriteFrames(projectDir, asset.path, bg, { minGapPixels: 6 });
      if (raw?.length && raw[0].width > 0 && raw[0].height > 0) {
        return { w: raw[0].width, h: raw[0].height };
      }
    } catch {
      /* fallback to image */
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** cover 模式：保持比例铺满画布，返回 scale_x、scale_y（0–1 相对设计尺寸） */
function computeCoverScale(
  assetW: number,
  assetH: number,
  designW: number,
  designH: number
): { scale_x: number; scale_y: number } {
  if (assetW <= 0 || assetH <= 0) return { scale_x: 1, scale_y: 1 };
  const designAspect = designW / designH;
  const assetAspect = assetW / assetH;
  let scale_x: number;
  let scale_y: number;
  if (assetAspect >= designAspect) {
    scale_x = 1;
    scale_y = Math.max(1, (designW / designH) * (assetH / assetW));
  } else {
    scale_y = 1;
    scale_x = Math.max(1, (designH / designW) * (assetW / assetH));
  }
  return { scale_x, scale_y };
}

/** 缩放控件：Slider + InputNumber（百分比），Form.Item 注入 value/onChange */
function ScaleControl({
  value,
  onChange,
  lockAspect,
  form,
  precision,
}: {
  value?: number;
  onChange?: (v: number) => void;
  lockAspect: boolean;
  form: FormInstance<any>;
  precision: number;
}) {
  const handleChange = (v: number) => {
    onChange?.(v);
    if (lockAspect) form.setFieldValue('scale_y', v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <Slider
        min={0.01}
        max={2}
        step={0.01}
        style={{ flex: 1, margin: 0 }}
        value={value}
        onChange={handleChange}
      />
      <InputNumber
        size="small"
        min={0.01}
        max={10}
        step={0.01}
        precision={precision}
        value={value}
        onChange={(v) => handleChange(typeof v === 'number' ? v : 0)}
        formatter={(v) => (v != null && String(v) !== '' ? `${(Number(v) * 100).toFixed(2)}%` : '')}
        parser={(v) => (v ? parseFloat(String(v).replace(/%/g, '')) / 100 : 0)}
        style={{ width: 64, flexShrink: 0 }}
      />
    </div>
  );
}

export function SelectedBlockSettings({ project, blockId, currentTime, refreshKey, onUpdate, onJumpToTime, onBlockUpdate, onBlockInfo, settingsTab = 'base', isSpriteBlock = false, isAudioBlock = false }: SelectedBlockSettingsProps) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;
  const { createKeyframe, updateKeyframe, deleteKeyframe, getKeyframes } = useKeyframeCRUD(projectDir);
  const [form] = Form.useForm<{ pos_x: number; pos_y: number; scale_x: number; scale_y: number; rotation: number; blur: number; opacity: number }>();

  const [block, setBlock] = useState<BlockRow | null>(null);
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [keyframes, setKeyframes] = useState<KeyframeRow[]>([]);
  const [savingDuration, setSavingDuration] = useState(false);
  const [fitToCanvasLoading, setFitToCanvasLoading] = useState(false);
  const [addingKf, setAddingKf] = useState(false);
  const [duration, setDuration] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [spriteFrameCount, setSpriteFrameCount] = useState(8);
  const [componentInfo, setComponentInfo] = useState<{
    characterId: string;
    group: GroupComponentItem;
    spriteSheets: SpriteSheetItem[];
    componentGroups: GroupComponentItem[];
    allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
  } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 防止时间轴移动时 form.setFieldsValue 触发 onValuesChange 导致误保存 */
  const isSyncingFromTimelineRef = useRef(false);
  /** 用户刚编辑过 opacity/blur 的时间戳，避免 timeline 同步立即覆盖导致「跳回」 */
  const lastUserEditEffectsRef = useRef(0);

  const handleLockAspectChange = useCallback(
    async (checked: boolean) => {
      setLockAspect(checked);
      if (!blockId || !window.yiman?.project?.updateTimelineBlock) return;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        lock_aspect: checked ? 1 : 0,
      });
      if (res?.ok) onUpdate?.();
      else message.error(res?.error || '保存失败');
    },
    [blockId, projectDir, onUpdate, message]
  );

  /** 适合画布：cover 模式铺满画布，位置居中（见功能文档 6.8） */
  const handleFitToCanvas = useCallback(async () => {
    if (!blockId || !block || !asset || !window.yiman?.project?.updateTimelineBlock) return;
    setFitToCanvasLoading(true);
    try {
      const dim = await getAssetDimensions(projectDir, asset, isSpriteBlock);
      if (!dim || dim.w <= 0 || dim.h <= 0) {
        message.warning('无法获取素材尺寸');
        return;
      }
      const landscape = !!project.landscape;
      const designW = landscape ? DESIGN_WIDTH_LANDSCAPE : DESIGN_WIDTH_PORTRAIT;
      const designH = landscape ? DESIGN_HEIGHT_LANDSCAPE : DESIGN_HEIGHT_PORTRAIT;
      const { scale_x, scale_y } = computeCoverScale(dim.w, dim.h, designW, designH);
      const pos_x = 0.5;
      const pos_y = 0.5;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        pos_x,
        pos_y,
        scale_x,
        scale_y,
      });
      if (res?.ok) {
        form.setFieldsValue({ pos_x, pos_y, scale_x, scale_y });
        onBlockUpdate?.(blockId, { pos_x, pos_y, scale_x, scale_y });
        const kfList = await getKeyframes(blockId);
        for (const prop of ['pos', 'scale'] as KeyframeProperty[]) {
          const kf = kfList.find((k) => (k.property || 'pos') === prop && Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (kf) {
            const payload = prop === 'pos' ? { pos_x, pos_y } : { scale_x, scale_y };
            await updateKeyframe(kf.id, payload);
          }
        }
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    } finally {
      setFitToCanvasLoading(false);
    }
  }, [blockId, block, asset, projectDir, project.landscape, isSpriteBlock, form, getKeyframes, updateKeyframe, currentTime, onUpdate, onBlockUpdate, message]);

  /** 仅在新块加载时调用 onBlockInfo，避免 refresh 时触发 tab 切换（见开发计划 2.x 元件状态） */
  const lastBlockIdForInfoRef = useRef<string | null>(null);

  const loadBlock = useCallback(async () => {
    if (!blockId || !window.yiman?.project?.getTimelineBlockById) return;
    const b = (await window.yiman.project.getTimelineBlockById(projectDir, blockId)) as BlockRow | null;
    const kf = b ? (await getKeyframes(blockId)) || [] : [];
    setBlock(b);
    setKeyframes(kf);
    if (b) {
      if (!b.asset_id?.startsWith(COMPONENT_BLOCK_PREFIX)) {
        setComponentInfo(null);
      }
      setLockAspect((b.lock_aspect ?? 1) !== 0);
      const start = b.start_time ?? 0;
      const end = b.end_time ?? start + 5;
      setDuration(Math.max(0, end - start));
      let a: AssetRow | null = null;
      if (b.asset_id && window.yiman?.project?.getAssetById) {
        a = (await window.yiman.project.getAssetById(projectDir, b.asset_id)) as AssetRow | null;
        setAsset(a);
      } else setAsset(null);
      if (b.asset_id?.startsWith(COMPONENT_BLOCK_PREFIX) && window.yiman?.project?.getCharacters) {
        const rest = b.asset_id.slice(COMPONENT_BLOCK_PREFIX.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx >= 0) {
          const characterId = rest.slice(0, colonIdx);
          const groupId = rest.slice(colonIdx + 1);
          const chars = (await window.yiman.project.getCharacters(projectDir)) as { id: string; sprite_sheets?: string | null; component_groups?: string | null }[];
          const char = chars.find((ch) => ch.id === characterId);
          if (char?.component_groups) {
            try {
              const groups = JSON.parse(char.component_groups) as GroupComponentItem[];
              const group = Array.isArray(groups) ? groups.find((g) => g.id === groupId) : null;
              if (group) {
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
                const allCharsData: { characterId: string; spriteSheets: SpriteSheetItem[] }[] = [];
                for (const ch of chars) {
                  if (ch.id === characterId || !ch.sprite_sheets) continue;
                  try {
                    const ss = JSON.parse(ch.sprite_sheets) as SpriteSheetItem[];
                    if (Array.isArray(ss)) allCharsData.push({ characterId: ch.id, spriteSheets: ss });
                  } catch { /* ignore */ }
                }
                setComponentInfo({
                  characterId,
                  group,
                  spriteSheets: Array.isArray(spriteSheets) ? spriteSheets : [],
                  componentGroups,
                  allCharactersData: allCharsData.length > 0 ? allCharsData : undefined,
                });
              }
            } catch { /* ignore */ }
          }
        }
      }
      if (onBlockInfo && blockId !== lastBlockIdForInfoRef.current) {
        lastBlockIdForInfoRef.current = blockId;
        let isSprite = false;
        let frameCount = 8;
        if (a?.path && window.yiman?.project?.getCharacters) {
          const chars = (await window.yiman.project.getCharacters(projectDir)) as { sprite_sheets?: string | null }[];
          for (const c of chars) {
            try {
              const arr = c.sprite_sheets ? (JSON.parse(c.sprite_sheets) as { image_path?: string; frame_count?: number; frames?: unknown[] }[]) : [];
              const match = Array.isArray(arr) ? arr.find((s) => s.image_path === a!.path) : null;
              if (match) {
                isSprite = true;
                frameCount = (match.frame_count ?? (match.frames?.length ?? 0)) || 8;
                break;
              }
            } catch { /* ignore */ }
          }
        }
        const isAudio = !!(a && ['sfx', 'music'].includes(a.type ?? ''));
        const isComponent = !!b.asset_id?.startsWith(COMPONENT_BLOCK_PREFIX);
        onBlockInfo({ isSprite, frameCount, isAudio, isComponent });
        if (isSprite) setSpriteFrameCount(frameCount);
      }
    } else {
      setAsset(null);
      setDuration(0);
      setComponentInfo(null);
      if (onBlockInfo) {
        lastBlockIdForInfoRef.current = null;
        onBlockInfo({ isSprite: false, isAudio: false, isComponent: false });
      }
    }
  }, [blockId, projectDir, getKeyframes, onBlockInfo]);

  useEffect(() => {
    loadBlock();
  }, [loadBlock, refreshKey]);

  /** 时间轴移动时，用关键帧插值同步表单显示（见功能文档 6.8） */
  useEffect(() => {
    if (!block) return;
    const base = {
      start_time: block.start_time,
      end_time: block.end_time,
      pos_x: block.pos_x ?? 0.5,
      pos_y: block.pos_y ?? 0.5,
      scale_x: block.scale_x ?? 1,
      scale_y: block.scale_y ?? 1,
      rotation: block.rotation ?? 0,
      blur: block.blur ?? 0,
      opacity: block.opacity ?? 1,
    };
    const transform = getInterpolatedTransform(base, keyframes, currentTime);
    const effects = getInterpolatedEffects(base, keyframes, currentTime);
    const skipEffects = Date.now() - lastUserEditEffectsRef.current < 600;
    isSyncingFromTimelineRef.current = true;
    form.setFieldsValue({
      pos_x: transform.pos_x,
      pos_y: transform.pos_y,
      scale_x: transform.scale_x,
      scale_y: transform.scale_y,
      rotation: transform.rotation,
      ...(skipEffects ? {} : { blur: effects.blur, opacity: effects.opacity }),
    });
    queueMicrotask(() => { isSyncingFromTimelineRef.current = false; });
  }, [block, keyframes, currentTime, form]);

  /** 自动保存位置大小（防抖）；若当前时间有关键帧则同步更新关键帧值 */
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock) return;
      const values = form.getFieldsValue();
      const blurVal = values.blur ?? block.blur ?? 0;
      const opacityVal = values.opacity ?? block.opacity ?? 1;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        pos_x: values.pos_x ?? block.pos_x ?? 0.5,
        pos_y: values.pos_y ?? block.pos_y ?? 0.5,
        scale_x: values.scale_x ?? block.scale_x ?? 1,
        scale_y: values.scale_y ?? block.scale_y ?? 1,
        rotation: values.rotation ?? block.rotation ?? 0,
        blur: blurVal,
        opacity: opacityVal,
      });
      if (res?.ok) {
        onBlockUpdate?.(blockId, { blur: blurVal, opacity: opacityVal });
        const kfList = await getKeyframes(blockId);
        for (const prop of ['pos', 'scale', 'rotation', 'blur', 'opacity'] as KeyframeProperty[]) {
          const kf = kfList.find((k) => (k.property || 'pos') === prop && Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (kf) {
            const payload = prop === 'pos' ? { pos_x: values.pos_x, pos_y: values.pos_y }
              : prop === 'scale' ? { scale_x: values.scale_x, scale_y: values.scale_y }
              : prop === 'rotation' ? { rotation: values.rotation }
              : prop === 'blur' ? { blur: values.blur }
              : { opacity: values.opacity };
            await updateKeyframe(kf.id, payload);
          }
        }
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [blockId, block, projectDir, form, getKeyframes, updateKeyframe, currentTime, onUpdate, onBlockUpdate, message]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleSaveDuration = async () => {
    if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock) return;
    const start = block.start_time ?? 0;
    const newEnd = start + duration;
    if (newEnd <= start) {
      message.warning('播放时长须大于 0');
      return;
    }
    setSavingDuration(true);
    const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { end_time: newEnd });
    setSavingDuration(false);
    if (res?.ok) {
      message.success('已更新播放时间');
      loadBlock();
      onUpdate?.();
    } else message.error(res?.error || '保存失败');
  };

  const timeOnBlock = block && currentTime >= block.start_time && currentTime <= block.end_time;

  const getKfForProperty = useCallback((prop: KeyframeProperty) => {
    const list = keyframes.filter((kf) => (kf.property || 'pos') === prop);
    const kfAtCurrent = list.find((kf) => Math.abs(kf.time - currentTime) < KF_TOLERANCE);
    const prevKf = list.filter((kf) => kf.time < currentTime).pop();
    const nextKf = list.find((kf) => kf.time > currentTime);
    return { kfAtCurrent, prevKf, nextKf };
  }, [keyframes, currentTime]);

  const handleAddKeyframe = async (property: KeyframeProperty) => {
    if (!blockId || !block) return;
    const values = form.getFieldsValue();
    setAddingKf(true);
    try {
      const kfId = `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const data = { id: kfId, block_id: blockId, time: currentTime, property } as {
        id: string; block_id: string; time: number; property: KeyframeProperty;
        pos_x?: number; pos_y?: number; scale_x?: number; scale_y?: number; rotation?: number; blur?: number; opacity?: number;
      };
      if (property === 'pos') {
        data.pos_x = values.pos_x ?? block.pos_x ?? 0.5;
        data.pos_y = values.pos_y ?? block.pos_y ?? 0.5;
      } else if (property === 'scale') {
        data.scale_x = values.scale_x ?? block.scale_x ?? 1;
        data.scale_y = values.scale_y ?? block.scale_y ?? 1;
      } else if (property === 'rotation') {
        data.rotation = values.rotation ?? block.rotation ?? 0;
      } else if (property === 'blur') {
        data.blur = values.blur ?? block.blur ?? 0;
      } else if (property === 'opacity') {
        data.opacity = values.opacity ?? block.opacity ?? 1;
      } else {
        data.rotation = values.rotation ?? block.rotation ?? 0;
      }
      const res = await createKeyframe(data);
      if (res?.ok) {
        message.success('已添加关键帧');
        loadBlock();
        onUpdate?.();
      } else message.error(res?.error || '添加失败');
    } finally {
      setAddingKf(false);
    }
  };

  const handleDeleteKeyframe = async (property: KeyframeProperty) => {
    const { kfAtCurrent } = getKfForProperty(property);
    if (!kfAtCurrent) return;
    const res = await deleteKeyframe(kfAtCurrent.id);
    if (res?.ok) {
      message.success('已取消关键帧');
      loadBlock();
      onUpdate?.();
    } else message.error(res?.error || '删除失败');
  };

  /** 精灵图：根据播放速度、播放次数、帧数计算 duration 并更新 end_time；必须在早期 return 前声明（hooks 规则） */
  const updateSpriteDuration = useCallback(
    async (fps: number, count: number) => {
      if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock || spriteFrameCount <= 0) return;
      const duration = (spriteFrameCount / fps) * count;
      const newEnd = block.start_time + duration;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        playback_fps: fps,
        playback_count: count,
        end_time: newEnd,
      });
      if (res?.ok) {
        setBlock((prev) => (prev ? { ...prev, playback_fps: fps, playback_count: count, end_time: newEnd } : prev));
        setDuration(duration);
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    },
    [blockId, block, projectDir, spriteFrameCount, onUpdate]
  );

  if (!blockId) {
    return (
      <Form form={form} className="selected-block-settings">
        <Text type="secondary" className="selected-block-settings__placeholder">在画布或时间轴选中素材后显示</Text>
      </Form>
    );
  }

  if (!block) {
    return (
      <Form form={form} className="selected-block-settings">
        <Text type="secondary" className="selected-block-settings__placeholder">加载中…</Text>
      </Form>
    );
  }

  const isComponentBlock = block.asset_id?.startsWith(COMPONENT_BLOCK_PREFIX);
  const assetName = isComponentBlock ? '元件' : (asset?.description || asset?.path?.split(/[/\\]/).pop() || block.asset_id || '—');
  const typeLabel = isComponentBlock ? '元件' : (asset?.type
    ? (ASSET_CATEGORIES.find((c) => c.value === asset.type)?.label ?? { character: '人物', scene_bg: '场景背景', prop: '情景道具', sticker: '贴纸' }[asset.type] ?? asset.type)
    : '—');

  const handlePlaybackFpsChange = async (v: number | null) => {
    if (v == null || v < 0.5) return;
    const count = (block?.playback_count ?? 1);
    await updateSpriteDuration(v, count);
  };

  const handlePlaybackCountChange = async (v: number | null) => {
    if (v == null || v < 1) return;
    const fps = block?.playback_fps ?? 8;
    await updateSpriteDuration(fps, v);
  };

  /** 音效/音乐：仅声音设置（音量、渐入、渐出），无基础设置（见功能文档 6.7） */
  if (isAudioBlock) {
    const volume = (block as { volume?: number }).volume ?? 1;
    const fadeIn = (block as { fade_in?: number }).fade_in ?? 0;
    const fadeOut = (block as { fade_out?: number }).fade_out ?? 0;
    const saveAudio = async (data: { volume?: number; fade_in?: number; fade_out?: number }) => {
      if (!blockId || !window.yiman?.project?.updateTimelineBlock) return;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, data);
      if (res?.ok) onUpdate?.();
      else message.error(res?.error || '保存失败');
    };
    return (
      <div className="selected-block-settings selected-block-settings--audio" style={{ padding: '4px 0' }}>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>音量</Text>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(v) => saveAudio({ volume: v })}
              style={{ flex: 1, margin: 0 }}
            />
            <Text type="secondary" style={{ fontSize: 12, width: 40 }}>{(volume * 100).toFixed(0)}%</Text>
          </div>
        </section>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>渐入</Text>
            <Switch size="small" checked={!!fadeIn} onChange={(v) => saveAudio({ fade_in: v ? 1 : 0 })} />
          </div>
        </section>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>渐出</Text>
            <Switch size="small" checked={!!fadeOut} onChange={(v) => saveAudio({ fade_out: v ? 1 : 0 })} />
          </div>
        </section>
      </div>
    );
  }

  if (settingsTab === 'state' && isComponentBlock && componentInfo && block) {
    const stateKfs = parseStateKeyframes((block as { state_keyframes?: string | null }).state_keyframes);
    return (
      <div className="selected-block-settings selected-block-settings--state">
        <StateSettingsPanel
          projectDir={projectDir}
          blockId={blockId}
          blockStartTime={block.start_time ?? 0}
          blockEndTime={block.end_time ?? 0}
          currentTime={currentTime}
          stateKeyframes={stateKfs}
          characterId={componentInfo.characterId}
          group={componentInfo.group}
          spriteSheets={componentInfo.spriteSheets}
          componentGroups={componentInfo.componentGroups}
          allCharactersData={componentInfo.allCharactersData}
          onUpdate={() => { loadBlock(); onUpdate?.(); }}
          onJumpToTime={onJumpToTime}
        />
      </div>
    );
  }

  if (settingsTab === 'animation') {
    let animationConfig: BlockAnimationConfig | null = null;
    try {
      const raw = (block as { animation_config?: string | null }).animation_config;
      if (raw) animationConfig = JSON.parse(raw) as BlockAnimationConfig;
    } catch {
      /* ignore */
    }
    return (
      <div className="selected-block-settings selected-block-settings--animation">
        <AnimationSettingsPanel
          projectDir={projectDir}
          blockId={blockId}
          animationConfig={animationConfig}
          assetPath={asset?.path}
          assetType={asset?.type}
          projectDirForAsset={projectDir}
          onUpdate={() => { loadBlock(); onUpdate?.(); }}
        />
      </div>
    );
  }

  if (settingsTab === 'sprite') {
    const playbackFps = block.playback_fps ?? 8;
    const playbackCount = block.playback_count ?? 1;
    const computedDuration = spriteFrameCount > 0 ? (spriteFrameCount / playbackFps) * playbackCount : 0;
    return (
      <div className="selected-block-settings selected-block-settings--sprite" style={{ padding: '4px 0' }}>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">播放速度</Text>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber
              size="small"
              min={1}
              max={60}
              step={1}
              value={playbackFps}
              onChange={(v) => handlePlaybackFpsChange(typeof v === 'number' ? v : null)}
              style={{ width: 80 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>帧/秒</Text>
          </div>
        </section>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">播放次数</Text>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber
              size="small"
              min={1}
              max={999}
              step={1}
              value={playbackCount}
              onChange={(v) => handlePlaybackCountChange(typeof v === 'number' ? v : null)}
              style={{ width: 80 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>次</Text>
          </div>
        </section>
        <section className="selected-block-settings__section" style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>时长</Text>
          <div style={{ marginTop: 4, fontSize: 13 }}>
            {computedDuration.toFixed(1)} 秒（自动计算）
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="selected-block-settings" style={{ padding: '4px 0' }}>
      {/* 素材信息 */}
      <section className="selected-block-settings__section selected-block-settings__asset-info" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">素材信息</Text>
        <div className="selected-block-settings__asset-detail" style={{ marginTop: 4 }}>
          <Text strong className="selected-block-settings__asset-name">{assetName}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__asset-type">类型：{typeLabel}</Text>
        </div>
      </section>

      {/* 播放时间（精灵图不可调，由播放速度+播放次数自动计算） */}
      {!isSpriteBlock && (
      <section className="selected-block-settings__section selected-block-settings__duration" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">播放时间</Text>
        <div className="selected-block-settings__duration-controls" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Space.Compact>
            <InputNumber
              size="small"
              min={0.1}
              max={3600}
              step={0.1}
              precision={PRECISION_TIME}
              value={duration}
              onChange={(v) => setDuration(typeof v === 'number' ? v : 0)}
              style={{ width: 90 }}
              className="selected-block-settings__duration-input"
            />
            <Input size="small" value="秒" readOnly style={{ width: 32, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }} />
          </Space.Compact>
          <Button size="small" type="primary" onClick={handleSaveDuration} loading={savingDuration} className="selected-block-settings__duration-apply">
            应用
          </Button>
        </div>
      </section>
      )}

      {/* 位置大小（参考图）：缩放、等比缩放、位置、旋转，每行 label | 控件 | 关键帧右对齐 */}
      <section className="selected-block-settings__section selected-block-settings__transform" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">位置大小</Text>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed, all) => {
            if (isSyncingFromTimelineRef.current) return;
            scheduleAutoSave();
            // 即时乐观更新：blur/opacity/scale 变化时立即反映到画布，不等防抖保存
            if (blockId && (changed.blur !== undefined || changed.opacity !== undefined || changed.scale_x !== undefined || changed.scale_y !== undefined)) {
              if (changed.blur !== undefined || changed.opacity !== undefined) lastUserEditEffectsRef.current = Date.now();
              const blurVal = all.blur ?? block?.blur ?? 0;
              const opacityVal = all.opacity ?? block?.opacity ?? 1;
              const scale_x = all.scale_x ?? block?.scale_x ?? 1;
              const scale_y = all.scale_y ?? block?.scale_y ?? 1;
              onBlockUpdate?.(blockId, { blur: blurVal, opacity: opacityVal, scale_x, scale_y });
            }
          }}
          className="selected-block-settings__transform-form"
        >
          {/* 缩放：Slider + InputNumber + 关键帧 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>缩放</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="scale_x" noStyle>
                <ScaleControl
                  lockAspect={lockAspect}
                  form={form}
                  precision={PRECISION_TRANSFORM}
                />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('scale').kfAtCurrent}
                hasPrev={!!getKfForProperty('scale').prevKf}
                hasNext={!!getKfForProperty('scale').nextKf}
                onToggle={getKfForProperty('scale').kfAtCurrent ? () => handleDeleteKeyframe('scale') : () => handleAddKeyframe('scale')}
                onPrev={() => getKfForProperty('scale').prevKf && onJumpToTime?.(getKfForProperty('scale').prevKf!.time)}
                onNext={() => getKfForProperty('scale').nextKf && onJumpToTime?.(getKfForProperty('scale').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 等比缩放 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>等比缩放</span>
            <div style={{ flex: 1 }} />
            <Switch size="small" checked={lockAspect} onChange={handleLockAspectChange} style={{ flexShrink: 0 }} />
          </div>
          {/* 适合画布：cover 模式铺满画布 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }} />
            <Button size="small" onClick={handleFitToCanvas} loading={fitToCanvasLoading} disabled={!asset}>
              适合画布
            </Button>
          </div>
          {/* 位置 X/Y */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>位置</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="pos_x" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={PRECISION_TRANSFORM} style={{ width: 64 }} placeholder="X" />
              </Form.Item>
              <Form.Item name="pos_y" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={PRECISION_TRANSFORM} style={{ width: 64 }} placeholder="Y" />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('pos').kfAtCurrent}
                hasPrev={!!getKfForProperty('pos').prevKf}
                hasNext={!!getKfForProperty('pos').nextKf}
                onToggle={getKfForProperty('pos').kfAtCurrent ? () => handleDeleteKeyframe('pos') : () => handleAddKeyframe('pos')}
                onPrev={() => getKfForProperty('pos').prevKf && onJumpToTime?.(getKfForProperty('pos').prevKf!.time)}
                onNext={() => getKfForProperty('pos').nextKf && onJumpToTime?.(getKfForProperty('pos').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 旋转 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>旋转</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <Form.Item name="rotation" noStyle>
                <InputNumber size="small" min={-360} max={360} step={1} precision={PRECISION_TRANSFORM} style={{ width: 72 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('rotation').kfAtCurrent}
                hasPrev={!!getKfForProperty('rotation').prevKf}
                hasNext={!!getKfForProperty('rotation').nextKf}
                onToggle={getKfForProperty('rotation').kfAtCurrent ? () => handleDeleteKeyframe('rotation') : () => handleAddKeyframe('rotation')}
                onPrev={() => getKfForProperty('rotation').prevKf && onJumpToTime?.(getKfForProperty('rotation').prevKf!.time)}
                onNext={() => getKfForProperty('rotation').nextKf && onJumpToTime?.(getKfForProperty('rotation').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 模糊 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>模糊</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <Form.Item name="blur" noStyle>
                <InputNumber size="small" min={0} max={50} step={0.5} precision={1} style={{ width: 72 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('blur').kfAtCurrent}
                hasPrev={!!getKfForProperty('blur').prevKf}
                hasNext={!!getKfForProperty('blur').nextKf}
                onToggle={getKfForProperty('blur').kfAtCurrent ? () => handleDeleteKeyframe('blur') : () => handleAddKeyframe('blur')}
                onPrev={() => getKfForProperty('blur').prevKf && onJumpToTime?.(getKfForProperty('blur').prevKf!.time)}
                onNext={() => getKfForProperty('blur').nextKf && onJumpToTime?.(getKfForProperty('blur').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 透明度 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>透明度</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="opacity" noStyle>
                <Slider min={0} max={1} step={0.01} style={{ flex: 1, margin: 0 }} />
              </Form.Item>
              <Form.Item name="opacity" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={2} style={{ width: 56, flexShrink: 0 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('opacity').kfAtCurrent}
                hasPrev={!!getKfForProperty('opacity').prevKf}
                hasNext={!!getKfForProperty('opacity').nextKf}
                onToggle={getKfForProperty('opacity').kfAtCurrent ? () => handleDeleteKeyframe('opacity') : () => handleAddKeyframe('opacity')}
                onPrev={() => getKfForProperty('opacity').prevKf && onJumpToTime?.(getKfForProperty('opacity').prevKf!.time)}
                onNext={() => getKfForProperty('opacity').nextKf && onJumpToTime?.(getKfForProperty('opacity').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
        </Form>
      </section>
    </div>
  );
}
