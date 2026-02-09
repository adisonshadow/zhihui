/**
 * 素材浏览（列 1 素材面板）：本地/人物/特效/声效/音乐 Tabs；本地为 GrowCard（导入+模糊搜索+已导入列表）（见功能文档 6.4、开发计划 2.12）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Typography, Button, Space, Divider, App, Modal, Form, Select, Checkbox, Input } from 'antd';
import { PlusOutlined, UserOutlined, ThunderboltOutlined, SoundOutlined, CustomerServiceOutlined, UploadOutlined, FolderOpenOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import { GrowCard } from '@/components/GrowCard';
import { ASSET_TYPES } from '@/constants/assetTypes';

const { Text } = Typography;
const { TextArea } = Input;

interface CharacterRow {
  id: string;
  name: string;
  image_path: string | null;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
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
  const [characterThumbs, setCharacterThumbs] = useState<Record<string, string>>({});
  const [assetsByType, setAssetsByType] = useState<Record<string, AssetRow[]>>({});
  const [assetThumbs, setAssetThumbs] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);

  /** 本地：已导入素材列表（所有分类） */
  const [localAssets, setLocalAssets] = useState<AssetRow[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importForm] = Form.useForm<{ type: string; is_favorite: boolean; description: string }>();

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

  const boundIds = useCallback((): string[] => {
    try {
      const arr = JSON.parse(episodeCharacterRefs || '[]');
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, [episodeCharacterRefs]);

  useEffect(() => {
    if (!window.yiman?.project?.getCharacters) return;
    window.yiman.project.getCharacters(projectDir).then((list) => setCharacters((list as CharacterRow[]) || []));
  }, [projectDir]);

  useEffect(() => {
    const ids = characters.map((c) => c.id);
    if (ids.length === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    const next: Record<string, string> = {};
    Promise.all(
      characters.map(async (c) => {
        if (!c.image_path) return;
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, c.image_path);
        if (url) next[c.id] = url;
      })
    ).then(() => setCharacterThumbs((prev) => ({ ...prev, ...next })));
  }, [projectDir, characters]);

  useEffect(() => {
    if (!window.yiman?.project?.getAssets) return;
    const types = ['transparent_video', 'sfx', 'music'] as const;
    Promise.all(types.map((t) => window.yiman!.project.getAssets(projectDir, t))).then(([fx, sfx, music]) => {
      setAssetsByType({
        transparent_video: (fx as AssetRow[]) || [],
        sfx: (sfx as AssetRow[]) || [],
        music: (music as AssetRow[]) || [],
      });
    });
  }, [projectDir]);

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
      ...(assetsByType.transparent_video || []),
      ...(assetsByType.sfx || []),
      ...(assetsByType.music || []),
    ];
    if (all.length === 0 || !window.yiman?.project?.getAssetDataUrl) return;
    const next: Record<string, string> = {};
    Promise.all(
      all.filter((a) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path)).map(async (a) => {
        const url = await window.yiman!.project.getAssetDataUrl(projectDir, a.path);
        if (url) next[a.id] = url;
      })
    ).then(() => setAssetThumbs((prev) => ({ ...prev, ...next })));
  }, [projectDir, assetsByType]);

  /** 图片类素材（无播放时长）默认 10 秒，其他 5 秒 */
  const getPlaceDuration = useCallback(async (assetId: string): Promise<number> => {
    if (!window.yiman?.project?.getAssetById) return 5;
    const a = (await window.yiman.project.getAssetById(projectDir, assetId)) as AssetRow | null;
    if (!a) return 5;
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(a.path) || ['character', 'scene_bg', 'prop', 'sticker'].includes(a.type || '');
    return isImage ? 10 : 5;
  }, [projectDir]);

  /** 放置到主轨道当前选中时间轴位置；若有冲突则插入后移（见功能文档 6.4） */
  const placeAsset = useCallback(
    async (assetId: string) => {
      if (!sceneId || !window.yiman?.project?.insertBlockAtMainTrack) return;
      setPlacing(true);
      try {
        let layers = (await window.yiman.project.getLayers?.(projectDir, sceneId)) as { id: string }[] | undefined;
        if (!layers?.length && window.yiman?.project?.createLayer) {
          const layerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const cr = await window.yiman.project.createLayer(projectDir, { id: layerId, scene_id: sceneId, name: '主轨道', z_index: 0, is_main: 1 });
          if (!cr?.ok) {
            message.error(cr?.error || '创建主轨道失败');
            return;
          }
        }
        const duration = await getPlaceDuration(assetId);
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const br = await window.yiman.project.insertBlockAtMainTrack(projectDir, sceneId, {
          id: blockId,
          asset_id: assetId,
          duration,
          insertAt: currentTime,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.25,
          scale_y: 0.25,
          rotation: 0,
        });
        if (br?.ok) {
          message.success('已放置到主轨道');
          onPlaced?.();
        } else message.error(br?.error || '放置失败');
      } finally {
        setPlacing(false);
      }
    },
    [projectDir, sceneId, currentTime, message, onPlaced, getPlaceDuration]
  );

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
      } else message.error(res?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  }, [projectDir, importForm, message, loadLocalAssets]);

  const placeCharacter = useCallback(
    async (char: CharacterRow) => {
      if (!char.image_path) {
        message.warning('该人物暂无形象');
        return;
      }
      if (!window.yiman?.project?.getAssets) return;
      const all = (await window.yiman.project.getAssets(projectDir)) as AssetRow[];
      const match = all.find((a) => a.path === char.image_path);
      if (!match) {
        message.warning('请先将该人物形象添加到素材库');
        return;
      }
      await placeAsset(match.id);
    },
    [projectDir, placeAsset, message]
  );

  /** 本地：模糊过滤（description、path、type） */
  const filteredLocalAssets = React.useMemo(() => {
    const kw = (localSearch || '').trim().toLowerCase();
    if (!kw) return localAssets;
    return localAssets.filter((a) => {
      const desc = (a.description || '').toLowerCase();
      const path = (a.path || '').toLowerCase();
      const type = (a.type || '').toLowerCase();
      return desc.includes(kw) || path.includes(kw) || type.includes(kw);
    });
  }, [localAssets, localSearch]);

  const sortedCharacters = React.useMemo(() => {
    const bound = boundIds();
    const boundSet = new Set(bound);
    const a: CharacterRow[] = [];
    const b: CharacterRow[] = [];
    characters.forEach((c) => (boundSet.has(c.id) ? a.push(c) : b.push(c)));
    return { bound: a, unbound: b };
  }, [characters, boundIds]);

  const tabItems = [
    {
      key: 'local',
      label: (
        <span>
          <FolderOpenOutlined /> 本地
        </span>
      ),
      children: (
        <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <GrowCard
            headerHeight={56}
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: 12,
              }}
            >
              {filteredLocalAssets.map((a) => (
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
            {filteredLocalAssets.length === 0 && (
              <Text type="secondary" style={{ display: 'block', padding: 16 }}>
                {localAssets.length === 0 ? '暂无已导入素材，点击「导入」添加' : '无匹配结果'}
              </Text>
            )}
          </GrowCard>
        </div>
      ),
    },
    {
      key: 'character',
      label: (
        <span>
          <UserOutlined /> 人物
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          {sortedCharacters.bound.length > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>绑定剧本的人物</Text>
              <div style={{ marginTop: 4, marginBottom: 8 }}>
                {sortedCharacters.bound.map((c) => (
                  <AssetItem
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    thumb={characterThumbs[c.id]}
                    onPlace={() => placeCharacter(c)}
                    placing={placing}
                  />
                ))}
              </div>
              {sortedCharacters.unbound.length > 0 && <Divider style={{ margin: '8px 0' }} />}
            </>
          )}
          {sortedCharacters.unbound.length > 0 && (
            <>
              {(sortedCharacters.bound.length > 0 || sortedCharacters.unbound.length > 0) && (
                <Text type="secondary" style={{ fontSize: 12 }}>未绑定人物</Text>
              )}
              <div style={{ marginTop: 4 }}>
                {sortedCharacters.unbound.map((c) => (
                  <AssetItem
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    thumb={characterThumbs[c.id]}
                    onPlace={() => placeCharacter(c)}
                    placing={placing}
                  />
                ))}
              </div>
            </>
          )}
          {characters.length === 0 && <Text type="secondary">暂无人物，请在「人物设计」中添加</Text>}
        </div>
      ),
    },
    {
      key: 'fx',
      label: (
        <span>
          <ThunderboltOutlined /> 特效
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
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
          {(assetsByType.transparent_video?.length ?? 0) === 0 && <Text type="secondary">暂无透明视频特效</Text>}
        </div>
      ),
    },
    {
      key: 'sfx',
      label: (
        <span>
          <SoundOutlined /> 声效
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          {(assetsByType.sfx || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
            />
          ))}
          {(assetsByType.sfx?.length ?? 0) === 0 && <Text type="secondary">暂无声效</Text>}
        </div>
      ),
    },
    {
      key: 'music',
      label: (
        <span>
          <CustomerServiceOutlined /> 音乐
        </span>
      ),
      children: (
        <div style={{ padding: '8px 0' }}>
          {(assetsByType.music || []).map((a) => (
            <AssetItem
              key={a.id}
              id={a.id}
              name={a.description || a.path.split(/[/\\]/).pop() || a.id}
              thumb={assetThumbs[a.id]}
              onPlace={() => placeAsset(a.id)}
              placing={placing}
            />
          ))}
          {(assetsByType.music?.length ?? 0) === 0 && <Text type="secondary">暂无音乐</Text>}
        </div>
      ),
    },
  ];

  if (!sceneId) {
    return <Text type="secondary">请先选择场景</Text>;
  }

  return (
    <>
      <Tabs
        size="small"
        items={tabItems}
        tabBarGutter={10}
        tabBarStyle={{ padding: '0 8px' }}
        styles={{
          header: { margin: '0', backgroundColor: '#343434', lineHeight: 1 },
          content: { height: '100%', overflow: 'hidden' },
        }}
      />
      <Modal
        title="导入本地素材"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onOk={handleImportLocal}
        confirmLoading={importing}
        okText="选择文件并导入"
      >
        <Form form={importForm} layout="vertical" initialValues={{ type: 'scene_bg', is_favorite: false, description: '' }}>
          <Form.Item name="type" label="分类" rules={[{ required: true }]}>
            <Select options={ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
          <Form.Item name="is_favorite" valuePropName="checked">
            <Checkbox>保存为常用</Checkbox>
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <TextArea rows={2} placeholder="素材描述" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/** 本地列表卡片：参考图样式，缩略图 + 左上角「已添加」角标（仅当该素材已在当前场景时间线中时显示）+ 下方文件名，支持点击/拖拽放置 */
function LocalAssetCard({
  id,
  name,
  thumb,
  added,
  onPlace,
  placing,
  placeDuration = 10,
}: { id: string; name: string; thumb?: string; added: boolean; onPlace: () => void; placing: boolean; placeDuration?: number }) {
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
}: { id: string; name: string; thumb?: string; onPlace: () => void; placing: boolean; placeDuration?: number }) {
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
      <Button type="primary" size="small" icon={<PlusOutlined />} loading={placing} onClick={onPlace}>
        放置
      </Button>
    </div>
  );
}
