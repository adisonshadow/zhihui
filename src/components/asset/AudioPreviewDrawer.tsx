/**
 * 音效/音乐预览 Drawer：使用 wavesurfer 波形预览、修改名称与 tags、删除素材（支持 AAC 等格式）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Input, Button, App, Space, Typography, Tag, theme, Dropdown, Tooltip } from 'antd';
import { PlusOutlined, PlusCircleOutlined, PlayCircleOutlined, PauseCircleOutlined, MoreOutlined } from '@ant-design/icons';
import { AssetBundlePreviewNav } from './AssetBundlePreviewNav';
import { ChangeCategoryModal } from './ChangeCategoryModal';
import { addCategoryToTags, type AssetUiCategory } from '@/utils/assetCategory';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';
import WavesurferPlayer from '@wavesurfer/react';

const { Text } = Typography;

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
  tags?: string | null;
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

interface AudioPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  onUpdate: () => void;
  saveAssetFromFile?: (
    projectDir: string,
    sourcePath: string,
    type?: string,
    options?: { description?: string | null; is_favorite?: number; tags?: string | null }
  ) => Promise<{ ok: boolean; id?: string; path?: string; error?: string }>;
  openFileDialog?: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | undefined>;
}

export function AudioPreviewDrawer({
  open,
  onClose,
  projectDir,
  asset,
  onUpdate,
  saveAssetFromFile,
  openFileDialog,
}: AudioPreviewDrawerProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [changeCategoryOpen, setChangeCategoryOpen] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const wavesurferRef = useRef<{ playPause: () => void } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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

  useEffect(() => {
    if (!open) {
      setDisplayAsset(null);
      setBundleId(null);
      setBundleTitle('');
      bundleTitleInitialRef.current = '';
      return;
    }
    setDisplayAsset(asset);
  }, [open, asset]);

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

  useEffect(() => {
    if (!open || !displayAsset?.path || !window.yiman?.project?.getAssetDataUrl) {
      setAudioUrl(null);
      wavesurferRef.current = null;
      setIsPlaying(false);
      return;
    }
    wavesurferRef.current = null;
    setIsPlaying(false);
    window.yiman.project.getAssetDataUrl(projectDir, displayAsset.path).then(setAudioUrl);
  }, [open, projectDir, displayAsset?.path]);

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

  const dirty = bundleId
    ? tags.join(',') !== initialRef.current.tags || bundleTitle.trim() !== bundleTitleInitialRef.current
    : name !== initialRef.current.name || tags.join(',') !== initialRef.current.tags;

  const handleSave = useCallback(async () => {
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
    if (!displayAsset || !saveAssetFromFile || !openFileDialog || !window.yiman?.project?.addSimilarAssetToBundle) return;
    const audioExts = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'];
    const filePath = await openFileDialog({
      filters: [{ name: '音频', extensions: audioExts }],
    });
    if (!filePath) return;
    setAddingSimilar(true);
    try {
      const res = await saveAssetFromFile(projectDir, filePath, displayAsset.type, {
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

  const handleCloseTag = (removedTag: string) => {
    setTags((prev) => prev.filter((t) => t !== removedTag));
  };

  const handleInputConfirm = () => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
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
  const showAddSimilar = !bundleLoading && !!displayAsset && !!saveAssetFromFile && !!openFileDialog;
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
              placeholder={memberFileLabel || '音频'}
              prefix=""
            />
          )
        ) : (
          '音频预览'
        )
      }
      open={open}
      onClose={onClose}
      size={420}
      destroyOnHidden
      maskClosable={!dirty}
      extra={
        <Space size={4}>
          {showAddSimilar && (
            <Tooltip title="添加同类素材（选音频导入并与当前项归组）">
                <Button
                  size="small"
                  icon={<PlusCircleOutlined />}
                  type="text"
                  loading={addingSimilar}
                  onClick={() => void handleAddSimilar()}
                />
            </Tooltip>
          )}
          <Button type="primary" size="small" onClick={handleSave} loading={saving} disabled={!dirty}>
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
              padding: 16,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            {audioUrl ? (
              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                <WavesurferPlayer
                  height={80}
                  waveColor="rgba(255,255,255,0.4)"
                  progressColor="rgba(100,150,255,0.8)"
                  url={audioUrl}
                  onReady={(ws) => {
                    wavesurferRef.current = ws;
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <Button
                  type="primary"
                  size="small"
                  icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => wavesurferRef.current?.playPause?.()}
                >
                  {isPlaying ? '暂停' : '播放'}
                </Button>
              </Space>
            ) : (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Text type="secondary">加载中</Text>
              </div>
            )}
          </div>

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

    <ChangeCategoryModal
      open={changeCategoryOpen}
      onCancel={() => setChangeCategoryOpen(false)}
      currentCategory="sound"
      assetType={displayAsset?.type}
      projectDir={projectDir}
      onConfirm={async (category, characterId) => {
        if (!displayAsset || !window.yiman?.project?.updateAsset) return;
        setChangeCategoryOpen(false);
        const newTags = category !== 'character'
          ? addCategoryToTags(displayAsset.tags, category as AssetUiCategory)
          : `${displayAsset.tags ?? ''},__char:${characterId}`.replace(/^,/, '');
        const res = await window.yiman.project.updateAsset(projectDir, displayAsset.id, { tags: newTags });
        if (res?.ok) {
          message.success('分类已更新');
          onUpdate();
        } else {
          message.error(res?.error || '变更分类失败');
        }
      }}
    />
    </>
  );
}
