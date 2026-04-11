/**
 * 选择角色 Modal：添加素材到特定角色时，先在此弹窗选择角色名
 */
import { useState, useEffect } from 'react';
import { Modal, Select, Typography } from 'antd';
import {
  STANDALONE_SPRITES_CHARACTER_ID,
  STANDALONE_COMPONENTS_CHARACTER_ID,
} from '@/constants/project';

const { Text } = Typography;

interface Character {
  id: string;
  name: string;
}

interface CharacterSelectModalProps {
  open: boolean;
  title?: string;
  projectDir: string;
  onCancel: () => void;
  onConfirm: (characterId: string) => void;
}

export function CharacterSelectModal({
  open,
  title = '请选择角色',
  projectDir,
  onCancel,
  onConfirm,
}: CharacterSelectModalProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setSelectedId(undefined);
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
  }, [open, projectDir]);

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        if (selectedId) onConfirm(selectedId);
      }}
      okButtonProps={{ disabled: !selectedId }}
      okText="确认"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ padding: '12px 0' }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          选择添加到哪个角色
        </Text>
        {characters.length === 0 ? (
          <Text type="secondary">暂无角色，请先在「角色」页面创建角色</Text>
        ) : (
          <Select
            placeholder="请选择角色"
            style={{ width: '100%' }}
            value={selectedId}
            onChange={setSelectedId}
            options={characters.map((c) => ({ value: c.id, label: c.name || '未命名' }))}
          />
        )}
      </div>
    </Modal>
  );
}
