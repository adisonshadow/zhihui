/**
 * 视频转精灵图面板：FFmpeg scene 滤镜提取关键帧，预览帧播放，生成精灵图
 * 面板风格参考 VideoMattingPanel（可拖拽浮层）
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Space, Typography, Slider, App, Spin, Radio } from 'antd';
import {
  CloseOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';

const { Text } = Typography;

export interface VideoToSpritePanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  /** 当前 Drawer 正在播放的视频的相对路径（与 Drawer 播放源完全一致） */
  videoPath: string;
  onSaved?: (result: {
    path: string;
    frameCount: number;
    frames: { x: number; y: number; width: number; height: number }[];
    cover_path?: string;
  }) => void;
}

export function VideoToSpritePanel({
  open,
  onClose,
  projectDir,
  videoPath,
  onSaved,
}: VideoToSpritePanelProps) {
  const { message } = App.useApp();

  const [extractMode, setExtractMode] = useState<'scene' | 'uniform'>('uniform');
  const [sceneThreshold, setSceneThreshold] = useState(0.3);
  // const [uniformFps, setUniformFps] = useState(4);
  const [totalFrames, setTotalFrames] = useState(8);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackFps, setPlaybackFps] = useState(4);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pos, setPos] = useState({ x: 120, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initX: pos.x,
        initY: pos.y,
      };
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopPlay();
      setFrameUrls([]);
      setCurrentFrame(0);
    }
  }, [open]);

  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (playing && frameUrls.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frameUrls.length);
      }, 1000 / playbackFps);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return undefined;
  }, [playing, playbackFps, frameUrls.length]);

  const handleExtract = useCallback(async () => {
    if (!window.yiman?.project?.videoToSpriteExtract) return;
    stopPlay();
    setExtracting(true);
    setFrameUrls([]);
    setCurrentFrame(0);
    try {
      const options = extractMode === 'uniform'
        ? { mode: 'uniform' as const, totalFrames }
        : { mode: 'scene' as const, sceneThreshold };
      const res = await window.yiman.project.videoToSpriteExtract(
        projectDir,
        videoPath,
        options
      );
      if (res?.ok && res.dataUrls && res.dataUrls.length > 0) {
        setFrameUrls(res.dataUrls);
        message.success(`提取到 ${res.dataUrls.length} 帧`);
        if (res.dataUrls.length > 1) setPlaying(true);
      } else {
        message.warning(res?.error || '未提取到帧');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提取失败');
    } finally {
      setExtracting(false);
    }
  }, [projectDir, videoPath, extractMode, sceneThreshold, totalFrames, message, stopPlay]);

  const handleSave = useCallback(async () => {
    if (!window.yiman?.project?.videoToSpriteSave) return;
    setSaving(true);
    try {
      const res = await window.yiman.project.videoToSpriteSave(
        projectDir,
        videoPath
      );
      if (res?.ok && res.path && res.frames) {
        message.success('精灵图已保存');
        onSaved?.({
          path: res.path,
          frameCount: res.frameCount ?? res.frames.length,
          frames: res.frames,
          cover_path: res.cover_path,
        });
        onClose();
      } else {
        message.error(res?.error || '保存精灵图失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectDir, videoPath, message, onSaved, onClose]);

  const togglePlay = useCallback(() => {
    if (frameUrls.length < 2) return;
    if (playing) {
      stopPlay();
    } else {
      setPlaying(true);
    }
  }, [playing, frameUrls.length, stopPlay]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="视频转精灵图"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1050,
        width: 380,
        background: 'rgba(30, 30, 30, 0.98)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        style={{
          padding: '8px 12px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onPointerDown={handleHeaderPointerDown}
      >
        <Text strong>视频转精灵图</Text>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        />
      </div>

      <div style={{ padding: 12 }}>
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <div>
            <Radio.Group
              value={extractMode}
              onChange={(e) => setExtractMode(e.target.value)}
              size="small"
              style={{ marginBottom: 8 }}
            >
              <Radio.Button value="uniform">均匀抽帧</Radio.Button>
              <Radio.Button value="scene">场景检测</Radio.Button>
            </Radio.Group>

            {extractMode === 'uniform' ? (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  总帧数：{totalFrames}
                </Text>
                <Text
                  type="secondary"
                  style={{ fontSize: 11, display: 'block', marginTop: 2, opacity: 0.7 }}
                >
                  从视频中均匀提取指定数量的帧，适合动作循环类视频
                </Text>
                <Slider
                  min={2}
                  max={50}
                  step={1}
                  value={totalFrames}
                  onChange={setTotalFrames}
                  style={{ marginTop: 4 }}
                />
              </>
            ) : (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  变化分数阈值：{sceneThreshold.toFixed(2)}
                </Text>
                <Text
                  type="secondary"
                  style={{ fontSize: 11, display: 'block', marginTop: 2, opacity: 0.7 }}
                >
                  值越小提取帧越多，适合镜头切换类视频
                </Text>
                <Slider
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  value={sceneThreshold}
                  onChange={setSceneThreshold}
                  style={{ marginTop: 4 }}
                />
              </>
            )}
          </div>

          <Button
            type="primary"
            block
            onClick={handleExtract}
            loading={extracting}
          >
            生成预览
          </Button>

          {(extracting || frameUrls.length > 0) && (
            <div>
              <div
                style={{
                  width: '100%',
                  height: 200,
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  ...CHECKERBOARD_BACKGROUND,
                }}
              >
                {extracting ? (
                  <Spin tip="提取中…"><div style={{ minHeight: 120 }} /></Spin>
                ) : frameUrls.length > 0 ? (
                  <img
                    src={frameUrls[currentFrame]}
                    alt={`帧 ${currentFrame + 1}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 192,
                      objectFit: 'contain',
                    }}
                  />
                ) : null}
              </div>

              {frameUrls.length > 0 && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      onClick={togglePlay}
                      disabled={frameUrls.length < 2}
                    >
                      {playing ? '暂停' : '播放'}
                    </Button>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {currentFrame + 1} / {frameUrls.length} 帧
                    </Text>
                  </div>

                  {frameUrls.length > 1 && (
                    <Slider
                      min={0}
                      max={frameUrls.length - 1}
                      step={1}
                      value={currentFrame}
                      onChange={(v) => {
                        stopPlay();
                        setCurrentFrame(v);
                      }}
                      style={{ marginTop: 4 }}
                    />
                  )}

                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      播放速度：{playbackFps} 帧/秒
                    </Text>
                    <Slider
                      min={1}
                      max={24}
                      step={1}
                      value={playbackFps}
                      onChange={setPlaybackFps}
                      style={{ marginTop: 2, marginBottom: 0 }}
                    />
                  </div>

                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                    block
                    style={{ marginTop: 8 }}
                  >
                    保存为精灵图
                  </Button>
                </>
              )}
            </div>
          )}
        </Space>
      </div>
    </div>
  );
}
