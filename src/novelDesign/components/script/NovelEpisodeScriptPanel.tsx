import { useState } from 'react';
import { Button, Empty, Flex, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { IconButton } from '@/components/antd-plus/IconButton';
import type { Character, Scene } from '@/constants/Script';
import type { NovelEpisodeScript } from '@/novelDesign/storage/novelWorkspaceStorage';
import { createEmptyScene, normalizeEpisodeScenes, sceneHasContent } from '@/novelDesign/utils/novelScriptModel';
import { NovelSceneCard } from './NovelSceneCard';

const { Text } = Typography;

interface NovelEpisodeScriptPanelProps {
  episodeScript: NovelEpisodeScript | undefined;
  characters: Character[];
  onEpisodeScriptChange: (script: NovelEpisodeScript) => void;
  onGenerateScript?: () => void;
  episodeTitle?: string;
}

export function NovelEpisodeScriptPanel({
  episodeScript,
  characters,
  onEpisodeScriptChange,
  onGenerateScript,
  episodeTitle,
}: NovelEpisodeScriptPanelProps) {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

  if (!sceneHasContent(episodeScript)) {
    return (
      <Flex align="center" justify="center" style={{ flex: 1, minHeight: 0, padding: 24 }}>
        {onGenerateScript ?
          <Button type="primary" size="large" onClick={onGenerateScript}>
            生成剧本
          </Button>
        : <Empty description="暂无剧本分场" />}
      </Flex>
    );
  }

  const scenes = episodeScript!.scenes;
  const si = Math.min(selectedSceneIndex, Math.max(0, scenes.length - 1));
  const scene = scenes[si];

  const commitScenes = (nextScenes: Scene[]) => {
    onEpisodeScriptChange({
      ...episodeScript!,
      scenes: normalizeEpisodeScenes(nextScenes),
    });
  };

  const handleUpdateScene = (index: number, nextScene: Scene) => {
    const next = [...scenes];
    next[index] = nextScene;
    commitScenes(next);
  };

  const handleAddScene = () => {
    const next = [...scenes, createEmptyScene(scenes.length + 1)];
    commitScenes(next);
    setSelectedSceneIndex(next.length - 1);
  };

  const handleRemoveScene = (index: number) => {
    const next = scenes.filter((_, i) => i !== index);
    commitScenes(next);
    setSelectedSceneIndex((prev) => (prev >= next.length ? Math.max(0, next.length - 1) : prev));
  };

  return (
    <Flex vertical style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        {episodeTitle ?
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {episodeTitle} · 剧本分场
          </Text>
        : null}
        <Space wrap size={[8, 8]} style={{ marginBottom: 8 }}>
          {scenes.map((s, i) => (
            <IconButton
              key={s.id}
              enabled={si === i}
              onClick={() => setSelectedSceneIndex(i)}
              enabledStyle={{ background: 'rgba(23,119,255,0.25)' }}
            >
              {s.heading?.trim() || `场 ${i + 1}`}
            </IconButton>
          ))}
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddScene}>
            添加场
          </Button>
        </Space>
      </div>
      <div className="novel-episode-script-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' }}>
        {scene ?
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <NovelSceneCard
              scene={scene}
              characters={characters}
              onChange={(next) => handleUpdateScene(si, next)}
            />
            <Button
              type="text"
              size="small"
              danger
              block
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveScene(si)}
            >
              删除本场
            </Button>
          </Space>
        : null}
      </div>
    </Flex>
  );
}
