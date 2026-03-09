/**
 * 设计器时间线面板的剧本视图：左列场景信息，右列剧本时间线（见功能文档 6.7）
 */
import React, { useState, useCallback } from 'react';
import { Button, Input, Select, Space, Splitter, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ScriptScene, DramaTag, SceneContentType } from '@/types/script';
import { getSceneItems, SCENE_CONTENT_TYPE_LABELS } from '@/types/script';
import { ScriptTimeline } from '@/components/script/ScriptTimeline';
import { ScriptItemEditor } from '@/components/script/ScriptItemEditor';

const SCENE_CONTENT_TYPES: SceneContentType[] = [
  'dialogue', 'action', 'narration', 'stage', 'prop', 'foreground', 'music', 'sfx',
];
const { TextArea } = Input;
const { Text } = Typography;

const DRAMA_TAG_OPTIONS_LIST = [
  { value: 'suspense' as DramaTag, label: '悬念' },
  { value: 'hook' as DramaTag, label: '钩子' },
  { value: 'conflict' as DramaTag, label: '冲突' },
  { value: 'reversal' as DramaTag, label: '反转' },
  { value: 'climax' as DramaTag, label: '高潮' },
  { value: 'foreshadow' as DramaTag, label: '伏笔' },
  { value: 'payoff' as DramaTag, label: '回收' },
  { value: 'tension' as DramaTag, label: '紧张' },
  { value: 'relief' as DramaTag, label: '舒缓' },
  { value: 'comedy' as DramaTag, label: '喜剧点' },
  { value: 'tearjerker' as DramaTag, label: '催泪点' },
];

interface DesignScriptPanelProps {
  projectDir: string;
  episodeId: string;
  sceneId: string;
  sceneIndex: number;
  epIndex: number;
  scriptScene: ScriptScene | null;
  characters: { id: string; name: string }[];
  onUpdate: (patch: Partial<ScriptScene> | ((prev: ScriptScene) => ScriptScene)) => void;
}

export function DesignScriptPanel({
  projectDir,
  episodeId,
  sceneId,
  sceneIndex,
  epIndex,
  scriptScene,
  characters,
  onUpdate,
}: DesignScriptPanelProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const items = scriptScene ? getSceneItems(scriptScene, epIndex, sceneIndex) : [];

  const handleUpdateItem = useCallback(
    (itemId: string, patch: Partial<import('@/types/script').SceneContentItem>) => {
      if (!scriptScene) return;
      onUpdate((prev) => {
        const list = getSceneItems(prev, epIndex, sceneIndex);
        const next = list.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
        return { ...prev, items: next };
      });
    },
    [scriptScene, onUpdate, epIndex, sceneIndex]
  );

  const handleUpdateItems = useCallback(
    (nextItems: ReturnType<typeof getSceneItems>) => {
      onUpdate((prev) => ({ ...prev, items: nextItems }));
    },
    [onUpdate]
  );

  const handleAddItem = useCallback(
    (type: SceneContentType) => {
      const list = getSceneItems(scriptScene!, epIndex, sceneIndex);
      const maxEnd = list.length > 0 ? Math.max(...list.map((it) => it.endTime)) : 0;
      const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const path = `episode.${epIndex + 1}.scene.${sceneIndex + 1}.item.${list.length + 1}`;
      const newItem = {
        id,
        path,
        type,
        startTime: maxEnd,
        endTime: maxEnd + 3,
        layerIndex: 0,
        ...(type === 'dialogue' && { speaker: '' }),
        ...((type === 'dialogue' || type === 'narration') && { text: '' }),
        ...(type === 'narration' && { narratorType: '全知' as const }),
        ...(['action', 'stage', 'prop', 'foreground', 'music', 'sfx'].includes(type) && { description: '' }),
      };
      onUpdate((prev) => {
        const curr = getSceneItems(prev, epIndex, sceneIndex);
        return { ...prev, items: [...curr, newItem] };
      });
      setSelectedItemId(id);
    },
    [scriptScene, epIndex, sceneIndex, onUpdate]
  );

  if (!scriptScene) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.5)' }}>
        <Text type="secondary">请在「剧情大纲」中编辑本集剧本并保存后，在此查看剧本时间线。</Text>
      </div>
    );
  }

  return (
    <Splitter style={{ flex: 1, minHeight: 0 }} orientation="horizontal">
      <Splitter.Panel defaultSize="35%" min={180} max={400}>
        <div style={{ padding: 12, overflow: 'auto', height: '100%' }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="small">
            <Input
              placeholder="场景标题"
              value={scriptScene.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              addonBefore="标题"
            />
            <Input
              placeholder="地点"
              value={scriptScene.location ?? ''}
              onChange={(e) => onUpdate({ location: e.target.value || undefined })}
              addonBefore="地点"
            />
            <TextArea
              rows={2}
              placeholder="场景概要"
              value={scriptScene.summary ?? ''}
              onChange={(e) => onUpdate({ summary: e.target.value || undefined })}
            />
            <Select<DramaTag[]>
              mode="multiple"
              placeholder="场景戏剧标签"
              allowClear
              value={scriptScene.dramaTags}
              onChange={(tags) => onUpdate({ dramaTags: tags })}
              options={DRAMA_TAG_OPTIONS_LIST}
              style={{ width: '100%' }}
            />
          </Space>
        </div>
      </Splitter.Panel>
      <Splitter.Panel min={200}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Space wrap size={[8, 8]} style={{ padding: '8px 12px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {SCENE_CONTENT_TYPES.map((t) => (
              <Button key={t} type="dashed" size="small" icon={<PlusOutlined />} onClick={() => handleAddItem(t)}>
                {SCENE_CONTENT_TYPE_LABELS[t]}
              </Button>
            ))}
          </Space>
          <Splitter style={{ flex: 1, minHeight: 0 }} orientation="vertical">
          <Splitter.Panel defaultSize="55%" min={120}>
            <ScriptTimeline
              items={items}
              sceneIndex={sceneIndex}
              epIndex={epIndex}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onUpdateItems={handleUpdateItems}
            />
          </Splitter.Panel>
          <Splitter.Panel defaultSize={60} min={60}>
            <div style={{ padding: 12, overflow: 'auto' }}>
              {selectedItemId ? (
                (() => {
                  const item = items.find((it) => it.id === selectedItemId);
                  return item ? (
                    <ScriptItemEditor
                      item={item}
                      characters={characters}
                      onUpdate={(p) => handleUpdateItem(selectedItemId, p)}
                      onRemove={() => {
                        onUpdate((prev) => {
                          const list = getSceneItems(prev, epIndex, sceneIndex).filter((it) => it.id !== selectedItemId);
                          return { ...prev, items: list };
                        });
                        setSelectedItemId(null);
                      }}
                    />
                  ) : null;
                })()
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>在时间线中点击内容条进行编辑</Text>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
        </div>
      </Splitter.Panel>
    </Splitter>
  );
}
