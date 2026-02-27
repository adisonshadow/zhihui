/**
 * 设置面板 - AI 模型配置、AI 抠图配置（见功能文档 3.1、docs/配置订阅使用.md、docs/AI抠图配置说明.md）
 * 支持全页模式（/settings 路由）与 Modal 模式（全局打开）
 */
import { useEffect, useState } from 'react';
import {
  App,
  Modal,
  List,
  Button,
  Form,
  Input,
  Tag,
  Space,
  Typography,
  Divider,
  Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ScissorOutlined } from '@ant-design/icons';
import type { AISettings, AIModelConfig, AIMattingConfig, AIMattingProvider } from '@/types/settings';
import { CAPABILITY_TAGS } from '@/types/settings';

const { Text } = Typography;

const AI_MATTING_PROVIDERS: { value: AIMattingProvider; label: string }[] = [
  { value: 'volcengine', label: '火山引擎抠图' },
];

interface SettingsProps {
  /** Modal 模式 */
  modal?: boolean;
  open?: boolean;
  onClose?: () => void;
  /** 保存成功后回调（Modal 模式下用于通知订阅者） */
  onSaved?: (config: AISettings) => void;
}

export default function Settings({ modal = false, open = true, onClose, onSaved }: SettingsProps) {
  const { message } = App.useApp();
  const [config, setConfig] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMattingId, setEditingMattingId] = useState<string | null>(null);
  const [form] = Form.useForm<Partial<AIModelConfig>>();
  const [mattingForm] = Form.useForm<Partial<AIMattingConfig>>();

  const loadConfig = async () => {
    if (!window.yiman?.settings?.get) return;
    setLoading(true);
    try {
      const data = await window.yiman.settings.get();
      setConfig(data);
    } catch (e) {
      message.error('加载配置失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadConfig();
  }, [open]);

  const handleAdd = () => {
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newModel: AIModelConfig = {
      id,
      apiUrl: '',
      apiKey: '',
      capabilityKeys: [],
    };
    setConfig((prev) => (prev ? { ...prev, models: [...(prev.models ?? []), newModel] } : { models: [newModel] }));
    setEditingId(id);
    setEditingMattingId(null);
    form.setFieldsValue(newModel);
  };

  const handleAddMatting = () => {
    const id = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newMatting: AIMattingConfig = {
      id,
      provider: 'volcengine',
      accessKeyId: '',
      secretAccessKey: '',
      region: 'cn-north-1',
      name: undefined,
      enabled: true,
    };
    setConfig((prev) =>
      prev
        ? { ...prev, aiMattingConfigs: [...(prev.aiMattingConfigs ?? []), newMatting] }
        : { models: [], aiMattingConfigs: [newMatting] }
    );
    setEditingMattingId(id);
    setEditingId(null);
    mattingForm.setFieldsValue(newMatting);
  };

  const handleEdit = (m: AIModelConfig) => {
    setEditingId(m.id);
    setEditingMattingId(null);
    form.setFieldsValue(m);
  };

  const handleEditMatting = (c: AIMattingConfig) => {
    setEditingMattingId(c.id);
    setEditingId(null);
    mattingForm.setFieldsValue(c);
  };

  const handleDelete = (id: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const models = (prev.models ?? []).filter((x) => x.id !== id);
      return { ...prev, models };
    });
    if (editingId === id) {
      setEditingId(null);
      form.resetFields();
    }
  };

  const handleDeleteMatting = (id: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const aiMattingConfigs = (prev.aiMattingConfigs ?? []).filter((x) => x.id !== id);
      return { ...prev, aiMattingConfigs };
    });
    if (editingMattingId === id) {
      setEditingMattingId(null);
      mattingForm.resetFields();
    }
  };

  const handleSaveModel = async () => {
    if (!config || editingId == null) return;
    try {
      const values = await form.validateFields();
      const next: AIModelConfig = {
        id: editingId,
        name: values.name,
        provider: values.provider,
        apiUrl: values.apiUrl ?? '',
        apiKey: values.apiKey ?? '',
        model: values.model,
        capabilityKeys: values.capabilityKeys ?? [],
      };
      const models = config.models.map((m) => (m.id === editingId ? next : m));
      setConfig({ ...config, models });
      setEditingId(null);
      form.resetFields();
      await saveConfig({ ...config, models });
    } catch {
      // 表单校验失败
    }
  };

  const handleSaveMatting = async () => {
    if (!config || editingMattingId == null) return;
    try {
      const values = await mattingForm.validateFields();
      const next: AIMattingConfig = {
        id: editingMattingId,
        name: values.name,
        provider: (values.provider ?? 'volcengine') as AIMattingProvider,
        accessKeyId: values.accessKeyId ?? '',
        secretAccessKey: values.secretAccessKey ?? '',
        region: values.region ?? 'cn-north-1',
        enabled: values.enabled !== false,
      };
      const aiMattingConfigs = (config.aiMattingConfigs ?? []).map((c) =>
        c.id === editingMattingId ? next : c
      );
      const nextConfig = { ...config, aiMattingConfigs };
      setConfig(nextConfig);
      setEditingMattingId(null);
      mattingForm.resetFields();
      await saveConfig(nextConfig);
    } catch {
      // 表单校验失败
    }
  };

  const saveConfig = async (data: AISettings) => {
    if (!window.yiman?.settings?.save) return;
    try {
      const res = await window.yiman.settings.save(data);
      if (res.ok) {
        message.success('已保存');
        onSaved?.(data);
      } else {
        message.error(res.error || '保存失败');
      }
    } catch (e) {
      message.error('保存失败');
      console.error(e);
    }
  };

  const content = (
    <div style={{ display: 'flex', gap: 24, minHeight: modal ? 400 : 'calc(100vh - 180px)' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text strong>AI 模型</Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加模型
          </Button>
        </div>
        {loading ? (
          <Text type="secondary">加载中…</Text>
        ) : (
          <>
            <List
              size="small"
              dataSource={config?.models ?? []}
              renderItem={(m) => (
                <List.Item
                  actions={[
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(m)}>
                      编辑
                    </Button>,
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(m.id)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {m.name || m.model || '未命名'}
                        {m.capabilityKeys?.length ? (
                          <Space size={[0, 4]} wrap>
                            {m.capabilityKeys.map((k) => {
                              const tag = CAPABILITY_TAGS.find((t) => t.key === k);
                              return (
                                <Tag key={k} style={{ margin: 0 }}>
                                  {tag?.label ?? k}
                                </Tag>
                              );
                            })}
                          </Space>
                        ) : null}
                      </Space>
                    }
                    description={m.apiUrl || '未配置 API'}
                  />
                </List.Item>
              )}
            />
            <Divider style={{ margin: '16px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong>AI 抠图</Text>
              <Button icon={<ScissorOutlined />} onClick={handleAddMatting}>
                添加 AI 抠图
              </Button>
            </div>
            <List
              size="small"
              dataSource={config?.aiMattingConfigs ?? []}
              renderItem={(c) => (
                <List.Item
                  actions={[
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditMatting(c)}>
                      编辑
                    </Button>,
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteMatting(c.id)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {c.name || AI_MATTING_PROVIDERS.find((p) => p.value === c.provider)?.label || '未命名'}
                        {c.enabled === false && <Tag color="default">已禁用</Tag>}
                      </Space>
                    }
                    description={c.provider === 'volcengine' ? `区域: ${c.region ?? 'cn-north-1'}` : c.provider}
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </div>
      <Divider orientation="vertical" style={{ height: 'auto', minHeight: 200 }} />
      <div style={{ width: 360 }}>
        {editingMattingId ? (
          <>
            <Text strong style={{ display: 'block', marginBottom: 16 }}>
              编辑 AI 抠图
            </Text>
            <Form form={mattingForm} layout="vertical">
              <Form.Item name="provider" label="AI 服务">
                <Select
                  options={AI_MATTING_PROVIDERS}
                  placeholder="选择服务"
                  disabled
                />
              </Form.Item>
              <Form.Item name="name" label="名称（可选）">
                <Input placeholder="如：默认抠图服务" allowClear />
              </Form.Item>
              <Form.Item
                name="accessKeyId"
                label="Access Key ID"
                rules={[{ required: true, message: '请输入 Access Key ID' }]}
              >
                <Input placeholder="火山引擎控制台获取" allowClear />
              </Form.Item>
              <Form.Item
                name="secretAccessKey"
                label="Secret Access Key"
                rules={[{ required: true, message: '请输入 Secret Access Key' }]}
              >
                <Input.Password placeholder="火山引擎控制台获取" allowClear />
              </Form.Item>
              <Form.Item name="region" label="区域（可选）">
                <Select
                  options={[
                    { value: 'cn-north-1', label: '华北（cn-north-1）' },
                    { value: 'cn-north-2', label: '华北2（cn-north-2）' },
                    { value: 'ap-singapore-1', label: '新加坡（ap-singapore-1）' },
                  ]}
                  placeholder="默认 cn-north-1"
                  allowClear
                />
              </Form.Item>
              <Form.Item name="enabled" label="启用">
                <Select
                  options={[
                    { value: true, label: '是' },
                    { value: false, label: '否（禁用）' },
                  ]}
                />
              </Form.Item>
              <Space>
                <Button type="primary" onClick={handleSaveMatting}>
                  保存
                </Button>
                <Button onClick={() => setEditingMattingId(null)}>取消</Button>
              </Space>
            </Form>
          </>
        ) : editingId ? (
          <>
            <Text strong style={{ display: 'block', marginBottom: 16 }}>
              编辑模型
            </Text>
            <Form form={form} layout="vertical">
              <Form.Item name="name" label="名称（可选）">
                <Input placeholder="如：剧本生成模型" allowClear />
              </Form.Item>
              <Form.Item name="provider" label="供应商类型">
                <Input placeholder="如：OpenAI、通义" allowClear />
              </Form.Item>
              <Form.Item
                name="apiUrl"
                label="API 地址"
                rules={[{ required: true, message: '请输入 API 地址' }]}
              >
                <Input placeholder="https://api.openai.com/v1" allowClear />
              </Form.Item>
              <Form.Item
                name="apiKey"
                label="API 密钥"
                rules={[{ required: true, message: '请输入 API 密钥' }]}
              >
                <Input.Password placeholder="sk-..." allowClear />
              </Form.Item>
              <Form.Item name="model" label="模型名称">
                <Input placeholder="gpt-3.5-turbo" allowClear />
              </Form.Item>
              <Form.Item
                name="capabilityKeys"
                label="能力"
                tooltip="选择该模型擅长的能力，可多选"
              >
                <CapabilityKeySelect />
              </Form.Item>
              <Space>
                <Button type="primary" onClick={handleSaveModel}>
                  保存
                </Button>
                <Button onClick={() => setEditingId(null)}>取消</Button>
              </Space>
            </Form>
          </>
        ) : (
          <Text type="secondary">
            点击「添加模型」或「添加 AI 抠图」或列表中的「编辑」开始配置
          </Text>
        )}
      </div>
    </div>
  );

  if (modal) {
    return (
      <Modal
        title="AI 模型配置"
        open={open}
        onCancel={onClose}
        // footer={
        //   <Space>
        //     <Button onClick={onClose}>关闭</Button>
        //     <Button type="primary" onClick={handleSaveAll}>
        //       保存全部
        //     </Button>
        //   </Space>
        // }
        footer={null}
        width={900}
        centered
        destroyOnHidden
      >
        {content}
      </Modal>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={5}>AI 模型配置</Typography.Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        不同模型有不同擅长方向，可添加多个模型并为每个模型设置能力 tag。配置供剧情大纲、人物设计、视频设计器等 AI 功能使用。
      </Text>
      <Divider />
      {content}
    </div>
  );
}

/** 能力 tag 多选（用于 Form.Item） */
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
