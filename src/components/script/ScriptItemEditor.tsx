/**
 * 场景内容项编辑：根据 type 渲染对应表单，编辑后立即保存
 */
import React from 'react';
import { Input, InputNumber, Select, Space, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { SceneContentItem, SceneContentType } from '@/types/script';
import { SCENE_CONTENT_TYPE_LABELS } from '@/types/script';

const { TextArea } = Input;

interface ScriptItemEditorProps {
  item: SceneContentItem;
  characters: { id: string; name: string }[];
  onUpdate: (patch: Partial<SceneContentItem>) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export function ScriptItemEditor({ item, characters, onUpdate, onRemove, compact }: ScriptItemEditorProps) {
  const isDialogue = item.type === 'dialogue';
  const isNarration = item.type === 'narration';
  const hasDescription = ['action', 'stage', 'prop', 'foreground', 'music', 'sfx'].includes(item.type);

  if (compact) {
    if (isDialogue) {
      return (
        <Space wrap size={[4, 4]} style={{ width: '100%' }}>
          <Select
            size="small"
            placeholder="说话人"
            value={item.speaker || undefined}
            onChange={(v) => onUpdate({ speaker: v ?? '' })}
            options={characters.map((c) => ({ label: c.name, value: c.id }))}
            style={{ width: 80 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="情绪"
            value={item.emotion ?? ''}
            onChange={(e) => onUpdate({ emotion: e.target.value || undefined })}
            style={{ width: 70 }}
          />
          <Select
            size="small"
            placeholder="音量"
            value={item.volume || undefined}
            onChange={(v) => onUpdate({ volume: (v as '正常' | '轻声' | '大喊') ?? undefined })}
            options={[
              { label: '正常', value: '正常' },
              { label: '轻声', value: '轻声' },
              { label: '大喊', value: '大喊' },
            ]}
            style={{ width: 70 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="台词"
            value={item.text ?? ''}
            onChange={(e) => onUpdate({ text: e.target.value })}
            style={{ minWidth: 140, flex: 1 }}
          />
        </Space>
      );
    }
    if (isNarration) {
      return (
        <Space wrap size={[4, 4]} style={{ width: '100%' }}>
          <Select
            size="small"
            placeholder="叙述者"
            value={item.narratorType}
            onChange={(v) => onUpdate({ narratorType: v })}
            options={[
              { label: '全知', value: '全知' },
              { label: '第一人称主角', value: '第一人称主角' },
              { label: '第一人称配角', value: '第一人称配角' },
            ]}
            style={{ width: 110 }}
          />
          <Input
            size="small"
            placeholder="情绪"
            value={item.emotion ?? ''}
            onChange={(e) => onUpdate({ emotion: e.target.value || undefined })}
            style={{ width: 70 }}
          />
          <Input
            size="small"
            placeholder="旁白内容"
            value={item.text ?? ''}
            onChange={(e) => onUpdate({ text: e.target.value })}
            style={{ minWidth: 140, flex: 1 }}
          />
        </Space>
      );
    }
    if (item.type === 'action') {
      return (
        <Space wrap size={[4, 4]} style={{ width: '100%' }}>
          <Select
            size="small"
            placeholder="对象"
            value={item.target || undefined}
            onChange={(v) => onUpdate({ target: v ?? undefined })}
            options={characters.map((c) => ({ label: c.name, value: c.id }))}
            style={{ width: 80 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="描述"
            value={item.description ?? ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            style={{ minWidth: 140, flex: 1 }}
          />
        </Space>
      );
    }
    return (
      <Input
        size="small"
        placeholder="描述"
        value={item.description ?? ''}
        onChange={(e) => onUpdate({ description: e.target.value })}
        style={{ minWidth: 120 }}
      />
    );
  }

  const timeInputs = (
    <Space size={4} style={{ flexShrink: 0 }}>
      <InputNumber
        size="small"
        addonBefore="起始"
        min={0}
        step={0.5}
        precision={1}
        value={item.startTime}
        onChange={(v) => onUpdate({ startTime: v != null && typeof v === 'number' ? v : 0 })}
        style={{ width: 60 }}
      />
      <InputNumber
        size="small"
        addonBefore="结束"
        min={0}
        step={0.5}
        precision={1}
        value={item.endTime}
        onChange={(v) => onUpdate({ endTime: v != null && typeof v === 'number' ? v : 0 })}
        style={{ width: 60 }}
      />
    </Space>
  );

  const deleteBtn = onRemove ? (
    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onRemove} style={{ flexShrink: 0 }}>
    </Button>
  ) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
      {timeInputs}
      {isDialogue && (
        <>
          <Select
            size="small"
            placeholder="说话人"
            value={item.speaker || undefined}
            onChange={(v) => onUpdate({ speaker: v ?? '' })}
            options={characters.map((c) => ({ label: c.name, value: c.id }))}
            style={{ width: 90, flexShrink: 0 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="情绪"
            value={item.emotion ?? ''}
            onChange={(e) => onUpdate({ emotion: e.target.value || undefined })}
            style={{ width: 70, flexShrink: 0 }}
          />
          <Select
            size="small"
            placeholder="音量"
            value={item.volume || undefined}
            onChange={(v) => onUpdate({ volume: (v as '正常' | '轻声' | '大喊') ?? undefined })}
            options={[
              { label: '正常', value: '正常' },
              { label: '轻声', value: '轻声' },
              { label: '大喊', value: '大喊' },
            ]}
            style={{ width: 70, flexShrink: 0 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="台词"
            value={item.text ?? ''}
            onChange={(e) => onUpdate({ text: e.target.value })}
            style={{ flex: 1, minWidth: 60 }}
          />
        </>
      )}
      {isNarration && (
        <>
          <Select
            size="small"
            placeholder="叙述者"
            value={item.narratorType}
            onChange={(v) => onUpdate({ narratorType: v })}
            options={[
              { label: '全知', value: '全知' },
              { label: '第一人称主角', value: '第一人称主角' },
              { label: '第一人称配角', value: '第一人称配角' },
            ]}
            style={{ width: 110, flexShrink: 0 }}
          />
          <Input
            size="small"
            placeholder="旁白内容"
            value={item.text ?? ''}
            onChange={(e) => onUpdate({ text: e.target.value })}
            style={{ flex: 1, minWidth: 60 }}
          />
          <Input
            size="small"
            placeholder="情绪"
            value={item.emotion ?? ''}
            onChange={(e) => onUpdate({ emotion: e.target.value || undefined })}
            style={{ width: 70, flexShrink: 0 }}
          />
        </>
      )}
      {item.type === 'action' && (
        <>
          <Select
            size="small"
            placeholder="对象"
            value={item.target || undefined}
            onChange={(v) => onUpdate({ target: v ?? undefined })}
            options={characters.map((c) => ({ label: c.name, value: c.id }))}
            style={{ width: 90, flexShrink: 0 }}
            allowClear
          />
          <Input
            size="small"
            placeholder="动作/表演说明"
            value={item.description ?? ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            style={{ flex: 1, minWidth: 60 }}
          />
          <Select
            size="small"
            mode="multiple"
            placeholder="涉及角色"
            value={item.characters ?? []}
            onChange={(v) => onUpdate({ characters: v })}
            options={characters.map((c) => ({ label: c.name, value: c.id }))}
            style={{ width: 120, flexShrink: 0 }}
            allowClear
          />
        </>
      )}
      {hasDescription && item.type !== 'action' && (
        <Input
          size="small"
          placeholder={`${SCENE_CONTENT_TYPE_LABELS[item.type as SceneContentType]}内容`}
          value={item.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          style={{ flex: 1, minWidth: 60 }}
        />
      )}
      {deleteBtn}
    </div>
  );
}
