/**
 * 素材库页：按分类筛选、列表/卡片、上传、保存为常用（见功能文档 5、开发计划 2.8）
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Select,
  Radio,
  Space,
  Card,
  App,
  Modal,
  Form,
  Input,
  Checkbox,
  Spin,
  Typography,
  Empty,
} from 'antd';
import { PlusOutlined, StarOutlined, StarFilled, DeleteOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import { ASSET_TYPES, type AssetTypeValue } from '@/constants/assetTypes';

const { TextArea } = Input;
const { Text } = Typography;

interface AssetRow {
  id: string;
  path: string;
  type: string;
  is_favorite: number;
  description: string | null;
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
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm<{ type: AssetTypeValue; is_favorite: boolean; description: string }>();
  const projectDir = project.project_dir;

  const loadAssets = useCallback(async () => {
    if (!window.yiman?.project?.getAssets) return;
    setLoading(true);
    try {
      const list = await window.yiman.project.getAssets(projectDir, typeFilter || undefined);
      setAssets(list as AssetRow[]);
    } catch {
      message.error('加载素材失败');
    } finally {
      setLoading(false);
    }
  }, [projectDir, typeFilter, message]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const filtered = favoriteOnly ? assets.filter((a) => a.is_favorite) : assets;

  const handleUpload = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const filePath = await window.yiman?.dialog?.openFile?.({
      filters: [{ name: '素材', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'webm'] }],
    });
    if (!filePath || !window.yiman?.project?.saveAssetFromFile) return;
    setUploading(true);
    try {
      const res = await window.yiman.project.saveAssetFromFile(projectDir, filePath, values.type, {
        description: values.description?.trim() || null,
        is_favorite: values.is_favorite ? 1 : 0,
      });
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
    <div style={{ padding: '0 0 24px' }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap align="center">
          <span>分类：</span>
          <Select
            value={typeFilter}
            onChange={(v) => setTypeFilter(v ?? '')}
            placeholder="全部"
            allowClear
            style={{ width: 140 }}
            options={[{ value: '', label: '全部' }, ...ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
          <Checkbox checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)}>
            仅常用
          </Checkbox>
          <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} optionType="button" size="small" options={[{ value: 'list', label: '列表' }, { value: 'card', label: '卡片' }]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModalOpen(true)}>
            上传素材
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        {filtered.length === 0 ? (
          <Empty description="暂无素材，点击「上传素材」添加" style={{ marginTop: 48 }} />
        ) : viewMode === 'card' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {filtered.map((a) => (
              <AssetCard
                key={a.id}
                projectDir={projectDir}
                asset={a}
                onFavorite={() => toggleFavorite(a.id, a.is_favorite)}
                onDelete={() => handleDelete(a.id)}
              />
            ))}
          </div>
        ) : (
          <Space orientation="vertical" style={{ width: '100%' }} size="small">
            {filtered.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                }}
              >
                <AssetThumb projectDir={projectDir} path={a.path} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text ellipsis>{a.path}</Text>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                    {ASSET_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                    {a.description && ` · ${a.description}`}
                  </div>
                </div>
                <Button type="text" icon={a.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFavorite(a.id, a.is_favorite)} />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(a.id)} />
              </div>
            ))}
          </Space>
        )}
      </Spin>

      <Modal
        title="上传素材"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText="选择文件并上传"
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'character', is_favorite: false, description: '' }}>
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
    </div>
  );
}

function AssetThumb({ projectDir, path, size = 80 }: { projectDir: string; path: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isMedia, setIsMedia] = useState(false);
  useEffect(() => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['mp3', 'wav', 'mp4', 'webm'].includes(ext ?? '')) {
      setIsMedia(true);
      return;
    }
    window.yiman?.project?.getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path]);
  if (isMedia) {
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
}: {
  projectDir: string;
  asset: AssetRow;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <Card size="small" style={{ width: 140 }}>
      <AssetThumb projectDir={projectDir} path={asset.path} size={120} />
      <div style={{ marginTop: 8, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.path}</div>
      <Space style={{ marginTop: 8 }}>
        <Button type="text" size="small" icon={asset.is_favorite ? <StarFilled /> : <StarOutlined />} onClick={onFavorite} />
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
      </Space>
    </Card>
  );
}
