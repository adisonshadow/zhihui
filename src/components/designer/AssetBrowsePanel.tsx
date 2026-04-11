/**
 * 素材浏览（列 1 素材面板）：本地/角色/特效/声效/音乐 Tabs；本地为 GrowCard（导入+模糊搜索+已导入列表）（见功能文档 6.4、开发计划 2.12）
 */
import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Typography, Button, App, Modal, Form, Input, Radio, Slider, Checkbox, Dropdown, Tag } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { getAssetUiCategory, addCategoryToTags, type AssetUiCategory } from '@/utils/assetCategory';
import { AdaptiveTabs } from '@/components/antd-plus/AdaptiveTabs';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import { ImagePreviewDrawer } from '@/components/asset/ImagePreviewDrawer';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import { TextPreviewDrawer } from '@/components/asset/TextPreviewDrawer';
import { CharacterSelectModal } from '@/components/asset/CharacterSelectModal';
import type { ProjectInfo } from '@/hooks/useProject';
import { GrowCard } from '@/components/GrowCard';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { STANDALONE_SPRITES_CHARACTER_ID, STANDALONE_COMPONENTS_CHARACTER_ID, COMPONENT_BLOCK_PREFIX, TEXT_GADGET_BLOCK_PREFIX, PARTICLES_GADGET_BLOCK_PREFIX } from '@/constants/project';
import { AudioListItem } from '@/components/asset/AudioListItem';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import { GroupComponentPanel } from '@/components/character/GroupComponentPanel';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { AssetBundleListRow } from '@/types/assetBundle';
import type { AssetBundlePickMember } from '@/components/asset/AssetBundlePickModal';
import { bundleCardDisplayTitle, fetchAssetRowForBundleMemberPreview } from '@/utils/assetBundleUi';
import { AssetThumb } from '@/components/asset/AssetLibraryCard';

const { Text } = Typography;

export type AssetBrowsePanelHandle = {
  openBundleMemberPreview: (m: AssetBundlePickMember) => void | Promise<void>;
};

/** 见文档 09-素材面板分类方案 五、Hot Tags 配置 */
const HOT_TAGS: Record<string, string[]> = {
  scene: ['室内', '室外', '山水', '天空', '街道', '建筑'],
  prop: ['桌椅', '马车', '武器', '服饰', '生活用品'],
  effect: ['光效', '粒子', '转场', '烟雾', '火焰'],
  text: ['标题', '对白', '旁白', '字幕'],
  sound: ['音效', 'BGM', '环境音'],
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  image: '图片',
  sprite: '精灵图',
  component: '元件',
  video: '视频',
  transparent_video: '透明视频',
  sfx: '音效',
  music: '音乐',
  text_gadget: '文字',
  particles_gadget: '脚本特效',
};

/** 素材面板统一 Header：左侧添加 Dropdown + 右侧模糊搜索（带 Hot Tags Dropdown）（见文档 09 二、Header 规范） */
function AssetTabHeader({
  addItems,
  search,
  onSearch,
  hotTags,
}: {
  addItems: { key: string; label: string; onClick: () => void }[];
  search: string;
  onSearch: (v: string) => void;
  hotTags: string[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
      <Dropdown
        menu={{
          items: addItems.map((item) => ({ key: item.key, label: item.label })),
          onClick: ({ key }) => addItems.find((i) => i.key === key)?.onClick(),
        }}
        trigger={['click']}
      >
        <Button type="primary" size="small">
          添加 <DownOutlined />
        </Button>
      </Dropdown>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <Input.Search
          placeholder="模糊搜索"
          allowClear
          size="small"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ width: 100 }}
        />
        {hotTags.length > 0 && (
          <Dropdown
            trigger={['click']}
            popupRender={() => (
              <div
                style={{
                  background: '#1f1f1f',
                  borderRadius: 8,
                  padding: '8px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxWidth: 240,
                }}
              >
                {hotTags.map((tag) => (
                  <Tag key={tag} style={{ cursor: 'pointer', margin: 0 }} onClick={() => onSearch(tag)}>
                    {tag}
                  </Tag>
                ))}
              </div>
            )}
          >
            <Button size="small" icon={<DownOutlined />} style={{ flexShrink: 0 }} />
          </Dropdown>
        )}
      </div>
    </div>
  );
}

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

interface CharacterTransparentVideoItem {
  id: string;
  asset_id: string;
}

function parseTransparentVideos(json: string | null): CharacterTransparentVideoItem[] {
  if (!json || json.trim() === '') return [];
  try {
    const arr = JSON.parse(json) as CharacterTransparentVideoItem[];
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
  transparent_videos?: string | null;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
  cover_path?: string | null;
  tags?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface AssetBrowsePanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  /** 当前集的 character_refs JSON 数组字符串，用于角色 Tab 排序 */
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
  /** 同类组：先选子素材再放置（由 DesignerTab 提供，打开全局选子项 Modal） */
  requestAssetBundlePick?: (bundleId: string) => Promise<string | null>;
}

export const AssetBrowsePanel = forwardRef<AssetBrowsePanelHandle, AssetBrowsePanelProps>(function AssetBrowsePanel({
  project,
  sceneId,
  episodeCharacterRefs,
  currentTime,
  onPlaced,
  onAssetUpdated,
  refreshKey,
  assetRefreshKey,
  requestAssetBundlePick,
}: AssetBrowsePanelProps, ref) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;

  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [assetsByType, setAssetsByType] = useState<Record<string, AssetRow[]>>({});
  const [assetThumbs, setAssetThumbs] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const playingAudioRef = useRef<{ id: string; el: HTMLAudioElement } | null>(null);

  /** 本地：已导入素材列表（所有分类） */
  const [localAssets, setLocalAssets] = useState<AssetRow[]>([]);
  /** 各 Tab 搜索状态（见文档 09 二、Header 规范） */
  const [characterSearch, setCharacterSearch] = useState('');
  const [sceneSearch, setSceneSearch] = useState('');
  const [propSearch, setPropSearch] = useState('');
  const [effectSearch, setEffectSearch] = useState('');
  const [textSearch, setTextSearch] = useState('');
  const [soundSearch, setSoundSearch] = useState('');
  /** 文字组件 preset 列表（来自 public/TextGadgets） */
  const [textGadgetPresets, setTextGadgetPresets] = useState<Array<{ id: string; name: string; description?: string; config: { id: string; name: string; fields: Array<{ key: string; label: string; type: string; defaults: { content: string; fontSize: number; color: string; fontFamily: string } }> } }>>([]);
  /** 脚本特效 preset 列表（来自 public/ParticlesGadgets） */
  const [particlesGadgetPresets, setParticlesGadgetPresets] = useState<Array<{ id: string; name: string; description?: string; config: { id: string; name: string; fields: Array<{ key: string; label: string; type: string; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number; defaults: Record<string, string | number> }> } }>>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [spriteSheetPanelOpen, setSpriteSheetPanelOpen] = useState(false);
  const [spriteSheetPanelItem, setSpriteSheetPanelItem] = useState<SpriteSheetItem | null>(null);
  /** 编辑精灵图时的角色 ID（standalone 为 STANDALONE_SPRITES_CHARACTER_ID，角色精灵为 characterId） */
  const [spriteSheetPanelCharacterId, setSpriteSheetPanelCharacterId] = useState<string>(STANDALONE_SPRITES_CHARACTER_ID);
  const [importForm] = Form.useForm<{ name: string; tags: string }>();
  const [videoUploadModalOpen, setVideoUploadModalOpen] = useState(false);
  const [videoUploadType, setVideoUploadType] = useState<'video' | 'transparent_video'>('video');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadForm] = Form.useForm<{ name: string; tags: string; chromaKeyColor?: 'auto' | 'black' | 'green' | 'purple'; tolerance?: number; contiguous?: boolean }>();
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
  const [textPreviewAsset, setTextPreviewAsset] = useState<AssetRow | null>(null);
  const [textPreviewOpen, setTextPreviewOpen] = useState(false);
  const [groupComponentPanelOpen, setGroupComponentPanelOpen] = useState(false);
  const [groupComponentPanelItem, setGroupComponentPanelItem] = useState<GroupComponentItem | null>(null);
  /** 编辑元件时的角色 ID（standalone 为 STANDALONE_COMPONENTS_CHARACTER_ID，角色元件为 characterId） */
  const [groupComponentPanelCharacterId, setGroupComponentPanelCharacterId] = useState<string | null>(null);
  /** 当前「添加」操作所属的 UI 分类（scene/prop/effect），用于上传时自动打分类标签 */
  const [pendingUiCategory, setPendingUiCategory] = useState<AssetUiCategory>('prop');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  /** 角色 tab 添加时的角色选择 Modal */
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [pendingCharAction, setPendingCharAction] = useState<'sprite' | 'component' | 'transparent_video' | null>(null);
  /** 角色 tab 透明视频上传时关联的角色 ID */
  const [pendingCharacterVideoId, setPendingCharacterVideoId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!window.yiman?.project?.getTextGadgetPresets) return;
    window.yiman.project.getTextGadgetPresets().then((list) => setTextGadgetPresets(list || []));
  }, []);

  useEffect(() => {
    if (!window.yiman?.project?.getParticlesGadgetPresets) return;
    window.yiman.project.getParticlesGadgetPresets().then((list) => setParticlesGadgetPresets(list || []));
  }, []);

  const loadAssetsByType = useCallback(async () => {
    if (!window.yiman?.project?.getAssets || !window.yiman?.project?.getBundledAssetIds) return;
    const bundled = new Set(await window.yiman.project.getBundledAssetIds(projectDir));
    const excl = (arr: AssetRow[] | undefined) => (arr || []).filter((a) => !bundled.has(a.id));
    const types = ['image', 'sprite', 'component', 'video', 'transparent_video', 'sfx', 'music'] as const;
    const [img, spr, comp, vid, fx, sfx, music] = await Promise.all(types.map((t) => window.yiman!.project.getAssets(projectDir, t)));
    setAssetsByType({
      image: excl(img as AssetRow[]),
      sprite: excl(spr as AssetRow[]),
      component: excl(comp as AssetRow[]),
      video: excl(vid as AssetRow[]),
      transparent_video: excl(fx as AssetRow[]),
      sfx: excl(sfx as AssetRow[]),
      music: excl(music as AssetRow[]),
    });
  }, [projectDir]);

  const [bundlesByCategory, setBundlesByCategory] = useState<{
    scene: AssetBundleListRow[];
    prop: AssetBundleListRow[];
    effect: AssetBundleListRow[];
    sound: AssetBundleListRow[];
  }>({ scene: [], prop: [], effect: [], sound: [] });

  useEffect(() => {
    if (!window.yiman?.project?.getAssetBundlesByUiCategory) return;
    let cancelled = false;
    (async () => {
      const [scene, prop, effect, sound] = await Promise.all([
        window.yiman.project.getAssetBundlesByUiCategory(projectDir, 'scene'),
        window.yiman.project.getAssetBundlesByUiCategory(projectDir, 'prop'),
        window.yiman.project.getAssetBundlesByUiCategory(projectDir, 'effect'),
        window.yiman.project.getAssetBundlesByUiCategory(projectDir, 'sound'),
      ]);
      if (!cancelled) {
        setBundlesByCategory({
          scene: (scene as AssetBundleListRow[]) || [],
          prop: (prop as AssetBundleListRow[]) || [],
          effect: (effect as AssetBundleListRow[]) || [],
          sound: (sound as AssetBundleListRow[]) || [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectDir, assetRefreshKey]);

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

  /** 放置元件/角色元件到主轨道：asset_id 格式 component:${characterId}:${groupId}，默认 10 秒 */
  const placeComponent = useCallback(
    async (characterId: string, groupId: string): Promise<string | null> => {
      const assetId = `${COMPONENT_BLOCK_PREFIX}${characterId}:${groupId}`;
      return placeAsset(assetId, 10);
    },
    [placeAsset]
  );

  /** 放置文字组件到主轨道：asset_id 格式 textgadget:${presetId}，默认 10 秒，带 config 默认值 */
  const placeTextGadget = useCallback(
    async (presetId: string, config: Record<string, { content: string; fontSize: number; color: string; fontFamily: string }>): Promise<string | null> => {
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
        const assetId = `${TEXT_GADGET_BLOCK_PREFIX}${presetId}`;
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const br = await window.yiman.project.insertBlockAtMainTrack(projectDir, sceneId, {
          id: blockId,
          asset_id: assetId,
          duration: 10,
          insertAt,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
          text_gadget_config: JSON.stringify(config),
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
    [projectDir, sceneId, message, onPlaced]
  );

  /** 放置脚本特效到主轨道：asset_id 格式 particlesgadget:${presetId}，默认 10 秒，带 config 默认值 */
  const placeParticlesGadget = useCallback(
    async (presetId: string, config: Record<string, string | number>): Promise<string | null> => {
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
        const assetId = `${PARTICLES_GADGET_BLOCK_PREFIX}${presetId}`;
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const br = await window.yiman.project.insertBlockAtMainTrack(projectDir, sceneId, {
          id: blockId,
          asset_id: assetId,
          duration: 10,
          insertAt,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
          particles_gadget_config: JSON.stringify(config),
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
    [projectDir, sceneId, message, onPlaced]
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

  /** 同类组内选中子项后的放置（与设计器单卡片添加一致） */
  const placeMemberById = useCallback(
    async (assetId: string) => {
      if (!window.yiman?.project?.getAssetById) return;
      const row = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
      if (!row) return;
      const t = row.type || '';
      if (t === 'image') await placeImageAsset(assetId);
      else if (t === 'video' || t === 'transparent_video') await placeVideoAsset(assetId);
      else if (t === 'sfx' || t === 'music') await placeAudioAsset(assetId);
    },
    [projectDir, placeImageAsset, placeVideoAsset, placeAudioAsset]
  );

  useImperativeHandle(
    ref,
    () => ({
      openBundleMemberPreview: async (m: AssetBundlePickMember) => {
        const row = (await fetchAssetRowForBundleMemberPreview(projectDir, m)) as AssetRow | null;
        if (!row) return;
        const t = row.type || '';
        if (t === 'video' || t === 'transparent_video') {
          setVideoPreviewAsset(row);
          setVideoPreviewOpen(true);
        } else if (t === 'image') {
          setImagePreviewAsset(row);
          setImagePreviewOpen(true);
        } else if (t === 'sfx' || t === 'music') {
          setAudioPreviewAsset(row);
          setAudioPreviewOpen(true);
        }
      },
    }),
    [projectDir]
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
    const tags = addCategoryToTags((values.tags ?? '').trim() || null, pendingUiCategory);
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
          tolerance: values.tolerance ?? 80,
          contiguous: values.contiguous ?? false,
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
        // 如果是从角色 tab 发起的透明视频上传，将该视频与角色关联
        const uploadedAssetId = (res as { id?: string }).id;
        if (pendingCharacterVideoId && videoUploadType === 'transparent_video' && uploadedAssetId) {
          const charData = characters.find((c) => c.id === pendingCharacterVideoId);
          const existing = parseTransparentVideos(charData?.transparent_videos ?? null);
          const newItem: CharacterTransparentVideoItem = {
            id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            asset_id: uploadedAssetId,
          };
          const next = [...existing, newItem];
          await window.yiman?.project?.updateCharacter?.(projectDir, pendingCharacterVideoId, { transparent_videos: JSON.stringify(next) });
          setCharacters((prev) => prev.map((c) => (c.id === pendingCharacterVideoId ? { ...c, transparent_videos: JSON.stringify(next) } : c)));
        }
        setPendingCharacterVideoId(null);
        loadLocalAssets();
        loadAssetsByType();
      } else message.error(res?.error || '导入失败');
    } finally {
      setVideoUploading(false);
    }
  }, [projectDir, videoUploadType, videoUploadForm, pendingCharacterVideoId, characters, message, loadLocalAssets, loadAssetsByType]);

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
    const tags = addCategoryToTags((values.tags ?? '').trim() || null, pendingUiCategory);
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

  /** 放置角色精灵到主轨道：需找到 sprite.image_path 对应的 asset，时长=(帧数/播放速度)*播放次数；按帧宽高设置 scale 以保持正确比例 */
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
        message.warning('请先在角色设计中完成精灵图导入与抠图');
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

  // filteredEffectAssets 已合并到 filterStandaloneAssets 中统一处理

  /** 声音 - 音效：模糊过滤，新添加的在前面 */
  const filteredSoundSfx = React.useMemo(() => {
    let list = assetsByType.sfx || [];
    const kw = soundSearch.trim().toLowerCase();
    if (kw) {
      list = list.filter((a) => {
        const desc = (a.description || '').toLowerCase();
        const path = (a.path || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [assetsByType.sfx, soundSearch]);

  /** 声音 - 音乐：模糊过滤，新添加的在前面 */
  const filteredSoundMusic = React.useMemo(() => {
    let list = assetsByType.music || [];
    const kw = soundSearch.trim().toLowerCase();
    if (kw) {
      list = list.filter((a) => {
        const desc = (a.description || '').toLowerCase();
        const path = (a.path || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [assetsByType.music, soundSearch]);

  /** 声音 Tab：同类组 */
  const filteredSoundBundles = React.useMemo(() => {
    const kw = soundSearch.trim().toLowerCase();
    let list = bundlesByCategory.sound;
    if (kw) {
      list = list.filter((b) => (b.title || '').toLowerCase().includes(kw) || (b.tags || '').toLowerCase().includes(kw));
    }
    return list;
  }, [bundlesByCategory.sound, soundSearch]);

  /** 项目级精灵图（未绑定角色） */
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


  const handleOpenSpriteSheetPanel = useCallback(async (category: AssetUiCategory = 'prop') => {
    await window.yiman?.project?.getOrCreateStandaloneSpritesCharacter?.(projectDir);
    const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: SpriteSheetItem = { id: newId, name: '精灵动作', image_path: '', uiCategory: category };
    const next = [...standaloneSprites, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
      sprite_sheets: JSON.stringify(next),
    });
    if (res?.ok) {
      loadStandaloneSprites();
      setSpriteSheetPanelItem(newItem);
      setSpriteSheetPanelCharacterId(STANDALONE_SPRITES_CHARACTER_ID);
      setSpriteSheetPanelOpen(true);
    } else {
      message.error(res?.error || '添加失败');
    }
  }, [projectDir, standaloneSprites, loadStandaloneSprites, message]);

  const handleSpriteSheetSave = useCallback(
    async (updated: SpriteSheetItem) => {
      const charId = spriteSheetPanelCharacterId;
      const isStandalone = charId === STANDALONE_SPRITES_CHARACTER_ID;
      const list = isStandalone
        ? standaloneSprites
        : parseSpriteSheets(characters.find((c) => c.id === charId)?.sprite_sheets ?? null);
      const next = list.some((s) => s.id === updated.id)
        ? list.map((s) => (s.id === updated.id ? updated : s))
        : [...list, updated];
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, charId, {
        sprite_sheets: JSON.stringify(next),
      });
      if (res?.ok) {
        if (isStandalone) loadStandaloneSprites();
        else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, sprite_sheets: JSON.stringify(next) } : c)));
        loadLocalAssets();
        loadAssetsByType();
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, spriteSheetPanelCharacterId, standaloneSprites, characters, loadStandaloneSprites, loadLocalAssets, loadAssetsByType, message]
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

  /** 角色精灵：按角色分组，仅显示有角色精灵的角色（排除项目级精灵图容器）；每组内为精灵列表，新添加的在前面 */
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

  /** 角色元件：从角色聚合元件（排除项目元件容器），新添加的在前面 */
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

  /** 角色视频：按角色分组，与透明视频本质相同，仅与角色关联 */
  const characterVideoGroups = React.useMemo(() => {
    const groups: { characterId: string; characterName: string; videos: CharacterTransparentVideoItem[] }[] = [];
    for (const c of characters) {
      if (c.id === STANDALONE_SPRITES_CHARACTER_ID || c.id === STANDALONE_COMPONENTS_CHARACTER_ID) continue;
      const videos = parseTransparentVideos(c.transparent_videos ?? null);
      if (videos.length > 0) groups.push({ characterId: c.id, characterName: c.name || '未命名', videos: [...videos].reverse() });
    }
    return groups;
  }, [characters]);

  /** 角色 Tab 合并视图：每个角色下汇总精灵图 + 元件 + 视频（见文档 09 四、4.1） */
  const combinedCharacterGroups = React.useMemo(() => {
    const map = new Map<string, {
      characterId: string;
      characterName: string;
      sprites: SpriteSheetItem[];
      components: GroupComponentItem[];
      videos: { item: CharacterTransparentVideoItem; asset: AssetRow | null }[];
    }>();
    for (const g of characterSpriteGroups) {
      map.set(g.characterId, { characterId: g.characterId, characterName: g.characterName, sprites: g.sprites, components: [], videos: [] });
    }
    for (const { characterId, characterName, group } of allComponentGroups) {
      if (!map.has(characterId)) map.set(characterId, { characterId, characterName, sprites: [], components: [], videos: [] });
      map.get(characterId)!.components.push(group);
    }
    for (const g of characterVideoGroups) {
      if (!map.has(g.characterId)) map.set(g.characterId, { characterId: g.characterId, characterName: g.characterName, sprites: [], components: [], videos: [] });
      map.get(g.characterId)!.videos = g.videos.map((v) => {
        const asset = (assetsByType.transparent_video || []).find((a) => a.id === v.asset_id) ?? localAssets.find((a) => a.id === v.asset_id) ?? null;
        return { item: v, asset };
      });
    }
    return Array.from(map.values());
  }, [characterSpriteGroups, allComponentGroups, characterVideoGroups, assetsByType, localAssets]);

  /** 角色搜索过滤：按角色名或素材名过滤 */
  const filteredCombinedCharacterGroups = React.useMemo(() => {
    const kw = characterSearch.trim().toLowerCase();
    if (!kw) return combinedCharacterGroups;
    return combinedCharacterGroups.filter(
      (g) =>
        g.characterName.toLowerCase().includes(kw) ||
        g.sprites.some((s) => (s.name || '').toLowerCase().includes(kw)) ||
        g.components.some((c) => (c.name || '').toLowerCase().includes(kw))
    );
  }, [combinedCharacterGroups, characterSearch]);

  /**
   * 布景/道具/特效 Tab 通用过滤函数：同时按 UI 分类（__cat: 标签 / uiCategory）和关键词过滤
   * 所有未标记分类的现有素材默认归入道具（getAssetUiCategory 返回 'prop'）
   */
  const filterStandaloneAssets = useCallback(
    (kw: string, category: AssetUiCategory) => {
      const k = kw.trim().toLowerCase();
      const matchAsset = (a: AssetRow) => {
        if (getAssetUiCategory(a.tags) !== category) return false;
        return !k || (a.description || '').toLowerCase().includes(k) || (a.tags || '').toLowerCase().includes(k) || a.path.toLowerCase().includes(k);
      };
      return {
        images: (assetsByType.image || []).filter(matchAsset),
        sprites: standaloneSprites.filter((s) => (s.uiCategory ?? 'prop') === category && (!k || (s.name || '').toLowerCase().includes(k))),
        components: standaloneComponents.filter((g) => (g.uiCategory ?? 'prop') === category && (!k || (g.name || g.id).toLowerCase().includes(k))),
        videos: (assetsByType.video || []).filter(matchAsset),
        transparentVideos: (assetsByType.transparent_video || []).filter(matchAsset),
      };
    },
    [assetsByType, standaloneSprites, standaloneComponents]
  );

  const filteredSceneAssets = React.useMemo(() => filterStandaloneAssets(sceneSearch, 'scene'), [filterStandaloneAssets, sceneSearch]);
  const filteredPropAssets = React.useMemo(() => filterStandaloneAssets(propSearch, 'prop'), [filterStandaloneAssets, propSearch]);
  const filteredEffectAssets = React.useMemo(() => filterStandaloneAssets(effectSearch, 'effect'), [filterStandaloneAssets, effectSearch]);

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


  /** 添加独立元件并打开编辑面板 */
  const addStandaloneComponent = useCallback(async (category: AssetUiCategory = 'prop') => {
    await window.yiman?.project?.getOrCreateStandaloneComponentsCharacter?.(projectDir);
    const newId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const defaultStateId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: GroupComponentItem = { id: newId, name: '元件', states: [{ id: defaultStateId, tags: [], items: [] }], uiCategory: category };
    const next = [...standaloneComponents, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_COMPONENTS_CHARACTER_ID, { component_groups: JSON.stringify(next) });
    if (res?.ok) { loadStandaloneComponents(); setGroupComponentPanelItem(newItem); setGroupComponentPanelCharacterId(STANDALONE_COMPONENTS_CHARACTER_ID); setGroupComponentPanelOpen(true); }
    else message.error(res?.error || '添加失败');
  }, [projectDir, standaloneComponents, loadStandaloneComponents, message]);

  /** 角色 tab 选中角色后的回调：在该角色下创建精灵图/元件，或打开透明视频上传 */
  const handleCharSelected = useCallback(async (characterId: string) => {
    setCharSelectOpen(false);
    if (!pendingCharAction) return;
    const charData = characters.find((c) => c.id === characterId);

    if (pendingCharAction === 'sprite') {
      const existing = parseSpriteSheets(charData?.sprite_sheets ?? null);
      const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newItem: SpriteSheetItem = { id: newId, name: '精灵动作', image_path: '' };
      const next = [...existing, newItem];
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, characterId, { sprite_sheets: JSON.stringify(next) });
      if (res?.ok) {
        setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, sprite_sheets: JSON.stringify(next) } : c)));
        setSpriteSheetPanelItem(newItem);
        setSpriteSheetPanelCharacterId(characterId);
        setSpriteSheetPanelOpen(true);
      } else {
        message.error(res?.error || '添加失败');
      }
    } else if (pendingCharAction === 'component') {
      const existing = parseComponentGroups(charData?.component_groups ?? null);
      const newId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const defaultStateId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newItem: GroupComponentItem = { id: newId, name: '元件', states: [{ id: defaultStateId, tags: [], items: [] }] };
      const next = [...existing, newItem];
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, characterId, { component_groups: JSON.stringify(next) });
      if (res?.ok) {
        setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, component_groups: JSON.stringify(next) } : c)));
        setGroupComponentPanelItem(newItem);
        setGroupComponentPanelCharacterId(characterId);
        setGroupComponentPanelOpen(true);
      } else {
        message.error(res?.error || '添加失败');
      }
    } else if (pendingCharAction === 'transparent_video') {
      setPendingCharacterVideoId(characterId);
      setVideoUploadType('transparent_video');
      setVideoUploadModalOpen(true);
    }
    setPendingCharAction(null);
  }, [pendingCharAction, characters, projectDir, message]);

  /** 精灵图变更分类/删除（从 SpriteSheetPanel more 菜单调用） */
  const handleSpriteSheetCategoryChange = useCallback(async (itemId: string, category: string, targetCharacterId?: string) => {
    const charId = spriteSheetPanelCharacterId;
    const isStandalone = charId === STANDALONE_SPRITES_CHARACTER_ID;
    const list = isStandalone
      ? standaloneSprites
      : parseSpriteSheets(characters.find((c) => c.id === charId)?.sprite_sheets ?? null);

    if (category === 'character' && targetCharacterId) {
      // 移动到指定角色：从源列表移除，再添加到目标角色
      const sprite = list.find((s) => s.id === itemId);
      if (!sprite) return;
      const nextSource = list.filter((s) => s.id !== itemId);
      const targetList = parseSpriteSheets(characters.find((c) => c.id === targetCharacterId)?.sprite_sheets ?? null);
      const nextTarget = [...targetList, { ...sprite, uiCategory: undefined }];
      const [resSource, resTarget] = await Promise.all([
        window.yiman?.project?.updateCharacter?.(projectDir, charId, { sprite_sheets: JSON.stringify(nextSource) }),
        window.yiman?.project?.updateCharacter?.(projectDir, targetCharacterId, { sprite_sheets: JSON.stringify(nextTarget) }),
      ]);
      if (resSource?.ok && resTarget?.ok) {
        if (isStandalone) loadStandaloneSprites();
        else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, sprite_sheets: JSON.stringify(nextSource) } : c)));
        setCharacters((prev) => prev.map((c) => (c.id === targetCharacterId ? { ...c, sprite_sheets: JSON.stringify(nextTarget) } : c)));
        message.success('已移动到角色');
      } else {
        message.error('移动失败');
      }
    } else {
      const next = list.map((s) =>
        s.id === itemId ? { ...s, uiCategory: category as 'scene' | 'prop' | 'effect' } : s
      );
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, charId, { sprite_sheets: JSON.stringify(next) });
      if (res?.ok) {
        if (isStandalone) loadStandaloneSprites();
        else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, sprite_sheets: JSON.stringify(next) } : c)));
        message.success('分类已更新');
      } else {
        message.error(res?.error || '变更分类失败');
      }
    }
  }, [spriteSheetPanelCharacterId, standaloneSprites, characters, projectDir, loadStandaloneSprites, message]);

  /** 精灵图删除（从 SpriteSheetPanel more 菜单调用） */
  const handleSpriteSheetDelete = useCallback(async (itemId: string) => {
    const charId = spriteSheetPanelCharacterId;
    const isStandalone = charId === STANDALONE_SPRITES_CHARACTER_ID;
    const list = isStandalone
      ? standaloneSprites
      : parseSpriteSheets(characters.find((c) => c.id === charId)?.sprite_sheets ?? null);
    const next = list.filter((s) => s.id !== itemId);
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, charId, { sprite_sheets: JSON.stringify(next) });
    if (res?.ok) {
      if (isStandalone) loadStandaloneSprites();
      else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, sprite_sheets: JSON.stringify(next) } : c)));
      message.success('已删除');
    } else {
      message.error(res?.error || '删除失败');
    }
  }, [spriteSheetPanelCharacterId, standaloneSprites, characters, projectDir, loadStandaloneSprites, message]);

  /** 元件变更分类（从 GroupComponentPanel more 菜单调用） */
  const handleGroupComponentCategoryChange = useCallback(async (itemId: string, category: string, targetCharacterId?: string) => {
    const charId = groupComponentPanelCharacterId;
    if (!charId) return;
    const isStandalone = charId === STANDALONE_COMPONENTS_CHARACTER_ID;
    const list = isStandalone
      ? standaloneComponents
      : parseComponentGroups(characters.find((c) => c.id === charId)?.component_groups ?? null);

    if (category === 'character' && targetCharacterId) {
      const comp = list.find((g) => g.id === itemId);
      if (!comp) return;
      const nextSource = list.filter((g) => g.id !== itemId);
      const targetList = parseComponentGroups(characters.find((c) => c.id === targetCharacterId)?.component_groups ?? null);
      const nextTarget = [...targetList, { ...comp, uiCategory: undefined }];
      const [resSource, resTarget] = await Promise.all([
        window.yiman?.project?.updateCharacter?.(projectDir, charId, { component_groups: JSON.stringify(nextSource) }),
        window.yiman?.project?.updateCharacter?.(projectDir, targetCharacterId, { component_groups: JSON.stringify(nextTarget) }),
      ]);
      if (resSource?.ok && resTarget?.ok) {
        if (isStandalone) loadStandaloneComponents();
        else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, component_groups: JSON.stringify(nextSource) } : c)));
        setCharacters((prev) => prev.map((c) => (c.id === targetCharacterId ? { ...c, component_groups: JSON.stringify(nextTarget) } : c)));
        message.success('已移动到角色');
      } else {
        message.error('移动失败');
      }
    } else {
      const next = list.map((g) =>
        g.id === itemId ? { ...g, uiCategory: category as 'scene' | 'prop' | 'effect' } : g
      );
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, charId, { component_groups: JSON.stringify(next) });
      if (res?.ok) {
        if (isStandalone) loadStandaloneComponents();
        else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, component_groups: JSON.stringify(next) } : c)));
        message.success('分类已更新');
      } else {
        message.error(res?.error || '变更分类失败');
      }
    }
  }, [groupComponentPanelCharacterId, standaloneComponents, characters, projectDir, loadStandaloneComponents, message]);

  /** 元件删除（从 GroupComponentPanel more 菜单调用） */
  const handleGroupComponentDelete = useCallback(async (itemId: string) => {
    const charId = groupComponentPanelCharacterId;
    if (!charId) return;
    const isStandalone = charId === STANDALONE_COMPONENTS_CHARACTER_ID;
    const list = isStandalone
      ? standaloneComponents
      : parseComponentGroups(characters.find((c) => c.id === charId)?.component_groups ?? null);
    const next = list.filter((g) => g.id !== itemId);
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, charId, { component_groups: JSON.stringify(next) });
    if (res?.ok) {
      if (isStandalone) loadStandaloneComponents();
      else setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, component_groups: JSON.stringify(next) } : c)));
      message.success('已删除');
    } else {
      message.error(res?.error || '删除失败');
    }
  }, [groupComponentPanelCharacterId, standaloneComponents, characters, projectDir, loadStandaloneComponents, message]);

  /** 视频变更分类到角色：把 asset 加入 character.transparent_videos（从 VideoPreviewDrawer 回调） */
  const handleVideoAssetCategoryChange = useCallback(async (assetId: string, category: string, targetCharacterId?: string) => {
    if (category !== 'character' || !targetCharacterId) return;
    const charData = characters.find((c) => c.id === targetCharacterId);
    const existing = parseTransparentVideos(charData?.transparent_videos ?? null);
    // 避免重复添加
    if (existing.some((v) => v.asset_id === assetId)) {
      message.warning('该视频已在此角色中');
      return;
    }
    const newItem: CharacterTransparentVideoItem = {
      id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      asset_id: assetId,
    };
    const next = [...existing, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, targetCharacterId, { transparent_videos: JSON.stringify(next) });
    if (res?.ok) {
      setCharacters((prev) => prev.map((c) => (c.id === targetCharacterId ? { ...c, transparent_videos: JSON.stringify(next) } : c)));
      message.success('已移动到角色');
    } else {
      message.error(res?.error || '操作失败');
    }
  }, [characters, projectDir, message]);

  /** 渲染独立素材混合网格（布景/道具 Tab 共用，见文档 09 四、4.2/4.3） */
  const renderStandaloneGrid = (
    assets: { images: AssetRow[]; sprites: SpriteSheetItem[]; components: GroupComponentItem[]; videos: AssetRow[]; transparentVideos: AssetRow[] },
    emptyText: string,
    category: 'scene' | 'prop' | 'effect',
    searchKw: string,
  ): React.ReactNode => {
    const kw = searchKw.trim().toLowerCase();
    const bundleList = bundlesByCategory[category].filter((b) => {
      if (!kw) return true;
      return (b.title || '').toLowerCase().includes(kw) || (b.tags || '').toLowerCase().includes(kw);
    });
    const extractTs = (id: string) => {
      const m = id.match(/_(\d{10,})_/);
      return m ? parseInt(m[1], 10) : 0;
    };
    type UnifiedItem =
      | { kind: 'image'; data: AssetRow; sortTime: number }
      | { kind: 'video'; data: AssetRow; sortTime: number }
      | { kind: 'transparent_video'; data: AssetRow; sortTime: number }
      | { kind: 'sprite'; data: SpriteSheetItem; sortTime: number }
      | { kind: 'component'; data: GroupComponentItem; sortTime: number };
    const items: UnifiedItem[] = [
      ...assets.images.map((a) => ({ kind: 'image' as const, data: a, sortTime: new Date(a.updated_at || a.created_at || 0).getTime() })),
      ...assets.videos.map((a) => ({ kind: 'video' as const, data: a, sortTime: new Date(a.updated_at || a.created_at || 0).getTime() })),
      ...assets.transparentVideos.map((a) => ({ kind: 'transparent_video' as const, data: a, sortTime: new Date(a.updated_at || a.created_at || 0).getTime() })),
      ...assets.sprites.map((s) => ({ kind: 'sprite' as const, data: s, sortTime: extractTs(s.id) })),
      ...assets.components.map((g) => ({ kind: 'component' as const, data: g, sortTime: extractTs(g.id) })),
    ];
    items.sort((a, b) => b.sortTime - a.sortTime);

    return (
      <>
        <ResponsiveCardGrid minItemWidth={100} padding={0}>
          {bundleList.map((b) => (
            <LocalBundleCard
              key={`bundle:${b.id}`}
              bundle={b}
              projectDir={projectDir}
              requestAssetBundlePick={requestAssetBundlePick}
              placeMemberById={placeMemberById}
              placing={placing}
            />
          ))}
          {items.map((item) => {
            if (item.kind === 'image') {
              const a = item.data;
              return (
                <LocalAssetCard
                  key={a.id}
                  id={a.id}
                  name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                  thumb={assetThumbs[a.id]}
                  added={usedInSceneAssetIds.has(a.id)}
                  onAdd={() => placeImageAsset(a.id)}
                  onPreviewOrEdit={() => { setImagePreviewAsset(a); setImagePreviewOpen(true); }}
                  placing={placing}
                  assetType="image"
                />
              );
            }
            if (item.kind === 'sprite') {
              const s = item.data;
              const assetId = pathToAssetId[s.image_path];
              const pd = ((s.frame_count ?? 8) / (s.playback_fps ?? 8)) || 1;
              return assetId ? (
                <LocalAssetCard
                  key={`sprite:${s.id}`}
                  id={assetId}
                  name={s.name || '未命名'}
                  thumb={spriteThumbs[`standalone:${s.id}`]}
                  added={usedInSceneAssetIds.has(assetId)}
                  onAdd={() => placeSprite(s)}
                  onPreviewOrEdit={() => { setSpriteSheetPanelItem(s); setSpriteSheetPanelOpen(true); }}
                  placing={placing}
                  placeDuration={pd}
                  assetType="sprite"
                />
              ) : (
                <div key={`sprite:${s.id}`} style={{ borderRadius: 8, background: 'rgba(255,255,255,0.04)', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 100, aspectRatio: '1' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>需完成导入</Text>
                  <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{s.name || '未命名'}</Text>
                </div>
              );
            }
            if (item.kind === 'component') {
              const g = item.data;
              const assetId = `${COMPONENT_BLOCK_PREFIX}${STANDALONE_COMPONENTS_CHARACTER_ID}:${g.id}`;
              return (
                <LocalAssetCard
                  key={`comp:${g.id}`}
                  id={assetId}
                  name={g.name || g.id}
                  thumb={componentThumbs[`${STANDALONE_COMPONENTS_CHARACTER_ID}:${g.id}`]}
                  added={usedInSceneAssetIds.has(assetId)}
                  onAdd={() => placeComponent(STANDALONE_COMPONENTS_CHARACTER_ID, g.id)}
                  onPreviewOrEdit={() => { setGroupComponentPanelItem(g); setGroupComponentPanelCharacterId(STANDALONE_COMPONENTS_CHARACTER_ID); setGroupComponentPanelOpen(true); }}
                  placing={placing}
                  assetType="component"
                />
              );
            }
            const a = item.data;
            const isTransparent = item.kind === 'transparent_video';
            return (
              <LocalAssetCard
                key={a.id}
                id={a.id}
                name={a.description || a.path.split(/[/\\]/).pop() || a.id}
                thumb={assetThumbs[a.id]}
                added={usedInSceneAssetIds.has(a.id)}
                onAdd={() => placeVideoAsset(a.id)}
                onPreviewOrEdit={() => { setVideoPreviewAsset(a); setVideoPreviewOpen(true); }}
                placing={placing}
                assetType={isTransparent ? 'transparent_video' : 'video'}
              />
            );
          })}
        </ResponsiveCardGrid>
        {items.length === 0 && bundleList.length === 0 && (
          <Text type="secondary" style={{ display: 'block', padding: 16 }}>{emptyText}</Text>
        )}
      </>
    );
  };

  /** 按分类生成添加菜单（布景/道具/特效 各自传入 category，上传时自动打分类标签） */
  const makeStandaloneAddItems = useCallback(
    (category: AssetUiCategory) => [
      { key: 'image', label: '图片', onClick: () => { setPendingUiCategory(category); setImportModalOpen(true); } },
      { key: 'sprite', label: '精灵图', onClick: () => handleOpenSpriteSheetPanel(category) },
      { key: 'component', label: '元件', onClick: () => addStandaloneComponent(category) },
      { key: 'video', label: '视频', onClick: () => { setPendingUiCategory(category); setVideoUploadType('video'); setVideoUploadModalOpen(true); } },
      { key: 'transparent_video', label: '透明视频', onClick: () => { setPendingUiCategory(category); setVideoUploadType('transparent_video'); setVideoUploadModalOpen(true); } },
    ],
    [handleOpenSpriteSheetPanel, addStandaloneComponent]
  );

  /** 见文档 09 一、分类结构：6 个用户友好分类 */
  const tabItems = [
    {
      key: 'character',
      label: '角色',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={[
                { key: 'sprite', label: '精灵图', onClick: () => { setPendingCharAction('sprite'); setCharSelectOpen(true); } },
                { key: 'component', label: '元件', onClick: () => { setPendingCharAction('component'); setCharSelectOpen(true); } },
                { key: 'transparent_video', label: '透明视频', onClick: () => { setPendingCharAction('transparent_video'); setCharSelectOpen(true); } },
              ]}
              search={characterSearch}
              onSearch={setCharacterSearch}
              hotTags={characters.filter((c) => c.id !== STANDALONE_SPRITES_CHARACTER_ID && c.id !== STANDALONE_COMPONENTS_CHARACTER_ID).map((c) => c.name || '未命名')}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredCombinedCharacterGroups.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', padding: 16 }}>
                暂无角色素材，请在「角色」页为角色添加精灵图、元件或视频
              </Text>
            ) : (
              filteredCombinedCharacterGroups.map((g) => (
                <div key={g.characterId}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{g.characterName}</Text>
                  <ResponsiveCardGrid minItemWidth={100} padding={0} style={{ marginTop: 8 }}>
                    {g.sprites.map((s) => {
                      const assetId = pathToAssetId[s.image_path];
                      const pd = ((s.frame_count ?? 8) / (s.playback_fps ?? 8)) || 1;
                      return assetId ? (
                        <LocalAssetCard
                          key={`sprite:${s.id}`}
                          id={assetId}
                          name={s.name || '未命名'}
                          thumb={spriteThumbs[`${g.characterId}:${s.id}`]}
                          added={usedInSceneAssetIds.has(assetId)}
                          onAdd={() => placeSprite(s)}
                          onPreviewOrEdit={() => {
                            setSpriteSheetPanelItem(s);
                            setSpriteSheetPanelCharacterId(g.characterId);
                            setSpriteSheetPanelOpen(true);
                          }}
                          placing={placing}
                          placeDuration={pd}
                          assetType="sprite"
                        />
                      ) : (
                        <div key={`sprite:${s.id}`} style={{ borderRadius: 8, background: 'rgba(255,255,255,0.04)', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 100, aspectRatio: '1' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>需完成导入</Text>
                          <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{s.name || '未命名'}</Text>
                        </div>
                      );
                    })}
                    {g.components.map((group) => {
                      const assetId = `${COMPONENT_BLOCK_PREFIX}${g.characterId}:${group.id}`;
                      return (
                        <LocalAssetCard
                          key={`comp:${group.id}`}
                          id={assetId}
                          name={group.name || group.id}
                          thumb={componentThumbs[`${g.characterId}:${group.id}`]}
                          added={usedInSceneAssetIds.has(assetId)}
                          onAdd={() => placeComponent(g.characterId, group.id)}
                          onPreviewOrEdit={() => { setGroupComponentPanelItem(group); setGroupComponentPanelCharacterId(g.characterId); setGroupComponentPanelOpen(true); }}
                          placing={placing}
                          assetType="component"
                        />
                      );
                    })}
                    {g.videos.map(({ item: v, asset }) =>
                      asset ? (
                        <LocalAssetCard
                          key={`vid:${v.id}`}
                          id={asset.id}
                          name={asset.description || asset.path.split(/[/\\]/).pop() || asset.id}
                          thumb={assetThumbs[asset.id]}
                          added={usedInSceneAssetIds.has(asset.id)}
                          onAdd={() => placeVideoAsset(asset.id)}
                          onPreviewOrEdit={() => { setVideoPreviewAsset(asset); setVideoPreviewOpen(true); }}
                          placing={placing}
                          assetType="transparent_video"
                        />
                      ) : null
                    )}
                  </ResponsiveCardGrid>
                </div>
              ))
            )}
          </div>
        </GrowCard>
      ),
    },
    {
      key: 'scene',
      label: '布景',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={makeStandaloneAddItems('scene')}
              search={sceneSearch}
              onSearch={setSceneSearch}
              hotTags={HOT_TAGS.scene}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          {renderStandaloneGrid(filteredSceneAssets, '暂无布景素材，点击「添加」导入', 'scene', sceneSearch)}
        </GrowCard>
      ),
    },
    {
      key: 'prop',
      label: '道具',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={makeStandaloneAddItems('prop')}
              search={propSearch}
              onSearch={setPropSearch}
              hotTags={HOT_TAGS.prop}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          {renderStandaloneGrid(filteredPropAssets, '暂无道具素材，点击「添加」导入', 'prop', propSearch)}
        </GrowCard>
      ),
    },
    {
      key: 'effect',
      label: '特效',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={makeStandaloneAddItems('effect')}
              search={effectSearch}
              onSearch={setEffectSearch}
              hotTags={HOT_TAGS.effect}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {renderStandaloneGrid(filteredEffectAssets, '', 'effect', effectSearch)}
            {particlesGadgetPresets.length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>脚本特效</Text>
                <ResponsiveCardGrid minItemWidth={100} padding={0}>
                  {particlesGadgetPresets
                    .filter((p) => !effectSearch || p.name.includes(effectSearch) || p.id.includes(effectSearch))
                    .map((preset) => {
                      const assetId = `${PARTICLES_GADGET_BLOCK_PREFIX}${preset.id}`;
                      const defaultConfig: Record<string, string | number> = {};
                      for (const f of preset.config.fields) {
                        if (f.defaults && typeof f.defaults === 'object') {
                          Object.assign(defaultConfig, f.defaults);
                        }
                      }
                      return (
                        <ParticlesGadgetCard
                          key={preset.id}
                          id={assetId}
                          name={preset.name}
                          presetId={preset.id}
                          added={usedInSceneAssetIds.has(assetId)}
                          onAdd={() => placeParticlesGadget(preset.id, defaultConfig)}
                          placing={placing}
                          defaultConfig={defaultConfig}
                        />
                      );
                    })}
                </ResponsiveCardGrid>
              </>
            )}
            {filteredEffectAssets.images.length === 0 && filteredEffectAssets.sprites.length === 0 && filteredEffectAssets.components.length === 0 && filteredEffectAssets.videos.length === 0 && filteredEffectAssets.transparentVideos.length === 0 && particlesGadgetPresets.length === 0 && (
              <Text type="secondary" style={{ display: 'block', padding: 16 }}>暂无特效素材，点击「添加」导入透明视频，或使用下方脚本特效</Text>
            )}
          </div>
        </GrowCard>
      ),
    },
    {
      key: 'text',
      label: '文字',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={[{ key: 'text', label: '文字', onClick: () => {} }]}
              search={textSearch}
              onSearch={setTextSearch}
              hotTags={HOT_TAGS.text}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          {textGadgetPresets.length === 0 ? (
            <Text type="secondary" style={{ display: 'block', padding: 16 }}>暂无文字组件，请检查 public/TextGadgets 目录</Text>
          ) : (
            <ResponsiveCardGrid minItemWidth={100} padding={0}>
              {textGadgetPresets
                .filter((p) => !textSearch || p.name.includes(textSearch) || p.id.includes(textSearch))
                .map((preset) => {
                  const assetId = `${TEXT_GADGET_BLOCK_PREFIX}${preset.id}`;
                  const defaultConfig: Record<string, { content: string; fontSize: number; color: string; fontFamily: string }> = {};
                  for (const f of preset.config.fields) {
                    if (f.defaults) defaultConfig[f.key] = f.defaults;
                  }
                  return (
                    <TextGadgetCard
                      key={preset.id}
                      id={assetId}
                      name={preset.name}
                      config={preset.config}
                      added={usedInSceneAssetIds.has(assetId)}
                      onAdd={() => placeTextGadget(preset.id, defaultConfig)}
                      placing={placing}
                    />
                  );
                })}
            </ResponsiveCardGrid>
          )}
        </GrowCard>
      ),
    },
    {
      key: 'sound',
      label: '声音',
      children: (
        <GrowCard
          headerHeight={40}
          header={
            <AssetTabHeader
              addItems={[
                { key: 'sfx', label: '音效', onClick: () => { setAudioUploadType('sfx'); setAudioUploadModalOpen(true); } },
                { key: 'music', label: '音乐', onClick: () => { setAudioUploadType('music'); setAudioUploadModalOpen(true); } },
              ]}
              search={soundSearch}
              onSearch={setSoundSearch}
              hotTags={HOT_TAGS.sound}
            />
          }
          bodyStyle={{ padding: 8 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredSoundBundles.length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>同类素材组</Text>
                <ResponsiveCardGrid minItemWidth={100} padding={0}>
                  {filteredSoundBundles.map((b) => (
                    <LocalBundleCard
                      key={`bundle-snd:${b.id}`}
                      bundle={b}
                      projectDir={projectDir}
                      requestAssetBundlePick={requestAssetBundlePick}
                      placeMemberById={placeMemberById}
                      placing={placing}
                    />
                  ))}
                </ResponsiveCardGrid>
              </>
            )}
            {filteredSoundSfx.length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>音效</Text>
                {filteredSoundSfx.map((a) => (
                  <AudioListItem
                    key={a.id}
                    asset={a}
                    isPlaying={playingAudioId === a.id}
                    onPlay={() => handleAudioPlay(a)}
                    onEdit={() => { setAudioPreviewAsset(a); setAudioPreviewOpen(true); }}
                    onPlace={() => placeAudioAsset(a.id)}
                    placing={placing}
                  />
                ))}
              </>
            )}
            {filteredSoundMusic.length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 12, marginTop: filteredSoundSfx.length > 0 ? 8 : 0 }}>音乐</Text>
                {filteredSoundMusic.map((a) => (
                  <AudioListItem
                    key={a.id}
                    asset={a}
                    isPlaying={playingAudioId === a.id}
                    onPlay={() => handleAudioPlay(a)}
                    onEdit={() => { setAudioPreviewAsset(a); setAudioPreviewOpen(true); }}
                    onPlace={() => placeAudioAsset(a.id)}
                    placing={placing}
                  />
                ))}
              </>
            )}
            {filteredSoundSfx.length === 0 && filteredSoundMusic.length === 0 && filteredSoundBundles.length === 0 && (
              <Text type="secondary" style={{ display: 'block', padding: 16 }}>
                {(assetsByType.sfx?.length ?? 0) === 0 && (assetsByType.music?.length ?? 0) === 0 && bundlesByCategory.sound.length === 0
                  ? '暂无声音素材，点击「添加」导入音效或音乐'
                  : '无匹配结果'}
              </Text>
            )}
          </div>
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
        <Form form={videoUploadForm} layout="vertical" initialValues={{ name: '', tags: '', chromaKeyColor: 'auto', tolerance: 80, contiguous: false }}>
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          {videoUploadType === 'transparent_video' && (
            <>
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
              <Form.Item name="tolerance" label="容差（0–255）">
                <Slider min={0} max={255} />
              </Form.Item>
              <Form.Item name="contiguous" valuePropName="checked">
                <Checkbox>从边缘扩散去色（防止误删内部同色区域）</Checkbox>
              </Form.Item>
            </>
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
            setSpriteSheetPanelCharacterId(STANDALONE_SPRITES_CHARACTER_ID);
          }}
          projectDir={projectDir}
          characterId={spriteSheetPanelCharacterId}
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
          onChangeCategory={handleSpriteSheetCategoryChange}
          onDelete={handleSpriteSheetDelete}
        />
      )}
      <AudioPreviewDrawer
        open={audioPreviewOpen}
        onClose={() => { setAudioPreviewOpen(false); setAudioPreviewAsset(null); }}
        projectDir={projectDir}
        asset={audioPreviewAsset}
        onUpdate={() => { loadLocalAssets(); loadAssetsByType(); }}
        saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
      <ImagePreviewDrawer
        open={imagePreviewOpen}
        onClose={() => { setImagePreviewOpen(false); setImagePreviewAsset(null); }}
        projectDir={projectDir}
        asset={imagePreviewAsset}
        onUpdate={async (opts) => {
          loadLocalAssets();
          loadAssetsByType();
          onAssetUpdated?.(opts?.assetId);
          if (opts?.assetId && imagePreviewOpen && imagePreviewAsset?.id === opts.assetId && window.yiman?.project?.getAssetById) {
            const fresh = (await window.yiman.project.getAssetById(projectDir, opts.assetId)) as AssetRow | null;
            if (fresh) setImagePreviewAsset(fresh);
          }
        }}
        getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
        saveAssetFromBase64={(dir, base64, ext, type, opt) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type, opt) ?? Promise.resolve({ ok: false })}
        matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false })}
        saveAssetFromFile={async (dir, filePath, type, opt) =>
          (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type, opt)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
      <VideoPreviewDrawer
        open={videoPreviewOpen}
        onClose={() => { setVideoPreviewOpen(false); setVideoPreviewAsset(null); }}
        projectDir={projectDir}
        asset={videoPreviewAsset}
        onUpdate={() => { loadLocalAssets(); loadAssetsByType(); }}
        onChangeCategory={handleVideoAssetCategoryChange}
        onReprocessComplete={async (assetId) => {
          loadLocalAssets();
          loadAssetsByType();
          if (videoPreviewAsset?.id === assetId && window.yiman?.project?.getAssetById) {
            const fresh = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
            if (fresh) setVideoPreviewAsset(fresh);
          }
        }}
        saveAssetFromFile={async (dir, filePath, type, opt) =>
          (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type, opt)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
      <TextPreviewDrawer
        open={textPreviewOpen}
        onClose={() => { setTextPreviewOpen(false); setTextPreviewAsset(null); }}
        projectDir={projectDir}
        asset={textPreviewAsset}
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
          onChangeCategory={handleGroupComponentCategoryChange}
          onDelete={handleGroupComponentDelete}
        />
      )}

      <CharacterSelectModal
        open={charSelectOpen}
        projectDir={projectDir}
        onCancel={() => { setCharSelectOpen(false); setPendingCharAction(null); }}
        onConfirm={handleCharSelected}
      />
    </>
  );
});

/** 脚本特效卡片：展示封面，可添加/拖拽到时间线 */
function ParticlesGadgetCard({
  id,
  name,
  presetId,
  added,
  onAdd,
  placing,
  defaultConfig,
}: {
  id: string;
  name: string;
  presetId: string;
  added: boolean;
  onAdd: () => void;
  placing: boolean;
  defaultConfig: Record<string, string | number>;
}) {
  const coverUrl = `/ParticlesGadgets/${presetId}/cover.png`;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', '10');
        e.dataTransfer.setData('assetType', 'particles_gadget');
        e.dataTransfer.setData('particlesGadgetConfig', JSON.stringify(defaultConfig));
      }}
      style={{
        cursor: placing ? 'wait' : 'pointer',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: 'rgba(255,255,255,0.08)' }}>
        <img
          src={coverUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(ev) => {
            (ev.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {added && (
          <span style={{ position: 'absolute', left: 4, top: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 10 }}>
            已添加
          </span>
        )}
        <span style={{ position: 'absolute', left: 4, bottom: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>
          脚本特效
        </span>
        <Button
          type="primary"
          size="small"
          style={{ position: 'absolute', right: 4, top: 4, minWidth: 28, height: 28, padding: 0 }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          loading={placing}
        >
          +
        </Button>
      </div>
      <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ width: '80%', maxWidth: '80%', marginTop: 8, fontSize: 12, marginBottom: 0, minHeight: 38, margin: '8px auto 0', textAlign: 'center' }}>
        {name}
      </Typography.Paragraph>
    </div>
  );
}

/** 文字组件卡片：预览两行文字，可添加/拖拽到时间线 */
function TextGadgetCard({
  id,
  name,
  config,
  added,
  onAdd,
  placing,
}: {
  id: string;
  name: string;
  config: { fields: Array<{ key: string; defaults?: { content: string; fontSize: number; color: string; fontFamily: string } }> };
  added: boolean;
  onAdd: () => void;
  placing: boolean;
}) {
  const lines = config.fields.slice(0, 2).map((f) => f.defaults ?? { content: '', fontSize: 24, color: '#fff', fontFamily: 'cursive' });
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', '10');
        e.dataTransfer.setData('assetType', 'text_gadget');
        const defaultConfig: Record<string, { content: string; fontSize: number; color: string; fontFamily: string }> = {};
        for (const f of config.fields) {
          if (f.defaults) defaultConfig[f.key] = f.defaults;
        }
        e.dataTransfer.setData('textGadgetConfig', JSON.stringify(defaultConfig));
      }}
      style={{
        cursor: placing ? 'wait' : 'pointer',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {lines.map((l, i) => (
            <span key={i} style={{ fontFamily: l.fontFamily, fontSize: Math.min(l.fontSize, 28), color: l.color, whiteSpace: 'nowrap' }}>
              {l.content || (i === 0 ? 'A' : 'B')}
            </span>
          ))}
        </div>
        {added && (
          <span style={{ position: 'absolute', left: 4, top: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 10 }}>
            已添加
          </span>
        )}
        <span style={{ position: 'absolute', left: 4, bottom: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>
          文字
        </span>
        <Button
          type="primary"
          size="small"
          style={{ position: 'absolute', right: 4, top: 4, minWidth: 28, height: 28, padding: 0 }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          loading={placing}
        >
          +
        </Button>
      </div>
      <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ width: '80%', maxWidth: '80%', marginTop: 8, fontSize: 12, marginBottom: 0, minHeight: 38, margin: '8px auto 0', textAlign: 'center' }}>
        {name}
      </Typography.Paragraph>
    </div>
  );
}

/** 同类组卡片：拖拽传 assetBundleId；点击或 + 先选子项再放置 */
function LocalBundleCard({
  bundle,
  projectDir,
  requestAssetBundlePick,
  placeMemberById,
  placing,
}: {
  bundle: AssetBundleListRow;
  projectDir: string;
  requestAssetBundlePick?: (bundleId: string) => Promise<string | null>;
  placeMemberById: (assetId: string) => Promise<void>;
  placing: boolean;
}) {
  const openPickAndPlace = async () => {
    if (!requestAssetBundlePick) return;
    const id = await requestAssetBundlePick(bundle.id);
    if (id) await placeMemberById(id);
  };
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetBundleId', bundle.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => void openPickAndPlace()}
      style={{
        cursor: placing || !requestAssetBundlePick ? 'wait' : 'pointer',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: 'rgba(255,255,255,0.08)' }}>
        {bundle.cover_path ? (
          <AssetThumb projectDir={projectDir} path={bundle.cover_path} size="fullWidth" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>同类组</Text>
          </div>
        )}
        <span
          style={{
            position: 'absolute',
            left: 4,
            bottom: 4,
            padding: '2px 5px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.65)',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 10,
          }}
        >
          组 {bundle.member_count}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            void openPickAndPlace();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              void openPickAndPlace();
            }
          }}
          style={{
            position: 'absolute',
            right: 4,
            top: 4,
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: placing || !requestAssetBundlePick ? 'wait' : 'pointer',
            fontSize: 16,
            color: '#fff',
            lineHeight: '1',
          }}
          title="选择子项并添加"
        >
          +
        </span>
      </div>
      <div style={{ padding: '6px 4px 4px', minHeight: 28 }}>
        <Text ellipsis style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }} title={bundleCardDisplayTitle(bundle)}>
          {bundleCardDisplayTitle(bundle)}
        </Text>
      </div>
    </div>
  );
}

/**
 * 素材卡片（见文档 09 三、Card UI 规范）：
 * - 左上角：「已添加」角标
 * - 左下角：素材类型标签（精灵图/元件/透明视频/图片/视频）
 * - 右上角：+ 添加按钮，点击后添加到时间线主层
 * - 点击卡片主区域：打开对应素材的预览/编辑面板（onPreviewOrEdit）
 * - 拖拽：可拖至时间线轨道放置
 */
function LocalAssetCard({
  id,
  name,
  thumb,
  added,
  onAdd,
  onPreviewOrEdit,
  placing,
  placeDuration = 10,
  assetType = '',
}: {
  id: string;
  name: string;
  thumb?: string;
  added: boolean;
  onAdd: () => void;
  onPreviewOrEdit?: () => void;
  placing: boolean;
  placeDuration?: number;
  assetType?: string;
}) {
  const typeLabel = ASSET_TYPE_LABELS[assetType] || '';
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', id);
        e.dataTransfer.setData('assetDuration', String(placeDuration));
        e.dataTransfer.setData('assetType', assetType);
      }}
      onClick={onPreviewOrEdit}
      style={{
        cursor: placing ? 'wait' : onPreviewOrEdit ? 'pointer' : 'default',
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
              padding: '2px 5px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              fontSize: 10,
            }}
          >
            已添加
          </span>
        )}
        {typeLabel && (
          <span
            style={{
              position: 'absolute',
              left: 4,
              bottom: 4,
              padding: '2px 5px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.65)',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 10,
            }}
          >
            {typeLabel}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (!placing) onAdd();
          }}
          style={{
            position: 'absolute',
            right: 4,
            top: 4,
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: placing ? 'wait' : 'pointer',
            fontSize: 16,
            color: '#fff',
            lineHeight: '1',
          }}
          title="添加到时间线"
        >
          +
        </span>
      </div>
      <div style={{ padding: '6px 4px 4px', minHeight: 28 }}>
        <Text ellipsis style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }} title={name}>
          {name}
        </Text>
      </div>
    </div>
  );
}
