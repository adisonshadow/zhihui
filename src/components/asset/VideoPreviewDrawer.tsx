/**
 * 视频/透明视频预览 Drawer：预览视频、修改 tags、删除素材
 * 透明视频使用深色棋盘格背景以展示透明通道；支持容差+连续选项重新扣色
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';
import { Drawer, Input, Button, App, Space, Typography, Tag, theme, Dropdown, Tooltip, Modal } from 'antd';
import { PlusOutlined, PlusCircleOutlined, MoreOutlined, ScissorOutlined, PictureOutlined } from '@ant-design/icons';
import { AssetBundlePreviewNav } from './AssetBundlePreviewNav';
import { ChangeCategoryModal, type ChangeCategoryTarget } from './ChangeCategoryModal';
import { getAssetUiCategory, addCategoryToTags, type AssetUiCategory } from '@/utils/assetCategory';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';
import { VideoMattingPanel } from './VideoMattingPanel';
import { VideoToSpritePanel } from './VideoToSpritePanel';

const { Text } = Typography;

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
  tags?: string | null;
  original_path?: string | null;
  duration?: number | null;
}

/** 仅返回用户可见 tag（过滤 __cat: / __char: 等内部标记） */
function parseTags(tagsStr: string | null | undefined): string[] {
  if (!tagsStr || !tagsStr.trim()) return [];
  return tagsStr.split(/[,，\s]+/).map((t) => t.trim()).filter((t) => t && !t.startsWith('__'));
}

/** 保存时保留原始内部 tag，仅替换用户可见部分 */
function serializeTags(userTags: string[], originalTags: string | null | undefined): string | null {
  const internal = (originalTags ?? '').split(/[,，\s]+/).map((t) => t.trim()).filter((t) => t.startsWith('__'));
  const all = [...userTags.filter(Boolean), ...internal];
  return all.length ? all.join(',') : null;
}

interface VideoPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  onUpdate: () => void;
  /** 变更分类回调：category='character' 时携带 characterId，父组件负责写入 character.transparent_videos */
  onChangeCategory?: (assetId: string, category: string, characterId?: string) => void;
  /** 去背景完成后回调，父组件可刷新 asset 以获取新 path */
  onReprocessComplete?: (assetId: string) => void;
  /** 是否在打开时自动展开视频去背景面板（角色页上传后使用） */
  defaultMattingPanelOpen?: boolean;
  /** 精灵图保存后回调，父组件写入 character.sprite_sheets 或素材库 */
  onSpriteSaved?: (result: { path: string; frameCount: number; frames: { x: number; y: number; width: number; height: number }[]; cover_path?: string }) => void;
  saveAssetFromFile?: (
    projectDir: string,
    sourcePath: string,
    type?: string,
    options?: { description?: string | null; is_favorite?: number; tags?: string | null }
  ) => Promise<{ ok: boolean; id?: string; path?: string; error?: string }>;
  openFileDialog?: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | undefined>;
}

export function VideoPreviewDrawer({
  open,
  onClose,
  projectDir,
  asset,
  onUpdate,
  onChangeCategory,
  onReprocessComplete,
  defaultMattingPanelOpen,
  onSpriteSaved,
  saveAssetFromFile,
  openFileDialog,
}: VideoPreviewDrawerProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [changeCategoryOpen, setChangeCategoryOpen] = useState(false);
  const [videoMattingPanelOpen, setVideoMattingPanelOpen] = useState(defaultMattingPanelOpen ?? false);
  const [videoToSpritePanelOpen, setVideoToSpritePanelOpen] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const initialRef = useRef<{ name: string; tags: string }>({ name: '', tags: '' });
  const bundleTitleInitialRef = useRef('');
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [bundleTitle, setBundleTitle] = useState('');

  const [displayAsset, setDisplayAsset] = useState<AssetRow | null>(null);
  const [bundleMemberIds, setBundleMemberIds] = useState<string[]>([]);
  const [bundleInGroup, setBundleInGroup] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleReloadTick, setBundleReloadTick] = useState(0);
  const [addingSimilar, setAddingSimilar] = useState(false);
  const [similarTransparentModalOpen, setSimilarTransparentModalOpen] = useState(false);
  const [pendingSimilarFilePath, setPendingSimilarFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDisplayAsset(null);
      setSimilarTransparentModalOpen(false);
      setPendingSimilarFilePath(null);
      setBundleId(null);
      setBundleTitle('');
      bundleTitleInitialRef.current = '';
      return;
    }
    setDisplayAsset(asset);
  }, [open, asset]);

  const currentAsset = displayAsset;

  useEffect(() => {
    if (!open || !displayAsset?.id || !window.yiman?.project?.getAssetBundleForAsset) {
      setBundleMemberIds([]);
      setBundleInGroup(false);
      setBundleLoading(false);
      return;
    }
    let cancelled = false;
    setBundleLoading(true);
    void window.yiman.project.getAssetBundleForAsset(projectDir, displayAsset.id).then((res) => {
      if (cancelled) return;
      setBundleLoading(false);
      if (!res) {
        setBundleMemberIds([]);
        setBundleInGroup(false);
        setBundleId(null);
        setBundleTitle('');
        bundleTitleInitialRef.current = '';
        return;
      }
      const tit = res.bundle.title ?? '';
      setBundleId(res.bundle.id);
      setBundleTitle(tit);
      bundleTitleInitialRef.current = tit;
      setBundleMemberIds(res.members.map((m) => m.id));
      setBundleInGroup(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectDir, displayAsset?.id, bundleReloadTick]);

  const isTransparent = currentAsset?.type === 'transparent_video';
  /** 所有视频均可去背景：有 original_path 时基于原始视频重处理，否则基于 path（首次处理） */
  const canMatting = !!(currentAsset && (currentAsset.type === 'video' || currentAsset.type === 'transparent_video'));
  const mattingVideoPath = canMatting ? (currentAsset!.original_path ?? currentAsset!.path) : null;
  /** 转精灵图：有去背景时用透明视频文件，否则用原始文件。transparent_video 的 path=透明视频，video 的 path=原始视频 */
  const spriteVideoPath = canMatting && currentAsset?.path ? currentAsset.path : null;

  useEffect(() => {
    if (!open || !currentAsset?.path || !window.yiman?.project?.getAssetDataUrl) {
      setVideoUrl(null);
      return;
    }
    const p = currentAsset.path;
    window.yiman.project.getAssetDataUrl(projectDir, p).then(setVideoUrl);
  }, [open, projectDir, currentAsset?.path]);

  useEffect(() => {
    if (displayAsset) {
      const t = parseTags(displayAsset.tags);
      const n = displayAsset.description ?? '';
      setTags(t);
      setName(n);
      initialRef.current = { name: n, tags: t.join(',') };
    } else {
      setTags([]);
      setName('');
      initialRef.current = { name: '', tags: '' };
    }
  }, [displayAsset]);

  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);

  useEffect(() => {
    if (open && defaultMattingPanelOpen) setVideoMattingPanelOpen(true);
  }, [open, defaultMattingPanelOpen]);

  const dirty = bundleId
    ? tags.join(',') !== initialRef.current.tags || bundleTitle.trim() !== bundleTitleInitialRef.current
    : name !== initialRef.current.name || tags.join(',') !== initialRef.current.tags;

  const handleSaveTags = useCallback(async () => {
    if (!displayAsset || !window.yiman?.project?.updateAsset) return;
    setSaving(true);
    try {
      if (bundleId && window.yiman.project.updateAssetBundle) {
        if (bundleTitle.trim() !== bundleTitleInitialRef.current) {
          const br = await window.yiman.project.updateAssetBundle(projectDir, bundleId, {
            title: bundleTitle.trim() || '',
          });
          if (!br?.ok) {
            message.error(br?.error || '素材包名称保存失败');
            return;
          }
          bundleTitleInitialRef.current = bundleTitle.trim();
        }
        const res = await window.yiman.project.updateAsset(projectDir, displayAsset.id, {
          tags: serializeTags(tags, displayAsset.tags),
        });
        if (res?.ok) {
          message.success('已保存');
          initialRef.current = { ...initialRef.current, tags: tags.join(',') };
          onUpdate();
        } else message.error(res?.error || '保存失败');
      } else {
        const res = await window.yiman.project.updateAsset(projectDir, displayAsset.id, {
          tags: serializeTags(tags, displayAsset.tags),
          description: name.trim() || null,
        });
        if (res?.ok) {
          message.success('已保存');
          initialRef.current = { name: name.trim() || '', tags: tags.join(',') };
          onUpdate();
        } else message.error(res?.error || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }, [projectDir, displayAsset, tags, name, message, onUpdate, bundleId, bundleTitle]);

  const handleMemberDescriptionCommit = useCallback(
    async (nextTrimmed: string) => {
      if (!displayAsset || !window.yiman?.project?.updateAsset) return;
      const nextDesc = nextTrimmed.length ? nextTrimmed : null;
      if ((displayAsset.description ?? '') === (nextDesc ?? '')) return;
      const res = await window.yiman.project.updateAsset(projectDir, displayAsset.id, {
        description: nextDesc,
      });
      if (res?.ok) {
        message.success('子素材名称已更新');
        setDisplayAsset({ ...displayAsset, description: nextDesc });
        onUpdate();
      } else message.error(res?.error || '更新失败');
    },
    [projectDir, displayAsset, message, onUpdate]
  );

  const handleBundleNavigate = useCallback(
    async (assetId: string) => {
      if (!window.yiman?.project?.getAssetById) return;
      const row = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
      if (row) setDisplayAsset(row);
    },
    [projectDir]
  );

  const handleAddSimilar = useCallback(async () => {
    if (!displayAsset || !openFileDialog || !window.yiman?.project?.addSimilarAssetToBundle) return;
    const filePath = await openFileDialog({
      filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }],
    });
    if (!filePath) return;
    /** 透明视频组须保持类型一致：新文件只能入库 transparent_video；抠色须经用户确认（受控 Modal），避免静默处理 */
    if (displayAsset.type === 'transparent_video') {
      setPendingSimilarFilePath(filePath);
      setSimilarTransparentModalOpen(true);
      return;
    }
    if (!saveAssetFromFile) return;
    setAddingSimilar(true);
    try {
      const res = await saveAssetFromFile(projectDir, filePath, 'video', {
        tags: displayAsset.tags ?? undefined,
        description: null,
        is_favorite: 0,
      });
      if (!res?.ok || !res.id) {
        message.error(res?.error || '导入失败');
        return;
      }
      const addRes = await window.yiman.project.addSimilarAssetToBundle(projectDir, displayAsset.id, res.id);
      if (!addRes?.ok) {
        message.error(addRes?.error || '归入同类组失败');
        return;
      }
      message.success('已添加并归入同类组');
      setBundleReloadTick((t) => t + 1);
      onUpdate();
    } finally {
      setAddingSimilar(false);
    }
  }, [displayAsset, saveAssetFromFile, openFileDialog, projectDir, message, onUpdate]);

  const confirmTransparentSimilarImport = useCallback(async () => {
    const filePath = pendingSimilarFilePath;
    if (!filePath || !displayAsset || !window.yiman?.project?.addSimilarAssetToBundle) return;
    const api = window.yiman.project;
    if (!api.saveTransparentVideoAsset) {
      message.error('透明视频导入未就绪');
      return;
    }
    setAddingSimilar(true);
    try {
      const res = await api.saveTransparentVideoAsset(projectDir, filePath, 'auto', {
        description: null,
        is_favorite: 0,
        tags: displayAsset.tags ?? undefined,
        tolerance: 80,
        contiguous: false,
      });
      if (!res?.ok || !res.id) {
        message.error(res?.error || '导入失败');
        return;
      }
      const addRes = await api.addSimilarAssetToBundle(projectDir, displayAsset.id, res.id);
      if (!addRes?.ok) {
        message.error(addRes?.error || '归入同类组失败');
        return;
      }
      message.success('已添加并归入同类组');
      setSimilarTransparentModalOpen(false);
      setPendingSimilarFilePath(null);
      setBundleReloadTick((t) => t + 1);
      onUpdate();
    } finally {
      setAddingSimilar(false);
    }
  }, [pendingSimilarFilePath, displayAsset, projectDir, message, onUpdate]);

  const handleCloseTag = (removedTag: string) => {
    const next = tags.filter((t) => t !== removedTag);
    setTags(next);
  };

  const handleInputConfirm = () => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setInputVisible(false);
    setInputValue('');
  };

  const handleDelete = useCallback(() => {
    if (!displayAsset || !window.yiman?.project?.deleteAsset) return;
    void window.yiman.project
      .deleteAsset(projectDir, displayAsset.id)
      .then((res: { ok: boolean; error?: string }) => {
        if (res?.ok) {
          message.success('已移除');
          onClose();
          onUpdate();
        } else message.error(res?.error || '删除失败');
      });
  }, [projectDir, displayAsset, message, onClose, onUpdate]);

  const showBundleNav = !bundleLoading && bundleInGroup && bundleMemberIds.length >= 2;
  const showAddSimilar =
    !bundleLoading &&
    !!displayAsset &&
    !!openFileDialog &&
    (displayAsset.type === 'transparent_video' ? !!window.yiman?.project?.saveTransparentVideoAsset : !!saveAssetFromFile);
  const memberFileLabel = displayAsset?.path?.split(/[/\\]/).pop() || '';

  return (
    <>
    <Drawer
      title={
        displayAsset ? (
          bundleId ? (
            <EditableTitle
              value={bundleTitle}
              onChange={(v) => setBundleTitle(v)}
              placeholder="素材包名称"
              prefix=""
            />
          ) : (
            <EditableTitle
              value={name}
              onChange={(v) => setName(v)}
              placeholder={memberFileLabel || '视频'}
              prefix=""
            />
          )
        ) : (
          '视频预览'
        )
      }
      open={open}
      onClose={onClose}
      size={480}
      destroyOnHidden
      maskClosable={!dirty}
      extra={
        <Space size={4}>
          {showAddSimilar && (
            <Tooltip
              title={
                displayAsset?.type === 'transparent_video'
                  ? '添加子项（透明视频组仅可加入抠色后的透明视频，选文件后需确认再处理）'
                  : '添加子项（以普通视频文件入库；与组内类型一致）'
              }
            >
              <Button
                size="small"
                icon={<PlusCircleOutlined />}
                type="text"
                loading={addingSimilar && !similarTransparentModalOpen}
                onClick={() => void handleAddSimilar()}
              />
            </Tooltip>
          )}
          <Button type="primary" size="small" onClick={handleSaveTags} loading={saving} disabled={!dirty}>
            保存
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'change-category', label: '变更分类' },
                { key: 'delete', label: '删除', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'change-category') setChangeCategoryOpen(true);
                else if (key === 'delete') handleDelete();
              },
            }}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      }
    >
      {displayAsset && (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          {showBundleNav && (
            <AssetBundlePreviewNav
              memberIds={bundleMemberIds}
              currentAssetId={displayAsset.id}
              onChangeCurrent={(id) => void handleBundleNavigate(id)}
              onDeleteCurrent={handleDelete}
              memberDescription={displayAsset.description}
              memberFileLabel={memberFileLabel}
              onMemberDescriptionCommit={(v) => void handleMemberDescriptionCommit(v)}
            />
          )}
          <div
            style={{
              position: 'relative',
              aspectRatio: '16/9',
              maxHeight: 280,
              borderRadius: 8,
              overflow: 'hidden',
              background: isTransparent
                ? undefined
                : 'rgba(255,255,255,0.06)',
            }}
          >
            {isTransparent && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  ...CHECKERBOARD_BACKGROUND,
                  pointerEvents: 'none',
                }}
              />
            )}
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="secondary">加载中</Text>
              </div>
            )}
          </div>

          {canMatting && (
            <Space wrap>
              <Button
                size="small"
                icon={<ScissorOutlined />}
                onClick={() => setVideoMattingPanelOpen(true)}
              >
                视频去背景
              </Button>
              <Button
                size="small"
                icon={<PictureOutlined />}
                onClick={async () => {
                  if (currentAsset?.id && window.yiman?.project?.getAssetById) {
                    const fresh = (await window.yiman.project.getAssetById(projectDir, currentAsset.id)) as AssetRow | null;
                    if (fresh) setDisplayAsset(fresh);
                  }
                  setVideoToSpritePanelOpen(true);
                }}
              >
                转精灵图
              </Button>
            </Space>
          )}

          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              标签
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    handleCloseTag(tag);
                  }}
                >
                  {tag}
                </Tag>
              ))}
              {inputVisible ? (
                <Input
                  ref={inputRef}
                  type="text"
                  size="small"
                  style={{ width: 78 }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleInputConfirm}
                  onPressEnter={handleInputConfirm}
                />
              ) : (
                <Tag onClick={() => setInputVisible(true)} style={{ background: token.colorBgContainer, borderStyle: 'dashed' }}>
                  <PlusOutlined /> 添加标签
                </Tag>
              )}
            </div>
          </div>
        </Space>
      )}
    </Drawer>

    {canMatting && currentAsset && mattingVideoPath && (
      <VideoMattingPanel
        open={videoMattingPanelOpen}
        onClose={() => setVideoMattingPanelOpen(false)}
        projectDir={projectDir}
        videoPath={mattingVideoPath}
        assetId={currentAsset.id}
        duration={currentAsset.duration}
        onReprocess={() => {
          setVideoMattingPanelOpen(false);
          onUpdate();
          onReprocessComplete?.(currentAsset!.id);
          window.yiman?.project?.getAssetById?.(projectDir, currentAsset!.id).then((fresh) => {
            if (fresh && (fresh as AssetRow).path) {
              setDisplayAsset(fresh as AssetRow);
              const p = (fresh as AssetRow).path;
              window.yiman?.project?.getAssetDataUrl?.(projectDir, p).then((url) => {
                setVideoUrl(url ?? null);
                if (videoRef.current && url) {
                  videoRef.current.src = url;
                  videoRef.current.load();
                }
              });
            }
          });
        }}
      />
    )}

    {canMatting && spriteVideoPath && (
      <VideoToSpritePanel
        open={videoToSpritePanelOpen}
        onClose={() => setVideoToSpritePanelOpen(false)}
        projectDir={projectDir}
        videoPath={spriteVideoPath}
        onSaved={(result) => {
          onUpdate();
          onSpriteSaved?.(result);
        }}
      />
    )}

    <Modal
      title="导入为透明视频子项"
      open={similarTransparentModalOpen}
      destroyOnHidden
      okText="开始抠色并加入组"
      cancelText="取消"
      confirmLoading={addingSimilar}
      onCancel={() => {
        setSimilarTransparentModalOpen(false);
        setPendingSimilarFilePath(null);
      }}
      onOk={() => void confirmTransparentSimilarImport()}
    >
      <Text type="secondary">
        同类组内子素材类型须一致。当前组为透明视频，新文件需经抠色处理后才能写入为透明视频素材。若只需普通视频，请单独建立「普通视频」同类组。
      </Text>
    </Modal>

    <ChangeCategoryModal
      open={changeCategoryOpen}
      onCancel={() => setChangeCategoryOpen(false)}
      currentCategory={currentAsset ? (getAssetUiCategory(currentAsset.tags) as ChangeCategoryTarget) : undefined}
      assetType={currentAsset?.type}
      projectDir={projectDir}
      onConfirm={async (category, characterId) => {
        if (!displayAsset) return;
        setChangeCategoryOpen(false);
        if (category === 'character') {
          // 变更到角色：委托父组件处理 character.transparent_videos 写入
          onChangeCategory?.(displayAsset.id, category, characterId);
          onUpdate();
        } else {
          if (!window.yiman?.project?.updateAsset) return;
          const newTags = addCategoryToTags(displayAsset.tags, category as AssetUiCategory);
          const res = await window.yiman.project.updateAsset(projectDir, displayAsset.id, { tags: newTags });
          if (res?.ok) {
            message.success('分类已更新');
            onUpdate();
          } else {
            message.error(res?.error || '变更分类失败');
          }
        }
      }}
    />
    </>
  );
}
