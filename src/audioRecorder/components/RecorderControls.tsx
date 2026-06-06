/**
 * 录制控件：开始/暂停/继续/停止，实时计时
 */
import { Button, Space, Typography } from 'antd';
import {
  AudioOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { RecorderStatus } from '../hooks/useMediaRecorder';

const { Text } = Typography;

interface RecorderControlsProps {
  status: RecorderStatus;
  elapsed: number;
  error: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function RecorderControls({ status, elapsed, error, onStart, onPause, onResume, onStop }: RecorderControlsProps) {
  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 48,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: isRecording ? '#ff4d4f' : isPaused ? '#faad14' : 'rgba(255,255,255,0.65)',
            fontFamily: 'monospace',
          }}
        >
          {formatTime(elapsed)}
        </Text>
      </div>

      {error && (
        <Text type="danger" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          {error}
        </Text>
      )}

      <Space size={16}>
        {isIdle && (
          <Button
            type="primary"
            size="large"
            icon={<AudioOutlined />}
            onClick={onStart}
            style={{ borderRadius: 24, padding: '0 32px', height: 48 }}
          >
            开始录制
          </Button>
        )}

        {isRecording && (
          <>
            <Button
              size="large"
              icon={<PauseCircleOutlined />}
              onClick={onPause}
              style={{ borderRadius: 24, height: 48 }}
            >
              暂停
            </Button>
            <Button
              type="primary"
              danger
              size="large"
              icon={<StopOutlined />}
              onClick={onStop}
              style={{ borderRadius: 24, height: 48 }}
            >
              停止
            </Button>
          </>
        )}

        {isPaused && (
          <>
            <Button
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={onResume}
              style={{ borderRadius: 24, height: 48 }}
            >
              继续
            </Button>
            <Button
              type="primary"
              danger
              size="large"
              icon={<StopOutlined />}
              onClick={onStop}
              style={{ borderRadius: 24, height: 48 }}
            >
              停止
            </Button>
          </>
        )}
      </Space>
    </div>
  );
}
