/**
 * 漫剧设置：默认工作目录、画布行为（见功能文档 3.1 扩展）
 */
import { useEffect } from 'react';
import { Button, Form, Input, Space, Switch, Typography } from 'antd';
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

export interface ProjectSettingsPanelProps {
  config: AISettings | null;
  onApply: (patch: Pick<AISettings, 'defaultProjectRoot' | 'canvasAutoFitViewport'>) => Promise<boolean>;
}

export function ProjectSettingsPanel({ config, onApply }: ProjectSettingsPanelProps) {
  const [form] = Form.useForm<{
    defaultProjectRoot?: string;
    canvasAutoFitViewport?: boolean;
  }>();

  useEffect(() => {
    if (!config) return;
    form.setFieldsValue({
      defaultProjectRoot: config.defaultProjectRoot ?? '',
      canvasAutoFitViewport: config.canvasAutoFitViewport === true,
    });
  }, [config, form]);

  return (
    <div style={{ maxWidth: 480 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        配置漫剧项目与设计器相关参数。
      </Text>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          defaultProjectRoot: '',
          canvasAutoFitViewport: false,
        }}
        onFinish={async (v) => {
          await onApply({
            defaultProjectRoot: (v.defaultProjectRoot ?? '').trim() || undefined,
            canvasAutoFitViewport: v.canvasAutoFitViewport === true,
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
        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
