/**
 * 视频去背景面板：提取任意一帧作为预览，支持扣色参数调整，确认后对整段视频重新扣色
 * 参考 MattingSettingsPanel，用于透明视频的视频去背景（Chroma Key）
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Space, Typography, Slider, App, Checkbox, Radio, Collapse, Flex } from 'antd';
import { CloseOutlined, ScissorOutlined, SettingOutlined, FullscreenOutlined } from '@ant-design/icons';
import { getInstantTransparencyPreviewDataUrl } from '@/utils/instantTransparencyMatting';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';
import { ImagePreviewButton } from '@/components/antd-plus/ImagePreviewButton';

const { Text } = Typography;

/** 与 transparentVideoService 的 CHROMA_COLORS 保持一致 */
const CHROMA_BG: Record<'black' | 'green' | 'purple', { r: number; g: number; b: number }> = {
  black: { r: 0, g: 0, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
};

export interface VideoMattingPanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  /** 原始视频相对路径（用于透明视频重新扣色） */
  videoPath: string;
  assetId: string;
  /** 视频时长（秒），用于帧选择 */
  duration?: number | null;
  onReprocess: () => void;
}

export function VideoMattingPanel({
  open,
  onClose,
  projectDir,
  videoPath,
  assetId,
  duration = 1,
  onReprocess,
}: VideoMattingPanelProps) {
  const { message } = App.useApp();

  const [frameTime, setFrameTime] = useState(0.5);
  const [color, setColor] = useState<'auto' | 'black' | 'green' | 'purple'>('auto');
  const [tolerance, setTolerance] = useState(80);
  const [contiguous, setContiguous] = useState(false);
  /** 边缘过渡柔和度 0–0.3，越大边缘越柔（见 docs/10） */
  const [blend, setBlend] = useState(0.12);
  /** 去溢色：与背景色一致，ffmpeg 仅支持 green/blue，绿幕→green，紫幕→blue（紫含蓝分量） */
  const [despillEnabled, setDespillEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [singleFrameResult, setSingleFrameResult] = useState<string | null>(null);
  const [singleFrameLoading, setSingleFrameLoading] = useState(false);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'original' | 'preview' | 'result'>('original');
  const previewAbortRef = useRef(0);

  const [pos, setPos] = useState({ x: 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const [fetchedDuration, setFetchedDuration] = useState<number | null>(null);
  const dur = Math.max(0.1, duration ?? fetchedDuration ?? 1);
  const effectiveFrameTime = Math.max(0, Math.min(dur, frameTime));

  /** 若 asset 无 duration，从视频文件获取 */
  useEffect(() => {
    if (!open || !videoPath || (duration != null && duration > 0)) return;
    if (!window.yiman?.project?.getVideoMetadata) return;
    window.yiman.project.getVideoMetadata(projectDir, videoPath).then((meta) => {
      if (meta?.ok && meta.duration != null && meta.duration > 0) {
        setFetchedDuration(meta.duration);
      }
    });
  }, [open, projectDir, videoPath, duration]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y };
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

  /** 提取视频帧作为预览（主进程 IPC 变更后需重启应用） */
  useEffect(() => {
    if (!open || !videoPath) return;
    setPreviewError(null);
    setFrameDataUrl(null);
    const extract = (window.yiman?.project as { extractVideoFrameToDataUrl?: (a: string, b: string, c: number, d?: boolean) => Promise<string | null> })?.extractVideoFrameToDataUrl;
    if (!extract) {
      setPreviewError('视频去背景功能未就绪，请完全退出后重新运行 yarn dev');
      return;
    }
    extract(projectDir, videoPath, effectiveFrameTime, false)
      .then((url) => setFrameDataUrl(url ?? null))
      .catch(() => setPreviewError('提取帧失败，请完全退出后重新运行 yarn dev'));
  }, [open, projectDir, videoPath, effectiveFrameTime]);

  /** 即时抠图预览（模拟扣色效果，auto 时四角采样，其他颜色用指定背景色） */
  useEffect(() => {
    if (!open || !frameDataUrl) {
      setPreviewDataUrl(null);
      setPreviewError(null);
      return;
    }
    const id = ++previewAbortRef.current;
    const t = setTimeout(async () => {
      setPreviewError(null);
      try {
        const opts: Parameters<typeof getInstantTransparencyPreviewDataUrl>[1] = {
          tolerance,
          contiguous,
          antiAliasing: true,
          feather: 0,
        };
        if (color !== 'auto') {
          opts.backgroundColor = CHROMA_BG[color];
        }
        const url = await getInstantTransparencyPreviewDataUrl(frameDataUrl, opts);
        if (id !== previewAbortRef.current) return;
        setPreviewDataUrl(url);
      } catch (e) {
        if (id === previewAbortRef.current) {
          setPreviewError(e instanceof Error ? e.message : '预览失败');
          setPreviewDataUrl(null);
        }
      }
    }, 150);
    return () => clearTimeout(t);
  }, [open, frameDataUrl, color, tolerance, contiguous]);

  const handleExecute = useCallback(async () => {
    if (!window.yiman?.project?.reprocessTransparentVideo) return;
    setReprocessing(true);
    try {
      const res = await window.yiman.project.reprocessTransparentVideo(projectDir, assetId, color, {
        tolerance,
        contiguous,
        blend,
        despill: despillEnabled && (color === 'green' || color === 'purple') ? (color === 'green' ? 'green' : 'blue') : undefined,
      });
      if (res?.ok) {
        message.success('重新扣色完成');
        onReprocess();
        onClose();
      } else {
        message.error(res?.error ?? '重新扣色失败');
      }
    } finally {
      setReprocessing(false);
    }
  }, [projectDir, assetId, color, tolerance, contiguous, blend, despillEnabled, message, onReprocess, onClose]);

  const handleTestSingleFrame = useCallback(async () => {
    if (!window.yiman?.project?.processSingleFrameColorkey) {
      message.error('单帧扣色功能未就绪，请完全退出后重新运行 yarn dev');
      return;
    }
    setSingleFrameLoading(true);
    setSingleFrameResult(null);
    try {
      const res = await window.yiman.project.processSingleFrameColorkey(
        projectDir,
        videoPath,
        effectiveFrameTime,
        color,
        {
          tolerance,
          contiguous,
          blend,
          despill: despillEnabled && (color === 'green' || color === 'purple') ? (color === 'green' ? 'green' : 'blue') : undefined,
        }
      );
      if (res?.ok && res.dataUrl) {
        setSingleFrameResult(res.dataUrl);
        setActiveTab('result');
        message.success('单帧去背景完成（与整段视频算法一致）');
      } else {
        message.error(res?.error ?? '单帧去背景失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '单帧去背景失败');
    } finally {
      setSingleFrameLoading(false);
    }
  }, [projectDir, videoPath, effectiveFrameTime, color, tolerance, contiguous, blend, despillEnabled, message]);

  useEffect(() => {
    if (!open) {
      setFrameDataUrl(null);
      setPreviewDataUrl(null);
      setPreviewError(null);
      setSingleFrameResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!singleFrameResult && activeTab === 'result') {
      setActiveTab('preview');
    }
  }, [singleFrameResult, activeTab]);

  useEffect(() => {
    const validKeys: ('original' | 'preview' | 'result')[] = ['original', 'preview', ...(singleFrameResult ? ['result'] : [])];
    if (!validKeys.includes(activeTab)) {
      setActiveTab(validKeys[0] ?? 'original');
    }
  }, [activeTab, singleFrameResult]);

  const previewContainerStyle: React.CSSProperties = {
    width: '100%',
    maxHeight: 180,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="视频抠图"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1050,
        width: 340,
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
        <Text strong>视频去背景</Text>
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
            <Text type="secondary" style={{ fontSize: 12 }}>
              选取帧（{effectiveFrameTime.toFixed(1)}s / {dur.toFixed(1)}s）
            </Text>
            <Slider
              min={0}
              max={dur}
              step={0.1}
              value={frameTime}
              onChange={setFrameTime}
              style={{ marginTop: 4 }}
            />
          </div>

          <div>
            <Space size={8} wrap>
              <Button
                size="small"
                type={activeTab === 'original' ? 'primary' : 'default'}
                onClick={() => setActiveTab('original')}
              >
                原帧
              </Button>
              <Button
                size="small"
                type={activeTab === 'preview' ? 'primary' : 'default'}
                onClick={() => setActiveTab('preview')}
              >
                扣色预览
              </Button>
              {singleFrameResult && (
                <Button
                  size="small"
                  type={activeTab === 'result' ? 'primary' : 'default'}
                  onClick={() => setActiveTab('result')}
                >
                  单帧结果
                </Button>
              )}
            </Space>
            <div style={{ marginTop: 8, ...previewContainerStyle, ...CHECKERBOARD_BACKGROUND }}>
              {activeTab === 'original' ? (
                previewError && !frameDataUrl ? (
                  <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>
                    {previewError}
                  </Text>
                ) : frameDataUrl ? (
                  <img
                    src={frameDataUrl}
                    alt="视频帧"
                    style={{ maxWidth: '100%', maxHeight: 172, objectFit: 'contain' }}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    加载中…
                  </Text>
                )
              ) : activeTab === 'result' && singleFrameResult ? (
                <>
                  <img
                    src={singleFrameResult}
                    alt="单帧结果"
                    style={{ maxWidth: '100%', maxHeight: 172, objectFit: 'contain' }}
                  />
                  <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
                    <ImagePreviewButton images={singleFrameResult}>
                      <Button
                        type="text"
                        size="small"
                        icon={<FullscreenOutlined />}
                        style={{ color: 'rgba(255,255,255,0.85)' }}
                        title="全屏预览"
                      />
                    </ImagePreviewButton>
                  </div>
                </>
              ) : previewError ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {previewError}
                </Text>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="扣色预览"
                  style={{ maxWidth: '100%', maxHeight: 172, objectFit: 'contain' }}
                />
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  加载中…
                </Text>
              )}
            </div>
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              背景色
            </Text>
            <Radio.Group
              value={color}
              onChange={(e) => setColor(e.target.value)}
              options={[
                { value: 'auto', label: '自动检测' },
                { value: 'black', label: '黑色' },
                { value: 'green', label: '绿色' },
                { value: 'purple', label: '紫色' },
              ]}
              style={{ display: 'block', marginTop: 4 }}
            />
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              容差（0–255）：{tolerance}
            </Text>
            <Slider
              min={0}
              max={255}
              value={tolerance}
              onChange={setTolerance}
              style={{ marginTop: 2, marginBottom: 0 }}
            />
          </div>

          <Checkbox checked={contiguous} onChange={(e) => setContiguous(e.target.checked)}>
            从边缘扩散去色（防止误删内部同色区域）
          </Checkbox>

          <Collapse
            ghost
            size="small"
            items={[
              {
                key: 'advanced',
                label: (
                  <Space size={4}>
                    <SettingOutlined />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      高级
                    </Text>
                  </Space>
                ),
                children: (
                  <Space orientation="vertical" style={{ width: '100%' }} size="small">
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        边缘柔和度 blend（0–0.3）：{blend.toFixed(2)}
                      </Text>
                      <Slider
                        min={0}
                        max={0.3}
                        step={0.01}
                        value={blend}
                        onChange={setBlend}
                        style={{ marginTop: 2, marginBottom: 0 }}
                      />
                    </div>
                    {(color === 'green' || color === 'purple') && (
                      <Checkbox
                        checked={despillEnabled}
                        onChange={(e) => setDespillEnabled(e.target.checked)}
                      >
                        去溢色（与背景色一致，减少边缘残留）
                      </Checkbox>
                    )}
                  </Space>
                ),
              },
            ]}
          />

          <Flex gap="small" align="center">
            <Button
              icon={<ScissorOutlined />}
              onClick={handleTestSingleFrame}
              loading={singleFrameLoading}
              disabled={!videoPath}
            >
              测试单帧
            </Button>
            <Button
              type="primary"
              icon={<ScissorOutlined />}
              onClick={handleExecute}
              loading={reprocessing}
              style={{ flex: 1 }}
            >
              应用到整段视频
            </Button>
          </Flex>
        </Space>
      </div>
    </div>
  );
}
