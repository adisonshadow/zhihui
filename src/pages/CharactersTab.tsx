/**
 * 角色设计页：角色列表 CRUD、名称/形象/备注、默认 TTS 参数、角度与骨骼绑定（见功能文档 4.2、开发计划 2.6，docs/06-角色骨骼贴图功能设计.md）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Input,
  Form,
  Space,
  Typography,
  App,
  Spin,
  Modal,
  InputNumber,
  Splitter,
  Radio,
  Slider,
  Checkbox,
} from 'antd';
import { GrowCard } from '@/components/GrowCard';
import { PlusOutlined, DeleteOutlined, UploadOutlined, PictureOutlined, RobotOutlined, ImportOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import { parseCharacterAngles, serializeCharacterAngles } from '@/types/skeleton';
import type { CharacterAngle } from '@/types/skeleton';
import { SkeletonBindingPanel } from '@/components/character/SkeletonBindingPanel';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';
import { GroupComponentPanel } from '@/components/character/GroupComponentPanel';
import {
  AssetCard,
  AssetThumb,
  SpriteCard,
  GroupComponentCard,
} from '@/components/asset/AssetLibraryCard';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { STANDALONE_SPRITES_CHARACTER_ID } from '@/constants/project';
import type { GroupComponentItem } from '@/types/groupComponent';
import { AddCharacterImageModal } from '@/components/character/AddCharacterImageModal';
import { CharacterImagesPanel, type CharacterImageItem } from '@/components/character/CharacterImagesPanel';
import { VideoTagInput } from '@/components/asset/VideoTagInput';

const { TextArea } = Input;
const { Text } = Typography;

/** 角色关联的透明视频项 */
interface CharacterTransparentVideoItem {
  id: string;
  asset_id: string;
}

interface CharacterRow {
  id: string;
  name: string;
  image_path: string | null;
  images?: string | null;
  note: string | null;
  tts_voice: string | null;
  tts_speed: number | null;
  angles: string | null;
  sprite_sheets: string | null;
  component_groups: string | null;
  transparent_videos?: string | null;
  created_at: string;
  updated_at: string;
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

function serializeTransparentVideos(list: CharacterTransparentVideoItem[]): string {
  return JSON.stringify(list);
}

function parseCharacterImages(json: string | null, fallbackPath: string | null): CharacterImageItem[] {
  if (json && json.trim()) {
    try {
      const arr = JSON.parse(json) as CharacterImageItem[];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {
      /* ignore */
    }
  }
  if (fallbackPath) {
    return [{ id: `legacy_${fallbackPath.replace(/[/\\]/g, '_')}`, path: fallbackPath, description: '' }];
  }
  return [];
}

function serializeCharacterImages(list: CharacterImageItem[]): string {
  return JSON.stringify(list);
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

function serializeSpriteSheets(list: SpriteSheetItem[]): string {
  return JSON.stringify(list);
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

function serializeComponentGroups(list: GroupComponentItem[]): string {
  return JSON.stringify(list);
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
}

interface CharactersTabProps {
  project: ProjectInfo;
  /** 素材属性变更（如去背景后 path/type 变化）时通知父组件刷新其他 Tab */
  onAssetUpdated?: () => void;
}

export default function CharactersTab({ project, onAssetUpdated }: CharactersTabProps) {
  const { message } = App.useApp();
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [addImageModalOpen, setAddImageModalOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [transparentVideoPickerOpen, setTransparentVideoPickerOpen] = useState(false);
  const [transparentVideoUploadModalOpen, setTransparentVideoUploadModalOpen] = useState(false);
  const [transparentVideoUploading, setTransparentVideoUploading] = useState(false);
  const [transparentVideoUploadForm] = Form.useForm<{ name: string; tags: string }>();
  const [transparentVideoAssets, setTransparentVideoAssets] = useState<AssetRow[]>([]);
  const [allTransparentVideoAssets, setAllTransparentVideoAssets] = useState<AssetRow[]>([]);
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<(AssetRow & { description?: string | null; cover_path?: string | null; tags?: string | null; duration?: number | null }) | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [videoMattingPanelOpenOnMount, setVideoMattingPanelOpenOnMount] = useState(false);
  const [videoAssetRefreshKey, setVideoAssetRefreshKey] = useState(0);
  const [skeletonPanelOpen, setSkeletonPanelOpen] = useState(false);
  const [skeletonPanelAngle, setSkeletonPanelAngle] = useState<CharacterAngle | null>(null);
  const [spriteSheetPanelOpen, setSpriteSheetPanelOpen] = useState(false);
  const [spriteSheetPanelItem, setSpriteSheetPanelItem] = useState<SpriteSheetItem | null>(null);
  const [groupComponentPanelOpen, setGroupComponentPanelOpen] = useState(false);
  const [groupComponentPanelItem, setGroupComponentPanelItem] = useState<GroupComponentItem | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'groupComponent' | 'sprite' | 'transparentVideo' | 'tts'>('image');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectDir = project.project_dir;

  const loadCharacters = useCallback(async (): Promise<CharacterRow[] | void> => {
    if (!window.yiman?.project?.getCharacters) return;
    setLoading(true);
    try {
      const list = ((await window.yiman.project.getCharacters(projectDir)) as CharacterRow[]).filter(
        (c) => c.id !== STANDALONE_SPRITES_CHARACTER_ID
      );
      setCharacters(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      if (selectedId && !list.some((c) => c.id === selectedId)) setSelectedId(list[0]?.id ?? null);
      return list;
    } catch {
      message.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, selectedId, message]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const selected = characters.find((c) => c.id === selectedId);
  const characterImages = selected ? parseCharacterImages(selected.images ?? null, selected.image_path) : [];
  const primaryImagePath = characterImages[0]?.path ?? selected?.image_path ?? null;

  useEffect(() => {
    if (selected) {
      form.setFieldsValue({
        name: selected.name,
        note: selected.note ?? '',
        tts_voice: selected.tts_voice ?? '',
        tts_speed: selected.tts_speed ?? 1,
      });
    }
  }, [selected, form]);

  const handleAdd = async () => {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await window.yiman?.project?.createCharacter(projectDir, { id, name: '新角色' });
    if (res?.ok) {
      message.success('已添加角色');
      loadCharacters();
      setSelectedId(id);
    } else message.error(res?.error || '添加失败');
  };

  const handleDelete = async (id: string) => {
    const res = await window.yiman?.project?.deleteCharacter(projectDir, id);
    if (res?.ok) {
      message.success('已删除');
      if (selectedId === id) setSelectedId(characters.find((c) => c.id !== id)?.id ?? null);
      loadCharacters();
    } else message.error(res?.error || '删除失败');
  };

  const doAutoSave = useCallback(
    async (values: { name?: string; note?: string; tts_voice?: string; tts_speed?: number }) => {
      if (!selectedId) return;
      try {
        const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
          name: values.name,
          note: values.note ?? null,
          tts_voice: values.tts_voice ?? null,
          tts_speed: values.tts_speed ?? null,
        });
        if (res?.ok) {
          message.success('已保存');
          loadCharacters();
        } else message.error(res?.error || '保存失败');
      } catch {
        message.error('保存失败');
      }
    },
    [projectDir, selectedId, loadCharacters, message]
  );

  const handleFormValuesChange = useCallback(() => {
    if (!selectedId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const values = form.getFieldsValue();
      doAutoSave(values);
    }, 500);
  }, [selectedId, doAutoSave, form]);

  const addCharacterImage = useCallback(
    async (path: string) => {
      if (!selectedId) return;
      const newItem: CharacterImageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        path,
        description: '',
      };
      const next = [...characterImages, newItem];
      const imagesJson = serializeCharacterImages(next);
      const firstPath = next[0]?.path ?? null;
      const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
        images: imagesJson,
        image_path: firstPath,
      });
      if (res?.ok) {
        message.success('已添加形象');
        loadCharacters();
      } else message.error(res?.error || '添加失败');
    },
    [selectedId, projectDir, characterImages, loadCharacters, message]
  );

  const handleUploadImage = async () => {
    const filePath = await window.yiman?.dialog?.openFile?.();
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, 'character');
    if (!res?.ok) {
      message.error(res?.error || '上传失败');
      return;
    }
    if (!res.path) return;
    await addCharacterImage(res.path);
  };

  const openAssetPicker = () => {
    setAssetPickerOpen(true);
    window.yiman?.project?.getAssets(projectDir).then((list: AssetRow[]) => setAssets(list));
  };

  const handlePickAsset = async (path: string) => {
    await addCharacterImage(path);
    setAssetPickerOpen(false);
  };

  const handleDeleteCharacterImage = async (item: CharacterImageItem) => {
    if (!selectedId) return;
    const next = characterImages.filter((i) => i.id !== item.id);
    const imagesJson = next.length > 0 ? serializeCharacterImages(next) : null;
    const firstPath = next[0]?.path ?? null;
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      images: imagesJson,
      image_path: firstPath,
    });
    if (res?.ok) {
      message.success('已删除');
      loadCharacters();
    } else message.error(res?.error || '删除失败');
  };

  const handleUpdateImageDescription = async (item: CharacterImageItem, description: string) => {
    if (!selectedId) return;
    const next = characterImages.map((i) => (i.id === item.id ? { ...i, description } : i));
    const imagesJson = serializeCharacterImages(next);
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, { images: imagesJson });
    if (res?.ok) loadCharacters();
  };

  const angles = selected ? parseCharacterAngles(selected.angles ?? null) : [];
  const spriteSheets = selected ? parseSpriteSheets(selected.sprite_sheets ?? null) : [];
  const componentGroups = selected ? parseComponentGroups(selected.component_groups ?? null) : [];
  const transparentVideos = selected ? parseTransparentVideos(selected.transparent_videos ?? null) : [];
  /** 新添加的在前面显示（desc 排序） */
  const sortedAngles = [...angles].reverse();
  const sortedSpriteSheets = [...spriteSheets].reverse();
  const sortedComponentGroups = [...componentGroups].reverse();
  const sortedTransparentVideos = [...transparentVideos].reverse();

  /** 角色视频：含 transparent_video 及未处理的 video（按 asset_id 拉取） */
  const transparentVideoAssetIds = transparentVideos.map((v) => v.asset_id).join(',');
  useEffect(() => {
    if (transparentVideos.length === 0 || !window.yiman?.project?.getAssetById) {
      setAllTransparentVideoAssets([]);
      return;
    }
    Promise.all(
      transparentVideos.map((v) => window.yiman!.project!.getAssetById!(projectDir, v.asset_id))
    ).then((results) => {
      setAllTransparentVideoAssets(results.filter((a: AssetRow | null | undefined): a is AssetRow => a != null));
    });
  }, [projectDir, transparentVideoAssetIds, videoAssetRefreshKey]);

  const openSpriteSheetPanel = (item: SpriteSheetItem | null) => {
    setSpriteSheetPanelItem(item);
    setSpriteSheetPanelOpen(true);
  };

  const handleSpriteSheetSave = async (updated: SpriteSheetItem) => {
    if (!selectedId) return;
    const next = spriteSheets.some((s) => s.id === updated.id)
      ? spriteSheets.map((s) => (s.id === updated.id ? updated : s))
      : [...spriteSheets, updated];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      sprite_sheets: serializeSpriteSheets(next),
    });
    if (res?.ok) {
      loadCharacters();
    } else {
      message.error(res?.error || '保存失败');
    }
  };

  const handleAddSpriteSheet = async () => {
    if (!selectedId) return;
    const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: SpriteSheetItem = { id: newId, name: '精灵动作', image_path: '' };
    const next = [...spriteSheets, newItem];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      sprite_sheets: serializeSpriteSheets(next),
    });
    if (res?.ok) {
      loadCharacters();
      setSpriteSheetPanelItem(newItem);
      setSpriteSheetPanelOpen(true);
    } else {
      message.error(res?.error || '添加失败');
    }
  };

  const handleDeleteSpriteSheet = async (item: SpriteSheetItem) => {
    if (!selectedId) return;
    const next = spriteSheets.filter((s) => s.id !== item.id);
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      sprite_sheets: serializeSpriteSheets(next),
    });
    if (res?.ok) {
      message.success('已删除');
      loadCharacters();
    } else {
      message.error(res?.error || '删除失败');
    }
  };

  const handleExportSpriteSheet = async (item: SpriteSheetItem) => {
    if (!item.image_path) {
      message.warning('请先导入精灵图');
      return;
    }
    const res = await window.yiman?.project?.exportSpriteSheet?.(projectDir, item);
    if (res?.ok) {
      message.success('导出成功');
    } else {
      message.error(res?.error || '导出失败');
    }
  };

  const openGroupComponentPanel = (item: GroupComponentItem | null) => {
    setGroupComponentPanelItem(item);
    setGroupComponentPanelOpen(true);
  };

  const handleGroupComponentSave = async (updated: GroupComponentItem) => {
    if (!selectedId) return;
    const next = componentGroups.some((g) => g.id === updated.id)
      ? componentGroups.map((g) => (g.id === updated.id ? updated : g))
      : [...componentGroups, updated];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      component_groups: serializeComponentGroups(next),
    });
    if (res?.ok) {
      loadCharacters();
    } else {
      message.error(res?.error || '保存失败');
    }
  };

  const handleAddGroupComponent = async () => {
    if (!selectedId) return;
    const newId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const defaultStateId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem: GroupComponentItem = {
      id: newId,
      name: '元件',
      states: [{ id: defaultStateId, tags: [], items: [] }],
    };
    const next = [...componentGroups, newItem];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      component_groups: serializeComponentGroups(next),
    });
    if (res?.ok) {
      loadCharacters();
      setGroupComponentPanelItem(newItem);
      setGroupComponentPanelOpen(true);
    } else {
      message.error(res?.error || '添加失败');
    }
  };

  const handleDeleteGroupComponent = async (item: GroupComponentItem) => {
    if (!selectedId) return;
    const next = componentGroups.filter((g) => g.id !== item.id);
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      component_groups: serializeComponentGroups(next),
    });
    if (res?.ok) {
      message.success('已删除');
      loadCharacters();
    } else {
      message.error(res?.error || '删除失败');
    }
  };

  const openTransparentVideoPicker = () => {
    setTransparentVideoPickerOpen(true);
    if (!window.yiman?.project?.getAssets) return;
    Promise.all([
      window.yiman.project.getAssets(projectDir, 'transparent_video'),
      window.yiman.project.getAssets(projectDir, 'video'),
    ]).then(([tv, v]) => {
      const arr = [...(Array.isArray(tv) ? tv : []), ...(Array.isArray(v) ? v : [])];
      setTransparentVideoAssets(arr);
    });
  };

  const handleUploadTransparentVideo = async () => {
    const values = await transparentVideoUploadForm.validateFields().catch(() => null);
    if (!values || !selectedId || !window.yiman?.project?.saveAssetFromFile) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description = values.name?.trim() || fileName || null;
    const tags = (values.tags ?? '').trim() || null;
    setTransparentVideoUploading(true);
    try {
      const res = (await window.yiman.project.saveAssetFromFile(projectDir, filePath, 'video', {
        description,
        is_favorite: 0,
        tags,
      })) as { ok: boolean; id?: string; path?: string; error?: string };
      if (res?.ok && res.id) {
        const newItem: CharacterTransparentVideoItem = {
          id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          asset_id: res.id,
        };
        const next = [...transparentVideos, newItem];
        const updateRes = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
          transparent_videos: serializeTransparentVideos(next),
        });
        if (updateRes?.ok) {
          message.success('已上传并添加');
          setTransparentVideoUploadModalOpen(false);
          transparentVideoUploadForm.resetFields();
          loadCharacters();
          const fresh = (await window.yiman?.project?.getAssetById?.(projectDir, res.id)) as (AssetRow & { description?: string | null; cover_path?: string | null; tags?: string | null; duration?: number | null }) | null;
          if (fresh) {
            setVideoPreviewAsset(fresh);
            setVideoPreviewOpen(true);
            setVideoMattingPanelOpenOnMount(true);
          }
        } else {
          message.error(updateRes?.error || '添加失败');
        }
      } else {
        message.error(res?.error || '上传失败');
      }
    } finally {
      setTransparentVideoUploading(false);
    }
  };

  const handleAddTransparentVideo = async (assetId: string) => {
    if (!selectedId) return;
    const newItem: CharacterTransparentVideoItem = {
      id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      asset_id: assetId,
    };
    const next = [...transparentVideos, newItem];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      transparent_videos: serializeTransparentVideos(next),
    });
    if (res?.ok) {
      message.success('已添加');
      setTransparentVideoPickerOpen(false);
      loadCharacters();
    } else {
      message.error(res?.error || '添加失败');
    }
  };

  const handleDeleteTransparentVideo = async (item: CharacterTransparentVideoItem) => {
    if (!selectedId) return;
    const next = transparentVideos.filter((v) => v.id !== item.id);
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      transparent_videos: serializeTransparentVideos(next),
    });
    if (res?.ok) {
      message.success('已删除');
      loadCharacters();
    } else {
      message.error(res?.error || '删除失败');
    }
  };

  const handleImportSpriteSheet = async () => {
    if (!selectedId) return;
    const zipPath = await window.yiman?.dialog?.openFile?.({ filters: [{ name: 'ZIP 包', extensions: ['zip'] }] });
    if (!zipPath) return;
    const res = await window.yiman?.project?.importSpriteSheet?.(projectDir, zipPath);
    if (res?.ok && res.item) {
      const newItem = res.item as SpriteSheetItem;
      const next = [...spriteSheets, newItem];
      const up = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
        sprite_sheets: serializeSpriteSheets(next),
      });
      if (up?.ok) {
        message.success('导入成功');
        loadCharacters();
      } else {
        message.error(up?.error || '保存失败');
      }
    } else {
      message.error(res?.error || '导入失败');
    }
  };

  const openSkeletonPanel = (angle: CharacterAngle) => {
    setSkeletonPanelAngle(angle);
    setSkeletonPanelOpen(true);
  };

  const handleSkeletonSave = async (updatedAngle: CharacterAngle) => {
    if (!selectedId || !skeletonPanelAngle) return;
    const nextAngles = angles.map((a) => (a.id === updatedAngle.id ? updatedAngle : a));
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      angles: serializeCharacterAngles(nextAngles),
    });
    if (res?.ok) {
      loadCharacters();
    } else {
      message.error(res?.error || '保存失败');
    }
  };

  const handleAddAngle = async () => {
    if (!selectedId) return;
    const newId = `angle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newAngle: CharacterAngle = { id: newId, name: `角度 ${angles.length + 1}` };
    const nextAngles = [...angles, newAngle];
    const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
      angles: serializeCharacterAngles(nextAngles),
    });
    if (res?.ok) {
      loadCharacters();
      setSkeletonPanelAngle(newAngle);
      setSkeletonPanelOpen(true);
    } else {
      message.error(res?.error || '添加角度失败');
    }
  };

  return (
    <div style={{ height: '100%', minHeight: 400 }}>
      <Splitter style={{ height: '100%' }} orientation="horizontal">
        {/* 左侧：角色列表，默认 240px */}
        <Splitter.Panel defaultSize={240} min={160} max={400}>
          <GrowCard headerHeight={40} headerStyle={{ display: 'flex', alignItems: 'center' }} header={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' ,padding: '0 12px'}}>
              <Text>角色列表</Text>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
                添加角色
              </Button>
            </div>
          }>
            <Spin spinning={loading}>
              <Space orientation="vertical" style={{ width: '100%' }} size={0}>
                {characters.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      backgroundColor: selectedId === item.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        cursor: 'pointer',
                        fontWeight: selectedId === item.id ? 600 : 400,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.name || '未命名'}
                    </span>
                    <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
                  </div>
                ))}
              </Space>
            </Spin>
          </GrowCard>
        </Splitter.Panel>

        {/* 右侧：角色编辑 */}
        <Splitter.Panel min={320}>
          <AdaptiveCard 
            headerHeight={40}
            headerStyle={{ display: 'flex'}}
            contentOverflow={false}
            variant="borderless"
            styles={{ body: { padding: 0 } }}
            header={
              (
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Radio.Group
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    value={activeTab}
                    onChange={(e) => setActiveTab(e.target.value)}
                  >
                    <Radio value="image">形象</Radio>
                    <Radio value="groupComponent">元件</Radio>
                    <Radio value="sprite">精灵图</Radio>
                    <Radio value="transparentVideo">透明视频</Radio>
                    <Radio value="tts">AI声音配置</Radio>
                  </Radio.Group>
                </div>
              )
          }>
          {selected ? (
            activeTab === 'image' ? (
              <Form form={form} layout="vertical" onValuesChange={handleFormValuesChange} style={{ padding: 20 }}>
                <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                  <Input placeholder="角色名称" />
                </Form.Item>
                <Form.Item name="note" label="备注">
                  <TextArea rows={3} placeholder="角色设定、备注等" />
                </Form.Item>
                <Form.Item label="形象">
                  <CharacterImagesPanel
                    projectDir={projectDir}
                    images={characterImages}
                    onAdd={() => setAddImageModalOpen(true)}
                    onDelete={handleDeleteCharacterImage}
                    onUpdateDescription={handleUpdateImageDescription}
                    onAiClick={() => {}}
                  />
                </Form.Item>
              </Form>
            ) : activeTab === 'groupComponent' ? (
              <AdaptiveCard
                headerHeight={40}
                variant="borderless"
                header={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddGroupComponent}>
                      新建元件
                    </Button>
                    <Button size="small" icon={<ImportOutlined />}>
                      导入
                    </Button>
                  </div>
                }
              >
                <ResponsiveCardGrid>
                  {sortedComponentGroups.map((g) => (
                    <GroupComponentCard
                      key={g.id}
                      projectDir={projectDir}
                      item={g}
                      spriteSheets={spriteSheets}
                      onEdit={() => openGroupComponentPanel(g)}
                      onDelete={() => handleDeleteGroupComponent(g)}
                    />
                  ))}
                </ResponsiveCardGrid>
              </AdaptiveCard>
            ) : activeTab === 'sprite' ? (
              <AdaptiveCard
                headerHeight={40}
                variant="borderless"
                header={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddSpriteSheet}>
                    新建精灵图
                  </Button>
                  <Button size="small" icon={<ImportOutlined />} onClick={handleImportSpriteSheet}>
                    导入
                  </Button>
                </div>}
              >
                <ResponsiveCardGrid>
                  {sortedSpriteSheets.map((s) => (
                    <SpriteCard
                      key={s.id}
                      projectDir={projectDir}
                      sprite={s}
                      onEdit={() => openSpriteSheetPanel(s)}
                      onDelete={() => handleDeleteSpriteSheet(s)}
                      onExport={() => handleExportSpriteSheet(s)}
                    />
                  ))}
                </ResponsiveCardGrid>
              </AdaptiveCard>
            ) : activeTab === 'transparentVideo' ? (
              <AdaptiveCard
                headerHeight={40}
                variant="borderless"
                header={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
                    <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setTransparentVideoUploadModalOpen(true)}>
                      上传视频
                    </Button>
                    <Button size="small" onClick={openTransparentVideoPicker}>
                      从素材库选择
                    </Button>
                  </div>
                }
              >
                <ResponsiveCardGrid>
                  {sortedTransparentVideos
                    .map((v) => {
                      const rawAsset = allTransparentVideoAssets.find((a) => a.id === v.asset_id) ?? transparentVideoAssets.find((a) => a.id === v.asset_id);
                      return rawAsset ? { v, rawAsset } : null;
                    })
                    .filter((x): x is { v: typeof sortedTransparentVideos[0]; rawAsset: AssetRow } => x != null)
                    .map(({ v, rawAsset }) => {
                      const assetForCard = {
                        id: rawAsset.id,
                        path: rawAsset.path,
                        type: rawAsset.type,
                        is_favorite: (rawAsset as AssetRow & { is_favorite?: number }).is_favorite ?? 0,
                        description: (rawAsset as AssetRow & { description?: string | null }).description ?? rawAsset.path.split(/[/\\]/).pop() ?? rawAsset.id,
                        cover_path: (rawAsset as AssetRow & { cover_path?: string | null }).cover_path,
                        original_path: (rawAsset as AssetRow & { original_path?: string | null }).original_path,
                        duration: (rawAsset as AssetRow & { duration?: number | null }).duration,
                      };
                      return (
                        <AssetCard
                          key={v.id}
                          projectDir={projectDir}
                          asset={assetForCard}
                          onFavorite={() => {}}
                          onDelete={() => handleDeleteTransparentVideo(v)}
                          onVideoPreview={() => {
                            setVideoPreviewAsset(rawAsset as AssetRow & { description?: string | null; cover_path?: string | null; tags?: string | null; duration?: number | null });
                            setVideoPreviewOpen(true);
                            setVideoMattingPanelOpenOnMount(false);
                          }}
                        />
                      );
                    })}
                </ResponsiveCardGrid>
                {sortedTransparentVideos.length === 0 && (
                  <div style={{ padding: 20 }}>
                    <Typography.Text type="secondary">暂无视频，可「上传视频」或「从素材库选择」添加。添加后可在预览中执行「视频去背景」。</Typography.Text>
                  </div>
                )}
              </AdaptiveCard>
            ) : (
              <Form form={form} layout="vertical" onValuesChange={handleFormValuesChange} style={{ padding: 20 }}>
                <Form.Item name="tts_voice" label="默认 TTS 音色">
                  <Input placeholder="如：音色 ID 或名称，供视频设计器对白默认带出" />
                </Form.Item>
                <Form.Item name="tts_speed" label="默认 TTS 语速" extra="1 为正常语速">
                  <InputNumber min={0.5} max={2} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
            )
          ) : (
            <div style={{ padding: 20 }}>
              <Text type="secondary">在左侧添加角色或选择已有角色进行编辑。</Text>
            </div>
          )}
          </AdaptiveCard>
        </Splitter.Panel>
      </Splitter>

      <AddCharacterImageModal
        open={addImageModalOpen}
        onClose={() => setAddImageModalOpen(false)}
        onLocalUpload={handleUploadImage}
        onPickFromLibrary={openAssetPicker}
      />

      <Modal
        title="上传视频"
        open={transparentVideoUploadModalOpen}
        onCancel={() => { setTransparentVideoUploadModalOpen(false); transparentVideoUploadForm.resetFields(); }}
        onOk={handleUploadTransparentVideo}
        confirmLoading={transparentVideoUploading}
        okText="选择视频并上传"
      >
        <Form
          form={transparentVideoUploadForm}
          layout="vertical"
          initialValues={{ name: '', tags: '' }}
        >
          <Form.Item name="name" label="名称（可选，不填则用文件名）">
            <Input placeholder="素材名称" />
          </Form.Item>
          <Form.Item name="tags" label="标签（可选）">
            <VideoTagInput />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从素材库选择视频"
        open={transparentVideoPickerOpen}
        onCancel={() => setTransparentVideoPickerOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {transparentVideoAssets.length === 0 ? (
            <Text type="secondary">暂无视频，请先在素材页上传视频。</Text>
          ) : (
            <Space wrap size="middle">
              {transparentVideoAssets.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: 80,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                  onClick={() => handleAddTransparentVideo(a.id)}
                >
                  <AssetThumb projectDir={projectDir} path={a.path} coverPath={(a as AssetRow & { cover_path?: string })?.cover_path} size={80} />
                  <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.path?.split(/[/\\]/).pop() || a.id}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>

      <Modal
        title="从素材库选择形象"
        open={assetPickerOpen}
        onCancel={() => setAssetPickerOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {assets.length === 0 ? (
            <Text type="secondary">暂无素材，请先使用「本地上传」添加图片。</Text>
          ) : (
            <Space wrap size="middle">
              {assets.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: 80,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                  onClick={() => handlePickAsset(a.path)}
                >
                  <AssetThumb projectDir={projectDir} path={a.path} />
                  <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.path}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>

      {skeletonPanelAngle && (
        <SkeletonBindingPanel
          open={skeletonPanelOpen}
          onClose={() => { setSkeletonPanelOpen(false); setSkeletonPanelAngle(null); }}
          projectDir={projectDir}
          characterId={selectedId!}
          angle={skeletonPanelAngle}
          onSave={handleSkeletonSave}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
          matteImageForContour={(dir, path) => window.yiman?.project?.matteImageForContour?.(dir, path) ?? Promise.resolve({ ok: false, error: '未就绪' })}
        />
      )}

      {spriteSheetPanelOpen && (
        <SpriteSheetPanel
          open={spriteSheetPanelOpen}
          onClose={() => { setSpriteSheetPanelOpen(false); setSpriteSheetPanelItem(null); }}
          projectDir={projectDir}
          characterId={selectedId!}
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

      {groupComponentPanelOpen && selectedId && (
        <GroupComponentPanel
          open={groupComponentPanelOpen}
          onClose={() => { setGroupComponentPanelOpen(false); setGroupComponentPanelItem(null); }}
          projectDir={projectDir}
          characterId={selectedId}
          item={groupComponentPanelItem}
          onSave={handleGroupComponentSave}
          spriteSheets={spriteSheets}
          componentGroups={componentGroups}
          getAssetDataUrl={(dir, path) => window.yiman?.project?.getAssetDataUrl?.(dir, path) ?? Promise.resolve(null)}
          getAssets={(dir) => window.yiman?.project?.getAssets?.(dir) ?? Promise.resolve([])}
          saveAssetFromFile={async (dir, filePath, type) => (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type)) ?? { ok: false }}
          saveAssetFromBase64={(dir, base64, ext, type) => window.yiman?.project?.saveAssetFromBase64?.(dir, base64, ext, type) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          openFileDialog={() => window.yiman?.dialog?.openFile?.() ?? Promise.resolve(undefined)}
          matteImageAndSave={(dir, path, opt) => window.yiman?.project?.matteImageAndSave?.(dir, path, opt) ?? Promise.resolve({ ok: false, error: '未就绪' })}
          getAllCharactersData={async () => {
            if (!window.yiman?.project?.getCharacters) return [];
            const list = (await window.yiman.project.getCharacters(projectDir)) as CharacterRow[];
            return list
              .filter((c) => c.id !== STANDALONE_SPRITES_CHARACTER_ID)
              .map((c) => ({
                characterId: c.id,
                characterName: c.name ?? undefined,
                spriteSheets: parseSpriteSheets(c.sprite_sheets ?? null),
                componentGroups: parseComponentGroups(c.component_groups ?? null),
              }));
          }}
        />
      )}

      <VideoPreviewDrawer
        open={videoPreviewOpen}
        onClose={() => { setVideoPreviewOpen(false); setVideoPreviewAsset(null); setVideoMattingPanelOpenOnMount(false); }}
        projectDir={projectDir}
        asset={videoPreviewAsset ? { id: videoPreviewAsset.id, path: videoPreviewAsset.path, type: videoPreviewAsset.type, description: videoPreviewAsset.description ?? null, tags: videoPreviewAsset.tags ?? null, original_path: (videoPreviewAsset as AssetRow & { original_path?: string | null }).original_path ?? null, duration: videoPreviewAsset.duration ?? null } : null}
        onUpdate={() => loadCharacters()}
        defaultMattingPanelOpen={videoMattingPanelOpenOnMount}
        onReprocessComplete={async (assetId) => {
          setVideoAssetRefreshKey((k) => k + 1);
          onAssetUpdated?.();
          if (videoPreviewAsset?.id === assetId && window.yiman?.project?.getAssetById) {
            const fresh = (await window.yiman.project.getAssetById(projectDir, assetId)) as (AssetRow & { description?: string | null; cover_path?: string | null; tags?: string | null; duration?: number | null }) | null;
            if (fresh) setVideoPreviewAsset(fresh);
          }
        }}
        onSpriteSaved={async (result) => {
          if (!selectedId || !result.path) return;
          const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const newItem: SpriteSheetItem = {
            id: newId,
            name: '精灵动作',
            image_path: result.path,
            frames: result.frames,
          };
          const currentSheets = selected ? parseSpriteSheets(selected.sprite_sheets ?? null) : [];
          const next = [...currentSheets, newItem];
          const res = await window.yiman?.project?.updateCharacter(projectDir, selectedId, {
            sprite_sheets: serializeSpriteSheets(next),
          });
          if (res?.ok) {
            loadCharacters();
          }
        }}
        saveAssetFromFile={async (dir, filePath, type, opt) =>
          (await window.yiman?.project?.saveAssetFromFile?.(dir, filePath, type, opt)) ?? { ok: false }}
        openFileDialog={(opts) => window.yiman?.dialog?.openFile?.(opts) ?? Promise.resolve(undefined)}
      />
    </div>
  );
}

