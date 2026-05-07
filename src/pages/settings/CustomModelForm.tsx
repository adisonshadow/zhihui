/**
 * 自定义模型完整表单（含本地部署开关，见功能文档 3.1.1）
 */
import { Button, Form, Input, Space, Switch, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { AIModelConfig } from '@/types/settings';
import { CAPABILITY_TAGS } from '@/types/settings';
import { LOCAL_OLLAMA_DEFAULT_API_URL } from '@/components/AIChat/constants/modelPresets';
import { applyDisplayNameVersionSplitToForm } from '@/utils/modelDisplayNameInputSplit';

const { Text } = Typography;

function CapabilityKeySelect({
  value = [],
  onChange,
}: {
  value?: string[];
  onChange?: (keys: string[]) => void;
}) {
  const selected = new Set(value ?? []);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange?.(Array.from(next));
  };

  return (
    <Space size={[4, 8]} wrap>
      {CAPABILITY_TAGS.map((t) => (
        <Tag
          key={t.key}
          style={{ cursor: 'pointer', margin: 0 }}
          color={selected.has(t.key) ? 'blue' : 'default'}
          onClick={() => toggle(t.key)}
        >
          {t.label}
        </Tag>
      ))}
    </Space>
  );
}

export type CustomModelFormValues = Partial<AIModelConfig> & { isLocal?: boolean };

export interface CustomModelFormProps {
  form: FormInstance<CustomModelFormValues>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  /** 标题文案，默认「编辑模型」 */
  formTitle?: string;
  /** 是否显示底部保存/取消按钮 */
  showActionButtons?: boolean;
  /** 为 true 时不渲染「能力」多选（由外层如能力筛选同步写入 capabilityKeys） */
  hideCapabilityField?: boolean;
}

export function CustomModelForm({
  form,
  onSave,
  onCancel,
  formTitle = '编辑模型',
  showActionButtons = true,
  hideCapabilityField = false,
}: CustomModelFormProps) {
  const isLocal = Form.useWatch('isLocal', form);

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 16 }}>
        {formTitle}
      </Text>
      <Form form={form} layout="vertical">
        <Form.Item name="isLocal" label="本地部署" valuePropName="checked">
          <Switch
            onChange={(checked) => {
              if (checked) {
                const u = (form.getFieldValue('apiUrl') as string | undefined)?.trim();
                if (!u) form.setFieldsValue({ apiUrl: LOCAL_OLLAMA_DEFAULT_API_URL, apiKey: '' });
              }
            }}
          />
        </Form.Item>
        <Form.Item name="name" label="名称（可选）">
          <Input placeholder="如：剧本生成模型" allowClear />
        </Form.Item>
        <Form.Item name="provider" label="供应商类型">
          <Input placeholder="如：OpenAI、通义" allowClear />
        </Form.Item>
        <Form.Item name="apiUrl" label="API 地址" rules={[{ required: true, message: '请输入 API 地址' }]}>
          <Input placeholder="https://api.openai.com/v1" allowClear />
        </Form.Item>
        {!isLocal ? (
          <Form.Item
            name="apiKey"
            label="API 密钥"
            rules={[{ required: true, message: '请输入 API 密钥' }]}
          >
            <Input.Password placeholder="sk-..." allowClear />
          </Form.Item>
        ) : (
          <Form.Item name="apiKey" hidden>
            <Input />
          </Form.Item>
        )}
        <Form.Item
          name="modelDisplayName"
          label="模型名称（DisplayName）"
          tooltip="请求体中的 model 可写完整 ID；若另填主版本，则按「名称-主版本」组合。粘贴完整 id（末尾 6 位以上版本号）时可自动拆分。"
        >
          <Input
            placeholder="如 gpt-3.5-turbo 或 deepseek-chat"
            allowClear
            onKeyUp={(e) => {
              const v = (e.target as HTMLInputElement).value;
              applyDisplayNameVersionSplitToForm(form, v);
            }}
            onPaste={(e) => {
              const text = e.clipboardData?.getData('text') ?? '';
              setTimeout(() => applyDisplayNameVersionSplitToForm(form, text), 0);
            }}
          />
        </Form.Item>
        <Form.Item
          name="primaryVersion"
          label="主版本（PrimaryVersion）"
          dependencies={['modelDisplayName']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, v) {
                const pv = String(v ?? '').trim();
                if (!pv) return Promise.resolve();
                const d = String(getFieldValue('modelDisplayName') ?? '').trim();
                if (!d) {
                  return Promise.reject(new Error('填写主版本时请先填写模型名称'));
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <Input placeholder="易变时填写，如 260328" allowClear />
        </Form.Item>
        {hideCapabilityField ? (
          <Form.Item name="capabilityKeys" hidden>
            <CapabilityKeySelect />
          </Form.Item>
        ) : (
          <Form.Item name="capabilityKeys" label="能力" tooltip="选择该模型擅长的能力，可多选">
            <CapabilityKeySelect />
          </Form.Item>
        )}
        {showActionButtons ? (
          <Space>
            <Button type="primary" onClick={() => void onSave()}>
              保存
            </Button>
            <Button onClick={onCancel}>取消</Button>
          </Space>
        ) : null}
      </Form>
    </>
  );
}
