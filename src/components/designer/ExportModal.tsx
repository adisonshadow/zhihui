/**
 * 视频导出弹窗：格式、分辨率（480P/720P/1080P/2K/4K）、帧率、导出目录；导出进度与结果路径（见开发计划 2.13）
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Form, Select, Progress, Space, Button, Typography, Input, App } from 'antd';
import { CopyOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';

const { Text } = Typography;

/** 分辨率预设：短边高度，横屏 width>height，竖屏 height>width */
const RESOLUTION_PRESETS = [
  { value: '480p', label: '480P' },
  { value: '720p', label: '720P' },
  { value: '1080p', label: '1080P' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
] as const;

function getResolutionFromPreset(preset: string, landscape: boolean): { width: number; height: number } {
  const byShort = { '480p': 480, '720p': 720, '1080p': 1080, '2k': 1440, '4k': 2160 };
  const short = byShort[preset as keyof typeof byShort] ?? 1080;
  const long = Math.round(short * (16 / 9));
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

const FPS_OPTIONS = [
  { value: 24, label: '24 fps' },
  { value: 30, label: '30 fps' },
];

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  project: ProjectInfo;
  sceneId: string | null;
  landscape: boolean;
}

export function ExportModal({ open, onClose, project, sceneId, landscape }: ExportModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ resolution: string; fps: number; outputDir: string }>();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState<string | undefined>();
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && window.yiman?.project?.getExportsPath) {
      window.yiman.project.getExportsPath(project.project_dir).then((dir: string) => {
        form.setFieldValue('outputDir', dir);
      });
    }
  }, [open, project.project_dir, form]);

  const handleClose = useCallback(() => {
    if (!exporting) {
      form.resetFields();
      setProgress(0);
      setProgressMsg(undefined);
      setResultPath(null);
      setError(null);
      onClose();
    }
  }, [exporting, form, onClose]);

  const handleBrowseDir = useCallback(async () => {
    const dir = await window.yiman?.dialog?.openDirectory?.();
    if (dir) form.setFieldValue('outputDir', dir);
  }, [form]);

  const handleExport = useCallback(async () => {
    if (!sceneId || !window.yiman?.project?.exportVideo) return;
    const values = await form.validateFields();
    const { width, height } = getResolutionFromPreset(values.resolution, landscape);
    setExporting(true);
    setProgress(0);
    setProgressMsg(undefined);
    setResultPath(null);
    setError(null);

    try {
      const res = await window.yiman.project.exportVideo(
        project.project_dir,
        sceneId,
        { width, height, fps: values.fps, outputDir: values.outputDir },
        (p) => {
          setProgress(p.percent);
          setProgressMsg(p.message);
        }
      );

      if (res?.ok && res.outputPath) {
        setResultPath(res.outputPath);
        setProgress(100);
      } else {
        setError(res?.error ?? '导出失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [project.project_dir, sceneId, landscape, form]);

  const handleCopyPath = useCallback(() => {
    if (resultPath) {
      navigator.clipboard.writeText(resultPath);
      message.success('已复制路径');
    }
  }, [resultPath, message]);

  const handleOpenFolder = useCallback(() => {
    if (resultPath && window.yiman?.shell?.showItemInFolder) {
      window.yiman.shell.showItemInFolder(resultPath);
    }
  }, [resultPath]);

  return (
    <Modal
      title="导出视频"
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={440}
    >
      {!resultPath ? (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ resolution: '1080p', fps: 30 }}
        >
          <Form.Item
            name="resolution"
            label="分辨率"
            rules={[{ required: true }]}
            extra={landscape ? '横屏项目' : '竖屏项目'}
          >
            <Select options={RESOLUTION_PRESETS} />
          </Form.Item>
          <Form.Item
            name="fps"
            label="帧率"
            rules={[{ required: true }]}
          >
            <Select options={FPS_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="outputDir"
            label="导出目录"
            rules={[{ required: true, message: '请选择导出目录' }]}
          >
            <Input
              readOnly
              placeholder="选择保存位置"
              addonAfter={<Button type="link" size="small" icon={<FolderOutlined />} onClick={handleBrowseDir} htmlType="button">浏览</Button>}
            />
          </Form.Item>
          {error && (
            <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
              {error}
            </Text>
          )}
          {exporting && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={progress} status={error ? 'exception' : 'active'} />
              {progressMsg && (
                <Text type="secondary" style={{ fontSize: 12 }}>{progressMsg}</Text>
              )}
            </div>
          )}
          <Space>
            <Button
              type="primary"
              onClick={handleExport}
              loading={exporting}
              disabled={!sceneId || exporting}
            >
              {exporting ? '导出中...' : '开始导出'}
            </Button>
            {!exporting && <Button onClick={handleClose}>取消</Button>}
          </Space>
        </Form>
      ) : (
        <div>
          <Text type="secondary">导出完成，文件已保存至：</Text>
          <Input.TextArea
            readOnly
            value={resultPath ?? ''}
            rows={3}
            style={{ marginTop: 8, marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }}
          />
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCopyPath}>
              复制路径
            </Button>
            {typeof window.yiman?.shell?.showItemInFolder === 'function' && (
              <Button icon={<FolderOpenOutlined />} onClick={handleOpenFolder}>
                在文件夹中显示
              </Button>
            )}
            <Button type="primary" onClick={handleClose}>
              关闭
            </Button>
          </Space>
        </div>
      )}
    </Modal>
  );
}
