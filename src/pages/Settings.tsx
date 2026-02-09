/**
 * 设置面板（见功能文档 3、开发计划 2.3）
 * 布局参考 Biezhi2/web SettingsPanel：左侧 Menu + 右侧内容
 */
import React, { useState, useEffect } from 'react';
import {
  App,
  Menu,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
} from 'antd';
import type { MenuProps } from 'antd';
import { SaveOutlined, FileTextOutlined, PictureOutlined, VideoCameraOutlined, SoundOutlined } from '@ant-design/icons';
import type { AISettings, AIModalityConfig } from '@/types/settings';

const { Title, Text } = Typography;

type ModalityKey = 'text' | 'image' | 'video' | 'audio';

const menuItems: MenuProps['items'] = [
  {
    key: 'ai',
    label: 'AI 供应商',
    type: 'group',
    children: [
      { key: 'text', label: '文本', icon: <FileTextOutlined /> },
      { key: 'image', label: '生图', icon: <PictureOutlined /> },
      { key: 'video', label: '生视频', icon: <VideoCameraOutlined /> },
      { key: 'audio', label: '生音频', icon: <SoundOutlined /> },
    ],
  },
];

const modalityLabels: Record<ModalityKey, string> = {
  text: '文本（剧本、大纲等）',
  image: '生图（人物/场景等）',
  video: '生视频',
  audio: '生音频（TTS、音效、音乐等）',
};

const defaultModalityConfig = (): AIModalityConfig => ({
  apiUrl: '',
  apiKey: '',
  model: '',
});

export default function Settings() {
  const { message } = App.useApp();
  const [selectedKey, setSelectedKey] = useState<ModalityKey>('text');
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<AIModalityConfig>();

  const loadSettings = async () => {
    if (!window.yiman?.settings?.get) return;
    setLoading(true);
    try {
      const data = await window.yiman.settings.get();
      setSettings(data);
      const current = data[selectedKey] ?? defaultModalityConfig();
      form.setFieldsValue(current);
    } catch (e) {
      message.error('加载设置失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      const current = settings[selectedKey] ?? defaultModalityConfig();
      form.setFieldsValue(current);
    }
  }, [selectedKey, settings]);

  const handleSaveModality = async () => {
    if (!window.yiman?.settings?.save || !settings) return;
    try {
      const values = await form.validateFields();
      const next: AISettings = {
        ...settings,
        [selectedKey]: { ...(settings[selectedKey] ?? defaultModalityConfig()), ...values },
      };
      setSaving(true);
      const res = await window.yiman.settings.save(next);
      if (res.ok) {
        setSettings(next);
        message.success('已保存');
      } else {
        message.error(res.error || '保存失败');
      }
    } catch (e) {
      message.error('请检查表单');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 120px)' }}>
      {/* 左侧导航：参考 Biezhi2 SettingsPanel */}
      <div style={{ width: 200, paddingRight: 16 }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => setSelectedKey(key as ModalityKey)}
          style={{ border: 'none', height: '100%' }}
        />
      </div>

      {/* 右侧内容 */}
      <div style={{ flex: 1, paddingLeft: 24, paddingRight: 16, overflow: 'auto' }}>
        {loading ? (
          <Text type="secondary">加载中…</Text>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {modalityLabels[selectedKey]}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  配置 API 地址、密钥、模型名等，供剧情大纲、人物设计、视频设计器内 AI 调用
                </Text>
              </div>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSaveModality}
              >
                保存
              </Button>
            </div>
            <Divider />
            <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
              <Form.Item
                name="provider"
                label="供应商类型"
                tooltip="可选，如 OpenAI、通义、本地模型等"
              >
                <Input placeholder="例如：OpenAI、自定义" allowClear />
              </Form.Item>
              <Form.Item
                name="apiUrl"
                label="API 地址"
                rules={[{ required: true, message: '请输入 API 地址' }]}
                tooltip="OpenAI 兼容 API 基地址"
              >
                <Input placeholder="https://api.openai.com/v1" allowClear />
              </Form.Item>
              <Form.Item
                name="apiKey"
                label="API 密钥"
                rules={[{ required: true, message: '请输入 API 密钥' }]}
                tooltip="密钥仅保存在本机，不提交版本库"
              >
                <Input.Password placeholder="sk-..." allowClear />
              </Form.Item>
              <Form.Item
                name="model"
                label="模型名称"
                tooltip="可选，如 gpt-3.5-turbo、gpt-4 等"
              >
                <Input placeholder="gpt-3.5-turbo" allowClear />
              </Form.Item>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}
