/**
 * 素材库页：按分类筛选、列表/卡片、上传、保存为常用（见功能文档 5、开发计划 2.8）
 * 精灵图与人物精灵动作本质相同，使用项目级精灵图存储，点击「添加精灵图」打开与人物设计相同的编辑侧栏
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Radio,
  Select,
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
} from 'antd';
import { PlusOutlined, StarOutlined, StarFilled, DeleteOutlined } from '@ant-design/icons';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import { ImagePreviewDrawer } from '@/components/asset/ImagePreviewDrawer';
import { AudioListItem } from '@/components/asset/AudioListItem';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_CATEGORIES, ASSET_LIBRARY_CATEGORIES, type AssetCategoryValue } from '@/constants/assetCategories';
import { STANDALONE_SPRITES_CHARACTER_ID, STANDALONE_COMPONENTS_CHARACTER_ID } from '@/constants/project';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import { GroupComponentPanel } from '@/components/character/GroupComponentPanel';
import { AssetCard, AssetThumb, SpriteCard, GroupComponentCard, getGroupCoverPath, IMAGE_TYPES } from '@/components/asset/AssetLibraryCard';
import type { GroupComponentItem } from '@/types/groupComponent';

const { TextArea } = Input;
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
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ASSET_CATEGORY);
      return saved && ASSET_LIBRARY_CATEGORIES.some((c) => c.value === saved) ? saved : 'image';
    } catch {
      return 'image';
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
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const playingAudioRef = useRef<{ id: string; el: HTMLAudioElement } | null>(null);
  const [audioSearch, setAudioSearch] = useState('');
  const [form] = Form.useForm<{ type: AssetCategoryValue; is_favorite: boolean; description: string; name?: string; tags?: string; chromaKeyColor?: 'auto' | 'black' | 'green' | 'purple' }>();
  const projectDir = project.project_dir;

  const isSpriteCategory = typeFilter === 'sprite';
  const isComponentCategory = typeFilter === 'component';
  const isImageCategory = typeFilter === 'image';
  const isVideoCategory = typeFilter === 'video' || typeFilter === 'transparent_video';
  const isAudioCategory = typeFilter === 'sfx' || typeFilter === 'music';

  const loadAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    setLoading(true);
    try {
      const list = await window.yiman.project.getAssets(projectDir, typeFilter);
      setAssets(list as AssetRow[]);
    } catch {
      message.error('加载素材失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, typeFilter, message]);

  const handleCategoryChange = (v: string) => {
    setTypeFilter(v);
    try {
      localStorage.setItem(STORAGE_KEY_ASSET_CATEGORY, v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadAssets();
  }, [loadAssets, assetRefreshKey]);

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
    if (isSpriteCategory || isComponentCategory) loadStandaloneSprites();
  }, [isSpriteCategory, isComponentCategory, loadStandaloneSprites]);

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
    if (isComponentCategory) loadStandaloneComponents();
  }, [isComponentCategory, loadStandaloneComponents]);

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
    if (!isSpriteCategory && !isComponentCategory) return;
    loadPathToAsset();
  }, [isSpriteCategory, isComponentCategory, loadPathToAsset]);

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
    const newItem: SpriteSheetItem = { id: newId, name: '精灵动作', image_path: '' };
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

  const filtered = favoriteOnly ? assets.filter((a) => a.is_favorite) : assets;
  const filteredAudio = React.useMemo(() => {
    if (!isAudioCategory) return filtered;
    let list = filtered;
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
  }, [filtered, isAudioCategory, audioSearch]);

  const handleUpload = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const isVideo = isVideoCategory;
    const isAudio = isAudioCategory;
    const isTransparent = typeFilter === 'transparent_video';
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: isVideo
        ? [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
        : isAudio
          ? [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }]
          : isImageCategory
            ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
            : [{ name: '素材', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'webm'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description =
      isVideo || isAudio || isImageCategory ? (values.name?.trim() || fileName || null) : (values.description?.trim() || null);
    const tags = (values.tags ?? '').trim() || null;
    setUploading(true);
    try {
      const type = isVideo || isAudio || isImageCategory ? typeFilter : values.type;
      let res: { ok: boolean; error?: string };
      if (isTransparent && window.yiman?.project?.saveTransparentVideoAsset) {
        const color = (values.chromaKeyColor ?? 'auto') as 'auto' | 'black' | 'green' | 'purple';
        res = await window.yiman.project.saveTransparentVideoAsset(projectDir, filePath, color, {
          description,
          is_favorite: values.is_favorite ? 1 : 0,
          tags,
        });
      } else if (window.yiman?.project?.saveAssetFromFile) {
        res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, type, {
          description,
          is_favorite: isImageCategory ? 0 : (values.is_favorite ? 1 : 0),
          tags,
        });
      } else {
        message.error(isTransparent ? '透明视频功能未就绪' : '上传功能未就绪');
        return;
      }
      if (res?.ok) {
        message.success('已上传并入库');
        setUploadModalOpen(false);
        form.resetFields();
        loadAssets();
        onAssetAdded?.();
      } else message.error(res?.error || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const toggleFavorite = async (id: string, current: number) => {
    const res = await window.yiman?.project?.updateAsset(projectDir, id, { is_favorite: current ? 0 : 1 });
    if (res?.ok) loadAssets();
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
          loadAssets();
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

  return (
    <div style={{ padding: '0' , height: '100%' }}>
      <AdaptiveCard size="small" style={{ marginBottom: 16 }}
        headerStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        headerHeight={40}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <Radio.Group
                block
                optionType="button"
                buttonStyle="solid"
                value={typeFilter}
                onChange={(e) => handleCategoryChange(e.target.value)}
                size="small"
                options={ASSET_LIBRARY_CATEGORIES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <Checkbox checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)}>
                仅常用
              </Checkbox>
              {!isAudioCategory && (
                <Radio.Group value={viewMode} buttonStyle="solid" onChange={(e) => setViewMode(e.target.value)} optionType="button" size="small" options={[{ value: 'list', label: '列表' }, { value: 'card', label: '卡片' }]} />
              )}
              {isAudioCategory && (
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
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={
                isComponentCategory
                  ? handleAddGroupComponent
                  : isSpriteCategory
                    ? handleAddSpriteSheet
                    : () => setUploadModalOpen(true)
              }
            >
              {isComponentCategory ? '新建元件' : isSpriteCategory ? '添加精灵图' : isImageCategory ? '上传' : isVideoCategory ? (typeFilter === 'transparent_video' ? '上传透明视频' : '上传视频') : isAudioCategory ? (typeFilter === 'sfx' ? '上传音效' : '上传音乐') : '上传'}
            </Button>
          </div>
        }
      >

        <Spin spinning={loading && !isSpriteCategory && !isComponentCategory}>
          {isComponentCategory ? (
            standaloneComponents.length === 0 ? (
              <Empty description="暂无元件，点击「新建元件」添加" style={{ marginTop: 48 }} />
            ) : (
              <ResponsiveCardGrid>
                {standaloneComponents.map((g) => {
                  const coverPath = getGroupCoverPath(g, standaloneSprites);
                  const asset = coverPath ? pathToAsset[coverPath] : undefined;
                  return (
                    <GroupComponentCard
                      key={g.id}
                      projectDir={projectDir}
                      item={g}
                      spriteSheets={standaloneSprites}
                      onEdit={() => {
                        setGroupComponentPanelItem(g);
                        setGroupComponentPanelOpen(true);
                      }}
                      onDelete={() => handleDeleteGroupComponent(g)}
                      onFavorite={asset ? () => toggleFavorite(asset.id, asset.is_favorite).then(() => loadPathToAsset()) : undefined}
                      asset={asset}
                    />
                  );
                })}
              </ResponsiveCardGrid>
            )
          ) : isSpriteCategory ? (
            standaloneSprites.length === 0 ? (
              <Empty description="暂无精灵图，点击「添加精灵图」添加" style={{ marginTop: 48 }} />
            ) : (
              <ResponsiveCardGrid>
                {standaloneSprites.map((s) => {
                  const asset = (s.cover_path || s.image_path) ? pathToAsset[s.cover_path || s.image_path!] : undefined;
                  return (
                    <SpriteCard
                      key={s.id}
                      projectDir={projectDir}
                      sprite={s}
                      asset={asset}
                      onEdit={() => {
                        setSpriteSheetPanelItem(s);
                        setSpriteSheetPanelOpen(true);
                      }}
                      onFavorite={asset ? () => toggleFavorite(asset.id, asset.is_favorite).then(() => loadPathToAsset()) : undefined}
                      onDelete={() => handleDeleteSprite(s)}
                    />
                  );
                })}
              </ResponsiveCardGrid>
            )
          ) : isAudioCategory ? (
            filteredAudio.length === 0 ? (
              <Empty description={(assets.length === 0 ? `暂无${typeFilter === 'sfx' ? '音效' : '音乐'}，点击「上传${typeFilter === 'sfx' ? '音效' : '音乐'}」添加` : '无匹配结果')} style={{ marginTop: 48 }} />
            ) : (
              <ResponsiveCardGrid minItemWidth={240}>
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
          ) : filtered.length === 0 ? (
            <Empty description={`暂无素材，点击「${isImageCategory ? '上传' : isVideoCategory ? '上传视频' : '上传'}」添加`} style={{ marginTop: 48 }} />
          ) : viewMode === 'card' ? (
            <ResponsiveCardGrid>
                {filtered.map((a) => (
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
                  onAudioPreview={
                    (a.type === 'sfx' || a.type === 'music')
                      ? () => { setAudioPreviewAsset(a); setAudioPreviewOpen(true); }
                      : undefined
                  }
                  onImagePreview={
                    IMAGE_TYPES.includes(a.type)
                      ? () => { setImagePreviewAsset(a); setImagePreviewOpen(true); }
                      : undefined
                  }
                />
              ))}
            </ResponsiveCardGrid>
          ) : !isSpriteCategory ? (
            <Table
              dataSource={filtered}
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
                  title: '分类',
                  dataIndex: 'type',
                  width: 100,
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
                        <Button type="link" size="small" onClick={() => { setVideoPreviewAsset(r); setVideoPreviewOpen(true); }}>
                          预览
                        </Button>
                      )}
                      {(r.type === 'sfx' || r.type === 'music') && (
                        <Button type="link" size="small" onClick={() => { setAudioPreviewAsset(r); setAudioPreviewOpen(true); }}>
                          预览
                        </Button>
                      )}
                      <Button type="text" size="small" icon={r.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFavorite(r.id, r.is_favorite)} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
                    </Space>
                  ),
                },
              ]}
            />
          ) : null}
        </Spin>

      </AdaptiveCard>

      <Modal
        title={
          isVideoCategory ? '上传视频' : isAudioCategory ? (typeFilter === 'sfx' ? '上传音效' : '上传音乐') : isImageCategory ? '上传' : '上传素材'
        }
        open={uploadModalOpen}
        onCancel={() => { setUploadModalOpen(false); form.resetFields(); }}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText={isVideoCategory ? '选择视频并上传' : isAudioCategory ? '选择音频并上传' : isImageCategory ? '选择图片并上传' : '选择文件并上传'}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'image', is_favorite: false, description: '', name: '', tags: '', chromaKeyColor: 'auto' }}
        >
          {isVideoCategory || isAudioCategory || isImageCategory ? (
            <>
              <Form.Item name="name" label="名称（可选，不填则用文件名）">
                <Input placeholder="素材名称" />
              </Form.Item>
              {isVideoCategory && typeFilter === 'transparent_video' && (
                <Form.Item name="chromaKeyColor" label="抠图背景色" rules={[{ required: true }]} initialValue="auto">
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
            </>
          ) : (
            <>
              <Form.Item name="type" label="分类" rules={[{ required: true }]}>
                <Select options={ASSET_LIBRARY_CATEGORIES.map((t) => ({ value: t.value, label: t.label }))} />
              </Form.Item>
              <Form.Item name="is_favorite" valuePropName="checked">
                <Checkbox>保存为常用</Checkbox>
              </Form.Item>
              <Form.Item name="description" label="描述（可选）">
                <TextArea rows={2} placeholder="素材描述" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <VideoPreviewDrawer
        open={videoPreviewOpen}
        onClose={() => { setVideoPreviewOpen(false); setVideoPreviewAsset(null); }}
        projectDir={projectDir}
        asset={videoPreviewAsset}
        onUpdate={loadAssets}
      />
      <AudioPreviewDrawer
        open={audioPreviewOpen}
        onClose={() => { setAudioPreviewOpen(false); setAudioPreviewAsset(null); }}
        projectDir={projectDir}
        asset={audioPreviewAsset}
        onUpdate={loadAssets}
      />
      <ImagePreviewDrawer
        open={imagePreviewOpen}
        onClose={() => { setImagePreviewOpen(false); setImagePreviewAsset(null); }}
        projectDir={projectDir}
        asset={imagePreviewAsset}
        onUpdate={loadAssets}
        getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
        saveAssetFromBase64={(dir, base64, ext, type, opt) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type, opt) ?? Promise.resolve({ ok: false })}
        matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false })}
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
    </div>
  );
}

