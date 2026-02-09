/**
 * 漫剧视频设计器：第一行固定 + 第二行四列 Splitter（见功能文档 6、开发计划 2.9）
 * 面板 Toggle、默认剧集/场景持久化到 localStorage（见功能文档 1.1）
 */
const STORAGE_KEY_SHOW_NAV = 'yiman:designer:showNav';
const STORAGE_KEY_SHOW_ASSETS = 'yiman:designer:showAssets';
const STORAGE_KEY_SHOW_CHAT = 'yiman:designer:showChat';

function getStoredBool(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch (_) {}
  return defaultVal;
}

function getStoredEpisodeScene(projectId: string): { episodeId: string | null; sceneId: string | null } {
  try {
    const ep = localStorage.getItem(`yiman:designer:${projectId}:selectedEpisodeId`);
    const sc = localStorage.getItem(`yiman:designer:${projectId}:selectedSceneId`);
    return { episodeId: ep || null, sceneId: sc || null };
  } catch (_) {}
  return { episodeId: null, sceneId: null };
}

import React, { useState, useEffect, useCallback } from 'react';
import { Splitter, Space, Typography, Card } from 'antd';
import type { ProjectInfo } from '@/hooks/useProject';
import type { EpisodeRow } from '@/types/project';
import { CanvasContainer } from '@/components/designer/CanvasContainer';
import { TimelinePanel } from '@/components/designer/TimelinePanel';
import { SceneSettingsAccordion } from '@/components/designer/SceneSettingsAccordion';
import { AssetBrowsePanel } from '@/components/designer/AssetBrowsePanel';
import { SelectedBlockSettings } from '@/components/designer/SelectedBlockSettings';
import { ExportModal } from '@/components/designer/ExportModal';
import { GrowCard } from '@/components/GrowCard';

const { Text } = Typography;

interface SceneRow {
  id: string;
  episode_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DesignerTabProps {
  project: ProjectInfo;
  onBack?: () => void;
  /** 受控模式：由父组件（如 ProjectEditor 的 tab header）控制剧集场景面板显隐 */
  showNav?: boolean;
  onShowNavChange?: (show: boolean) => void;
  /** 受控模式：由父组件（如 ProjectEditor 的 tab header）控制 AI Chat 显隐 */
  showChat?: boolean;
  onShowChatChange?: (show: boolean) => void;
  /** 节数变更时上报给父组件（项目级 currentEpisode） */
  onEpisodeChange?: (ep: { id: string; title: string } | null) => void;
}

export default function DesignerTab({ project, onBack, showNav: showNavProp, onShowNavChange, showChat: showChatProp, onShowChatChange, onEpisodeChange }: DesignerTabProps) {
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [scenesByEpisode, setScenesByEpisode] = useState<Record<string, SceneRow[]>>({});
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(() =>
    getStoredEpisodeScene(project.id).episodeId
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(() =>
    getStoredEpisodeScene(project.id).sceneId
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingBlockUpdates, setPendingBlockUpdates] = useState<Record<string, Partial<{ pos_x: number; pos_y: number; scale_x: number; scale_y: number; rotation: number; blur: number; opacity: number }>>>({});
  const [showNavInternal, setShowNavInternal] = useState(() => getStoredBool(STORAGE_KEY_SHOW_NAV, true));
  const showNav = showNavProp ?? showNavInternal;
  const setShowNav = onShowNavChange ?? setShowNavInternal;
  const [showAssets, setShowAssets] = useState(() => getStoredBool(STORAGE_KEY_SHOW_ASSETS, true));
  const [showChatInternal, setShowChatInternal] = useState(() => getStoredBool(STORAGE_KEY_SHOW_CHAT, true));
  const showChat = showChatProp ?? showChatInternal;
  const setShowChat = onShowChatChange ?? setShowChatInternal;
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const projectDir = project.project_dir;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_NAV, showNav ? '1' : '0');
    } catch (_) {}
  }, [showNav]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_ASSETS, showAssets ? '1' : '0');
    } catch (_) {}
  }, [showAssets]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_CHAT, showChat ? '1' : '0');
    } catch (_) {}
  }, [showChat]);
  useEffect(() => {
    if (selectedEpisodeId != null) {
      try {
        localStorage.setItem(`yiman:designer:${project.id}:selectedEpisodeId`, selectedEpisodeId);
      } catch (_) {}
    }
  }, [project.id, selectedEpisodeId]);
  useEffect(() => {
    if (selectedSceneId != null) {
      try {
        localStorage.setItem(`yiman:designer:${project.id}:selectedSceneId`, selectedSceneId);
      } catch (_) {}
    }
  }, [project.id, selectedSceneId]);

  const loadEpisodes = useCallback(async () => {
    if (!window.yiman?.project?.getEpisodes) return;
    const list = await window.yiman.project.getEpisodes(projectDir);
    setEpisodes(list as EpisodeRow[]);
    setSelectedEpisodeId((prev) => {
      if (list.length === 0) return null;
      if (prev && list.some((e) => e.id === prev)) return prev;
      return list[0].id;
    });
  }, [projectDir]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  useEffect(() => {
    if (!window.yiman?.project?.getScenes || !episodes.length) return;
    const load = async () => {
      const next: Record<string, SceneRow[]> = {};
      for (const ep of episodes) {
        let scenes = (await window.yiman!.project.getScenes(projectDir, ep.id)) as SceneRow[];
        if (scenes.length === 0 && window.yiman?.project?.createScene) {
          const sceneId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          await window.yiman.project.createScene(projectDir, { id: sceneId, episode_id: ep.id, name: '场景 1', sort_order: 0 });
          scenes = (await window.yiman!.project.getScenes(projectDir, ep.id)) as SceneRow[];
        }
        next[ep.id] = scenes;
      }
      setScenesByEpisode(next);
    };
    load();
  }, [projectDir, episodes]);

  useEffect(() => {
    if (!selectedEpisodeId) {
      setSelectedSceneId(null);
      return;
    }
    const list = scenesByEpisode[selectedEpisodeId] ?? [];
    setSelectedSceneId((prev) => {
      if (list.length === 0) return null;
      if (prev && list.some((s) => s.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, [selectedEpisodeId, scenesByEpisode]);

  const currentEpisode = episodes.find((e) => e.id === selectedEpisodeId);
  const scenes = selectedEpisodeId ? scenesByEpisode[selectedEpisodeId] ?? [] : [];

  useEffect(() => {
    if (onEpisodeChange) {
      if (currentEpisode) {
        onEpisodeChange({ id: currentEpisode.id, title: currentEpisode.title ?? '' });
      } else if (selectedEpisodeId === null) {
        onEpisodeChange(null);
      }
    }
  }, [onEpisodeChange, currentEpisode, selectedEpisodeId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 480 }}>
      {/* 剧集场景、AI Chat 在 ProjectEditor tab header；撤销/重做、导出视频在 TimelinePanel header */}
      <Splitter style={{ flex: 1, minHeight: 0 }} orientation="vertical">
        <Splitter.Panel defaultSize="60%" min={200}>
          <Splitter style={{ height: '100%' }} orientation="horizontal">
            {showNav && (
              <Splitter.Panel defaultSize={240} min={160} max={400}>
                <EpisodeSceneNav
                  episodes={episodes}
                  scenesByEpisode={scenesByEpisode}
                  selectedEpisodeId={selectedEpisodeId}
                  selectedSceneId={selectedSceneId}
                  onSelectEpisode={setSelectedEpisodeId}
                  onSelectScene={setSelectedSceneId}
                />
              </Splitter.Panel>
            )}
            {/* 列 1：素材面板 */}
            {showAssets && (
              <Splitter.Panel className='relative' defaultSize={240} min={180} max={420}>
                <div
                  className="bg-[#242424] rounded-md absolute top-2 left-2 right-2 bottom-2"
                  >
                  <AssetBrowsePanel
                    project={project}
                    sceneId={selectedSceneId}
                    episodeCharacterRefs={currentEpisode?.character_refs ?? '[]'}
                    currentTime={currentTime}
                    onPlaced={() => setRefreshKey((k) => k + 1)}
                    refreshKey={refreshKey}
                  />
                </div>
              </Splitter.Panel>
            )}
            {/* 列 2：播放器面板（舞台 + 渲染区）；播放时时间轴随进度移动，画布按当前帧渲染关键帧（见功能文档 6.8） */}
            <Splitter.Panel min={280}>
              <CanvasContainer
                project={project}
                sceneId={selectedSceneId}
                landscape={!!project.landscape}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                refreshKey={refreshKey}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                playing={playing}
                onPlayPause={() => setPlaying((p) => !p)}
                onUpdate={() => setRefreshKey((k) => k + 1)}
                onPlayEnd={() => setPlaying(false)}
                pendingBlockUpdates={pendingBlockUpdates}
                setPendingBlockUpdates={setPendingBlockUpdates}
              />
            </Splitter.Panel>
            {/* 列 3：功能面板（无选中显示当前场景设置，有选中显示选中素材设置） */}
            <Splitter.Panel defaultSize={280} min={200} max={420} className="designer-panel-panel">
              <GrowCard
                className="designer-panel-content"
                header={selectedBlockId ? '选中素材设置' : '当前场景设置'}
                headerClassName="designer-panel-content__header"
                bodyClassName="designer-panel-content__body"
                bodyStyle={{ padding: 12 }}
              >
                {selectedBlockId ? (
                  <div className="designer-panel-section designer-panel-section--selected-block">
                    <SelectedBlockSettings
                      project={project}
                      blockId={selectedBlockId}
                      currentTime={currentTime}
                      refreshKey={refreshKey}
                      onUpdate={() => setRefreshKey((k) => k + 1)}
                      onJumpToTime={setCurrentTime}
                      onBlockUpdate={(blockId, data) => setPendingBlockUpdates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], ...data } }))}
                    />
                  </div>
                ) : (
                  <div className="designer-panel-section designer-panel-section--scene">
                    <SceneSettingsAccordion project={project} sceneId={selectedSceneId} />
                  </div>
                )}
              </GrowCard>
            </Splitter.Panel>
            {showChat && (
              <Splitter.Panel defaultSize={320} min={240} max={480}>
                <Card size="small" title="AI Chat" style={{ height: '100%', overflow: 'auto' }}>
                  <Text type="secondary">Ant Design X Chat（开发计划 2.14）</Text>
                </Card>
              </Splitter.Panel>
            )}
          </Splitter>
        </Splitter.Panel>
        {/* 第三行：时间线面板 */}
        <Splitter.Panel defaultSize="40%" min={120}>
          <TimelinePanel
            project={project}
            sceneId={selectedSceneId}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onLayersChange={() => setRefreshKey((k) => k + 1)}
            refreshKey={refreshKey}
            onExportClick={() => setExportModalOpen(true)}
          />
        </Splitter.Panel>
      </Splitter>
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        project={project}
        sceneId={selectedSceneId}
        landscape={!!project.landscape}
      />
    </div>
  );
}

function EpisodeSceneNav({
  episodes,
  scenesByEpisode,
  selectedEpisodeId,
  selectedSceneId,
  onSelectEpisode,
  onSelectScene,
}: {
  episodes: EpisodeRow[];
  scenesByEpisode: Record<string, SceneRow[]>;
  selectedEpisodeId: string | null;
  selectedSceneId: string | null;
  onSelectEpisode: (id: string | null) => void;
  onSelectScene: (id: string | null) => void;
}) {
  return (
    <Card size="small" title="剧集与场景" style={{ height: '100%', overflow: 'auto' }}>
      <Space orientation="vertical" style={{ width: '100%' }} size="small">
        {episodes.map((ep) => {
          const scenes = scenesByEpisode[ep.id] ?? [];
          const isEpSelected = selectedEpisodeId === ep.id;
          return (
            <div key={ep.id}>
              <div
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  fontWeight: isEpSelected ? 600 : 400,
                  background: isEpSelected ? 'rgba(255,255,255,0.08)' : undefined,
                  borderRadius: 6,
                }}
                onClick={() => onSelectEpisode(ep.id)}
              >
                <span title="全集">▶ {ep.title || `集 ${ep.sort_order + 1}`}</span>
              </div>
              {isEpSelected && (
                <div style={{ paddingLeft: 16, marginTop: 4 }}>
                  {scenes.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>空场景</Text>
                  ) : (
                    scenes.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: selectedSceneId === s.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                          background: selectedSceneId === s.id ? 'rgba(255,255,255,0.06)' : undefined,
                          borderRadius: 4,
                        }}
                        onClick={() => onSelectScene(s.id)}
                      >
                        {s.name || `场景 ${s.sort_order + 1}`}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Space>
    </Card>
  );
}
