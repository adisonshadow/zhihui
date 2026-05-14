/**
 * 通用设置：默认工作目录、画布行为、列表背景视频（见功能文档 3.1 扩展）
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Select, Space, Switch, Typography } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import type { AISettings } from '@/types/settings';

const { Text } = Typography;

function DirPickerField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="留空则创建项目时不预填目录"
        style={{ flex: 1 }}
      />
      <Button
        type="primary"
        icon={<FolderOpenOutlined />}
        onClick={async () => {
          const dir = await window.yiman?.dialog?.openDirectory();
          if (dir) onChange?.(dir);
        }}
      >
        选择目录
      </Button>
    </Space.Compact>
  );
}

export interface GeneralSettingsPanelProps {
  config: AISettings | null;
  onApply: (
    patch: Pick<
      AISettings,
      'defaultProjectRoot' | 'canvasAutoFitViewport' | 'modalMaskBlur' | 'novelBgVideo' | 'projectBgVideo'
    >,
  ) => Promise<boolean>;
}

export function GeneralSettingsPanel({ config, onApply }: GeneralSettingsPanelProps) {
  const [form] = Form.useForm<{
    defaultProjectRoot?: string;
    canvasAutoFitViewport?: boolean;
    modalMaskBlur?: boolean;
    novelBgVideo: string;
    projectBgVideo: string;
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
      defaultProjectRoot: config.defaultProjectRoot ?? '',
      canvasAutoFitViewport: config.canvasAutoFitViewport === true,
      modalMaskBlur: config.modalMaskBlur !== false,
      novelBgVideo: config.novelBgVideo ?? 'bg1.mp4',
      projectBgVideo: config.projectBgVideo ?? 'bg1.mp4',
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
    <div style={{ maxWidth: 560 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        以下为应用级偏好，与 AI 模型列表一并写入本地配置。
      </Text>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          defaultProjectRoot: '',
          canvasAutoFitViewport: false,
          modalMaskBlur: true,
          novelBgVideo: 'bg1.mp4',
          projectBgVideo: 'bg1.mp4',
        }}
        onFinish={async (v) => {
          await onApply({
            defaultProjectRoot: (v.defaultProjectRoot ?? '').trim() || undefined,
            canvasAutoFitViewport: v.canvasAutoFitViewport === true,
            modalMaskBlur: v.modalMaskBlur !== false,
            novelBgVideo: v.novelBgVideo,
            projectBgVideo: v.projectBgVideo,
          });
        }}
      >
        <Form.Item
          name="defaultProjectRoot"
          label="默认工作目录"
          extra="创建漫剧项目时，「本地项目目录」默认使用该路径；仍可在新建弹窗中修改。"
        >
          <DirPickerField />
        </Form.Item>
        <Form.Item
          name="canvasAutoFitViewport"
          label="画布"
          valuePropName="checked"
          extra="开启后，进入设计器时画布缩放默认随视口变化自动适配（与工具栏「适应视口」行为一致）。"
        >
          <Switch checkedChildren="自动适应视口" unCheckedChildren="关闭" />
        </Form.Item>
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

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存通用设置
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
