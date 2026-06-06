/**
 * 通用设置：弹窗遮罩、列表背景视频（见功能文档 3.1 扩展）
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Select, Switch, Typography } from 'antd';
import type { AISettings } from '@/types/settings';

const { Text } = Typography;

export interface GeneralSettingsPanelProps {
  config: AISettings | null;
  onApply: (
    patch: Pick<
      AISettings,
      'modalMaskBlur' | 'novelBgVideo' | 'projectBgVideo' | 'audiobookBgVideo' | 'toolboxBgVideo'
    >,
  ) => Promise<boolean>;
}

export function GeneralSettingsPanel({ config, onApply }: GeneralSettingsPanelProps) {
  const [form] = Form.useForm<{
    modalMaskBlur?: boolean;
    novelBgVideo: string;
    projectBgVideo: string;
    audiobookBgVideo: string;
    toolboxBgVideo: string;
  }>();
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  /** 从 Electron 主进程读取 medias 目录下的视频文件列表 */
  const loadMediaFiles = useCallback(async () => {
    setMediaLoading(true);
    try {
      const files = await window.yiman?.fs?.listMedias?.();
      setMediaFiles(files ?? []);
    } catch {
      setMediaFiles([]);
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMediaFiles();
  }, [loadMediaFiles]);

  useEffect(() => {
    if (!config) return;
    form.setFieldsValue({
      modalMaskBlur: config.modalMaskBlur !== false,
      novelBgVideo: config.novelBgVideo ?? 'bg1.mp4',
      projectBgVideo: config.projectBgVideo ?? 'bg1.mp4',
      audiobookBgVideo:
        config.audiobookBgVideo ?? config.novelBgVideo ?? 'bg1.mp4',
      toolboxBgVideo:
        config.toolboxBgVideo ?? config.novelBgVideo ?? 'bg1.mp4',
    });
  }, [config, form]);

  /** 打开设置面板时重新读取文件列表 */
  useEffect(() => {
    if (config) void loadMediaFiles();
  }, [config, loadMediaFiles]);

  const bgOptions = [
    { label: '无背景', value: '' },
    ...mediaFiles.map((f) => ({
      label: f,
      value: f,
    })),
  ];

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        以下为应用级偏好。
      </Text>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          modalMaskBlur: true,
          novelBgVideo: 'bg1.mp4',
          projectBgVideo: 'bg1.mp4',
          audiobookBgVideo: 'bg1.mp4',
          toolboxBgVideo: 'bg1.mp4',
        }}
        onFinish={async (v) => {
          await onApply({
            modalMaskBlur: v.modalMaskBlur !== false,
            novelBgVideo: v.novelBgVideo,
            projectBgVideo: v.projectBgVideo,
            audiobookBgVideo: v.audiobookBgVideo,
            toolboxBgVideo: v.toolboxBgVideo,
          });
        }}
      >
        <Form.Item
          name="modalMaskBlur"
          label="弹窗遮罩"
          valuePropName="checked"
          extra="关闭后，Modal 遮罩为普通半透明层，不再对背后内容做模糊（backdrop-filter）。"
        >
          <Switch checkedChildren="使用模糊" unCheckedChildren="不使用模糊" />
        </Form.Item>

        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          列表背景视频
        </Text>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          选择列表页的背景动态视频，视频文件位于 public/medias/ 目录。选择「无背景」则不显示动态背景。
        </Text>

        <Form.Item
          name="novelBgVideo"
          label="小说编剧的动画背景"
          extra="小说编剧列表页面的背景视频，仅 .mp4 / .webm 格式。"
        >
          <Select
            options={bgOptions}
            loading={mediaLoading}
            placeholder="选择背景视频"
            allowClear
            onClear={() => form.setFieldsValue({ novelBgVideo: '' })}
            notFoundContent={
              mediaLoading ? '加载中…' : '未找到视频文件，请将 .mp4 文件放入 public/medias/'
            }
          />
        </Form.Item>

        <Form.Item
          name="projectBgVideo"
          label="漫剧项目的动画背景"
          extra="漫剧项目列表页面的背景视频，仅 .mp4 / .webm 格式。"
        >
          <Select
            options={bgOptions}
            loading={mediaLoading}
            placeholder="选择背景视频"
            allowClear
            onClear={() => form.setFieldsValue({ projectBgVideo: '' })}
            notFoundContent={
              mediaLoading ? '加载中…' : '未找到视频文件，请将 .mp4 文件放入 public/medias/'
            }
          />
        </Form.Item>

        <Form.Item
          name="audiobookBgVideo"
          label="有声书项目的动画背景"
          extra="有声书项目列表页面的背景视频，仅 .mp4 / .webm 格式；可与小说编剧使用不同片段。"
        >
          <Select
            options={bgOptions}
            loading={mediaLoading}
            placeholder="选择背景视频"
            allowClear
            onClear={() => form.setFieldsValue({ audiobookBgVideo: '' })}
            notFoundContent={
              mediaLoading ? '加载中…' : '未找到视频文件，请将 .mp4 文件放入 public/medias/'
            }
          />
        </Form.Item>

        <Form.Item
          name="toolboxBgVideo"
          label="实用工具的动画背景"
          extra="实用工具列表页面的背景视频，仅 .mp4 / .webm 格式。"
        >
          <Select
            options={bgOptions}
            loading={mediaLoading}
            placeholder="选择背景视频"
            allowClear
            onClear={() => form.setFieldsValue({ toolboxBgVideo: '' })}
            notFoundContent={
              mediaLoading ? '加载中…' : '未找到视频文件，请将 .mp4 文件放入 public/medias/'
            }
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存通用设置
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
