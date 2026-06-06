import { Button, Input, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Character, ShotDialogue } from '@/constants/Script';

const { Text } = Typography;

interface NovelShotDialogueListProps {
  dialogues: ShotDialogue[];
  characters: Character[];
  onChange: (dialogues: ShotDialogue[]) => void;
}

export function NovelShotDialogueList({ dialogues, characters, onChange }: NovelShotDialogueListProps) {
  const list = dialogues ?? [];

  const updateAt = (index: number, patch: Partial<ShotDialogue>) => {
    const next = list.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange(next);
  };

  const add = () => {
    const fallbackId = characters[0]?.id ?? '';
    onChange([
      ...list,
      { characterId: fallbackId, text: '', emotion: '', isNarration: false },
    ]);
  };

  const remove = (index: number) => {
    onChange(list.filter((_, i) => i !== index));
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Text type="secondary" style={{ fontSize: 12 }}>
        对白
      </Text>
      {list.map((d, i) => (
        <Space key={`${d.characterId}_${i}`} orientation="vertical" style={{ width: '100%' }} size={4}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ minWidth: 120, flex: 1 }}
              placeholder="角色"
              value={d.characterId || undefined}
              onChange={(v) => updateAt(i, { characterId: v })}
              options={[
                ...characters.map((c) => ({ value: c.id, label: c.name })),
                ...(d.characterId && !characters.some((c) => c.id === d.characterId) ?
                  [{ value: d.characterId, label: `${d.characterId}（待关联）` }]
                : []),
              ]}
              allowClear
              showSearch
              optionFilterProp="label"
            />
            <Select
              style={{ width: 88 }}
              value={d.isNarration ? 'narration' : 'dialogue'}
              onChange={(v) => updateAt(i, { isNarration: v === 'narration' })}
              options={[
                { value: 'dialogue', label: '对白' },
                { value: 'narration', label: '旁白' },
              ]}
            />
            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
          <Input.TextArea
            rows={2}
            placeholder="台词"
            value={d.text}
            onChange={(e) => updateAt(i, { text: e.target.value })}
          />
          <Input
            size="small"
            placeholder="情绪（可选）"
            value={d.emotion ?? ''}
            onChange={(e) => updateAt(i, { emotion: e.target.value || undefined })}
          />
        </Space>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={add} block>
        添加对白
      </Button>
    </Space>
  );
}

export { normalizeDialogueInput } from '@/novelDesign/utils/novelScriptModel';
