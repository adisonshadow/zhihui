/**
 * 同类素材组：选择子项（素材库与设计器共用）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Space, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { ResponsiveCardGrid } from '@/components/antd-plus/ResponsiveCardGrid';
import { AssetThumb } from '@/components/asset/AssetLibraryCard';

const { Text } = Typography;

export type AssetBundlePickMember = {
  id: string;
  path: string;
  type: string;
  description: string | null;
  cover_path?: string | null;
};

export type AssetBundlePickMode = 'library' | 'designer';

export interface AssetBundlePickModalProps {
  open: boolean;
  bundleId: string | null;
  projectDir: string;
  mode: AssetBundlePickMode;
  onCancel: () => void;
  /** 设计器：将选中素材放置到时间线（由父组件调用 placeImageAsset / placeVideoAsset / placeAudioAsset 等） */
  onPlaceMember?: (asset: AssetBundlePickMember) => void | Promise<void>;
  /** 打开侧边栏预览 */
  onPreviewMember: (asset: AssetBundlePickMember) => void;
  title?: string;
  /** Modal 内子项拖拽到时间线时写入 dataTransfer（设计器） */
  setDragPayload?: (e: React.DragEvent, asset: AssetBundlePickMember) => void;
}

export function AssetBundlePickModal({
  open,
  bundleId,
  projectDir,
  mode,
  onCancel,
  onPlaceMember,
  onPreviewMember,
  title = '选择组内素材',
  setDragPayload,
}: AssetBundlePickModalProps) {
  const [members, setMembers] = useState<AssetBundlePickMember[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bundleId || !open || !window.yiman?.project?.getAssetBundleMembersOrdered) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const list = (await window.yiman.project.getAssetBundleMembersOrdered(projectDir, bundleId)) as AssetBundlePickMember[];
      const base = Array.isArray(list) ? list : [];
      /** 子项名称以 assets_index 为准，与 asset_bundles.title 分离，避免侧栏预览标题误用包名 */
      if (!base.length || !window.yiman.project.getAssetById) {
        setMembers(base);
      } else {
        const resolved = await Promise.all(
          base.map(async (row) => {
            const fresh = await window.yiman?.project?.getAssetById?.(projectDir, row.id);
            /** 使用完整 assets_index 行，避免视频等类型缺少 duration/original_path */
            return (fresh ?? row) as AssetBundlePickMember;
          })
        );
        setMembers(resolved);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [projectDir, bundleId, open]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      destroyOnHidden
    >
      {loading ? (
        <Text type="secondary">加载中…</Text>
      ) : members.length === 0 ? (
        <Text type="secondary">组内暂无素材</Text>
      ) : (
        <ResponsiveCardGrid minItemWidth={140}>
          {members.map((asset) => (
            <div
              key={asset.id}
              draggable={mode === 'designer' && !!setDragPayload}
              onDragStart={(e) => setDragPayload?.(e, asset)}
              style={{ padding: 8 }}
            >
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  padding: 8,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ cursor: 'pointer' }} onClick={() => onPreviewMember(asset)}>
                  <AssetThumb projectDir={projectDir} path={asset.path} coverPath={asset.cover_path} size="fullWidth" />
                </div>
                <Typography.Paragraph
                  ellipsis={{ rows: 2 }}
                  style={{ fontSize: 11, marginTop: 8, marginBottom: 8, minHeight: 32 }}
                >
                  {asset.description?.trim() || asset.path.split(/[/\\]/).pop() || asset.id}
                </Typography.Paragraph>
                <Space wrap size={4}>
                  {mode === 'designer' && onPlaceMember && (
                    <Button size="small" type="primary" onClick={() => void onPlaceMember(asset)}>
                      添加
                    </Button>
                  )}
                  <Button size="small" icon={<EyeOutlined />} onClick={() => onPreviewMember(asset)}>
                    预览
                  </Button>
                </Space>
              </div>
            </div>
          ))}
        </ResponsiveCardGrid>
      )}
    </Modal>
  );
}
