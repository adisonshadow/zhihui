/**
 * 变更分类 Modal：选择目标分类，选"角色"时需额外选择角色名
 * 供 ImagePreviewDrawer / VideoPreviewDrawer / AudioPreviewDrawer / TextPreviewDrawer /
 *     SpriteSheetPanel / GroupComponentPanel 的 more 菜单调用
 */
import { useState, useEffect } from 'react';
import { Modal, Radio, Select, Space, Typography } from 'antd';
import {
  STANDALONE_SPRITES_CHARACTER_ID,
  STANDALONE_COMPONENTS_CHARACTER_ID,
} from '@/constants/project';

const { Text } = Typography;

interface Character {
  id: string;
  name: string;
}

export type ChangeCategoryTarget = 'scene' | 'prop' | 'effect' | 'sound' | 'character';

const VISUAL_OPTIONS: { value: ChangeCategoryTarget; label: string }[] = [
  { value: 'scene', label: '布景' },
  { value: 'prop', label: '道具' },
  { value: 'effect', label: '特效' },
  { value: 'character', label: '角色' },
];

const AUDIO_OPTIONS: { value: ChangeCategoryTarget; label: string }[] = [
  { value: 'sound', label: '声音' },
  { value: 'character', label: '角色' },
];

const TEXT_OPTIONS: { value: ChangeCategoryTarget; label: string }[] = [
  { value: 'scene', label: '布景' },
  { value: 'prop', label: '道具' },
  { value: 'effect', label: '特效' },
  { value: 'character', label: '角色' },
];

interface ChangeCategoryModalProps {
  open: boolean;
  onCancel: () => void;
  /** category: 目标分类；characterId: 仅选"角色"时有值 */
  onConfirm: (category: ChangeCategoryTarget, characterId?: string) => void;
  /** 当前分类，用于初始化选中项 */
  currentCategory?: ChangeCategoryTarget;
  /** 资产类型，决定可选分类 */
  assetType?: string;
  projectDir: string;
}

export function ChangeCategoryModal({
  open,
  onCancel,
  onConfirm,
  currentCategory,
  assetType,
  projectDir,
}: ChangeCategoryModalProps) {
  const isAudio = assetType === 'sfx' || assetType === 'music';
  const isText = assetType === 'text';
  const options = isAudio ? AUDIO_OPTIONS : isText ? TEXT_OPTIONS : VISUAL_OPTIONS;

  const defaultCat = (currentCategory && options.some((o) => o.value === currentCategory)
    ? currentCategory
    : options[0].value) as ChangeCategoryTarget;

  const [selected, setSelected] = useState<ChangeCategoryTarget>(defaultCat);
  const [characterId, setCharacterId] = useState<string | undefined>();
  const [characters, setCharacters] = useState<Character[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelected(defaultCat);
    setCharacterId(undefined);
    if (!window.yiman?.project?.getCharacters) return;
    window.yiman.project.getCharacters(projectDir).then((list) => {
      const all = (list as Character[]) || [];
      setCharacters(
        all.filter(
          (c) =>
            c.id !== STANDALONE_SPRITES_CHARACTER_ID &&
            c.id !== STANDALONE_COMPONENTS_CHARACTER_ID,
        ),
      );
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canConfirm = selected !== 'character' || !!characterId;

  return (
    <Modal
      title="变更分类"
      open={open}
      onCancel={onCancel}
      onOk={() => onConfirm(selected, selected === 'character' ? characterId : undefined)}
      okButtonProps={{ disabled: !canConfirm }}
      okText="确认"
      cancelText="取消"
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: '100%', paddingTop: 8 }}>
        <Radio.Group
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setCharacterId(undefined);
          }}
        >
          <Space orientation="vertical">
            {options.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>

        {selected === 'character' && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
              选择角色
            </Text>
            <Select
              placeholder="请选择角色"
              style={{ width: '100%' }}
              value={characterId}
              onChange={setCharacterId}
              options={characters.map((c) => ({ value: c.id, label: c.name || '未命名' }))}
            />
          </div>
        )}
      </Space>
    </Modal>
  );
}
