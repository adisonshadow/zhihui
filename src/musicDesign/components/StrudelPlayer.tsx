import { useCallback, useMemo, useState } from 'react';
import { App, Button, InputNumber, Popover, Slider, Space, Tooltip } from 'antd';
import {
  CaretRightOutlined,
  DownloadOutlined,
  LoadingOutlined,
  MoreOutlined,
  PauseOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { useStrudelPlayback } from '@/musicDesign/strudelPlayback/useStrudelPlayback';
import { exportStrudelAudio } from '@/musicDesign/strudelExport';
import { computePlaybackDurationSec, formatPlaybackTime } from '@/musicDesign/utils/formatPlaybackTime';
import './StrudelPlayer.css';

const CYCLE_PRESETS = [1, 2, 4, 8] as const;

export interface StrudelPlayerProps {
  code: string;
  cps: number;
  onCpsChange: (v: number) => void;
  cycleCount: number;
  onCycleCountChange: (v: number) => void;
}

export function StrudelPlayer({
  code,
  cps,
  onCpsChange,
  cycleCount,
  onCycleCountChange,
}: StrudelPlayerProps) {
  const { message } = App.useApp();
  const { state, togglePlayPause, stop, setVolume, reinitEngine } = useStrudelPlayback();
  const [exporting, setExporting] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const durationSec = useMemo(
    () => computePlaybackDurationSec(cycleCount, cps),
    [cycleCount, cps],
  );

  const displayDuration =
    state.phase === 'idle' ? durationSec : state.durationSec || durationSec;

  const progressPercent =
    displayDuration > 0 ? Math.min(100, (state.currentSec / displayDuration) * 100) : 0;

  const isPlaying = state.phase === 'playing';
  const isPaused = state.phase === 'paused';
  const isActive = isPlaying || isPaused || state.phase === 'ended';

  const playOpts = useMemo(
    () => ({ code, cps, cycleCount }),
    [code, cps, cycleCount],
  );

  const handleToggle = useCallback(async () => {
    if (!state.ready) {
      message.warning('Strudel 引擎尚未就绪');
      return;
    }
    if (!code.trim()) {
      message.warning('请先输入 Strudel 代码');
      return;
    }
    try {
      await togglePlayPause(playOpts);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  }, [code, message, playOpts, state.ready, togglePlayPause]);

  const handleSliderChange = useCallback(
    (value: number) => {
      if (value >= 99) stop();
    },
    [stop],
  );

  const handleExport = useCallback(
    async (format: 'wav' | 'mp3') => {
      if (!code.trim()) {
        message.warning('请先输入 Strudel 代码');
        return;
      }
      if (!state.ready && !exporting) {
        message.warning('Strudel 引擎尚未就绪');
        return;
      }
      setExporting(true);
      const wasEngineReady = state.ready;
      try {
        stop();
        const res = await exportStrudelAudio({
          code,
          cps,
          cycleCount,
          format,
          volume: state.volume,
          engineReady: state.ready,
          downloadBaseName: `strudel-${Date.now()}`,
        });
        if (!res.ok) {
          message.error(res.error);
          return;
        }
        if (res.outputPath) {
          message.success(`已导出 ${format.toUpperCase()}：${res.outputPath}`);
        } else {
          message.success(`已开始下载 ${format.toUpperCase()}`);
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        if (wasEngineReady) {
          await reinitEngine();
        }
        setExporting(false);
      }
    },
    [code, cps, cycleCount, exporting, message, reinitEngine, state.ready, state.volume, stop],
  );

  const morePanel = useMemo(
    () => (
      <div className="strudel-player__more-panel">
        <div className="strudel-player__menu-section">
          <span className="strudel-player__menu-label">CPS（cycles per second）</span>
          <InputNumber
            size="small"
            min={0.25}
            max={4}
            step={0.05}
            value={cps}
            onChange={(v) => typeof v === 'number' && onCpsChange(v)}
            style={{ width: '100%' }}
          />
          <span className="strudel-player__menu-label" style={{ marginTop: 12 }}>
            预览 cycle 数（时长 = N / CPS 秒）
          </span>
          <Space wrap size={6}>
            {CYCLE_PRESETS.map((n) => (
              <Button
                key={n}
                size="small"
                type={cycleCount === n ? 'primary' : 'default'}
                onClick={() => onCycleCountChange(n)}
              >
                {n}
              </Button>
            ))}
          </Space>
          <div className="strudel-player__status">
            {state.initError ?
              <span className="strudel-player__status--error">引擎：{state.initError}</span>
            : state.ready ?
              <>Strudel 就绪 · 预览约 {formatPlaybackTime(durationSec)}</>
            : '初始化中…'}
          </div>
        </div>
        <div className="strudel-player__more-actions">
          <Button
            size="small"
            block
            icon={<DownloadOutlined />}
            disabled={exporting || !code.trim()}
            onClick={() => void handleExport('wav')}
          >
            导出 WAV
          </Button>
          <Button
            size="small"
            block
            icon={<DownloadOutlined />}
            disabled={exporting || !code.trim()}
            onClick={() => void handleExport('mp3')}
          >
            导出 MP3
          </Button>
        </div>
      </div>
    ),
    [
      code,
      cps,
      cycleCount,
      durationSec,
      exporting,
      handleExport,
      onCpsChange,
      onCycleCountChange,
      state.initError,
      state.ready,
    ],
  );

  const playTooltip = useMemo(() => {
    if (state.initError) return `引擎初始化失败：${state.initError}`;
    if (!state.ready) return 'Strudel 引擎初始化中，请稍候…';
    if (isPlaying) return '暂停';
    if (isPaused) return '继续';
    return '播放';
  }, [isPaused, isPlaying, state.initError, state.ready]);

  const volumePercent = Math.round(state.volume * 100);

  return (
    <div className="strudel-player">
      <Tooltip title={playTooltip}>
        <button
          type="button"
          className="strudel-player__play-btn"
          onClick={() => void handleToggle()}
          disabled={!state.ready || state.busy || exporting}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {state.busy && !isPlaying ?
            <LoadingOutlined />
          : isPlaying ?
            <PauseOutlined />
          : <CaretRightOutlined />}
        </button>
      </Tooltip>

      <span className="strudel-player__time">
        {formatPlaybackTime(state.currentSec)} / {formatPlaybackTime(displayDuration)}
      </span>

      <Slider
        className="strudel-player__slider"
        value={isActive ? progressPercent : 0}
        tooltip={{ formatter: null }}
        onChange={handleSliderChange}
        disabled={!isActive}
      />

      <Popover
        open={volumeOpen}
        onOpenChange={setVolumeOpen}
        trigger="click"
        placement="top"
        content={
          <div className="strudel-player__volume-popover">
            <span className="strudel-player__menu-label">主音量</span>
            <Slider
              min={0}
              max={100}
              value={volumePercent}
              onChange={(v) => setVolume(v / 100)}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
          </div>
        }
      >
        <Tooltip title={`音量 ${volumePercent}%`}>
          <button
            type="button"
            className="strudel-player__volume-btn"
            aria-label="音量"
            disabled={!state.ready}
          >
            <SoundOutlined />
          </button>
        </Tooltip>
      </Popover>

      <Popover
        open={moreOpen}
        onOpenChange={setMoreOpen}
        trigger="click"
        placement="topRight"
        content={morePanel}
      >
        <Button
          type="text"
          size="small"
          className="strudel-player__menu-btn"
          icon={exporting ? <LoadingOutlined /> : <MoreOutlined />}
          aria-label="播放设置与导出"
          disabled={exporting}
        />
      </Popover>
    </div>
  );
}
