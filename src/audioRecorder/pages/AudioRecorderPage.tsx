/**
 * AudioRecorderPage：整体布局（左侧录音列表 + 右侧录制/编辑区）
 * 右侧面板分两种模式：
 *   - 无选中录音 → 录制模式（RecorderControls）
 *   - 有选中录音 → 编辑模式（播放/波形裁剪/导出），不显示录制控件
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Divider, message, Typography } from 'antd';
import { AudioOutlined, RollbackOutlined } from '@ant-design/icons';
import { resolveLocalAudioPlayUrl } from '@/novelDesign/utils/resolveLocalAudioPlayUrl';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useRecordingLibrary } from '../hooks/useRecordingLibrary';
import { RecordingList } from '../components/RecordingList';
import { RecorderControls } from '../components/RecorderControls';
import { AudioTrimEditor } from '../components/AudioTrimEditor';
import { ExportBar } from '../components/ExportBar';
import { saveRecording, getDuration } from '../utils/audioRecorderApi';
import './AudioRecorderPage.css';

const { Text } = Typography;

export default function AudioRecorderPage() {
  const navigate = useNavigate();
  const recorder = useMediaRecorder();
  const library = useRecordingLibrary();
  const mainRef = useRef<HTMLDivElement>(null);

  const [denoise, setDenoise] = useState(false);
  const [trimRange, setTrimRange] = useState<[number, number] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playingEntry, setPlayingEntry] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** 选择录音时获取时长 */
  useEffect(() => {
    if (!library.selected) {
      setDuration(null);
      setTrimRange(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const d = await getDuration(library.selected!.path);
      if (!cancelled) setDuration(d);
    };
    void load();
    return () => { cancelled = true; };
  }, [library.selected]);

  /** 停止录制后保存到磁盘 */
  const handleStopRecording = useCallback(async () => {
    const blob = await recorder.stop();
    if (!blob || blob.size === 0) {
      message.warning('录音为空');
      return;
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];

        const res = await saveRecording(base64, 'webm');
        if (res.ok) {
          message.success('录音已保存');
          await library.refresh();
          const updated = await (await import('../utils/audioRecorderApi')).listRecordings();
          const saved = updated.find((r) => r.path === res.path);
          if (saved) library.selectRecording(saved);
        } else {
          message.error(res.error || '保存失败');
        }
      };
    } catch (e) {
      message.error('保存录音失败');
      console.error(e);
    }
  }, [recorder, library]);

  /** 新建录音：取消列表选中，重置计时器，切换到录制模式 */
  const handleNewRecording = useCallback(() => {
    recorder.reset();
    library.selectRecording(null);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [recorder, library]);

  /** 播放选中的录音（file:// URL 直接播放） */
  const handlePlaySelected = useCallback(() => {
    if (!library.selected) return;
    const path = library.selected.path;

    if (playingEntry === path && audioRef.current) {
      audioRef.current.pause();
      setPlayingEntry(null);
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audioUrl = resolveLocalAudioPlayUrl(path);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingEntry(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingEntry(null);
      };
      void audio.play().then(() => {
        setPlayingEntry(path);
      }).catch(() => {
        setPlayingEntry(null);
      });
    } catch {
      setPlayingEntry(null);
    }
  }, [library.selected, playingEntry]);

  return (
    <div className="audio-recorder-page">
      <header className="audio-recorder-topbar">
        <Button type="text" icon={<RollbackOutlined />} onClick={() => navigate('/toolbox')}>
          返回
        </Button>
        <div style={{ flex: 1 }} />
        <Button
          type="primary"
          icon={<AudioOutlined />}
          disabled={recorder.status !== 'idle'}
          onClick={handleNewRecording}
          style={{ borderRadius: 20 }}
        >
          新建录音
        </Button>
      </header>

      <div className="audio-recorder-body">
        {/* 左侧录音列表 */}
        <div className="audio-recorder-sidebar" style={{ overflowY: 'hidden' , padding: '0px'}}>
          <RecordingList
            recordings={library.recordings}
            selected={library.selected}
            loading={library.loading}
            onSelect={library.selectRecording}
            onDelete={library.removeRecording}
            onRename={library.renameRecordingEntry}
          />
        </div>

        {/* 右侧面板 */}
        <div className="audio-recorder-main" ref={mainRef}>
          {library.selected ? (
            /* 编辑模式：选中录音时显示播放/裁剪/导出 */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                  当前: {library.selected.name}
                  {duration != null && (
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                      ({duration.toFixed(1)}s)
                    </Text>
                  )}
                </Text>
                {/* 播放按钮暂时隐藏 */}
              </div>

              <AudioTrimEditor
                filePath={library.selected.path}
                trimRange={trimRange}
                onTrimChange={setTrimRange}
                duration={duration}
              />

              <ExportBar
                filePath={library.selected.path}
                trimStart={trimRange?.[0]}
                trimEnd={trimRange?.[1]}
                denoise={denoise}
                onDenoiseChange={setDenoise}
              />
            </div>
          ) : (
            /* 录制模式：无选中录音时显示录制控件和空状态提示 */
            <>
              <RecorderControls
                status={recorder.status}
                elapsed={recorder.elapsed}
                error={recorder.error}
                onStart={recorder.start}
                onPause={recorder.pause}
                onResume={recorder.resume}
                onStop={handleStopRecording}
              />
              {recorder.status === 'idle' && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.35)' }}>
                  <Text type="secondary">
                    新建录音后，录音会出现在左侧列表。选中录音可进行裁剪/降噪/导出。
                  </Text>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
