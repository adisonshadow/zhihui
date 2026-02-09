/**
 * 项目级 AI 配置页：剧本专家/绘画自定义要求（见功能文档 4.3、开发计划 2.7）
 */
import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, App } from 'antd';
import type { ProjectInfo } from '@/hooks/useProject';

const { TextArea } = Input;

interface AiConfigTabProps {
  project: ProjectInfo;
}

export default function AiConfigTab({ project }: AiConfigTabProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ script_expert_prompt: string; painting_prompt: string }>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!window.yiman?.project?.getAiConfig) return;
    setLoading(true);
    window.yiman.project
      .getAiConfig(project.project_dir)
      .then((row: { script_expert_prompt: string | null; painting_prompt: string | null } | null) => {
        if (row) {
          form.setFieldsValue({
            script_expert_prompt: row.script_expert_prompt ?? '',
            painting_prompt: row.painting_prompt ?? '',
          });
        }
      })
      .catch(() => message.error('加载 AI 配置失败'))
      .finally(() => setLoading(false));
  }, [project.project_dir, form, message]);

  const handleSave = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values || !window.yiman?.project?.saveAiConfig) return;
    setSaving(true);
    const res = await window.yiman.project.saveAiConfig(project.project_dir, {
      script_expert_prompt: values.script_expert_prompt?.trim() || null,
      painting_prompt: values.painting_prompt?.trim() || null,
    });
    setSaving(false);
    if (res?.ok) message.success('已保存');
    else message.error(res?.error || '保存失败');
  };

  return (
    <Card title="项目级 AI 配置" loading={loading}>
      <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 16 }}>
        此处仅配置「本项目内」的提示词/偏好，与全局「设置」中的 API 地址、密钥等区分；调用剧本专家或绘画时会合并使用。
      </p>
      <Form form={form} layout="vertical">
        <Form.Item
          name="script_expert_prompt"
          label="剧本专家自定义要求"
          extra="如：风格、篇幅、角色设定等，会与系统提示合并传入剧本专家。"
        >
          <TextArea rows={4} placeholder="可选，留空则仅使用默认系统提示" />
        </Form.Item>
        <Form.Item
          name="painting_prompt"
          label="绘画自定义要求"
          extra="如：画风、线稿/上色偏好等，会与绘画请求合并。"
        >
          <TextArea rows={4} placeholder="可选，留空则仅使用调用时传入的提示" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
