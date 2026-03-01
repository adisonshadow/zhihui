/**
 * 素材浏览（列 1 素材面板）：本地/人物/特效/声效/音乐 Tabs；本地为 GrowCard（导入+模糊搜索+已导入列表）（见功能文档 6.4、开发计划 2.12）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Button, Space, App, Modal, Form, Input, Radio } from 'antd';
import { PlusOutlined, UploadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { AdaptiveTabs } from '@/components/antd-plus/AdaptiveTabs';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import { ImagePreviewDrawer } from '@/components/asset/ImagePreviewDrawer';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import type { ProjectInfo } from '@/hooks/useProject';
import { GrowCard } from '@/components/GrowCard';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { ASSET_CATEGORIES } from '@/constants/assetCategories';
import { STANDALONE_SPRITES_CHARACTER_ID, STANDALONE_COMPONENTS_CHARACTER_ID, COMPONENT_BLOCK_PREFIX } from '@/constants/project';
import { AudioListItem } from '@/components/asset/AudioListItem';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import { GroupComponentPanel } from '@/components/character/GroupComponentPanel';
import type { GroupComponentItem } from '@/types/groupComponent';

const { Text } = Typography;

function parseSpriteSheets(json: string | null): SpriteSheetItem[] {
  if (!json || json.trim() === '') return [];
  try {
    const arr = JSON.parse(json) as SpriteSheetItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseComponentGroups(json: string | null): GroupComponentItem[] {
  if (!json || json.trim() === '') return [];
  try {
    const arr = JSON.parse(json) as GroupComponentItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 从元件首个状态的元素中取第一张图片 path，用于缩略图 */
function getFirstImagePathFromGroup(group: GroupComponentItem): string | null {
  const state = group.states?.[0];
  if (!state?.items?.length) return null;
  for (const it of state.items) {
    if (it.type === 'image' && (it as { path?: string }).path) return (it as { path: string }).path;
  }
  return null;
}

interface CharacterRow {
  id: string;
  name: string;
  image_path: string | null;
  sprite_sheets?: string | null;
  component_groups?: string | null;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
  cover_path?: string | null;
  tags?: string | null;
  created_at?: string;
}

interface AssetBrowsePanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  /** 当前集的 character_refs JSON 数组字符串，用于人物 Tab 排序 */
  episodeCharacterRefs: string;
  /** 当前播放时间（秒），放置时作为 start_time */
  currentTime: number;
  onPlaced?: () => void;
  /** 素材更新时（裁剪、抠图等）触发；传入 assetId 时用于更新画布上引用该素材的 block 的 scale */
  onAssetUpdated?: (assetId?: string) => void;
  /** 外部刷新键（时间线增删块等会触发），用于同步「已添加」状态 */
  refreshKey?: number;
  /** 素材页添加素材时递增，用于同步刷新列表 */
  assetRefreshKey?: number;
}

export function AssetBrowsePanel({
  project,
  sceneId,
  episodeCharacterRefs,
  currentTime,
  onPlaced,
  onAssetUpdated,
  refreshKey,
  assetRefreshKey,
}: AssetBrowsePanelProps) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;

  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [assetsByType, setAssetsByType] = useState<Record<string, AssetRow[]>>({});
  const [assetThumbs, setAssetThumbs] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const playingAudioRef = useRef<{ id: string; el: HTMLAudioElement } | null>(null);

  /** 本地：已导入素材列表（所有分类） */
  const [localAssets, setLocalAssets] = useState<AssetRow[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [transparentVideoSearch, setTransparentVideoSearch] = useState('');
  const [sfxSearch, setSfxSearch] = useState('');
  const [musicSearch, setMusicSearch] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [spriteSheetPanelOpen, setSpriteSheetPanelOpen] = useState(false);
  const [spriteSheetPanelItem, setSpriteSheetPanelItem] = useState<SpriteSheetItem | null>(null);
  const [spriteSearch, setSpriteSearch] = useState('');
  const [componentSearch, setComponentSearch] = useState('');
  const [characterComponentSearch, setCharacterComponentSearch] = useState('');
  const [importForm] = Form.useForm<{ name: string; tags: string }>();
  const [videoUploadModalOpen, setVideoUploadModalOpen] = useState(false);
  const [videoUploadType, setVideoUploadType] = useState<'video' | 'transparent_video'>('video');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadForm] = Form.useForm<{ name: string; tags: string; chromaKeyColor?: 'auto' | 'black' | 'green' | 'purple' }>();
  const [audioUploadModalOpen, setAudioUploadModalOpen] = useState(false);
  const [audioUploadType, setAudioUploadType] = useState<'sfx' | 'music'>('sfx');
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadForm] = Form.useForm<{ name: string; tags: string }>();
  const [audioPreviewAsset, setAudioPreviewAsset] = useState<AssetRow | null>(null);
  const [audioPreviewOpen, setAudioPreviewOpen] = useState(false);
  const [imagePreviewAsset, setImagePreviewAsset] = useState<AssetRow | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<AssetRow | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [groupComponentPanelOpen, setGroupComponentPanelOpen] = useState(false);
  const [groupComponentPanelItem, setGroupComponentPanelItem] = useState<GroupComponentItem | null>(null);
  /** 编辑元件时的人物 ID（standalone 为 STANDALONE_COMPONENTS_CHARACTER_ID，人物元件为 characterId） */
  const [groupComponentPanelCharacterId, setGroupComponentPanelCharacterId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  /** 项目元件（STANDALONE_COMPONENTS 的 component_groups），用于元件 Tab 显示 */
  const [standaloneComponents, setStandaloneComponents] = useState<GroupComponentItem[]>([]);
  /** 元件缩略图：key 为 component:charId:groupId 或 standalone 的 groupId */
  const [componentThumbs, setComponentThumbs] = useState<Record<string, string>>({});

  /** 当前场景时间线中已使用的 asset_id 集合，用于本地列表「已添加」角标（删除素材后角标消失） */
  const [usedInSceneAssetIds, setUsedInSceneAssetIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!sceneId || !window.yiman?.project?.getLayers || !window.yiman?.project?.getTimelineBlocks) {
      setUsedInSceneAssetIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const layers = (await window.yiman!.project.getLayers(projectDir, sceneId)) as { id: string }[];
      const ids = new Set<string>();
      for (const layer of layers) {
        const blocks = (await window.yiman!.project.getTimelineBlocks(projectDir, layer.id)) as { asset_id: string | null }[];
        for (const b of blocks) {
          if (b.asset_id) ids.add(b.asset_id);
        }
      }
      if (!cancelled) setUsedInSceneAssetIds(ids);
    })();
    return () => { cancelled = true; };
  }, [projectDir, sceneId, refreshKey]);

  useEffect(() => {
    if (!window.yiman?.project?.getCharacters) return;
    window.yiman.project.getCharacters(projectDir).then((list) => setCharacters((list as CharacterRow[]) || []));
  }, [projectDir]);

  const loadAssetsByType = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    const types = ['image', 'sprite', 'component', 'video', 'transparent_video', 'sfx', 'music'] as const;
    const [img, spr, comp, vid, fx, sfx, music] = await Promise.all(types.map((t) => window.yiman!.project.getAssets(projectDir, t)));
    setAssetsByType({
      image: (img as AssetRow[]) || [],
      sprite: (spr as AssetRow[]) || [],
      component: (comp as AssetRow[]) || [],
      video: (vid as AssetRow[]) || [],
      transparent_video: (fx as AssetRow[]) || [],
      sfx: (sfx as AssetRow[]) || [],
      music: (music as AssetRow[]) || [],
    });
  }, [projectDir]);

  useEffect(() => {
    loadAssetsByType();
  }, [loadAssetsByType, assetRefreshKey]);

  /** 本地：加载已导入的全部素材（无 type 筛选） */
  const loadLocalAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    const all = (await window.yiman.project.getAssets(projectDir)) as AssetRow[];
    setLocalAssets(all || []);
  }, [projectDir]);

  useEffect(() => {
    loadLocalAssets();
  }, [loadLocalAssets, assetRefreshKey]);

  useEffect(() => {
    const list = localAssets.filter((a) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path));
    if (list.length === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    const next: Record<string, string> = {};
    Promise.all(
      list.map(async (a) => {
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, a.path);
        if (url) next[a.id] = url;
      })
    ).then(() => setAssetThumbs((prev) => ({ ...prev, ...next })));
  }, [projectDir, localAssets]);

  useEffect(() => {
    const all = [
      ...(assetsByType.image || []),
      ...(assetsByType.sprite || []),
      ...(assetsByType.component || []),
      ...(assetsByType.video || []),
      ...(assetsByType.transparent_video || []),
      ...(assetsByType.sfx || []),
      ...(assetsByType.music || []),
    ];
    if (all.length === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    const next: Record<string, string> = {};
    const imageAssets = all.filter((a) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path));
    const videoWithCover = all.filter((a) => {
      const ext = a.path.split('.').pop()?.toLowerCase();
      const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext ?? '');
      return isVideo && (a as AssetRow).cover_path;
    });
    Promise.all([
      ...imageAssets.map(async (a) => {
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, a.path);
        if (url) next[a.id] = url;
      }),
      ...videoWithCover.map(async (a) => {
        const cover = (a as AssetRow).cover_path;
        if (cover) {
          const url = await window.yiman!.project.getAssetDataUrl(projectDir, cover);
          if (url) next[a.id] = url;
        }
      }),
    ]).then(() => setAssetThumbs((prev) => ({ ...prev, ...next })));
  }, [projectDir, assetsByType]);

  /** 图片类素材（无播放时长）默认 10 秒，音效/音乐/视频取实际时长，其他 5 秒 */
  const getPlaceDuration = useCallback(async (assetId: string): Promise<number> => {
    if (!window.yiman?.project?.getAssetById) return 5;
    const a = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
    if (!a) return 5;
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path) || ['image', 'character', 'scene_bg', 'prop', 'sticker'].includes(a.type || '');
    const isAudio = ['sfx', 'music'].includes(a.type || '');
    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(a.path) || ['video', 'transparent_video'].includes(a.type || '');
    if (isImage) return 10;
    if (isAudio && window.yiman?.project?.getAssetDataUrl) {
      const url = await window.yiman.project.getAssetDataUrl(projectDir, a.path);
      if (url) {
        const d = await new Promise<number>((resolve) => {
          const el = new Audio(url);
          el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 10);
          el.onerror = () => resolve(10);
        });
        return Math.max(0.5, d);
      }
    }
    if (isAudio) return 10;
    if (isVideo) {
      const storedDuration = (a as AssetRow & { duration?: number }).duration;
      if (typeof storedDuration === 'number' && storedDuration > 0) return Math.max(0.5, storedDuration);
      if (window.yiman?.project?.getAssetDataUrl) {
        const url = await window.yiman.project.getAssetDataUrl(projectDir, a.path);
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
          return Math.max(0.5, d);
        }
      }
    }
    return 5;
  }, [projectDir]);

  /** 放置到主轨道：自动向前堆叠（无间隔），insertAt 为最后一块的 end_time 或 0；overrideDuration 可选；返回 blockId 供后续更新（见功能文档 6.4/6.7） */
  const placeAsset = useCallback(
    async (assetId: string, overrideDuration?: number): Promise<string | null> => {
      if (!sceneId || !window.yiman?.project?.insertBlockAtMainTrack) return null;
      setPlacing(true);
      try {
        let layers = (await window.yiman.project.getLayers?.(projectDir, sceneId)) as { id: string; is_main?: number }[] | undefined;
        if (!layers?.length && window.yiman?.project?.createLayer) {
          const layerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const cr = await window.yiman.project.createLayer(projectDir, { id: layerId, scene_id: sceneId, name: '主轨道', z_index: 0, is_main: 1 });
          if (!cr?.ok) {
            message.error(cr?.error || '创建主轨道失败');
            return null;
          }
          layers = (await window.yiman.project.getLayers?.(projectDir, sceneId)) as { id: string; is_main?: number }[];
        }
        const mainLayer = layers?.find((l) => l.is_main);
        let insertAt = 0;
        if (mainLayer && window.yiman?.project?.getTimelineBlocks) {
          const blocks = (await window.yiman.project.getTimelineBlocks(projectDir, mainLayer.id)) as { end_time: number }[];
          if (blocks?.length) insertAt = Math.max(...blocks.map((b) => b.end_time));
        }
        const duration = overrideDuration ?? (await getPlaceDuration(assetId));
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const br = await window.yiman.project.insertBlockAtMainTrack(projectDir, sceneId, {
          id: blockId,
          asset_id: assetId,
          duration,
          insertAt,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
        });
        if (br?.ok) {
          message.success('已放置到主轨道');
          onPlaced?.();
          return blockId;
        }
        message.error(br?.error || '放置失败');
        return null;
      } finally {
        setPlacing(false);
      }
    },
    [projectDir, sceneId, message, onPlaced, getPlaceDuration]
  );

  /** 放置视频/透明视频：使用素材记录的 duration 和 width/height 计算 scale（见功能文档 6.8） */
  const placeVideoAsset = useCallback(
    async (assetId: string): Promise<string | null> => {
      const blockId = await placeAsset(assetId);
      if (!blockId || !window.yiman?.project?.getAssetById || !window.yiman?.project?.updateTimelineBlock) return blockId;
      const asset = (await window.yiman.project.getAssetById(projectDir, assetId)) as (AssetRow & { width?: number; height?: number }) | null;
      if (!asset || !['video', 'transparent_video'].includes(asset.type ?? '')) return blockId;
      const w = asset.width;
      const h = asset.height;
      if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
        const designW = project.landscape ? 1920 : 1080;
        const designH = project.landscape ? 1080 : 1920;
        const baseScale = 0.25;
        const frameAspect = w / h;
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
        await window.yiman.project.updateTimelineBlock(projectDir, blockId, { scale_x, scale_y });
      }
      return blockId;
    },
    [projectDir, project.landscape, placeAsset]
  );

  /** 放置元件/人物元件到主轨道：asset_id 格式 component:${characterId}:${groupId}，默认 10 秒 */
  const placeComponent = useCallback(
    async (characterId: string, groupId: string): Promise<string | null> => {
      const assetId = `${COMPONENT_BLOCK_PREFIX}${characterId}:${groupId}`;
      return placeAsset(assetId, 10);
    },
    [placeAsset]
  );

  /** 放置图片素材：根据图片实际尺寸计算 scale，使选中框与裁剪后图片一致（见功能文档 6.8） */
  const placeImageAsset = useCallback(
    async (assetId: string): Promise<void> => {
      const blockId = await placeAsset(assetId);
      if (!blockId || !window.yiman?.project?.getAssetById || !window.yiman?.project?.getAssetDataUrl || !window.yiman?.project?.updateTimelineBlock) return;
      const asset = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
      if (!asset?.path || (asset.type ?? '') !== 'image') return;
      const dataUrl = await window.yiman.project.getAssetDataUrl(projectDir, asset.path);
      if (!dataUrl) return;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      });
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      if (imgW <= 0 || imgH <= 0) return;
      const designW = project.landscape ? 1920 : 1080;
      const designH = project.landscape ? 1080 : 1920;
      const baseScale = 0.25;
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
      await window.yiman.project.updateTimelineBlock(projectDir, blockId, { scale_x, scale_y });
      onPlaced?.();
    },
    [projectDir, project.landscape, placeAsset, onPlaced]
  );

  /** 音效/音乐放置到声音层：在 currentTime 放置，无声音层则创建，冲突则新建声音层（见功能文档 6.7） */
  const placeAudioAsset = useCallback(
    async (assetId: string): Promise<string | null> => {
      if (!sceneId || !window.yiman?.project?.insertBlockAtAudioTrack) return null;
      setPlacing(true);
      try {
        let layers = (await window.yiman.project.getLayers?.(projectDir, sceneId)) as { id: string; is_main?: number; layer_type?: string }[] | undefined;
        if (!layers?.length && window.yiman?.project?.createLayer) {
          const layerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const cr = await window.yiman.project.createLayer(projectDir, { id: layerId, scene_id: sceneId, name: '主轨道', z_index: 0, is_main: 1 });
          if (!cr?.ok) {
            message.error(cr?.error || '创建主轨道失败');
            return null;
          }
          layers = (await window.yiman.project.getLayers?.(projectDir, sceneId)) as { id: string; is_main?: number; layer_type?: string }[];
        }
        const duration = await getPlaceDuration(assetId);
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const br = await window.yiman.project.insertBlockAtAudioTrack(projectDir, sceneId, {
          id: blockId,
          asset_id: assetId,
          start_time: currentTime,
          duration,
        });
        if (br?.ok) {
          message.success('已放置到声音层');
          onPlaced?.();
          return blockId;
        }
        message.error(br?.error || '放置失败');
        return null;
      } finally {
        setPlacing(false);
      }
    },
    [projectDir, sceneId, currentTime, message, onPlaced, getPlaceDuration]
  );

  /** 上传视频（视频/透明视频 Tab 专用：名称+标签；透明视频需选择抠图颜色，处理后保存为 WebM 透明通道） */
  const handleVideoUpload = useCallback(async () => {
    const values = await videoUploadForm.validateFields().catch(() => null);
    if (!values) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description = values.name?.trim() || fileName || null;
    const tags = (values.tags ?? '').trim() || null;
    setVideoUploading(true);
    try {
      let res: { ok: boolean; error?: string };
      if (videoUploadType === 'transparent_video') {
        if (!window.yiman?.project?.saveTransparentVideoAsset) {
          message.error('透明视频功能未就绪');
          return;
        }
        const color = (values.chromaKeyColor ?? 'auto') as 'auto' | 'black' | 'green' | 'purple';
        res = await window.yiman.project.saveTransparentVideoAsset(projectDir, filePath, color, {
          description,
          is_favorite: 0,
          tags,
        });
      } else {
        if (!window.yiman?.project?.saveAssetFromFile) return;
        res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, videoUploadType, {
          description,
          is_favorite: 0,
          tags,
        });
      }
      if (res?.ok) {
        message.success('已导入');
        setVideoUploadModalOpen(false);
        videoUploadForm.resetFields();
        loadLocalAssets();
        loadAssetsByType();
      } else message.error(res?.error || '导入失败');
    } finally {
      setVideoUploading(false);
    }
  }, [projectDir, videoUploadType, videoUploadForm, message, loadLocalAssets, loadAssetsByType]);

  /** 上传音效/音乐（名称+标签，保存到 sfx 或 music） */
  const handleAudioUpload = useCallback(async () => {
    const values = await audioUploadForm.validateFields().catch(() => null);
    if (!values) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description = values.name?.trim() || fileName || null;
    const tags = (values.tags ?? '').trim() || null;
    setAudioUploading(true);
    try {
      if (!window.yiman?.project?.saveAssetFromFile) return;
      const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, audioUploadType, {
        description,
        is_favorite: 0,
        ...(tags ? { tags } : {}),
      });
      if (res?.ok) {
        message.success('已导入');
        setAudioUploadModalOpen(false);
        audioUploadForm.resetFields();
        loadLocalAssets();
        loadAssetsByType();
      } else message.error(res?.error || '导入失败');
    } finally {
      setAudioUploading(false);
    }
  }, [projectDir, audioUploadType, audioUploadForm, message, loadLocalAssets, loadAssetsByType]);

  /** 上传图片（参考视频上传：名称+标签，选文件后保存为 image） */
  const handleImportLocal = useCallback(async () => {
    const values = await importForm.validateFields().catch(() => null);
    if (!values) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description = values.name?.trim() || fileName || null;
    const tags = (values.tags ?? '').trim() || null;
    setImporting(true);
    try {
      const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, 'image', {
        description,
        is_favorite: 0,
        tags,
      });
      if (res?.ok) {
        message.success('已上传');
        setImportModalOpen(false);
        importForm.resetFields();
        loadLocalAssets();
        loadAssetsByType();
      } else message.error(res?.error || '上传失败');
    } finally {
      setImporting(false);
    }
  }, [projectDir, importForm, message, loadLocalAssets, loadAssetsByType]);

  /** 音频播放/暂停切换：同一项再点则暂停，否则停止当前并播放新项 */
  const handleAudioPlay = useCallback(
    async (asset: AssetRow) => {
      if (!window.yiman?.project?.getAssetDataUrl) return;
      const cur = playingAudioRef.current;
      if (cur?.id === asset.id) {
        cur.el.pause();
        playingAudioRef.current = null;
        setPlayingAudioId(null);
        return;
      }
      if (cur) {
        cur.el.pause();
        playingAudioRef.current = null;
      }
      const url = await window.yiman.project.getAssetDataUrl(projectDir, asset.path);
      if (!url) return;
      const el = new Audio(url);
      el.onended = () => {
        const c = playingAudioRef.current;
        if (c?.id === asset.id) {
          playingAudioRef.current = null;
          setPlayingAudioId(null);
        }
      };
      el.onerror = () => {
        playingAudioRef.current = null;
        setPlayingAudioId(null);
      };
      playingAudioRef.current = { id: asset.id, el };
      setPlayingAudioId(asset.id);
      el.play().catch(() => {
        playingAudioRef.current = null;
        setPlayingAudioId(null);
      });
    },
    [projectDir]
  );

  /** 放置人物精灵到主轨道：需找到 sprite.image_path 对应的 asset，时长=(帧数/播放速度)*播放次数；按帧宽高设置 scale 以保持正确比例 */
  const placeSprite = useCallback(
    async (sprite: SpriteSheetItem) => {
      if (!sprite.image_path) {
        message.warning('该精灵暂无图片');
        return;
      }
      if (!window.yiman?.project?.getAssets) return;
      const all = (await window.yiman.project.getAssets(projectDir)) as AssetRow[];
      const match = all.find((a) => a.path === sprite.image_path);
      if (!match) {
        message.warning('请先在人物设计中完成精灵图导入与抠图');
        return;
      }
      const frameCount = sprite.frame_count ?? 8;
      const fps = sprite.playback_fps ?? 8;
      const count = 1;
      const duration = frameCount > 0 ? (frameCount / fps) * count : 1;
      const blockId = await placeAsset(match.id, duration);
      if (!blockId || !window.yiman?.project?.updateTimelineBlock) return;

      const designW = project.landscape ? 1920 : 1080;
      const designH = project.landscape ? 1080 : 1920;
      const baseScale = 0.25;
      let scale_x = baseScale;
      let scale_y = baseScale;
      const frame0 = sprite.frames?.[0];
      if (frame0 && frame0.width > 0 && frame0.height > 0) {
        const fw = frame0.width;
        const fh = frame0.height;
        const frameAspect = fw / fh;
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

      await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        playback_fps: fps,
        playback_count: count,
        scale_x,
        scale_y,
      });
      onPlaced?.();
    },
    [projectDir, project.landscape, placeAsset, message, onPlaced]
  );

  /** 图片：仅 type=image 的素材（与素材库页一致），+ 模糊过滤 */
  const filteredImageAssets = React.useMemo(() => {
    const list = assetsByType.image || [];
    const kw = (localSearch || '').trim().toLowerCase();
    if (!kw) return list;
    return list.filter((a) => {
      const desc = (a.description || '').toLowerCase();
      const path = (a.path || '').toLowerCase();
      return desc.includes(kw) || path.includes(kw);
    });
  }, [assetsByType.image, localSearch]);

  /** 视频：模糊过滤 */
  const filteredVideoAssets = React.useMemo(() => {
    const list = assetsByType.video || [];
    const kw = (videoSearch || '').trim().toLowerCase();
    if (!kw) return list;
    return list.filter((a) => {
      const desc = (a.description || '').toLowerCase();
      const path = (a.path || '').toLowerCase();
      const tags = (a.tags || '').toLowerCase();
      return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
    });
  }, [assetsByType.video, videoSearch]);

  /** 透明视频：模糊过滤 */
  const filteredTransparentVideoAssets = React.useMemo(() => {
    const list = assetsByType.transparent_video || [];
    const kw = (transparentVideoSearch || '').trim().toLowerCase();
    if (!kw) return list;
    return list.filter((a) => {
      const desc = (a.description || '').toLowerCase();
      const path = (a.path || '').toLowerCase();
      const tags = (a.tags || '').toLowerCase();
      return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
    });
  }, [assetsByType.transparent_video, transparentVideoSearch]);

  /** 音效：模糊过滤，新添加的在前面（desc） */
  const filteredSfxAssets = React.useMemo(() => {
    let list = assetsByType.sfx || [];
    const kw = (sfxSearch || '').trim().toLowerCase();
    if (kw) {
      list = list.filter((a) => {
        const desc = (a.description || '').toLowerCase();
        const path = (a.path || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [assetsByType.sfx, sfxSearch]);

  /** 音乐：模糊过滤，新添加的在前面（desc） */
  const filteredMusicAssets = React.useMemo(() => {
    let list = assetsByType.music || [];
    const kw = (musicSearch || '').trim().toLowerCase();
    if (kw) {
      list = list.filter((a) => {
        const desc = (a.description || '').toLowerCase();
        const path = (a.path || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [assetsByType.music, musicSearch]);

  /** 项目级精灵图（未绑定人物） */
  const [standaloneSprites, setStandaloneSprites] = useState<SpriteSheetItem[]>([]);
  const loadStandaloneSprites = useCallback(async () => {
    if (!window.yiman?.project?.getOrCreateStandaloneSpritesCharacter) return;
    const char = (await window.yiman.project.getOrCreateStandaloneSpritesCharacter(projectDir)) as { sprite_sheets?: string | null };
    try {
      const arr = char?.sprite_sheets ? (JSON.parse(char.sprite_sheets) as SpriteSheetItem[]) : [];
      setStandaloneSprites(Array.isArray(arr) ? [...arr].reverse() : []);
    } catch {
      setStandaloneSprites([]);
    }
  }, [projectDir]);
  useEffect(() => {
    loadStandaloneSprites();
  }, [loadStandaloneSprites, refreshKey, assetRefreshKey]);

  /** 项目级元件（STANDALONE_COMPONENTS 的 component_groups） */
  const loadStandaloneComponents = useCallback(async () => {
    if (!window.yiman?.project?.getOrCreateStandaloneComponentsCharacter) return;
    const char = (await window.yiman.project.getOrCreateStandaloneComponentsCharacter(projectDir)) as { component_groups?: string | null };
    try {
      const arr = char?.component_groups ? (JSON.parse(char.component_groups) as GroupComponentItem[]) : [];
      setStandaloneComponents(Array.isArray(arr) ? [...arr].reverse() : []);
    } catch {
      setStandaloneComponents([]);
    }
  }, [projectDir]);
  useEffect(() => {
    loadStandaloneComponents();
  }, [loadStandaloneComponents, refreshKey, assetRefreshKey]);

  /** 精灵图 Tab：按名称模糊过滤 */
  const filteredStandaloneSprites = React.useMemo(() => {
    const kw = (spriteSearch || '').trim().toLowerCase();
    if (!kw) return standaloneSprites;
    return standaloneSprites.filter((s) => (s.name || '').toLowerCase().includes(kw));
  }, [standaloneSprites, spriteSearch]);

  const handleOpenSpriteSheetPanel = useCallback(async () => {
    await window.yiman?.project?.getOrCreateStandaloneSpritesCharacter?.(projectDir);
    const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: SpriteSheetItem = { id: newId, name: '精灵动作', image_path: '' };
    const next = [...standaloneSprites, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
      sprite_sheets: JSON.stringify(next),
    });
    if (res?.ok) {
      loadStandaloneSprites();
      setSpriteSheetPanelItem(newItem);
      setSpriteSheetPanelOpen(true);
    } else {
      message.error(res?.error || '添加失败');
    }
  }, [projectDir, standaloneSprites, loadStandaloneSprites, message]);

  const handleSpriteSheetSave = useCallback(
    async (updated: SpriteSheetItem) => {
      const next = standaloneSprites.some((s) => s.id === updated.id)
        ? standaloneSprites.map((s) => (s.id === updated.id ? updated : s))
        : [...standaloneSprites, updated];
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
        sprite_sheets: JSON.stringify(next),
      });
      if (res?.ok) {
        loadStandaloneSprites();
        loadLocalAssets();
        loadAssetsByType();
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, standaloneSprites, loadStandaloneSprites, loadLocalAssets, loadAssetsByType, message]
  );

  const handleGroupComponentSave = useCallback(
    async (updated: GroupComponentItem) => {
      const charId = groupComponentPanelCharacterId;
      if (!charId || !window.yiman?.project?.updateCharacter) return;
      const isStandalone = charId === STANDALONE_COMPONENTS_CHARACTER_ID;
      const list = isStandalone ? standaloneComponents : parseComponentGroups(characters.find((c) => c.id === charId)?.component_groups ?? null);
      const next = list.some((g) => g.id === updated.id)
        ? list.map((g) => (g.id === updated.id ? updated : g))
        : [...list, updated];
      const res = await window.yiman.project.updateCharacter(projectDir, charId, {
        component_groups: JSON.stringify(next),
      });
      if (res?.ok) {
        if (isStandalone) loadStandaloneComponents();
        else { setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, component_groups: JSON.stringify(next) } : c))); }
        loadLocalAssets();
        loadAssetsByType();
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, groupComponentPanelCharacterId, standaloneComponents, characters, loadStandaloneComponents, loadLocalAssets, loadAssetsByType, message]
  );

  /** 人物精灵：按人物分组，仅显示有人物精灵的人物（排除项目级精灵图容器）；每组内为精灵列表，新添加的在前面 */
  const characterSpriteGroups = React.useMemo(() => {
    const groups: { characterId: string; characterName: string; sprites: SpriteSheetItem[] }[] = [];
    for (const c of characters) {
      if (c.id === STANDALONE_SPRITES_CHARACTER_ID) continue;
      const sprites = parseSpriteSheets(c.sprite_sheets ?? null).filter((s) => s.image_path);
      if (sprites.length > 0) groups.push({ characterId: c.id, characterName: c.name || '未命名', sprites: [...sprites].reverse() });
    }
    return groups;
  }, [characters]);

  const pathToAssetId = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of localAssets) m[a.path] = a.id;
    return m;
  }, [localAssets]);

  /** 人物元件：从人物聚合元件（排除项目元件容器），新添加的在前面 */
  const allComponentGroups = React.useMemo(() => {
    const list: { characterId: string; characterName: string; group: GroupComponentItem }[] = [];
    for (const c of characters) {
      if (c.id === STANDALONE_COMPONENTS_CHARACTER_ID) continue;
      const groups = [...parseComponentGroups(c.component_groups ?? null)].reverse();
      for (const g of groups) {
        list.push({ characterId: c.id, characterName: c.name || '未命名', group: g });
      }
    }
    return list;
  }, [characters]);

  const [spriteThumbs, setSpriteThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = new Set<string>();
    for (const g of characterSpriteGroups) {
      for (const s of g.sprites) {
        const p = s.cover_path || s.image_path;
        if (p) paths.add(p);
      }
    }
    for (const s of standaloneSprites) {
      const p = s.cover_path || s.image_path;
      if (p) paths.add(p);
    }
    if (paths.size === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    Promise.all(
      Array.from(paths).map(async (p) => {
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, p);
        return { path: p, url: url ?? '' };
      })
    ).then((results) => {
      const next: Record<string, string> = {};
      for (const g of characterSpriteGroups) {
        for (const s of g.sprites) {
          const p = s.cover_path || s.image_path;
          const r = results.find((x) => x.path === p);
          if (r?.url) next[`${g.characterId}:${s.id}`] = r.url;
        }
      }
      for (const s of standaloneSprites) {
        const p = s.cover_path || s.image_path;
        const r = results.find((x) => x.path === p);
        if (r?.url) next[`standalone:${s.id}`] = r.url;
      }
      setSpriteThumbs((prev) => ({ ...prev, ...next }));
    });
  }, [projectDir, characterSpriteGroups, standaloneSprites]);

  /** 元件缩略图：从首个状态的图片加载 */
  useEffect(() => {
    const toLoad: { key: string; path: string }[] = [];
    for (const g of standaloneComponents) {
      const p = getFirstImagePathFromGroup(g);
      if (p) toLoad.push({ key: `${STANDALONE_COMPONENTS_CHARACTER_ID}:${g.id}`, path: p });
    }
    for (const { characterId, group } of allComponentGroups) {
      const p = getFirstImagePathFromGroup(group);
      if (p) toLoad.push({ key: `${characterId}:${group.id}`, path: p });
    }
    if (toLoad.length === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    Promise.all(
      toLoad.map(async ({ key, path }) => {
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, path);
        return { key, url: url ?? '' };
      })
    ).then((results) => {
      const next: Record<string, string> = {};
      for (const r of results) {
        if (r.url) next[r.key] = r.url;
      }
      setComponentThumbs((prev) => ({ ...prev, ...next }));
    });
  }, [projectDir, standaloneComponents, allComponentGroups]);

  const filteredStandaloneComponents = React.useMemo(() => {
    const kw = (componentSearch || '').trim().toLowerCase();
    if (!kw) return standaloneComponents;
    return standaloneComponents.filter((g) => (g.name || g.id).toLowerCase().includes(kw));
  }, [standaloneComponents, componentSearch]);

  const filteredCharacterComponentGroups = React.useMemo(() => {
    const kw = (characterComponentSearch || '').trim().toLowerCase();
    if (!kw) return allComponentGroups;
    return allComponentGroups.filter(
      ({ characterName, group }) =>
        characterName.toLowerCase().includes(kw) || (group.name || group.id).toLowerCase().includes(kw)
    );
  }, [allComponentGroups, characterComponentSearch]);

  const tabItems = [
    {
      key: 'image',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'image')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
                上传
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyClassName="local-assets-body"
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredImageAssets.map((a) => (
              <LocalAssetCard
                key={a.id}
                id={a.id}
                name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                thumb={assetThumbs[a.id]}
                added={usedInSceneAssetIds.has(a.id)}
                onPlace={() => placeImageAsset(a.id)}
                onEdit={() => { setImagePreviewAsset(a); setImagePreviewOpen(true); }}
                placing={placing}
                assetType={a.type ?? 'image'}
              />
            ))}
          </ResponsiveCardGrid>
          {filteredImageAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {assetsByType.image?.length === 0 ? '暂无图片素材，点击「上传」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'sprite',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'sprite')?.label}</span>
      ),
      children: (
        <AdaptiveCard
          size="small"
          headerHeight={36}
          header={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleOpenSpriteSheetPanel}>
                添加精灵图
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={spriteSearch}
                onChange={(e) => setSpriteSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </div>
          }
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredStandaloneSprites.map((s) => {
              const assetId = pathToAssetId[s.image_path];
              const added = assetId ? usedInSceneAssetIds.has(assetId) : false;
              const placeDuration = ((s.frame_count ?? 8) / (s.playback_fps ?? 8)) || 1;
              if (!assetId) {
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSpriteSheetPanelItem(s);
                      setSpriteSheetPanelOpen(true);
                    }}
                    style={{
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.04)',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 100,
                      cursor: 'pointer',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11 }}>需完成导入</Text>
                    <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{s.name || '未命名'}</Text>
                  </div>
                );
              }
              return (
                <LocalAssetCard
                  key={s.id}
                  id={assetId}
                  name={s.name || '未命名'}
                  thumb={spriteThumbs[`standalone:${s.id}`]}
                  added={added}
                  onPlace={() => placeSprite(s)}
                  onEdit={() => {
                    setSpriteSheetPanelItem(s);
                    setSpriteSheetPanelOpen(true);
                  }}
                  placing={placing}
                  placeDuration={placeDuration}
                  assetType="sprite"
                />
              );
            })}
          </ResponsiveCardGrid>
          {filteredStandaloneSprites.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {standaloneSprites.length === 0 ? '暂无精灵图，点击「添加精灵图」添加' : '无匹配结果'}
            </Text>
          )}
        </AdaptiveCard>
      ),
    },
    {
      key: 'character_sprite',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'character_sprite')?.label}</span>
      ),
      children: (
        <div style={{ padding: 8, overflow: 'auto', height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {characterSpriteGroups.length === 0 ? (
                <Text type="secondary" style={{ display: 'block', padding: 16 }}>
                  暂无人物精灵图，请在「人物设计」中为人物添加精灵动作图
                </Text>
              ) : (
                characterSpriteGroups.map((g) => (
                  <div key={g.characterId}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{g.characterName}</Text>
                    <ResponsiveCardGrid minItemWidth={100} padding={0} style={{ marginTop: 8 }}>
                      {g.sprites.map((s) => {
                        const assetId = pathToAssetId[s.image_path];
                        const added = assetId ? usedInSceneAssetIds.has(assetId) : false;
                        const placeDuration = ((s.frame_count ?? 8) / (s.playback_fps ?? 8)) || 1;
                        if (!assetId) {
                          return (
                            <div
                              key={`${g.characterId}:${s.id}`}
                              style={{
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: 'rgba(255,255,255,0.04)',
                                padding: 8,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 100,
                              }}
                            >
                              <Text type="secondary" style={{ fontSize: 11 }}>需在人物设计中完成导入</Text>
                              <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{s.name || '未命名'}</Text>
                            </div>
                          );
                        }
                        return (
                          <LocalAssetCard
                            key={`${g.characterId}:${s.id}`}
                            id={assetId}
                            name={s.name || '未命名'}
                            thumb={spriteThumbs[`${g.characterId}:${s.id}`]}
                            added={added}
                            onPlace={() => placeSprite(s)}
                            placing={placing}
                            placeDuration={placeDuration}
                          />
                        );
                      })}
                    </ResponsiveCardGrid>
                  </div>
                ))
              )}
            </div>
        </div>
      ),
    },
    {
      key: 'component',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'component')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={async () => {
                await window.yiman?.project?.getOrCreateStandaloneComponentsCharacter?.(projectDir);
                const newId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const defaultStateId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const newItem: GroupComponentItem = { id: newId, name: '元件', states: [{ id: defaultStateId, tags: [], items: [] }] };
                const next = [...standaloneComponents, newItem];
                const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_COMPONENTS_CHARACTER_ID, { component_groups: JSON.stringify(next) });
                if (res?.ok) { loadStandaloneComponents(); setGroupComponentPanelItem(newItem); setGroupComponentPanelCharacterId(STANDALONE_COMPONENTS_CHARACTER_ID); setGroupComponentPanelOpen(true); } else message.error(res?.error || '添加失败');
              }}>
                添加元件
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyClassName="local-assets-body"
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredStandaloneComponents.map((g) => {
              const assetId = `${COMPONENT_BLOCK_PREFIX}${STANDALONE_COMPONENTS_CHARACTER_ID}:${g.id}`;
              return (
                <LocalAssetCard
                  key={g.id}
                  id={assetId}
                  name={g.name || g.id}
                  thumb={componentThumbs[`${STANDALONE_COMPONENTS_CHARACTER_ID}:${g.id}`]}
                  added={usedInSceneAssetIds.has(assetId)}
                  onPlace={() => placeComponent(STANDALONE_COMPONENTS_CHARACTER_ID, g.id)}
                  onEdit={() => { setGroupComponentPanelItem(g); setGroupComponentPanelCharacterId(STANDALONE_COMPONENTS_CHARACTER_ID); setGroupComponentPanelOpen(true); }}
                  placing={placing}
                  assetType="component"
                />
              );
            })}
          </ResponsiveCardGrid>
          {filteredStandaloneComponents.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {standaloneComponents.length === 0 ? '暂无元件，点击「添加元件」或前往素材页添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'character_component',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'character_component')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <span style={{ fontSize: 12 }}>人物元件</span>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={characterComponentSearch}
                onChange={(e) => setCharacterComponentSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyClassName="local-assets-body"
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredCharacterComponentGroups.map(({ characterId, characterName, group }) => {
              const assetId = `${COMPONENT_BLOCK_PREFIX}${characterId}:${group.id}`;
              return (
                <LocalAssetCard
                  key={`${characterId}:${group.id}`}
                  id={assetId}
                  name={`${characterName} / ${group.name || group.id}`}
                  thumb={componentThumbs[`${characterId}:${group.id}`]}
                  added={usedInSceneAssetIds.has(assetId)}
                  onPlace={() => placeComponent(characterId, group.id)}
                  onEdit={() => { setGroupComponentPanelItem(group); setGroupComponentPanelCharacterId(characterId); setGroupComponentPanelOpen(true); }}
                  placing={placing}
                  assetType="character_component"
                />
              );
            })}
          </ResponsiveCardGrid>
          {filteredCharacterComponentGroups.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {allComponentGroups.length === 0 ? '暂无人物元件，请在「人物设计」中为人物添加元件' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'video',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'video')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button
                type="primary"
                size="small"
                icon={<UploadOutlined />}
                onClick={() => {
                  setVideoUploadType('video');
                  setVideoUploadModalOpen(true);
                }}
              >
                上传视频
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={videoSearch}
                onChange={(e) => setVideoSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyClassName="local-assets-body"
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredVideoAssets.map((a) => (
              <LocalAssetCard
                key={a.id}
                id={a.id}
                name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                thumb={assetThumbs[a.id]}
                added={usedInSceneAssetIds.has(a.id)}
                onPlace={() => placeVideoAsset(a.id)}
                onEdit={() => { setVideoPreviewAsset(a); setVideoPreviewOpen(true); }}
                placing={placing}
                assetType={a.type ?? 'video'}
              />
            ))}
          </ResponsiveCardGrid>
          {filteredVideoAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {(assetsByType.video?.length ?? 0) === 0 ? '暂无视频，点击「上传视频」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'transparent_video',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'transparent_video')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button
                type="primary"
                size="small"
                icon={<UploadOutlined />}
                onClick={() => {
                  setVideoUploadType('transparent_video');
                  setVideoUploadModalOpen(true);
                }}
              >
                上传透明视频
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={transparentVideoSearch}
                onChange={(e) => setTransparentVideoSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyClassName="local-assets-body"
          bodyStyle={{ padding: 8 }}
        >
          <ResponsiveCardGrid minItemWidth={100} padding={0}>
            {filteredTransparentVideoAssets.map((a) => (
              <LocalAssetCard
                key={a.id}
                id={a.id}
                name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                thumb={assetThumbs[a.id]}
                added={usedInSceneAssetIds.has(a.id)}
                onPlace={() => placeVideoAsset(a.id)}
                onEdit={() => { setVideoPreviewAsset(a); setVideoPreviewOpen(true); }}
                placing={placing}
                assetType={a.type ?? 'transparent_video'}
              />
            ))}
          </ResponsiveCardGrid>
          {filteredTransparentVideoAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {(assetsByType.transparent_video?.length ?? 0) === 0 ? '暂无透明视频，点击「上传透明视频」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'sfx',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'sfx')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button
                type="primary"
                size="small"
                icon={<UploadOutlined />}
                onClick={() => {
                  setAudioUploadType('sfx');
                  setAudioUploadModalOpen(true);
                }}
              >
                上传音效
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={sfxSearch}
                onChange={(e) => setSfxSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredSfxAssets.map((a) => (
              <AudioListItem
                key={a.id}
                asset={a}
                isPlaying={playingAudioId === a.id}
                onPlay={() => handleAudioPlay(a)}
                onEdit={() => {
                  setAudioPreviewAsset(a);
                  setAudioPreviewOpen(true);
                }}
                onPlace={() => placeAudioAsset(a.id)}
                placing={placing}
              />
            ))}
          </div>
          {filteredSfxAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {(assetsByType.sfx?.length ?? 0) === 0 ? '暂无音效，点击「上传音效」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'music',
      label: (
        <span>{ASSET_CATEGORIES.find((c) => c.value === 'music')?.label}</span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button
                type="primary"
                size="small"
                icon={<UploadOutlined />}
                onClick={() => {
                  setAudioUploadType('music');
                  setAudioUploadModalOpen(true);
                }}
              >
                上传音乐
              </Button>
              <Input.Search
                placeholder="模糊搜索"
                allowClear
                size="small"
                value={musicSearch}
                onChange={(e) => setMusicSearch(e.target.value)}
                style={{ width: 120 }}
              />
            </Space>
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredMusicAssets.map((a) => (
              <AudioListItem
                key={a.id}
                asset={a}
                isPlaying={playingAudioId === a.id}
                onPlay={() => handleAudioPlay(a)}
                onEdit={() => {
                  setAudioPreviewAsset(a);
                  setAudioPreviewOpen(true);
                }}
                onPlace={() => placeAudioAsset(a.id)}
                placing={placing}
              />
            ))}
          </div>
          {filteredMusicAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {(assetsByType.music?.length ?? 0) === 0 ? '暂无音乐，点击「上传音乐」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
  ];

  if (!sceneId) {
    return <Text type="secondary">请先选择场景</Text>;
  }

  return (
    <>
      {/* <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}> */}
        <AdaptiveTabs
          size="small"
          items={tabItems}
          tabBarGutter={10}
          tabBarStyle={{ paddingLeft: '8px' }}
          contentOverflow={false}
          className="fy-tabs"
          classNames={{
            header: 'fy-tabs-header',
          }}
          // style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        />
      {/* </div> */}
      <Modal
        title={videoUploadType === 'transparent_video' ? '上传透明视频' : '上传视频'}
        open={videoUploadModalOpen}
        onCancel={() => { setVideoUploadModalOpen(false); videoUploadForm.resetFields(); }}
        onOk={handleVideoUpload}
        confirmLoading={videoUploading}
        okText="选择视频并上传"
      >
        <Form form={videoUploadForm} layout="vertical" initialValues={{ name: '', tags: '', chromaKeyColor: 'auto' }}>
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          {videoUploadType === 'transparent_video' && (
            <Form.Item name="chromaKeyColor" label="抠图背景色" rules={[{ required: true }]}>
              <Radio.Group
                options={[
                  { value: 'auto', label: '自动检测（推荐）' },
                  { value: 'black', label: '黑色' },
                  { value: 'green', label: '绿色' },
                  { value: 'purple', label: '紫色' },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item name="tags" label="标签（可选）">
            <VideoTagInput />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={audioUploadType === 'music' ? '上传音乐' : '上传音效'}
        open={audioUploadModalOpen}
        onCancel={() => { setAudioUploadModalOpen(false); audioUploadForm.resetFields(); }}
        onOk={handleAudioUpload}
        confirmLoading={audioUploading}
        okText="选择音频并上传"
      >
        <Form form={audioUploadForm} layout="vertical" initialValues={{ name: '', tags: '' }}>
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          <Form.Item name="tags" label="标签（可选）">
            <VideoTagInput />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="上传"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onOk={handleImportLocal}
        confirmLoading={importing}
        okText="选择图片并上传"
      >
        <Form form={importForm} layout="vertical" initialValues={{ name: '', tags: '' }}>
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          <Form.Item name="tags" label="标签（可选）">
            <VideoTagInput />
          </Form.Item>
        </Form>
      </Modal>
      {spriteSheetPanelOpen && (
        <SpriteSheetPanel
          open={spriteSheetPanelOpen}
          onClose={() => {
            setSpriteSheetPanelOpen(false);
            setSpriteSheetPanelItem(null);
          }}
          projectDir={projectDir}
          characterId={STANDALONE_SPRITES_CHARACTER_ID}
          item={spriteSheetPanelItem}
          onSave={handleSpriteSheetSave}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          saveAssetFromBase64={(dir, base64, ext, type) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
          matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          getSpriteBackgroundColor={(dir, rel) => window.yiman?.project?.getSpriteBackgroundColor?.(dir, rel) ?? Promise.resolve(null)}
          getSpriteFrames={(dir, rel, bg, opt) => window.yiman?.project?.getSpriteFrames?.(dir, rel, bg, opt) ?? Promise.resolve({ raw: [], normalized: [] })}
          extractSpriteCover={(dir, rel, frame) => window.yiman?.project?.extractSpriteCover?.(dir, rel, frame) ?? Promise.resolve({ ok: false })}
          processSpriteWithOnnx={(dir, rel, opt) => window.yiman?.project?.processSpriteWithOnnx?.(dir, rel, opt) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          openDirectoryDialog={() => window.yiman?.dialog?.openDirectory?.() ?? Promise.resolve(null)}
        />
      )}
      <AudioPreviewDrawer
        open={audioPreviewOpen}
        onClose={() => { setAudioPreviewOpen(false); setAudioPreviewAsset(null); }}
        projectDir={projectDir}
        asset={audioPreviewAsset}
        onUpdate={() => { loadLocalAssets(); loadAssetsByType(); }}
      />
      <ImagePreviewDrawer
        open={imagePreviewOpen}
        onClose={() => { setImagePreviewOpen(false); setImagePreviewAsset(null); }}
        projectDir={projectDir}
        asset={imagePreviewAsset}
        onUpdate={(opts) => {
          loadLocalAssets();
          loadAssetsByType();
          onAssetUpdated?.(opts?.assetId);
        }}
        getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
        saveAssetFromBase64={(dir, base64, ext, type, opt) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type, opt) ?? Promise.resolve({ ok: false })}
        matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false })}
      />
      <VideoPreviewDrawer
        open={videoPreviewOpen}
        onClose={() => { setVideoPreviewOpen(false); setVideoPreviewAsset(null); }}
        projectDir={projectDir}
        asset={videoPreviewAsset}
        onUpdate={() => { loadLocalAssets(); loadAssetsByType(); }}
      />
      {groupComponentPanelOpen && groupComponentPanelCharacterId && (
        <GroupComponentPanel
          open={groupComponentPanelOpen}
          onClose={() => { setGroupComponentPanelOpen(false); setGroupComponentPanelItem(null); setGroupComponentPanelCharacterId(null); }}
          projectDir={projectDir}
          characterId={groupComponentPanelCharacterId}
          item={groupComponentPanelItem}
          onSave={(updated) => { handleGroupComponentSave(updated); setGroupComponentPanelItem(updated); }}
          spriteSheets={groupComponentPanelCharacterId === STANDALONE_COMPONENTS_CHARACTER_ID ? standaloneSprites : parseSpriteSheets(characters.find((c) => c.id === groupComponentPanelCharacterId)?.sprite_sheets ?? null)}
          componentGroups={(groupComponentPanelCharacterId === STANDALONE_COMPONENTS_CHARACTER_ID ? standaloneComponents : parseComponentGroups(characters.find((c) => c.id === groupComponentPanelCharacterId)?.component_groups ?? null)).filter((g) => g.id !== groupComponentPanelItem?.id)}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          saveAssetFromBase64={(dir, base64, ext, type) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
          matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false })}
        />
      )}
    </>
  );
}

/** 本地列表卡片：参考图样式，缩略图 + 左上角「已添加」角标（仅当该素材已在当前场景时间线中时显示）+ 下方文件名，支持点击/拖拽放置；可选 onEdit 显示编辑图标 */
function LocalAssetCard({
  id,
  name,
  thumb,
  added,
  onPlace,
  onEdit,
  placing,
  placeDuration = 10,
  assetType = '',
}: { id: string; name: string; thumb?: string; added: boolean; onPlace: () => void; onEdit?: () => void; placing: boolean; placeDuration?: number; assetType?: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', String(placeDuration));
        e.dataTransfer.setData('assetType', assetType);
      }}
      onClick={onPlace}
      style={{
        cursor: placing ? 'wait' : 'grab',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: 'rgba(255,255,255,0.08)' }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>图</Text>
          </div>
        )}
        {added && (
          <span
            style={{
              position: 'absolute',
              left: 4,
              top: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              fontSize: 11,
            }}
          >
            已添加
          </span>
        )}
        {onEdit && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            style={{
              position: 'absolute',
              right: 4,
              top: 4,
              width: 24,
              height: 24,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
            }}
            title="编辑"
          >
            ✎
          </span>
        )}
      </div>
      <div style={{ padding: '6px 4px 4px', minHeight: 32 }}>
        <Text ellipsis style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} title={name}>
          {name}
        </Text>
      </div>
    </div>
  );
}

function AssetItem({
  id,
  name,
  thumb,
  onPlace,
  placing,
  placeDuration = 10,
  onPreview,
}: {
  id: string;
  name: string;
  thumb?: string;
  onPlace: () => void;
  placing: boolean;
  placeDuration?: number;
  onPreview?: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', String(placeDuration));
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        cursor: 'grab',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.08)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Text type="secondary" style={{ fontSize: 10 }}>图</Text>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ fontSize: 13 }}>{name}</Text>
      </div>
      <Space size={4}>
        {onPreview && (
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={(e) => { e.stopPropagation(); onPreview(); }} style={{ padding: '0 4px' }}>
            预览
          </Button>
        )}
        <Button type="primary" size="small" icon={<PlusOutlined />} loading={placing} onClick={onPlace}>
          放置
        </Button>
      </Space>
    </div>
  );
}
