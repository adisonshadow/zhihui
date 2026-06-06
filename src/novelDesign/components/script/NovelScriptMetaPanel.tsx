import { Button, Flex, Input, InputNumber, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Character, Script } from '@/constants/Script';
import { bumpScriptMetadata } from '@/novelDesign/utils/novelScriptModel';

const { Text } = Typography;

function makeCharId(): string {
  return `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface NovelScriptMetaPanelProps {
  novelScript: Script;
  onChange: (script: Script) => void;
}

export function NovelScriptMetaPanel({ novelScript, onChange }: NovelScriptMetaPanelProps) {
  const patch = (p: Partial<Script>) => {
    onChange(bumpScriptMetadata({ ...novelScript, ...p }));
  };

  const patchStyle = (p: Partial<Script['style']>) => {
    onChange(bumpScriptMetadata({ ...novelScript, style: { ...novelScript.style, ...p } }));
  };

  const updateCharacter = (index: number, c: Character) => {
    const chars = [...novelScript.characters];
    chars[index] = c;
    patch({ characters: chars });
  };

  const addCharacter = () => {
    patch({
      characters: [
        ...novelScript.characters,
        {
          id: makeCharId(),
          name: '新角色',
          description: '',
          personality: '',
          importance: 'SECONDARY',
        },
      ],
    });
  };

  const removeCharacter = (index: number) => {
    patch({ characters: novelScript.characters.filter((_, i) => i !== index) });
  };

  return (
    <Flex
      vertical
      gap={12}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px' }}
      className="novel-script-meta-panel"
    >
      <Text type="secondary">全书剧本设定（故事大纲页编辑；各集分场在正文集的剧本区）</Text>
      <Input
        placeholder="作品名"
        value={novelScript.title}
        onChange={(e) => patch({ title: e.target.value })}
      />
      <Input.TextArea
        rows={2}
        placeholder="一句话梗概 logline"
        value={novelScript.logline}
        onChange={(e) => patch({ logline: e.target.value })}
      />
      <Select
        mode="tags"
        placeholder="类型标签，回车添加"
        value={novelScript.genre}
        onChange={(genre) => patch({ genre: genre as string[] })}
        style={{ width: '100%' }}
      />
      <Space wrap>
        <Input
          placeholder="画风"
          value={novelScript.style.artStyle}
          onChange={(e) => patchStyle({ artStyle: e.target.value })}
          style={{ width: 140 }}
        />
        <Select
          placeholder="画幅"
          value={novelScript.style.aspectRatio ?? '9:16'}
          onChange={(v) => patchStyle({ aspectRatio: v })}
          options={[
            { value: '9:16', label: '9:16 竖屏' },
            { value: '16:9', label: '16:9 横屏' },
          ]}
          style={{ width: 130 }}
        />
        <Space.Compact>
          <InputNumber
            min={30}
            max={600}
            value={novelScript.targetDuration}
            onChange={(v) => patch({ targetDuration: v ?? 90 })}
          />
          <Input
            readOnly
            tabIndex={-1}
            value="秒/集"
            style={{
              width: 52,
              textAlign: 'center',
              cursor: 'default',
              color: 'var(--ant-color-text-secondary)',
              background: 'var(--ant-color-fill-tertiary)',
            }}
          />
        </Space.Compact>
      </Space>
      <Input
        placeholder="目标作品类型（漫剧、有声书等）"
        value={novelScript.targetContentType ?? ''}
        onChange={(e) => patch({ targetContentType: e.target.value || undefined })}
      />

      <Text strong>角色</Text>
      {novelScript.characters.map((c, i) => (
        <Space key={c.id} orientation="vertical" style={{ width: '100%' }} size={6}>
          <Space wrap style={{ width: '100%' }}>
            <Input
              placeholder="姓名"
              value={c.name}
              onChange={(e) => updateCharacter(i, { ...c, name: e.target.value })}
              style={{ width: 120 }}
            />
            <Select
              value={c.importance}
              onChange={(v) => updateCharacter(i, { ...c, importance: v })}
              options={[
                { value: 'MAIN', label: '主角' },
                { value: 'SECONDARY', label: '配角' },
                { value: 'MINOR', label: '龙套' },
              ]}
              style={{ width: 88 }}
            />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeCharacter(i)} />
          </Space>
          <Input
            size="small"
            placeholder="外貌简述"
            value={c.description}
            onChange={(e) => updateCharacter(i, { ...c, description: e.target.value })}
          />
          <Input
            size="small"
            placeholder="性格关键词"
            value={c.personality}
            onChange={(e) => updateCharacter(i, { ...c, personality: e.target.value })}
          />
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addCharacter} block>
        添加角色
      </Button>
    </Flex>
  );
}
