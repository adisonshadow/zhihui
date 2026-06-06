/**
 * 小说编剧设置面板：封面候选数量、作者署名等
 */
import { useEffect } from 'react';
import { Button, Form, Input, InputNumber, Typography, App } from 'antd';
import type { AISettings, NovelWriterConfig } from '@/types/settings';
import { normalizeNovelWriterAuthorName } from '@/utils/novelWriterAuthorName';

const { Text } = Typography;

export interface NovelWriterSettingsPanelProps {
  config: AISettings | null;
  onApply: (patch: { novelWriter: NovelWriterConfig }) => Promise<boolean>;
}

export function NovelWriterSettingsPanel({ config, onApply }: NovelWriterSettingsPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NovelWriterConfig & { authorNameInput?: string }>();

  useEffect(() => {
    if (!config) return;
    form.setFieldsValue({
      coverImageCount: config.novelWriter?.coverImageCount ?? 4,
      authorNameInput: config.novelWriter?.authorName ?? '',
    });
  }, [config, form]);

  return (
    <div style={{ maxWidth: 480 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        配置小说编剧相关参数。
      </Text>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ coverImageCount: 4, authorNameInput: '' }}
        onFinish={async (v) => {
          const authorName = normalizeNovelWriterAuthorName(
            typeof v.authorNameInput === 'string' ? v.authorNameInput : undefined,
          );
          const ok = await onApply({
            novelWriter: {
              coverImageCount: Math.max(1, Math.min(12, v.coverImageCount)),
              ...(authorName ? { authorName } : {}),
            },
          });
          if (ok) {
            message.success('小说编剧设置已保存');
          }
        }}
      >
        <Form.Item
          name="coverImageCount"
          label="每次生成封面图片的数量"
          rules={[
            { required: true, message: '请输入数量' },
            { type: 'number', min: 1, max: 12, message: '数量须在 1–12 之间' },
          ]}
          extra="AI 助手每次生成封面候选图的数量，默认为 4。可设为 1–12。"
        >
          <InputNumber min={1} max={12} style={{ width: 120 }} />
        </Form.Item>

        <Form.Item
          name="authorNameInput"
          label="作者名称"
          extra="若填写，封面助手在给 AI 的下发提示中会要求在封面上绘制「作者 xxx」样式的署名文字；留空则不作此要求。"
        >
          <Input placeholder="例如：张三" maxLength={64} allowClear autoComplete="name" />
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
