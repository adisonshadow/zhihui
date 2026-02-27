/**
 * 素材库页：按分类筛选、列表/卡片、上传、保存为常用（见功能文档 5、开发计划 2.8）
 * 精灵图与人物精灵动作本质相同，使用项目级精灵图存储，点击「添加精灵图」打开与人物设计相同的编辑侧栏
 */
import React, { useState, useEffect, useCallback } from 'react';
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
  Card,
} from 'antd';
import { PlusOutlined, StarOutlined, StarFilled, DeleteOutlined } from '@ant-design/icons';
import { VideoPreviewDrawer } from '@/components/asset/VideoPreviewDrawer';
import { AudioPreviewDrawer } from '@/components/asset/AudioPreviewDrawer';
import { VideoTagInput } from '@/components/asset/VideoTagInput';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_CATEGORIES, ASSET_LIBRARY_CATEGORIES, type AssetCategoryValue } from '@/constants/assetCategories';
import { STANDALONE_SPRITES_CHARACTER_ID } from '@/constants/project';
import { AdaptiveCard } from '@/components/antd-plus/AdaptiveCard';
import { VirtualGrid } from '@/components/antd-plus/VirtualGrid';
import { SpriteSheetPanel, type SpriteSheetItem } from '@/components/character/SpriteSheetPanel';

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
}

export default function AssetLibraryTab({ project }: AssetLibraryTabProps) {
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
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<AssetRow | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [audioPreviewAsset, setAudioPreviewAsset] = useState<AssetRow | null>(null);
  const [audioPreviewOpen, setAudioPreviewOpen] = useState(false);
  const [form] = Form.useForm<{ type: AssetCategoryValue; is_favorite: boolean; description: string; name?: string; tags?: string; chromaKeyColor?: 'black' | 'green' | 'purple' }>();
  const projectDir = project.project_dir;

  const isSpriteCategory = typeFilter === 'sprite';
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
  }, [loadAssets]);

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
    if (isSpriteCategory) loadStandaloneSprites();
  }, [isSpriteCategory, loadStandaloneSprites]);

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
      } else {
        message.error(res?.error || '保存失败');
      }
    },
    [projectDir, standaloneSprites, loadStandaloneSprites, message]
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
    } else {
      message.error(res?.error || '添加失败');
    }
  }, [projectDir, standaloneSprites, loadStandaloneSprites, message]);

  const filtered = favoriteOnly ? assets.filter((a) => a.is_favorite) : assets;

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
          : [{ name: '素材', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'webm'] }],
    });
    if (!filePath) return;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const description =
      isVideo || isAudio ? (values.name?.trim() || fileName || null) : (values.description?.trim() || null);
    const tags = (values.tags ?? '').trim() || null;
    setUploading(true);
    try {
      const type = isVideo || isAudio ? typeFilter : values.type;
      let res: { ok: boolean; error?: string };
      if (isTransparent && window.yiman?.project?.saveTransparentVideoAsset) {
        const color = (values.chromaKeyColor ?? 'black') as 'black' | 'green' | 'purple';
        res = await window.yiman.project.saveTransparentVideoAsset(projectDir, filePath, color, {
          description,
          is_favorite: values.is_favorite ? 1 : 0,
          tags,
        });
      } else if (window.yiman?.project?.saveAssetFromFile) {
        res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, type, {
          description,
          is_favorite: values.is_favorite ? 1 : 0,
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
              <Radio.Group value={viewMode} buttonStyle="solid" onChange={(e) => setViewMode(e.target.value)} optionType="button" size="small" options={[{ value: 'list', label: '列表' }, { value: 'card', label: '卡片' }]} />
            </Space>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={isSpriteCategory ? handleAddSpriteSheet : () => setUploadModalOpen(true)}
            >
              {isSpriteCategory ? '添加精灵图' : '上传素材'}
            </Button>
          </div>
        }
      >

        <Spin spinning={loading && !isSpriteCategory}>
          {isSpriteCategory ? (
            standaloneSprites.length === 0 ? (
              <Empty description="暂无精灵图，点击「添加精灵图」添加" style={{ marginTop: 48 }} />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 12,
                  padding: 8,
                }}
              >
                {standaloneSprites.map((s) => (
                  <SpriteCard
                    key={s.id}
                    projectDir={projectDir}
                    sprite={s}
                    onEdit={() => {
                      setSpriteSheetPanelItem(s);
                      setSpriteSheetPanelOpen(true);
                    }}
                  />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <Empty description="暂无素材，点击「上传素材」添加" style={{ marginTop: 48 }} />
          ) : viewMode === 'card' ? (
            <div style={{ height: '100%', minHeight: 300 }}>
              <VirtualGrid
                data={filtered}
                rowHeight={180}
                columns={{ xs: 2, sm: 3, md: 4, lg: 5, xl: 6, xxl: 8 }}
                height="100%"
                gutter={0}
                getItemKey={(a) => a.id}
                renderItem={(a) => (
                  <div style={{ minHeight: 172, minWidth: 0, overflow: 'hidden' }}>
                    <AssetCard
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
                    />
                  </div>
                )}
              />
            </div>
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
          isVideoCategory ? '上传视频' : isAudioCategory ? (typeFilter === 'sfx' ? '上传音效' : '上传音乐') : '上传素材'
        }
        open={uploadModalOpen}
        onCancel={() => { setUploadModalOpen(false); form.resetFields(); }}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText={isVideoCategory ? '选择视频并上传' : isAudioCategory ? '选择音频并上传' : '选择文件并上传'}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'image', is_favorite: false, description: '', name: '', tags: '', chromaKeyColor: 'black' }}
        >
          {isVideoCategory || isAudioCategory ? (
            <>
              <Form.Item name="name" label="名称（可选，不填则用文件名）">
                <Input placeholder="素材名称" />
              </Form.Item>
              {isVideoCategory && typeFilter === 'transparent_video' && (
                <Form.Item name="chromaKeyColor" label="选择抠图颜色" rules={[{ required: true }]} initialValue="black">
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
    </div>
  );
}

function SpriteCard({
  projectDir,
  sprite,
  onEdit,
}: {
  projectDir: string;
  sprite: SpriteSheetItem;
  onEdit: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    const path = sprite.cover_path || sprite.image_path;
    if (!path) return;
    window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setThumb);
  }, [projectDir, sprite.cover_path, sprite.image_path]);
  return (
    <Card size="small" hoverable onClick={onEdit} style={{ cursor: 'pointer' }}>
      <div style={{ aspectRatio: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>未导入</Text>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sprite.name || '未命名'}
      </div>
    </Card>
  );
}

function AssetThumb({
  projectDir,
  path,
  coverPath,
  size = 80,
}: { projectDir: string; path: string; coverPath?: string | null; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const ext = path.split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext ?? '');
    const isAudio = ['mp3', 'wav'].includes(ext ?? '');
    if (isVideo && coverPath) {
      window.yiman?.project?.getAssetDataUrl(projectDir, coverPath).then(setDataUrl);
    } else if (!isAudio && !isVideo) {
      window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setDataUrl);
    } else {
      setDataUrl(null);
    }
  }, [projectDir, path, coverPath]);
  const ext = path.split('.').pop()?.toLowerCase();
  const isMediaPlaceholder = ['mp3', 'wav', 'mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext ?? '') && !dataUrl;
  if (isMediaPlaceholder) {
    return (
      <div style={{ width: size, height: size, background: 'rgba(255,255,255,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary">音/视频</Text>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
      {dataUrl ? <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">加载中</Text></div>}
    </div>
  );
}

function AssetCard({
  projectDir,
  asset,
  onFavorite,
  onDelete,
  onVideoPreview,
  onAudioPreview,
}: {
  projectDir: string;
  asset: AssetRow;
  onFavorite: () => void;
  onDelete: () => void;
  onVideoPreview?: () => void;
  onAudioPreview?: () => void;
}) {
  const isVideo = asset.type === 'video' || asset.type === 'transparent_video';
  const isAudio = asset.type === 'sfx' || asset.type === 'music';
  const handleCardClick = (isVideo && onVideoPreview ? onVideoPreview : isAudio && onAudioPreview ? onAudioPreview : undefined);

  return (
    <div style={{ padding: 8 }}>
      <Card 
        size="small"
        className="asset-card-hover"
        style={{ width: '100%', minWidth: 0, cursor: handleCardClick ? 'pointer' : undefined }}
        styles={{
          body: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          },
        }}
        onClick={handleCardClick}
      >
          <AssetThumb projectDir={projectDir} path={asset.path} coverPath={asset.cover_path} size={120} />
          <div style={{ width: '80%', maxWidth: '80%', marginTop: 8, fontSize: 12 }}>{asset.description || asset.path.split(/[/\\]/).pop() || asset.path}</div>
          <Space style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <Button type="text" size="small" icon={asset.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={onFavorite} />
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
          </Space>
      </Card>
    </div>
  );
}
