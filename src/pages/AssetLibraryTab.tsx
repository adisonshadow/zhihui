/**
 * 素材库页：按分类筛选、列表/卡片、上传、保存为常用（见功能文档 5、开发计划 2.8）
 * 精灵图与角色精灵动作本质相同，使用项目级精灵图存储，点击「添加精灵图」打开与角色设计相同的编辑侧栏
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Radio,
  Space,
  App,
  Modal,
  Form,
  Input,
  Checkbox,
  Spin,
  Typography,
  Empty,
  Table,
  Dropdown,
} from 'antd';
import { StarOutlined, StarFilled, DeleteOutlined, DownOutlined } from '@ant-design/icons';
import { UI_ASSET_CATEGORIES, addCategoryToTags, type AssetUiCategory, type UiCategoryValue } from '@/utils/assetCategory';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import { ImagePreviewDrawer } from '@/components/asset/ImagePreviewDrawer';
import { TextPreviewDrawer } from '@/components/asset/TextPreviewDrawer';
import { AudioListItem } from '@/components/asset/AudioListItem';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_CATEGORIES } from '@/constants/assetCategories';
import { STANDALONE_SPRITES_CHARACTER_ID, STANDALONE_COMPONENTS_CHARACTER_ID } from '@/constants/project';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import { GroupComponentPanel } from '@/components/character/GroupComponentPanel';
import { AssetCard, AssetBundleCard, AssetThumb, SpriteCard, GroupComponentCard, getGroupCoverPath, IMAGE_TYPES } from '@/components/asset/AssetLibraryCard';
import { AssetBundlePickModal, type AssetBundlePickMember } from '@/components/asset/AssetBundlePickModal';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { AssetBundleListRow } from '@/types/assetBundle';
import { bundleCardDisplayTitle, fetchAssetRowForBundleMemberPreview } from '@/utils/assetBundleUi';

const { Text } = Typography;

const STORAGE_KEY_ASSET_CATEGORY = 'yiman.assetLibrary.category';

interface AssetRow {
  id: string;
  path: string;
  type: string;
  is_favorite: number;
  description: string | null;
  cover_path?: string | null;
  tags?: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetLibraryTabProps {
  project: ProjectInfo;
  /** 设计器素材面板更新时递增，用于同步刷新 */
  assetRefreshKey?: number;
  /** 素材添加成功后调用，用于通知设计器刷新 */
  onAssetAdded?: () => void;
}

export default function AssetLibraryTab({ project, assetRefreshKey, onAssetAdded }: AssetLibraryTabProps) {
  const { message } = App.useApp();
  /** 视觉素材（图片/视频）合并列表，用于布景/道具/特效分类过滤 */
  const [visualAssets, setVisualAssets] = useState<AssetRow[]>([]);
  /** 音频素材（音效/音乐）列表 */
  const [audioAssets, setAudioAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<UiCategoryValue>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ASSET_CATEGORY);
      return saved && UI_ASSET_CATEGORIES.some((c) => c.value === saved) ? (saved as UiCategoryValue) : 'prop';
    } catch {
      return 'prop';
    }
  });
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [spriteSheetPanelOpen, setSpriteSheetPanelOpen] = useState(false);
  const [spriteSheetPanelItem, setSpriteSheetPanelItem] = useState<SpriteSheetItem | null>(null);
  const [standaloneSprites, setStandaloneSprites] = useState<SpriteSheetItem[]>([]);
  const [standaloneComponents, setStandaloneComponents] = useState<GroupComponentItem[]>([]);
  /** 精灵图/元件分类下，用于解析 path -> asset 的映射（添加为常用） */
  const [pathToAsset, setPathToAsset] = useState<Record<string, AssetRow>>({});
  const [groupComponentPanelOpen, setGroupComponentPanelOpen] = useState(false);
  const [groupComponentPanelItem, setGroupComponentPanelItem] = useState<GroupComponentItem | null>(null);
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<AssetRow | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [audioPreviewAsset, setAudioPreviewAsset] = useState<AssetRow | null>(null);
  const [audioPreviewOpen, setAudioPreviewOpen] = useState(false);
  const [imagePreviewAsset, setImagePreviewAsset] = useState<AssetRow | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [textPreviewAsset, setTextPreviewAsset] = useState<AssetRow | null>(null);
  const [textPreviewOpen, setTextPreviewOpen] = useState(false);
  const [assetBundles, setAssetBundles] = useState<AssetBundleListRow[]>([]);
  const [bundlePickId, setBundlePickId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const playingAudioRef = useRef<{ id: string; el: HTMLAudioElement } | null>(null);
  const [audioSearch, setAudioSearch] = useState('');
  /** 当前正在上传的资产类型（image/video/sfx/music），由添加按钮触发 */
  const [pendingUploadType, setPendingUploadType] = useState<string>('image');
  const [form] = Form.useForm<{ is_favorite: boolean; description: string; name?: string; tags?: string }>();
  const projectDir = project.project_dir;

  const isVisualCategory = categoryFilter === 'scene' || categoryFilter === 'prop' || categoryFilter === 'effect';
  const isSoundCategory = categoryFilter === 'sound';
  const isTextCategory = categoryFilter === 'text';

  /** 加载视觉素材（按 UI 分类：布景/道具/特效，服务端已按 created_at DESC 排序） */
  const loadVisualAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssetsByUiCategory) return;
    setLoading(true);
    try {
      const list = (await window.yiman.project.getAssetsByUiCategory(
        projectDir,
        categoryFilter as 'scene' | 'prop' | 'effect'
      )) as AssetRow[];
      setVisualAssets(list || []);
    } catch {
      message.error('加载素材失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, categoryFilter, message]);

  /** 加载音频素材（按 UI 分类：声音，服务端已按 created_at DESC 排序） */
  const loadAudioAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssetsByUiCategory) return;
    setLoading(true);
    try {
      const list = (await window.yiman.project.getAssetsByUiCategory(projectDir, 'sound')) as AssetRow[];
      setAudioAssets(list || []);
    } catch {
      message.error('加载素材失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, message]);

  const handleCategoryChange = (v: string) => {
    setCategoryFilter(v as UiCategoryValue);
    try {
      localStorage.setItem(STORAGE_KEY_ASSET_CATEGORY, v);
    } catch {
      /* ignore */
    }
  };

  const loadAssetBundles = useCallback(async () => {
    if (!window.yiman?.project?.getAssetBundlesByUiCategory) return;
    if (isVisualCategory) {
      const list = await window.yiman.project.getAssetBundlesByUiCategory(
        projectDir,
        categoryFilter as 'scene' | 'prop' | 'effect'
      );
      setAssetBundles((list as AssetBundleListRow[]) || []);
    } else if (isSoundCategory) {
      const list = await window.yiman.project.getAssetBundlesByUiCategory(projectDir, 'sound');
      setAssetBundles((list as AssetBundleListRow[]) || []);
    } else setAssetBundles([]);
  }, [projectDir, categoryFilter, isVisualCategory, isSoundCategory]);

  useEffect(() => {
    if (isVisualCategory) loadVisualAssets();
    else if (isSoundCategory) loadAudioAssets();
  }, [isVisualCategory, isSoundCategory, loadVisualAssets, loadAudioAssets, assetRefreshKey]);

  useEffect(() => {
    void loadAssetBundles();
  }, [loadAssetBundles, assetRefreshKey]);

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
    if (isVisualCategory) loadStandaloneSprites();
  }, [isVisualCategory, loadStandaloneSprites, assetRefreshKey]);

  const loadStandaloneComponents = useCallback(async () => {
    if (!window.yiman?.project?.getOrCreateStandaloneComponentsCharacter) return;
    const char = (await window.yiman.project.getOrCreateStandaloneComponentsCharacter(projectDir)) as {
      component_groups?: string | null;
    };
    try {
      const arr = char?.component_groups ? (JSON.parse(char.component_groups) as GroupComponentItem[]) : [];
      setStandaloneComponents(Array.isArray(arr) ? [...arr].reverse() : []);
    } catch {
      setStandaloneComponents([]);
    }
  }, [projectDir]);

  useEffect(() => {
    if (isVisualCategory) loadStandaloneComponents();
  }, [isVisualCategory, loadStandaloneComponents, assetRefreshKey]);

  const loadPathToAsset = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    // 加载全部资产（精灵图/元件封面可能为 image/character/sprite 等类型）
    const list = await window.yiman.project.getAssets(projectDir);
    const arr = (list as AssetRow[]) || [];
    const m: Record<string, AssetRow> = {};
    for (const a of arr) m[a.path] = a;
    setPathToAsset(m);
  }, [projectDir]);

  useEffect(() => {
    if (!isVisualCategory) return;
    loadPathToAsset();
  }, [isVisualCategory, loadPathToAsset]);

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
        onAssetAdded?.();
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, standaloneSprites, loadStandaloneSprites, message, onAssetAdded]
  );

  const handleGroupComponentSave = useCallback(
    async (updated: GroupComponentItem) => {
      const next = standaloneComponents.some((g) => g.id === updated.id)
        ? standaloneComponents.map((g) => (g.id === updated.id ? updated : g))
        : [...standaloneComponents, updated];
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_COMPONENTS_CHARACTER_ID, {
        component_groups: JSON.stringify(next),
      });
      if (res?.ok) {
        loadStandaloneComponents();
        onAssetAdded?.();
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, standaloneComponents, loadStandaloneComponents, message, onAssetAdded]
  );

  const handleAddGroupComponent = useCallback(async () => {
    await window.yiman?.project?.getOrCreateStandaloneComponentsCharacter?.(projectDir);
    const newId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const defaultStateId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: GroupComponentItem = {
      id: newId,
      name: '元件',
      states: [{ id: defaultStateId, tags: [], items: [] }],
      uiCategory: (isVisualCategory ? categoryFilter : 'prop') as AssetUiCategory,
    };
    const next = [...standaloneComponents, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_COMPONENTS_CHARACTER_ID, {
      component_groups: JSON.stringify(next),
    });
    if (res?.ok) {
      loadStandaloneComponents();
      setGroupComponentPanelItem(newItem);
      setGroupComponentPanelOpen(true);
      onAssetAdded?.();
    } else {
      message.error(res?.error || '添加失败');
    }
  }, [projectDir, standaloneComponents, loadStandaloneComponents, message, onAssetAdded]);

  /** 视频变更分类到角色：把 asset 加入 character.transparent_videos（从 VideoPreviewDrawer 回调） */
  const handleVideoAssetCategoryChange = useCallback(
    async (assetId: string, category: string, targetCharacterId?: string) => {
      if (category !== 'character' || !targetCharacterId || !window.yiman?.project?.getCharacters || !window.yiman?.project?.updateCharacter) return;
      const list = (await window.yiman.project.getCharacters(projectDir)) as { id: string; transparent_videos?: string | null }[];
      const charData = list.find((c) => c.id === targetCharacterId);
      const existing = (() => {
        if (!charData?.transparent_videos?.trim()) return [];
        try {
          const arr = JSON.parse(charData.transparent_videos) as { id: string; asset_id: string }[];
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      })();
      if (existing.some((v) => v.asset_id === assetId)) {
        message.warning('该视频已在此角色中');
        return;
      }
      const newItem = { id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, asset_id: assetId };
      const next = [...existing, newItem];
      const res = await window.yiman.project.updateCharacter(projectDir, targetCharacterId, { transparent_videos: JSON.stringify(next) });
      if (res?.ok) {
        message.success('已移动到角色');
      } else {
        message.error(res?.error || '操作失败');
      }
    },
    [projectDir, message]
  );

  const handleDeleteGroupComponent = useCallback(
    async (item: GroupComponentItem) => {
      const next = standaloneComponents.filter((g) => g.id !== item.id);
      const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_COMPONENTS_CHARACTER_ID, {
        component_groups: JSON.stringify(next),
      });
      if (res?.ok) {
        message.success('已删除');
        loadStandaloneComponents();
      } else {
        message.error(res?.error || '删除失败');
      }
    },
    [projectDir, standaloneComponents, loadStandaloneComponents, message]
  );

  const handleAddSpriteSheet = useCallback(async () => {
    await window.yiman?.project?.getOrCreateStandaloneSpritesCharacter?.(projectDir);
    const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: SpriteSheetItem = {
      id: newId,
      name: '精灵动作',
      image_path: '',
      uiCategory: (isVisualCategory ? categoryFilter : 'prop') as AssetUiCategory,
    };
    const next = [...standaloneSprites, newItem];
    const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
      sprite_sheets: JSON.stringify(next),
    });
    if (res?.ok) {
      loadStandaloneSprites();
      setSpriteSheetPanelItem(newItem);
      setSpriteSheetPanelOpen(true);
      onAssetAdded?.();
    } else {
      message.error(res?.error || '添加失败');
    }
  }, [projectDir, standaloneSprites, loadStandaloneSprites, message, onAssetAdded]);

  const handleDeleteSprite = useCallback(
    async (sprite: SpriteSheetItem) => {
      Modal.confirm({
        title: '确认删除',
        content: `确定删除精灵图「${sprite.name || '未命名'}」？`,
        onOk: async () => {
          const next = standaloneSprites.filter((s) => s.id !== sprite.id);
          const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
            sprite_sheets: JSON.stringify(next),
          });
          if (res?.ok) {
            message.success('已删除');
            loadStandaloneSprites();
          } else {
            message.error(res?.error || '删除失败');
          }
        },
      });
    },
    [projectDir, standaloneSprites, loadStandaloneSprites, message]
  );

  /** 视觉素材（API 已按分类 + created_at DESC 返回，此处仅应用「仅常用」过滤） */
  const filteredVisualAssets = React.useMemo(() => {
    if (favoriteOnly) return visualAssets.filter((a) => a.is_favorite);
    return visualAssets;
  }, [visualAssets, favoriteOnly]);

  /** 按当前分类过滤的独立精灵图 */
  const filteredSprites = React.useMemo(
    () => standaloneSprites.filter((s) => (s.uiCategory ?? 'prop') === categoryFilter),
    [standaloneSprites, categoryFilter]
  );

  /** 按当前分类过滤的独立元件 */
  const filteredComponents = React.useMemo(
    () => standaloneComponents.filter((g) => (g.uiCategory ?? 'prop') === categoryFilter),
    [standaloneComponents, categoryFilter]
  );

  const filteredAssetBundles = React.useMemo(() => {
    let list = assetBundles;
    if (favoriteOnly) list = list.filter((b) => b.is_favorite);
    return list;
  }, [assetBundles, favoriteOnly]);

  type UnifiedItem =
    | { kind: 'asset'; data: AssetRow; sortTime: number }
    | { kind: 'bundle'; data: AssetBundleListRow; sortTime: number }
    | { kind: 'sprite'; data: SpriteSheetItem; sortTime: number }
    | { kind: 'component'; data: GroupComponentItem; sortTime: number };

  /** 所有类型合并后按时间倒序排列，最新的排在最前 */
  const unifiedItems = React.useMemo<UnifiedItem[]>(() => {
    const extractTs = (id: string) => {
      const m = id.match(/_(\d{10,})_/);
      return m ? parseInt(m[1], 10) : 0;
    };
    const items: UnifiedItem[] = [
      ...filteredVisualAssets.map((a) => ({
        kind: 'asset' as const,
        data: a,
        sortTime: new Date(a.updated_at || a.created_at).getTime(),
      })),
      ...filteredAssetBundles.map((b) => ({
        kind: 'bundle' as const,
        data: b,
        sortTime: new Date(b.updated_at || b.created_at).getTime(),
      })),
      ...filteredSprites.map((s) => ({
        kind: 'sprite' as const,
        data: s,
        sortTime: extractTs(s.id),
      })),
      ...filteredComponents.map((g) => ({
        kind: 'component' as const,
        data: g,
        sortTime: extractTs(g.id),
      })),
    ];
    return items.sort((a, b) => b.sortTime - a.sortTime);
  }, [filteredVisualAssets, filteredAssetBundles, filteredSprites, filteredComponents]);

  /** 音频分类下的同类组（关键词过滤） */
  const filteredAudioBundles = React.useMemo(() => {
    if (!isSoundCategory) return [];
    const kw = (audioSearch || '').trim().toLowerCase();
    let list = assetBundles;
    if (kw) {
      list = list.filter((b) => {
        const t = (b.title || '').toLowerCase();
        const tags = (b.tags || '').toLowerCase();
        const fb = (b.first_member_fallback || '').toLowerCase();
        return t.includes(kw) || tags.includes(kw) || fb.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [assetBundles, isSoundCategory, audioSearch]);

  /** 音频列表（音效在前、音乐在后），支持关键词过滤 */
  const filteredAudio = React.useMemo(() => {
    if (!isSoundCategory) return [];
    let list = audioAssets;
    const kw = (audioSearch || '').trim().toLowerCase();
    if (kw) {
      list = list.filter((a) => {
        const desc = (a.description || '').toLowerCase();
        const path = (a.path || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        return desc.includes(kw) || path.includes(kw) || tags.includes(kw);
      });
    }
    return [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [audioAssets, isSoundCategory, audioSearch]);

  const toggleBundleFavorite = async (bundle: AssetBundleListRow) => {
    const res = await window.yiman?.project?.updateAssetBundle?.(projectDir, bundle.id, {
      is_favorite: bundle.is_favorite ? 0 : 1,
    });
    if (res?.ok) reloadCurrentCategory();
    else message.error(res?.error || '操作失败');
  };

  const handleDeleteBundle = (bundleId: string) => {
    Modal.confirm({
      title: '解散同类组',
      content: '将移除组关系，不删除组内素材文件。确定？',
      onOk: async () => {
        const res = await window.yiman?.project?.deleteAssetBundle?.(projectDir, bundleId);
        if (res?.ok) {
          message.success('已解散');
          reloadCurrentCategory();
        } else message.error(res?.error || '操作失败');
      },
    });
  };

  const previewMemberFromBundle = async (m: AssetBundlePickMember) => {
    const row = (await fetchAssetRowForBundleMemberPreview(projectDir, m)) as AssetRow | null;
    if (!row) return;
    const t = row.type || '';
    if (t === 'video' || t === 'transparent_video') {
      setVideoPreviewAsset(row);
      setVideoPreviewOpen(true);
    } else if (IMAGE_TYPES.includes(t) || t === 'image') {
      setImagePreviewAsset(row);
      setImagePreviewOpen(true);
    } else if (t === 'sfx' || t === 'music') {
      setAudioPreviewAsset(row);
      setAudioPreviewOpen(true);
    }
  };

  const handleUpload = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const isAudio = pendingUploadType === 'sfx' || pendingUploadType === 'music';
    const isVideo = pendingUploadType === 'video';
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: isVideo
        ? [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
        : isAudio
          ? [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }]
          : [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description = values.name?.trim() || fileName || null;
    const rawTags = (values.tags ?? '').trim() || null;
    const tags = isVisualCategory
      ? addCategoryToTags(rawTags, categoryFilter as AssetUiCategory)
      : rawTags;
    setUploading(true);
    try {
      let res: { ok: boolean; error?: string; id?: string };
      if (window.yiman?.project?.saveAssetFromFile) {
        res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, pendingUploadType, {
          description,
          is_favorite: values.is_favorite ? 1 : 0,
          tags,
        });
      } else {
        message.error('上传功能未就绪');
        return;
      }
      if (res?.ok) {
        message.success('已上传并入库');
        setUploadModalOpen(false);
        form.resetFields();
        if (isVisualCategory) {
          // 乐观更新：立即将新素材加入列表，避免刷新延迟导致看不到（见 issue：透明视频上传后道具分类不显示）
          const newId = (res as { id?: string }).id;
          if (newId && window.yiman?.project?.getAssetById) {
            try {
              const fresh = (await window.yiman.project.getAssetById(projectDir, newId)) as AssetRow | null;
              if (fresh) {
                setVisualAssets((prev) => [fresh, ...prev.filter((a) => a.id !== newId)]);
              }
            } catch {
              /* 乐观更新失败时仍依赖 loadVisualAssets */
            }
          }
          loadVisualAssets();
          loadPathToAsset();
        } else if (isSoundCategory) {
          loadAudioAssets();
        }
        onAssetAdded?.();
      } else message.error(res?.error || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const reloadCurrentCategory = useCallback(() => {
    if (isVisualCategory) { loadVisualAssets(); loadPathToAsset(); }
    else if (isSoundCategory) loadAudioAssets();
    void loadAssetBundles();
  }, [isVisualCategory, isSoundCategory, loadVisualAssets, loadAudioAssets, loadPathToAsset, loadAssetBundles]);

  const toggleFavorite = async (id: string, current: number) => {
    const res = await window.yiman?.project?.updateAsset(projectDir, id, { is_favorite: current ? 0 : 1 });
    if (res?.ok) reloadCurrentCategory();
    else message.error(res?.error || '操作失败');
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '仅从素材库索引移除，不删除本地文件。确定？',
      onOk: async () => {
        const res = await window.yiman?.project?.deleteAsset(projectDir, id);
        if (res?.ok) {
          message.success('已移除');
          reloadCurrentCategory();
        } else message.error(res?.error || '删除失败');
      },
    });
  };

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

  /** 视觉分类添加菜单（图片/精灵图/元件/视频） */
  const visualAddMenuItems = [
    { key: 'image', label: '图片' },
    { key: 'sprite', label: '精灵图' },
    { key: 'component', label: '元件' },
    { key: 'video', label: '视频' },
  ];

  const handleVisualAdd = ({ key }: { key: string }) => {
    if (key === 'sprite') {
      handleAddSpriteSheet();
    } else if (key === 'component') {
      handleAddGroupComponent();
    } else {
      setPendingUploadType(key);
      setUploadModalOpen(true);
    }
  };

  const uploadModalTitle = pendingUploadType === 'video'
    ? '上传视频'
    : pendingUploadType === 'sfx'
      ? '上传音效'
      : pendingUploadType === 'music'
        ? '上传音乐'
        : '上传图片';

  const uploadOkText = pendingUploadType === 'video'
    ? '选择视频并上传'
    : pendingUploadType === 'sfx' || pendingUploadType === 'music'
      ? '选择音频并上传'
      : '选择图片并上传';

  return (
    <div style={{ padding: '0', height: '100%' }}>
      <AdaptiveCard size="small" style={{ marginBottom: 16 }}
        headerStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        headerHeight={40}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Space>
              <Radio.Group
                block
                optionType="button"
                buttonStyle="solid"
                value={categoryFilter}
                onChange={(e) => handleCategoryChange(e.target.value)}
                size="small"
                options={UI_ASSET_CATEGORIES.map((t) => ({ value: t.value, label: t.label }))}
              />
              {isVisualCategory && (
                <>
                  <Checkbox checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)}>
                    仅常用
                  </Checkbox>
                  <Radio.Group value={viewMode} buttonStyle="solid" onChange={(e) => setViewMode(e.target.value)} optionType="button" size="small" options={[{ value: 'card', label: '卡片' }, { value: 'list', label: '列表' }]} />
                </>
              )}
              {isSoundCategory && (
                <Input.Search
                  placeholder="模糊搜索"
                  allowClear
                  size="small"
                  value={audioSearch}
                  onChange={(e) => setAudioSearch(e.target.value)}
                  style={{ width: 120 }}
                />
              )}
            </Space>
            {isVisualCategory && (
              <Dropdown menu={{ items: visualAddMenuItems, onClick: handleVisualAdd }} trigger={['click']}>
                <Button type="primary" size="small">
                  添加 <DownOutlined />
                </Button>
              </Dropdown>
            )}
            {isSoundCategory && (
              <Space>
                <Button type="primary" size="small" onClick={() => { setPendingUploadType('sfx'); setUploadModalOpen(true); }}>上传音效</Button>
                <Button size="small" onClick={() => { setPendingUploadType('music'); setUploadModalOpen(true); }}>上传音乐</Button>
              </Space>
            )}
          </div>
        }
      >
        <Spin spinning={loading}>
          {isTextCategory ? (
            <Empty description="文字素材功能即将上线" style={{ marginTop: 48 }} />
          ) : isSoundCategory ? (
            filteredAudio.length === 0 && filteredAudioBundles.length === 0 ? (
              <Empty description="暂无音频素材，点击「上传音效/上传音乐」添加" style={{ marginTop: 48 }} />
            ) : (
              <ResponsiveCardGrid minItemWidth={240}>
                {filteredAudioBundles.map((b) => (
                  <div key={`bundle:${b.id}`} style={{ padding: 8 }}>
                    <AdaptiveCard
                      size="small"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setBundlePickId(b.id)}
                      header={`${bundleCardDisplayTitle(b)}（${b.member_count} 个）`}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        点击展开选择子项或预览
                      </Text>
                      <Space style={{ marginTop: 8 }}>
                        <Button type="text" size="small" icon={b.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={(e) => { e.stopPropagation(); toggleBundleFavorite(b); }} />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDeleteBundle(b.id); }} />
                      </Space>
                    </AdaptiveCard>
                  </div>
                ))}
                {filteredAudio.map((a) => (
                  <AudioListItem
                    key={a.id}
                    asset={a}
                    isPlaying={playingAudioId === a.id}
                    onPlay={() => handleAudioPlay(a)}
                    onEdit={() => { setAudioPreviewAsset(a); setAudioPreviewOpen(true); }}
                    onFavorite={() => toggleFavorite(a.id, a.is_favorite)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
              </ResponsiveCardGrid>
            )
          ) : isVisualCategory && viewMode === 'list' ? (
            <Table
              dataSource={filteredVisualAssets}
              rowKey="id"
              virtual
              scroll={{ x: 600, y: 400 }}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '缩略图',
                  dataIndex: 'path',
                  width: 64,
                  render: (_, r) => <AssetThumb projectDir={projectDir} path={r.path} coverPath={r.cover_path} size={48} />,
                },
                {
                  title: '路径',
                  dataIndex: 'path',
                  key: 'pathText',
                  ellipsis: true,
                  render: (path: string) => <Text ellipsis>{path}</Text>,
                },
                {
                  title: '类型',
                  dataIndex: 'type',
                  width: 90,
                  render: (type) => ASSET_CATEGORIES.find((t) => t.value === type)?.label ?? type,
                },
                {
                  title: '描述',
                  dataIndex: 'description',
                  ellipsis: true,
                  render: (d) => d ?? '-',
                },
                {
                  title: '',
                  key: 'actions',
                  width: 80,
                  render: (_, r) => (
                    <Space>
                      {(r.type === 'video' || r.type === 'transparent_video') && (
                        <Button type="link" size="small" onClick={() => { setVideoPreviewAsset(r); setVideoPreviewOpen(true); }}>预览</Button>
                      )}
                      <Button type="text" size="small" icon={r.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFavorite(r.id, r.is_favorite)} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
                    </Space>
                  ),
                },
              ]}
            />
          ) : (
            <>
              {unifiedItems.length === 0 ? (
                <Empty description="暂无素材，点击「添加」导入" style={{ marginTop: 48 }} />
              ) : (
                <ResponsiveCardGrid>
                  {unifiedItems.map((item) => {
                    if (item.kind === 'bundle') {
                      const b = item.data;
                      return (
                        <AssetBundleCard
                          key={`bundle:${b.id}`}
                          projectDir={projectDir}
                          bundle={b}
                          onOpen={() => setBundlePickId(b.id)}
                          onFavorite={() => toggleBundleFavorite(b)}
                          onDeleteBundle={() => handleDeleteBundle(b.id)}
                        />
                      );
                    }
                    if (item.kind === 'asset') {
                      const a = item.data;
                      return (
                        <AssetCard
                          key={a.id}
                          projectDir={projectDir}
                          asset={a}
                          onFavorite={() => toggleFavorite(a.id, a.is_favorite)}
                          onDelete={() => handleDelete(a.id)}
                          onVideoPreview={
                            (a.type === 'video' || a.type === 'transparent_video')
                              ? () => { setVideoPreviewAsset(a); setVideoPreviewOpen(true); }
                              : undefined
                          }
                          onImagePreview={
                            IMAGE_TYPES.includes(a.type)
                              ? () => { setImagePreviewAsset(a); setImagePreviewOpen(true); }
                              : undefined
                          }
                        />
                      );
                    }
                    if (item.kind === 'sprite') {
                      const s = item.data;
                      const asset = (s.cover_path || s.image_path) ? pathToAsset[s.cover_path || s.image_path!] : undefined;
                      return (
                        <SpriteCard
                          key={s.id}
                          projectDir={projectDir}
                          sprite={s}
                          asset={asset}
                          onEdit={() => { setSpriteSheetPanelItem(s); setSpriteSheetPanelOpen(true); }}
                          onFavorite={asset ? () => toggleFavorite(asset.id, asset.is_favorite).then(() => loadPathToAsset()) : undefined}
                          onDelete={() => handleDeleteSprite(s)}
                        />
                      );
                    }
                    const g = item.data;
                    const coverPath = getGroupCoverPath(g, standaloneSprites);
                    const asset = coverPath ? pathToAsset[coverPath] : undefined;
                    return (
                      <GroupComponentCard
                        key={g.id}
                        projectDir={projectDir}
                        item={g}
                        spriteSheets={standaloneSprites}
                        onEdit={() => { setGroupComponentPanelItem(g); setGroupComponentPanelOpen(true); }}
                        onDelete={() => handleDeleteGroupComponent(g)}
                        onFavorite={asset ? () => toggleFavorite(asset.id, asset.is_favorite).then(() => loadPathToAsset()) : undefined}
                        asset={asset}
                      />
                    );
                  })}
                </ResponsiveCardGrid>
              )}
            </>
          )}
        </Spin>
      </AdaptiveCard>

      <Modal
        title={uploadModalTitle}
        open={uploadModalOpen}
        onCancel={() => { setUploadModalOpen(false); form.resetFields(); }}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText={uploadOkText}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ is_favorite: false, name: '', tags: '', chromaKeyColor: 'auto' }}
        >
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          <Form.Item name="tags" label="标签（可选）">
            <VideoTagInput />
          </Form.Item>
          {(pendingUploadType === 'sfx' || pendingUploadType === 'music') && (
            <Form.Item name="is_favorite" valuePropName="checked">
              <Checkbox>保存为常用</Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <VideoPreviewDrawer
        open={videoPreviewOpen}
        onClose={() => { setVideoPreviewOpen(false); setVideoPreviewAsset(null); }}
        projectDir={projectDir}
        asset={videoPreviewAsset}
        onUpdate={reloadCurrentCategory}
        onChangeCategory={handleVideoAssetCategoryChange}
        onReprocessComplete={async (assetId) => {
          reloadCurrentCategory();
          onAssetAdded?.();
          if (videoPreviewAsset?.id === assetId && window.yiman?.project?.getAssetById) {
            const fresh = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
            if (fresh) setVideoPreviewAsset(fresh);
          }
        }}
        onSpriteSaved={async (result) => {
          if (!result.path) return;
          await window.yiman?.project?.getOrCreateStandaloneSpritesCharacter?.(projectDir);
          const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const newItem: SpriteSheetItem = {
            id: newId,
            name: '精灵动作',
            image_path: result.path,
            frames: result.frames,
            uiCategory: (isVisualCategory ? categoryFilter : 'prop') as AssetUiCategory,
          };
          const next = [...standaloneSprites, newItem];
          const res = await window.yiman?.project?.updateCharacter?.(projectDir, STANDALONE_SPRITES_CHARACTER_ID, {
            sprite_sheets: JSON.stringify(next),
          });
          if (res?.ok) {
            loadStandaloneSprites();
            onAssetAdded?.();
          }
        }}
        saveAssetFromFile={async (dir, filePath, type, opt) =>
          (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type, opt)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
      <AudioPreviewDrawer
        open={audioPreviewOpen}
        onClose={() => { setAudioPreviewOpen(false); setAudioPreviewAsset(null); }}
        projectDir={projectDir}
        asset={audioPreviewAsset}
        onUpdate={reloadCurrentCategory}
        saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
      <ImagePreviewDrawer
        open={imagePreviewOpen}
        onClose={() => { setImagePreviewOpen(false); setImagePreviewAsset(null); }}
        projectDir={projectDir}
        asset={imagePreviewAsset}
        onUpdate={async (opts) => {
          reloadCurrentCategory();
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
      <TextPreviewDrawer
        open={textPreviewOpen}
        onClose={() => { setTextPreviewOpen(false); setTextPreviewAsset(null); }}
        projectDir={projectDir}
        asset={textPreviewAsset}
        onUpdate={reloadCurrentCategory}
      />
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
      {groupComponentPanelOpen && (
        <GroupComponentPanel
          open={groupComponentPanelOpen}
          onClose={() => {
            setGroupComponentPanelOpen(false);
            setGroupComponentPanelItem(null);
          }}
          projectDir={projectDir}
          characterId={STANDALONE_COMPONENTS_CHARACTER_ID}
          item={groupComponentPanelItem}
          onSave={handleGroupComponentSave}
          spriteSheets={standaloneSprites}
          componentGroups={standaloneComponents.filter((g) => g.id !== groupComponentPanelItem?.id)}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          saveAssetFromBase64={(dir, base64, ext, type) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
          matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false, error: '未就绪' })}
        />
      )}
      <AssetBundlePickModal
        open={!!bundlePickId}
        bundleId={bundlePickId}
        projectDir={projectDir}
        mode="library"
        title="素材包 · 选择子项"
        onCancel={() => setBundlePickId(null)}
        onPreviewMember={(m) => {
          previewMemberFromBundle(m);
          setBundlePickId(null);
        }}
      />
    </div>
  );
}

