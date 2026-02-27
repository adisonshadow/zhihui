/**
 * 元件组编辑面板：多状态（由 tag 构成）、画板可插入图片/精灵动作/嵌套元件组、预览支持 tag 指定与向内传递
 */
import { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Space, Typography, App, Input, Tag, Dropdown, Modal, Radio } from 'antd';
import { PlusOutlined, DeleteOutlined, MoreOutlined, PictureOutlined, EyeOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { GroupComponentItem, GroupComponentState, GroupCanvasItem } from '@/types/groupComponent';
import { GROUP_CANVAS_SIZE } from '@/types/groupComponent';
import type { SpriteSheetItem } from './SpriteSheetPanel';
import { GroupStateCanvas } from './GroupStateCanvas';
import { GroupPreview } from './GroupPreview';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';

const { Text } = Typography;

/** 递归收集当前元件组及所有嵌套元件组及其 tags（用于预览 tag 选择） */
function collectGroupsWithTags(
  group: GroupComponentItem | null,
  componentGroups: GroupComponentItem[],
  seen: Set<string> = new Set()
): { group: GroupComponentItem; tags: string[] }[] {
  if (!group || seen.has(group.id)) return [];
  seen.add(group.id);
  const tagOrder: string[] = [];
  for (const s of group.states) {
    for (const t of s.tags) {
      const trimmed = t?.trim();
      if (trimmed && !tagOrder.includes(trimmed)) tagOrder.push(trimmed);
    }
  }
  const result: { group: GroupComponentItem; tags: string[] }[] = [{ group, tags: tagOrder }];
  for (const state of group.states) {
    for (const it of state.items) {
      if (it.type === 'group' && it.groupId) {
        const nested = componentGroups.find((g) => g.id === it.groupId);
        if (nested) {
          result.push(...collectGroupsWithTags(nested, componentGroups, seen));
        }
      }
    }
  }
  return result;
}

/** 预览区域显示尺寸（px），内部按 GROUP_CANVAS_SIZE 1024 设计并 scale 适配 */
const PREVIEW_DISPLAY_SIZE = 370;

export interface GroupComponentPanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  characterId: string;
  item: GroupComponentItem | null;
  onSave: (item: GroupComponentItem) => void;
  /** 当前人物的精灵动作列表 */
  spriteSheets: SpriteSheetItem[];
  /** 当前人物的元件组列表（不含自身，用于嵌套选择） */
  componentGroups: GroupComponentItem[];
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  getAssets: (projectDir: string) => Promise<{ id: string; path: string; type: string }[]>;
  saveAssetFromFile: (projectDir: string, filePath: string, type: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveAssetFromBase64?: (projectDir: string, base64Data: string, ext?: string, type?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  openFileDialog: () => Promise<string | undefined>;
  matteImageAndSave?: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** 从人物元件组打开时，可获取全部人物的精灵图/元件组以支持「仅查看本人物的」筛选 */
  getAllCharactersData?: () => Promise<
    { characterId: string; characterName?: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[]
  >;
}

export function GroupComponentPanel({
  open,
  onClose,
  projectDir,
  characterId,
  item: initialItem,
  onSave,
  spriteSheets,
  componentGroups,
  getAssetDataUrl,
  getAssets,
  saveAssetFromFile,
  saveAssetFromBase64,
  openFileDialog,
  matteImageAndSave,
  getAllCharactersData,
}: GroupComponentPanelProps) {
  const { message } = App.useApp();
  const [item, setItem] = useState<GroupComponentItem | null>(initialItem);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(() =>
    initialItem?.states?.length ? initialItem.states[0]!.id : null
  );
  /** 预览时每个元件组选中的 tag，key=groupId, value=tag */
  const [selectedTagsByGroupId, setSelectedTagsByGroupId] = useState<Record<string, string>>({});
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<{ id: string; path: string; type: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [selectedCanvasItemId, setSelectedCanvasItemId] = useState<string | null>(null);

  useEffect(() => {
    setItem(initialItem);
    if (initialItem?.states?.length) {
      const firstId = initialItem.states[0]!.id;
      setSelectedStateId((prev) => (prev && initialItem.states.some((s) => s.id === prev) ? prev : firstId));
    } else {
      setSelectedStateId(null);
    }
  }, [initialItem, open]);

  /** 预览面板打开时，各 Radio.Group 默认选中第一个 tag */
  useEffect(() => {
    if (!previewDrawerOpen || !item) return;
    const groupsWithTags = collectGroupsWithTags(item, componentGroups);
    const next: Record<string, string> = {};
    for (const { group, tags } of groupsWithTags) {
      next[group.id] = tags[0] ?? '';
    }
    setSelectedTagsByGroupId(next);
  }, [previewDrawerOpen, item?.id, componentGroups]);

  const selectedState = item?.states.find((s) => s.id === selectedStateId) ?? null;

  const handleAddState = useCallback(() => {
    const newId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newState: GroupComponentState = { id: newId, tags: [], items: [] };
    setItem((i) => (i ? { ...i, states: [...i.states, newState] } : i));
    setSelectedStateId(newId);
  }, []);

  const handleDeleteState = useCallback(
    (stateId: string) => {
      setItem((i) => (i ? { ...i, states: i.states.filter((s) => s.id !== stateId) } : i));
      if (selectedStateId === stateId) {
        const rest = item?.states.filter((s) => s.id !== stateId) ?? [];
        setSelectedStateId(rest[0]?.id ?? null);
      }
    },
    [item, selectedStateId]
  );

  const handleUpdateStateTags = useCallback(
    (stateId: string, tags: string[]) => {
      setItem((i) =>
        i ? { ...i, states: i.states.map((s) => (s.id === stateId ? { ...s, tags } : s)) } : i
      );
    },
    []
  );

  const handleAddTagToState = useCallback(
    (stateId: string, tag: string) => {
      const t = tag.trim();
      if (!t) return;
      const state = item?.states.find((s) => s.id === stateId);
      if (!state || state.tags.includes(t)) return;
      handleUpdateStateTags(stateId, [...state.tags, t]);
      setTagInput('');
    },
    [item, handleUpdateStateTags]
  );

  const handleRemoveTagFromState = useCallback(
    (stateId: string, tag: string) => {
      const state = item?.states.find((s) => s.id === stateId);
      if (!state) return;
      handleUpdateStateTags(stateId, state.tags.filter((t) => t !== tag));
    },
    [item, handleUpdateStateTags]
  );

  const handleAddCanvasItem = useCallback(
    (stateId: string, type: 'image' | 'sprite' | 'group', ref: { path?: string; spriteId?: string; groupId?: string; characterId?: string }) => {
      const newId = `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let newItem: GroupCanvasItem;
      const refCharId = ref.characterId ?? characterId;
      if (type === 'image' && ref.path) {
        newItem = { id: newId, type: 'image', path: ref.path, pos_x: 0.5, pos_y: 0.5, scale_x: 0.2, scale_y: 0.2 };
      } else if (type === 'sprite' && ref.spriteId) {
        newItem = {
          id: newId,
          type: 'sprite',
          characterId: refCharId,
          spriteId: ref.spriteId,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.2,
          scale_y: 0.2,
        };
      } else if (type === 'group' && ref.groupId) {
        newItem = {
          id: newId,
          type: 'group',
          characterId: refCharId,
          groupId: ref.groupId,
          pos_x: 0.5,
          pos_y: 0.5,
          scale_x: 0.2,
          scale_y: 0.2,
        };
      } else return;
      setItem((i) =>
        i
          ? {
              ...i,
              states: i.states.map((s) =>
                s.id === stateId ? { ...s, items: [...s.items, newItem] } : s
              ),
            }
          : i
      );
    },
    [characterId]
  );

  const handleReorderCanvasItem = useCallback((stateId: string, itemId: string, direction: 'top' | 'bottom') => {
    setItem((i) => {
      if (!i) return i;
      const state = i.states.find((s) => s.id === stateId);
      if (!state) return i;
      const idx = state.items.findIndex((it) => it.id === itemId);
      if (idx < 0) return i;
      const arr = [...state.items];
      const [removed] = arr.splice(idx, 1);
      if (direction === 'top') {
        arr.push(removed!);
      } else {
        arr.unshift(removed!);
      }
      return {
        ...i,
        states: i.states.map((s) => (s.id === stateId ? { ...s, items: arr } : s)),
      };
    });
  }, []);

  const handleDeleteCanvasItem = useCallback((stateId: string, itemId: string) => {
    setItem((i) =>
      i
        ? {
            ...i,
            states: i.states.map((s) =>
              s.id === stateId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s
            ),
          }
        : i
    );
  }, []);

  const handleUpdateCanvasItem = useCallback(
    (stateId: string, itemId: string, patch: Partial<GroupCanvasItem>) => {
      setItem((i) =>
        i
          ? {
              ...i,
              states: i.states.map((s) =>
                s.id === stateId
                  ? {
                      ...s,
                      items: s.items.map((it) =>
                        it.id === itemId ? ({ ...it, ...patch } as GroupCanvasItem) : it
                      ),
                    }
                  : s
              ),
            }
          : i
    );
  }, []);

  const handleUploadImage = useCallback(async () => {
    const filePath = await openFileDialog();
    if (!filePath || !saveAssetFromFile) return;
    const res = await saveAssetFromFile(projectDir, filePath, 'character');
    if (!res?.ok) {
      message.error(res?.error || '上传失败');
      return;
    }
    if (res.path && selectedStateId) {
      handleAddCanvasItem(selectedStateId, 'image', { path: res.path });
      message.success('已添加图片');
    }
  }, [projectDir, saveAssetFromFile, openFileDialog, message, selectedStateId, handleAddCanvasItem]);

  const openAssetPicker = useCallback(() => {
    setAssetPickerOpen(true);
    getAssets(projectDir).then(setAssets);
  }, [projectDir, getAssets]);

  const handlePickAsset = useCallback(
    (path: string) => {
      if (selectedStateId) {
        handleAddCanvasItem(selectedStateId, 'image', { path });
        setAssetPickerOpen(false);
        message.success('已添加图片');
      }
    },
    [selectedStateId, handleAddCanvasItem, message]
  );

  const handleSave = useCallback(() => {
    if (!item) return;
    const next: GroupComponentItem = {
      ...item,
      name: item.name?.trim() || undefined,
    };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('已保存');
    onClose();
  }, [item, onSave, onClose, message]);

  const parsedPreviewTags = Object.values(selectedTagsByGroupId).filter(Boolean);

  const groupsWithTags = item ? collectGroupsWithTags(item, componentGroups) : [];

  return (
    <>
      <Drawer
        title={
          item ? (
            <EditableTitle
              value={item.name ?? ''}
              onChange={(v) => setItem((i) => (i ? { ...i, name: v || undefined } : i))}
              placeholder="元件组"
              prefix="编辑元件组："
            />
          ) : (
            '新建元件组'
          )
        }
        placement="right"
        size={520}
        open={open}
        onClose={onClose}
        styles={{ body: { overflowY: 'auto', paddingBottom: 24 } }}
        extra={
          <Space>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewDrawerOpen(true)}>
              预览
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              保存
            </Button>
          </Space>
        }
        maskClosable={false}
      >
        {!item ? (
          <Text type="secondary">请先保存新建项后再编辑。</Text>
        ) : (
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong>状态列表</Text>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddState}>
                  添加状态
                </Button>
              </div>
              <Space wrap size={[8, 8]}>
                {item.states.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: selectedStateId === s.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${selectedStateId === s.id ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onClick={() => setSelectedStateId(s.id)}
                  >
                    <div>
                      {s.tags.length > 0 ? (
                        s.tags.map((t) => (
                          <Tag
                            key={t}
                            closable
                            onClose={(e) => {
                              e.preventDefault();
                              handleRemoveTagFromState(s.id, t);
                            }}
                          >
                            {t}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">无 tag</Text>
                      )}
                    </div>
                    <Dropdown
                      menu={{
                        items: [{ key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />, onClick: () => handleDeleteState(s.id) }],
                      }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
                    </Dropdown>
                  </div>
                ))}
              </Space>
            </div>

            {selectedState && (
              <>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    当前状态的 Tags
                  </Text>
                  <Space wrap style={{ marginBottom: 8 }}>
                    <Input
                      placeholder="输入 tag 后回车"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onPressEnter={() => handleAddTagToState(selectedState.id, tagInput)}
                      style={{ width: 140 }}
                    />
                    <Button size="small" onClick={() => handleAddTagToState(selectedState.id, tagInput)}>
                      添加
                    </Button>
                  </Space>
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    设计画板
                  </Text>
                  <GroupStateCanvas
                    items={selectedState.items}
                    selectedItemId={selectedCanvasItemId}
                    onSelectItem={setSelectedCanvasItemId}
                    onItemUpdate={(itemId, patch) => handleUpdateCanvasItem(selectedState.id, itemId, patch)}
                    onItemDelete={(itemId) => handleDeleteCanvasItem(selectedState.id, itemId)}
                    onItemReorder={(itemId, direction) => handleReorderCanvasItem(selectedState.id, itemId, direction)}
                    onAddImage={handleUploadImage}
                    onAddImageFromAssets={openAssetPicker}
                    onAddSprite={(spriteId, charId) => handleAddCanvasItem(selectedState.id, 'sprite', { spriteId, characterId: charId })}
                    onAddGroup={(groupId, charId) => handleAddCanvasItem(selectedState.id, 'group', { groupId, characterId: charId })}
                    spriteSheets={spriteSheets}
                    componentGroups={componentGroups}
                    currentGroupId={item.id}
                    projectDir={projectDir}
                    characterId={characterId}
                    getAssetDataUrl={getAssetDataUrl}
                    saveAssetFromBase64={saveAssetFromBase64}
                    matteImageAndSave={matteImageAndSave}
                    getAllCharactersData={getAllCharactersData}
                  />
                </div>
              </>
            )}
          </Space>
        )}
      </Drawer>

      <Drawer
        title="预览"
        placement="right"
        size={420}
        open={previewDrawerOpen}
        onClose={() => setPreviewDrawerOpen(false)}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <GroupPreview
            projectDir={projectDir}
            characterId={characterId}
            group={item}
            tags={parsedPreviewTags}
            spriteSheets={spriteSheets}
            componentGroups={componentGroups}
            getAssetDataUrl={getAssetDataUrl}
            size={PREVIEW_DISPLAY_SIZE}
          />
          {groupsWithTags.map(({ group, tags }) =>
            tags.length > 0 ? (
              <div key={group.id}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
                  {group.name || group.id}
                </Text>
                <Radio.Group
                  value={selectedTagsByGroupId[group.id] ?? tags[0]}
                  optionType="button"
                  buttonStyle="solid"
                  onChange={(e) =>
                    setSelectedTagsByGroupId((prev) => ({ ...prev, [group.id]: e.target.value }))
                  }
                  options={tags.map((t) => ({ label: t, value: t }))}
                />
              </div>
            ) : null
          )}
        </Space>
      </Drawer>

      <Modal
        title="从素材库选择图片"
        open={assetPickerOpen}
        onCancel={() => setAssetPickerOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {assets.length === 0 ? (
            <Text type="secondary">暂无素材。</Text>
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
                  <AssetThumb projectDir={projectDir} path={a.path} getDataUrl={getAssetDataUrl} />
                  <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.path}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>
    </>
  );
}

function AssetThumb({
  projectDir,
  path,
  getDataUrl,
}: {
  projectDir: string;
  path: string;
  getDataUrl: (projectDir: string, path: string) => Promise<string | null>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getDataUrl]);
  return (
    <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {dataUrl ? (
        <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Text type="secondary">加载中</Text>
      )}
    </div>
  );
}

