/**
 * 素材浏览（列 1 素材面板）：本地/人物/特效/声效/音乐 Tabs；本地为 GrowCard（导入+模糊搜索+已导入列表）（见功能文档 6.4、开发计划 2.12）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Button, Space, App, Modal, Form, Select, Checkbox, Input, Radio } from 'antd';
import { PlusOutlined, UploadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { AdaptiveTabs } from '@/components/antd-plus/AdaptiveTabs';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import type { ProjectInfo } from '@/hooks/useProject';
import { GrowCard } from '@/components/GrowCard';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { ASSET_CATEGORIES, ASSET_LIBRARY_CATEGORIES } from '@/constants/assetCategories';
import { STANDALONE_SPRITES_CHARACTER_ID } from '@/constants/project';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import type { GroupComponentItem } from '@/types/groupComponent';

const { Text } = Typography;
const { TextArea } = Input;

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
}

interface AssetBrowsePanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  /** 当前集的 character_refs JSON 数组字符串，用于人物 Tab 排序 */
  episodeCharacterRefs: string;
  /** 当前播放时间（秒），放置时作为 start_time */
  currentTime: number;
  onPlaced?: () => void;
  /** 外部刷新键（时间线增删块等会触发），用于同步「已添加」状态 */
  refreshKey?: number;
}

export function AssetBrowsePanel({
  project,
  sceneId,
  episodeCharacterRefs,
  currentTime,
  onPlaced,
  refreshKey,
}: AssetBrowsePanelProps) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;

  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [assetsByType, setAssetsByType] = useState<Record<string, AssetRow[]>>({});
  const [assetThumbs, setAssetThumbs] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);

  /** 本地：已导入素材列表（所有分类） */
  const [localAssets, setLocalAssets] = useState<AssetRow[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [spriteSheetPanelOpen, setSpriteSheetPanelOpen] = useState(false);
  const [spriteSheetPanelItem, setSpriteSheetPanelItem] = useState<SpriteSheetItem | null>(null);
  const [spriteSearch, setSpriteSearch] = useState('');
  const [importForm] = Form.useForm<{ type: string; is_favorite: boolean; description: string }>();
  const [videoUploadModalOpen, setVideoUploadModalOpen] = useState(false);
  const [videoUploadType, setVideoUploadType] = useState<'video' | 'transparent_video'>('video');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadForm] = Form.useForm<{ name: string; tags: string; chromaKeyColor?: 'black' | 'green' | 'purple' }>();
  const [audioUploadModalOpen, setAudioUploadModalOpen] = useState(false);
  const [audioUploadType, setAudioUploadType] = useState<'sfx' | 'music'>('sfx');
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadForm] = Form.useForm<{ name: string; tags: string }>();
  const [audioPreviewAsset, setAudioPreviewAsset] = useState<AssetRow | null>(null);
  const [audioPreviewOpen, setAudioPreviewOpen] = useState(false);

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
  }, [loadAssetsByType]);

  /** 本地：加载已导入的全部素材（无 type 筛选） */
  const loadLocalAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    const all = (await window.yiman.project.getAssets(projectDir)) as AssetRow[];
    setLocalAssets(all || []);
  }, [projectDir]);

  useEffect(() => {
    loadLocalAssets();
  }, [loadLocalAssets]);

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

  /** 图片类素材（无播放时长）默认 10 秒，其他 5 秒 */
  const getPlaceDuration = useCallback(async (assetId: string): Promise<number> => {
    if (!window.yiman?.project?.getAssetById) return 5;
    const a = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
    if (!a) return 5;
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path) || ['image', 'character', 'scene_bg', 'prop', 'sticker'].includes(a.type || '');
    return isImage ? 10 : 5;
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
        const color = (values.chromaKeyColor ?? 'black') as 'black' | 'green' | 'purple';
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

  /** 导入本地素材（与播放器面板「上传素材」同效：选文件+分类+描述，不入画布，仅刷新本地列表） */
  const handleImportLocal = useCallback(async () => {
    const values = await importForm.validateFields().catch(() => null);
    if (!values) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '素材', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'] }],
    });
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    setImporting(true);
    try {
      const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, values.type, {
        description: values.description?.trim() || null,
        is_favorite: values.is_favorite ? 1 : 0,
      });
      if (res?.ok) {
        message.success('已导入');
        setImportModalOpen(false);
        importForm.resetFields();
        loadLocalAssets();
        loadAssetsByType();
      } else message.error(res?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  }, [projectDir, importForm, message, loadLocalAssets, loadAssetsByType]);

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

  /** 项目级精灵图（未绑定人物） */
  const [standaloneSprites, setStandaloneSprites] = useState<SpriteSheetItem[]>([]);
  const loadStandaloneSprites = useCallback(async () => {
    if (!window.yiman?.project?.getOrCreateStandaloneSpritesCharacter) return;
    const char = (await window.yiman.project.getOrCreateStandaloneSpritesCharacter(projectDir)) as { sprite_sheets?: string | null };
    try {
      const arr = char?.sprite_sheets ? (JSON.parse(char.sprite_sheets) as SpriteSheetItem[]) : [];
      setStandaloneSprites(Array.isArray(arr) ? arr : []);
    } catch {
      setStandaloneSprites([]);
    }
  }, [projectDir]);
  useEffect(() => {
    loadStandaloneSprites();
  }, [loadStandaloneSprites, refreshKey]);

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

  /** 人物精灵：按人物分组，仅显示有人物精灵的人物（排除项目级精灵图容器）；每组内为精灵列表 */
  const characterSpriteGroups = React.useMemo(() => {
    const groups: { characterId: string; characterName: string; sprites: SpriteSheetItem[] }[] = [];
    for (const c of characters) {
      if (c.id === STANDALONE_SPRITES_CHARACTER_ID) continue;
      const sprites = parseSpriteSheets(c.sprite_sheets ?? null).filter((s) => s.image_path);
      if (sprites.length > 0) groups.push({ characterId: c.id, characterName: c.name || '未命名', sprites });
    }
    return groups;
  }, [characters]);

  const pathToAssetId = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of localAssets) m[a.path] = a.id;
    return m;
  }, [localAssets]);

  /** 元件：从所有人物聚合元件组 */
  const allComponentGroups = React.useMemo(() => {
    const list: { characterId: string; characterName: string; group: GroupComponentItem }[] = [];
    for (const c of characters) {
      const groups = parseComponentGroups(c.component_groups ?? null);
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

  const tabItems = [
    {
      key: 'image',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'image')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'image')?.label}
        </span>
      ),
      children: (
        <GrowCard
          headerHeight={36}
          header={
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', padding: '4px 0' }}>
              <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
                导入
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
            {filteredImageAssets.map((a) => (
              <LocalAssetCard
                key={a.id}
                id={a.id}
                name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                thumb={assetThumbs[a.id]}
                added={usedInSceneAssetIds.has(a.id)}
                onPlace={() => placeAsset(a.id)}
                placing={placing}
              />
            ))}
          </div>
          {filteredImageAssets.length === 0 && (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>
              {assetsByType.image?.length === 0 ? '暂无图片素材，点击「导入」添加' : '无匹配结果'}
            </Text>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'sprite',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'sprite')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'sprite')?.label}
        </span>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
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
                />
              );
            })}
          </div>
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
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'character_sprite')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'character_sprite')?.label}
        </span>
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
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                        gap: 12,
                        marginTop: 8,
                      }}
                    >
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
                    </div>
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
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'component')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'component')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          {(assetsByType.component || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
            />
          ))}
          {(assetsByType.component?.length ?? 0) === 0 && <Text type="secondary">暂无元件素材</Text>}
        </div>
      ),
    },
    {
      key: 'character_component',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'character_component')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'character_component')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: 8 }}>
          {allComponentGroups.length === 0 ? (
            <Text type="secondary">暂无人物元件，请在「人物设计」中为人物添加元件组</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allComponentGroups.map(({ characterId, characterName, group }) => (
                <div key={`${characterId}:${group.id}`}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{characterName} / {group.name || group.id}</Text>
                  <div style={{ marginTop: 4, padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>元件组（放置功能开发中）</Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'video',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'video')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'video')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 8 }}>
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
          </div>
          {(assetsByType.video || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
            />
          ))}
          {(assetsByType.video?.length ?? 0) === 0 && <Text type="secondary">暂无视频，点击「上传视频」添加</Text>}
        </div>
      ),
    },
    {
      key: 'transparent_video',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'transparent_video')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'transparent_video')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 8 }}>
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
          </div>
          {(assetsByType.transparent_video || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
            />
          ))}
          {(assetsByType.transparent_video?.length ?? 0) === 0 && <Text type="secondary">暂无透明视频，点击「上传透明视频」添加</Text>}
        </div>
      ),
    },
    {
      key: 'sfx',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'sfx')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'sfx')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 8 }}>
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
          </div>
          {(assetsByType.sfx || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
              onPreview={() => {
                setAudioPreviewAsset(a);
                setAudioPreviewOpen(true);
              }}
            />
          ))}
          {(assetsByType.sfx?.length ?? 0) === 0 && <Text type="secondary">暂无音效，点击「上传音效」添加</Text>}
        </div>
      ),
    },
    {
      key: 'music',
      label: (
        <span>
          {React.createElement(ASSET_CATEGORIES.find((c) => c.value === 'music')!.icon, { style: { marginRight: 4 } })}
          {ASSET_CATEGORIES.find((c) => c.value === 'music')?.label}
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 8 }}>
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
          </div>
          {(assetsByType.music || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
              onPreview={() => {
                setAudioPreviewAsset(a);
                setAudioPreviewOpen(true);
              }}
            />
          ))}
          {(assetsByType.music?.length ?? 0) === 0 && <Text type="secondary">暂无音乐，点击「上传音乐」添加</Text>}
        </div>
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
        <Form form={videoUploadForm} layout="vertical" initialValues={{ name: '', tags: '', chromaKeyColor: 'black' }}>
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          {videoUploadType === 'transparent_video' && (
            <Form.Item name="chromaKeyColor" label="选择抠图颜色" rules={[{ required: true }]}>
              <Radio.Group
                options={[
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
        title="导入本地素材"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onOk={handleImportLocal}
        confirmLoading={importing}
        okText="选择文件并导入"
      >
        <Form form={importForm} layout="vertical" initialValues={{ type: 'image', is_favorite: false, description: '' }}>
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
}: { id: string; name: string; thumb?: string; added: boolean; onPlace: () => void; onEdit?: () => void; placing: boolean; placeDuration?: number }) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', String(placeDuration));
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
