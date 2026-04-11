/**
 * 文字素材预览 Drawer：编辑名称与 tags，内容暂时为空（与其他编辑面板结构一致）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Input, Button, App, Space, Typography, Tag, Dropdown } from 'antd';
import { PlusOutlined, MoreOutlined } from '@ant-design/icons';
import { ChangeCategoryModal, type ChangeCategoryTarget } from './ChangeCategoryModal';
import { getAssetUiCategory, addCategoryToTags, type AssetUiCategory } from '@/utils/assetCategory';
import type { InputRef } from 'antd';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';

const { Text } = Typography;

interface AssetRow {
  id: string;
  path?: string;
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

export interface TextPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  asset: AssetRow | null;
  onUpdate?: () => void;
  onChangeCategory?: (assetId: string, category: string, characterId?: string) => void;
}

export function TextPreviewDrawer({
  open,
  onClose,
  projectDir,
  asset,
  onUpdate,
  onChangeCategory,
}: TextPreviewDrawerProps) {
  const { message } = App.useApp();
  const [tags, setTags] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [changeCategoryOpen, setChangeCategoryOpen] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const initialRef = useRef<{ name: string; tags: string }>({ name: '', tags: '' });

  useEffect(() => {
    if (asset) {
      const t = parseTags(asset.tags);
      const n = asset.description ?? '';
      setTags(t);
      setName(n);
      initialRef.current = { name: n, tags: t.join(',') };
    } else {
      setTags([]);
      setName('');
      initialRef.current = { name: '', tags: '' };
    }
  }, [asset]);

  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);

  const dirty = name !== initialRef.current.name || tags.join(',') !== initialRef.current.tags;

  const handleSave = useCallback(async () => {
    if (!asset || !window.yiman?.project?.updateAsset) return;
    setSaving(true);
    try {
      const res = await window.yiman.project.updateAsset(projectDir, asset.id, {
        tags: serializeTags(tags, asset.tags),
        description: name.trim() || null,
      });
      if (res?.ok) {
        message.success('已保存');
        initialRef.current = { name: name.trim() || '', tags: tags.join(',') };
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectDir, asset, tags, name, message, onUpdate]);

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
    if (!asset || !window.yiman?.project?.deleteAsset) return;
    void window.yiman.project
      .deleteAsset(projectDir, asset.id)
      .then((res: { ok: boolean; error?: string }) => {
        if (res?.ok) {
          message.success('已移除');
          onClose();
          onUpdate?.();
        } else message.error(res?.error || '删除失败');
      });
  }, [projectDir, asset, message, onClose, onUpdate]);

  return (
    <>
      <Drawer
        title={
          asset ? (
            <EditableTitle
              value={name}
              onChange={(v) => setName(v)}
              placeholder={asset.path?.split(/[/\\]/).pop() || '文字'}
              prefix=""
            />
          ) : (
            '文字预览'
          )
        }
        open={open}
        onClose={onClose}
        size={420}
        destroyOnHidden
        maskClosable={!dirty}
        extra={
          <Space size={4}>
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
        {asset && (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
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
                  <Tag onClick={() => setInputVisible(true)} style={{ borderStyle: 'dashed' }}>
                    <PlusOutlined /> 添加标签
                  </Tag>
                )}
              </div>
            </div>
            <Text type="secondary" style={{ display: 'block' }}>
              编辑内容暂时为空
            </Text>
          </Space>
        )}
      </Drawer>

      <ChangeCategoryModal
        open={changeCategoryOpen}
        onCancel={() => setChangeCategoryOpen(false)}
        currentCategory={asset ? (getAssetUiCategory(asset.tags) as ChangeCategoryTarget) : undefined}
        assetType="text"
        projectDir={projectDir}
        onConfirm={async (category, characterId) => {
          if (!asset || !window.yiman?.project?.updateAsset) return;
          setChangeCategoryOpen(false);
          const newTags = category !== 'character'
            ? addCategoryToTags(asset.tags, category as AssetUiCategory)
            : `${asset.tags ?? ''},__char:${characterId}`.replace(/^,/, '');
          const res = await window.yiman.project.updateAsset(projectDir, asset.id, { tags: newTags });
          if (res?.ok) {
            message.success('分类已更新');
            onUpdate?.();
          } else {
            message.error(res?.error || '变更分类失败');
          }
        }}
      />
    </>
  );
}
