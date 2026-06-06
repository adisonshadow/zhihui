/**
 * AudioTrimEditor：用 Web Audio API 绘制波形 + 两端可拖拽裁剪手柄
 * 无新依赖，纯 canvas + AudioContext
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons';
import { resolveLocalAudioPlayUrl } from '@/novelDesign/utils/resolveLocalAudioPlayUrl';

const { Text } = Typography;

const HANDLE_WIDTH = 12;  // 手柄半宽（像素）

interface AudioTrimEditorProps {
  filePath: string;
  trimRange: [number, number] | null;
  onTrimChange: (range: [number, number] | null) => void;
  /** 外部传入的 duration（ffprobe），可能为 null；组件内 AudioBuffer 自取作为 fallback */
  duration: number | null;
}

export function AudioTrimEditor({ filePath, trimRange, onTrimChange, duration: propDuration }: AudioTrimEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [localDuration, setLocalDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 实际使用的 duration：优先 ffprobe（propDuration），fallback 到 AudioBuffer 自取
  const duration = propDuration ?? localDuration;

  // 拖拽状态
  const dragRef = useRef<'left' | 'right' | null>(null);
  const isDraggingRef = useRef(false);

  /** 从文件路径读 audio data URL 并提取波形 + duration */
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setLocalDuration(null);
    setWaveformData(null);
    setCurrentTime(0);
    let cancelled = false;

    const loadWaveform = async () => {
      try {
        const dataUrl = await window.yiman?.fs?.readFileAsDataUrl(filePath);
        if (!dataUrl || cancelled) return;

        const audioCtx = new AudioContext();
        const response = await fetch(dataUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const dur = audioBuffer.duration;
        audioCtx.close();

        if (cancelled) return;

        // 保存自取 duration（fallback）
        setLocalDuration(Number.isFinite(dur) ? dur : null);

        // 提取波形峰值（~200 采样点）
        const channel = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(channel.length / samples);
        const peaks: number[] = [];
        for (let i = 0; i < samples; i++) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const idx = i * blockSize + j;
            if (idx < channel.length) {
              max = Math.max(max, Math.abs(channel[idx]));
            }
          }
          peaks.push(max);
        }
        setWaveformData(peaks);
      } catch {
        // 波形提取失败不阻塞
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadWaveform();
    return () => { cancelled = true; };
  }, [filePath]);

  /** 绘制波形 + 裁剪范围 + 手柄 */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || !duration) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    canvas.width = w;
    canvas.height = h;
    ctx.scale(dpr, dpr);

    const ch = canvas.clientHeight;
    const cw = canvas.clientWidth;
    const midY = ch / 2;

    // 清空
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, cw, ch);

    // 波形
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    const barWidth = cw / waveformData.length;
    waveformData.forEach((peak, i) => {
      const barH = peak * midY * 0.9;
      ctx.fillRect(i * barWidth, midY - barH, Math.max(1, barWidth - 1), barH * 2);
    });

    // 有效的裁剪范围
    const range: [number, number] = trimRange ?? [0, duration];
    const startX = (range[0] / duration) * cw;
    const endX = (range[1] / duration) * cw;

    // 裁剪区域高亮
    ctx.fillStyle = 'rgba(24, 144, 255, 0.2)';
    ctx.fillRect(startX, 0, endX - startX, ch);

    // 裁剪边界线
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, ch);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, ch);
    ctx.stroke();

    // 左手柄（三角拖拽区域）
    ctx.fillStyle = '#1890ff';
    ctx.beginPath();
    ctx.moveTo(startX - HANDLE_WIDTH, ch);
    ctx.lineTo(startX, ch - 16);
    ctx.lineTo(startX + HANDLE_WIDTH, ch);
    ctx.closePath();
    ctx.fill();

    // 右手柄
    ctx.beginPath();
    ctx.moveTo(endX - HANDLE_WIDTH, ch);
    ctx.lineTo(endX, ch - 16);
    ctx.lineTo(endX + HANDLE_WIDTH, ch);
    ctx.closePath();
    ctx.fill();

    // 左手柄竖线
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, ch - 16);
    ctx.lineTo(startX, ch);
    ctx.stroke();

    // 右手柄竖线
    ctx.beginPath();
    ctx.moveTo(endX, ch - 16);
    ctx.lineTo(endX, ch);
    ctx.stroke();

    // 播放进度
    if (currentTime > 0 && currentTime <= duration) {
      const progressX = (currentTime / duration) * cw;
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, ch);
      ctx.stroke();
    }
  }, [waveformData, trimRange, duration, currentTime]);

  useEffect(() => {
    draw();
  }, [draw]);

  /** 像素 → 时间 */
  const xToTime = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(duration, (x / rect.width) * duration));
  }, [duration]);

  /** 判断点击在哪个手柄上 */
  const hitTestHandle = useCallback((clientX: number): 'left' | 'right' | null => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const cw = rect.width;

    const range: [number, number] = trimRange ?? [0, duration];
    const startPx = (range[0] / duration) * cw;
    const endPx = (range[1] / duration) * cw;

    const handleHitRadius = HANDLE_WIDTH + 4;
    if (Math.abs(x - startPx) <= handleHitRadius) return 'left';
    if (Math.abs(x - endPx) <= handleHitRadius) return 'right';

    return null;
  }, [trimRange, duration]);

  /** mousedown：检测手柄并开始拖拽 */
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTestHandle(e.clientX);
    if (hit) {
      dragRef.current = hit;
      isDraggingRef.current = true;
      e.preventDefault();
    }
  }, [hitTestHandle]);

  /** mousemove：拖拽中更新裁剪范围 */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !dragRef.current || !duration) return;
    e.preventDefault();

    const clickTime = xToTime(e.clientX);
    const range: [number, number] = trimRange ?? [0, duration];

    if (dragRef.current === 'left') {
      const newStart = Math.max(0, Math.min(range[1] - 0.1, clickTime));
      onTrimChange([newStart, range[1]]);
    } else if (dragRef.current === 'right') {
      const newEnd = Math.min(duration, Math.max(range[0] + 0.1, clickTime));
      onTrimChange([range[0], newEnd]);
    }
  }, [duration, trimRange, onTrimChange, xToTime]);

  /** mouseup / mouseleave：停止拖拽 */
  const handleDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dragRef.current = null;
    }
  }, []);

  /** canvas 点击：启用裁剪或调整边界 */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) return;
    if (!duration || duration <= 0 || !waveformData) return;
    const clickTime = xToTime(e.clientX);

    if (!trimRange) {
      onTrimChange([0, duration]);
    } else {
      const mid = (trimRange[0] + trimRange[1]) / 2;
      if (clickTime < mid) {
        onTrimChange([Math.max(0, clickTime), trimRange[1]]);
      } else {
        onTrimChange([trimRange[0], Math.min(duration, clickTime)]);
      }
    }
  }, [duration, waveformData, trimRange, onTrimChange, xToTime]);

  /** 播放/暂停（file:// URL 直接播放） */
  const togglePlay = useCallback(() => {
    if (!filePath) return;

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audioUrl = resolveLocalAudioPlayUrl(filePath);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setPlaying(true);
      audio.onpause = () => setPlaying(false);
      audio.onended = () => {
        setPlaying(false);
        setCurrentTime(0);
      };
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);

      if (trimRange && trimRange[0] > 0) {
        audio.currentTime = trimRange[0];
      }
      void audio.play().catch(() => setPlaying(false));
    } catch {
      setPlaying(false);
    }
  }, [filePath, playing, trimRange]);

  const range: [number, number] = trimRange ?? [0, duration ?? 0];

  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, display: 'block', marginBottom: 8 }}>
        波形裁剪
      </Text>

      {loading ? (
        <Text type="secondary" style={{ fontSize: 12 }}>加载波形中...</Text>
      ) : waveformData ? (
        <>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 120, borderRadius: 6, cursor: 'default', background: 'rgba(255,255,255,0.04)' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onClick={handleCanvasClick}
          />
          <Space style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button
                size="small"
                icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
                onClick={togglePlay}
              >
                {playing ? '暂停' : '预览'}
              </Button>
              {duration != null && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {range[0].toFixed(1)}s — {range[1].toFixed(1)}s / {duration.toFixed(1)}s
                </Text>
              )}
            </Space>
            <Space>
              {trimRange && (
                <Button size="small" onClick={() => onTrimChange(null)}>
                  取消裁剪
                </Button>
              )}
              {!trimRange && duration != null && (
                <Button size="small" onClick={() => onTrimChange([0, duration])}>
                  启用裁剪
                </Button>
              )}
            </Space>
          </Space>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            拖拽波形底部三角手柄调整裁剪范围，点击波形切换边界
          </Text>
        </>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>无法加载波形</Text>
      )}
    </div>
  );
}
