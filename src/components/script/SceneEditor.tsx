/**
 * 场景编辑：列表/时间线两种模式（见 docs/短漫剧剧本元素说明.md 15.0.1）
 * 8 种内容类型：对白、动作、旁白、舞台说明、道具说明、前景说明、音乐说明、音效说明
 */
import React, { useState, useCallback } from 'react';
import { Radio, Splitter, Table, Input, Select, Button, App, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import type { ScriptScene, SceneContentItem, SceneContentType } from '@/types/script';
import { SCENE_CONTENT_TYPE_LABELS, getSceneItems } from '@/types/script';
import { ScriptItemEditor } from './ScriptItemEditor';
import { ScriptTimeline } from './ScriptTimeline';

const { Text } = Typography;

const SCENE_CONTENT_TYPES: SceneContentType[] = [
  'dialogue',
  'action',
  'narration',
  'stage',
  'prop',
  'foreground',
  'music',
  'sfx',
];

function formatTimeRange(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return m > 0 ? `${m}:${sec.padStart(4, '0')}` : sec;
  };
  return `${fmt(start)}～${fmt(end)}`;
}

interface SceneEditorProps {
  scene: ScriptScene;
  sceneIndex: number;
  epIndex: number;
  characters: { id: string; name: string }[];
  onUpdate: (patch: Partial<ScriptScene> | ((prev: ScriptScene) => ScriptScene)) => void;
  /** 将场景内容项添加到 AI 对话上下文 */
  onAddItemToContext?: (item: SceneContentItem) => void;
}

export function SceneEditor({
  scene,
  sceneIndex,
  epIndex,
  characters,
  onUpdate,
  onAddItemToContext,
}: SceneEditorProps) {
  const { message } = App.useApp();
  const [mode, setMode] = useState<'list' | 'timeline'>('list');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const items = getSceneItems(scene, epIndex, sceneIndex);

  const handleUpdateItem = useCallback(
    (itemId: string, patch: Partial<SceneContentItem>) => {
      onUpdate((prev) => {
        const list = getSceneItems(prev, epIndex, sceneIndex);
        const next = list.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
        return { ...prev, items: next };
      });
    },
    [onUpdate, epIndex, sceneIndex]
  );

  const handleAddItem = useCallback(
    (type: SceneContentType) => {
      const list = getSceneItems(scene, epIndex, sceneIndex);
      const maxEnd = list.length > 0 ? Math.max(...list.map((it) => it.endTime)) : 0;
      const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const path = `episode.${epIndex + 1}.scene.${sceneIndex + 1}.item.${list.length + 1}`;
      const newItem: SceneContentItem = {
        id,
        path,
        type,
        startTime: maxEnd,
        endTime: maxEnd + 3,
        layerIndex: 0,
      };
      if (type === 'dialogue') newItem.speaker = '';
      if (type === 'dialogue' || type === 'narration') newItem.text = '';
      if (type === 'narration') newItem.narratorType = '全知';
      if (['action', 'stage', 'prop', 'foreground', 'music', 'sfx'].includes(type)) newItem.description = '';
      onUpdate((prev) => {
        const curr = getSceneItems(prev, epIndex, sceneIndex);
        return { ...prev, items: [...curr, newItem] };
      });
      setSelectedItemId(id);
    },
    [scene, epIndex, sceneIndex, onUpdate]
  );

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      onUpdate((prev) => {
        const curr = getSceneItems(prev, epIndex, sceneIndex);
        return { ...prev, items: curr.filter((it) => it.id !== itemId) };
      });
      if (selectedItemId === itemId) setSelectedItemId(null);
    },
    [onUpdate, epIndex, sceneIndex, selectedItemId]
  );

  const selectedItem = items.find((it) => it.id === selectedItemId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Space wrap size={[8, 8]} style={{ marginTop: 12 }}>
        {SCENE_CONTENT_TYPES.map((t) => (
          <Button
            key={t}
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleAddItem(t)}
          >
            {SCENE_CONTENT_TYPE_LABELS[t]}
          </Button>
        ))}
      </Space>
      <Space>
        <Text type="secondary">编辑模式：</Text>
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: 'list', label: '列表' },
            { value: 'timeline', label: '时间线' },
          ]}
        />
      </Space>

      {mode === 'list' ? (
        <Table
          size="small"
          dataSource={items}
          rowKey="id"
          pagination={false}
          scroll={{ x: 600 }}
          columns={[
            {
              title: '类型',
              dataIndex: 'type',
              key: 'type',
              width: 100,
              render: (t: SceneContentType) => SCENE_CONTENT_TYPE_LABELS[t],
            },
            {
              title: '编剧启止时间',
              key: 'time',
              width: 140,
              render: (_, r: SceneContentItem) => formatTimeRange(r.startTime, r.endTime),
            },
            {
              title: '内容',
              key: 'content',
              render: (_, r: SceneContentItem) => (
                <ScriptItemEditor
                  item={r}
                  characters={characters}
                  onUpdate={(p) => handleUpdateItem(r.id, p)}
                  compact
                />
              ),
            },
            {
              title: '',
              key: 'actions',
              width: 88,
              render: (_, r: SceneContentItem) => (
                <Space size={4}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MessageOutlined />}
                    title="添加到AI对话"
                    onClick={() => onAddItemToContext?.(r)}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    title="删除"
                    onClick={() => handleRemoveItem(r.id)}
                  />
                </Space>
              ),
            },
          ]}
        />
      ) : (
        <Splitter style={{ minHeight: 320 }} orientation="vertical">
          <Splitter.Panel min={120} resizable={false}>
            <ScriptTimeline
              items={items}
              sceneIndex={sceneIndex}
              epIndex={epIndex}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onUpdateItems={(next) => onUpdate((prev) => ({ ...prev, items: next }))}
            />
          </Splitter.Panel>
          <Splitter.Panel defaultSize={40} resizable={false} min={40}>
            <div style={{ padding: 10, overflow: 'auto' }}>
              {selectedItem ? (
                <>
                  <Space style={{ marginBottom: 8 }}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MessageOutlined />}
                      title="添加到AI对话"
                      onClick={() => onAddItemToContext?.(selectedItem)}
                    >
                      添加到AI对话
                    </Button>
                  </Space>
                  <ScriptItemEditor
                    item={selectedItem}
                    characters={characters}
                    onUpdate={(p) => handleUpdateItem(selectedItem.id, p)}
                    onRemove={() => handleRemoveItem(selectedItem.id)}
                  />
                </>
              ) : (
                <Text type="secondary">在时间线中点击内容条进行编辑，或添加新内容</Text>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      )}

    </div>
  );
}
