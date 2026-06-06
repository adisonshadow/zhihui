/**
 * ExportBar：降噪开关、导出 mp3/wav、demucs 预留按钮
 */
import { useCallback, useState } from 'react';
import { Button, Select, Space, Switch, Typography, message } from 'antd';
import { DownloadOutlined, SoundOutlined } from '@ant-design/icons';
import { demucsCheck, exportRecording } from '../utils/audioRecorderApi';

const { Text } = Typography;

interface ExportBarProps {
  /** 当前选中的录音文件路径 */
  filePath: string | null;
  /** 裁剪范围 */
  trimStart?: number;
  trimEnd?: number;
  /** 是否启用降噪 */
  denoise: boolean;
  onDenoiseChange: (v: boolean) => void;
}

export function ExportBar({ filePath, trimStart, trimEnd, denoise, onDenoiseChange }: ExportBarProps) {
  const [format, setFormat] = useState<'mp3' | 'wav'>('wav');
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!filePath) {
      message.warning('请先选择录音');
      return;
    }

    setExporting(true);
    try {
      // 弹出保存对话框
      const ext = format === 'mp3' ? '.mp3' : '.wav';
      const defaultName = `export_${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`;
      const saveResult = await window.yiman?.dialog?.saveFile({
        defaultPath: defaultName,
        filters: [
          { name: format === 'mp3' ? 'MP3 音频' : 'WAV 音频', extensions: [format] },
        ],
      });
      if (!saveResult) {
        // 用户取消
        return;
      }

      const res = await exportRecording(filePath, saveResult, {
        format,
        trimStart,
        trimEnd,
        denoise,
      });

      if (res.ok) {
        message.success(`已导出到 ${res.outputPath}`);
      } else {
        message.error(res.error || '导出失败');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [filePath, format, trimStart, trimEnd, denoise]);

  /** demucs 占位检查 */
  const handleDemucsCheck = useCallback(async () => {
    const result = await demucsCheck();
    if (result.installed) {
      message.info('demucs 已安装，功能待接入');
    } else {
      message.warning(result.message || 'demucs 未安装');
    }
  }, []);

  return (
    <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
      <Text strong style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, display: 'block', marginBottom: 12 }}>
        导出设置
      </Text>

      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Space>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>降噪:</Text>
          <Switch
            checked={denoise}
            onChange={onDenoiseChange}
            checkedChildren="开启"
            unCheckedChildren="关闭"
            size="small"
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            (ffmpeg afftdn 滤波器)
          </Text>
        </Space>

        <Space>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>导出格式:</Text>
          <Select
            value={format}
            onChange={setFormat}
            size="small"
            style={{ width: 90 }}
            options={[
              { value: 'mp3', label: 'MP3' },
              { value: 'wav', label: 'WAV' },
            ]}
          />
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!filePath}
            onClick={handleExport}
          >
            导出
          </Button>
        </Space>

        <Space>
          <Button
            size="small"
            icon={<SoundOutlined />}
            onClick={handleDemucsCheck}
            disabled
            title="需安装 demucs"
          >
            去背景音 (demucs)
          </Button>
          <Text type="secondary" style={{ fontSize: 11 }}>
            需安装
          </Text>
        </Space>
      </Space>
    </div>
  );
}
