/**
 * 当前场景（手风琴项）：播放速度、镜头 x/y/z、AI 自动生成镜头、自动居中说话人物（见功能文档 6.6、开发计划 2.11）
 */
import React, { useState, useEffect } from 'react';
import { Form, InputNumber, Checkbox, Button, Typography, App } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';

const { Text } = Typography;

interface SceneRow {
  id: string;
  play_speed?: number;
  camera_enabled?: number;
  camera_x?: number;
  camera_y?: number;
  camera_z?: number;
  auto_center_speaker?: number;
}

interface SceneSettingsAccordionProps {
  project: ProjectInfo;
  sceneId: string | null;
}

export function SceneSettingsAccordion({ project, sceneId }: SceneSettingsAccordionProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const projectDir = project.project_dir;

  useEffect(() => {
    if (!sceneId || !window.yiman?.project?.getScene) return;
    setLoading(true);
    window.yiman.project
      .getScene(projectDir, sceneId)
      .then((row: SceneRow | null) => {
        if (row) {
          form.setFieldsValue({
            play_speed: row.play_speed ?? 1,
            camera_enabled: !!row.camera_enabled,
            camera_x: row.camera_x ?? 0,
            camera_y: row.camera_y ?? 0,
            camera_z: row.camera_z ?? 1,
            auto_center_speaker: !!row.auto_center_speaker,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [projectDir, sceneId, form]);

  const handleSave = async () => {
    if (!sceneId || !window.yiman?.project?.updateScene) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    const res = await window.yiman.project.updateScene(projectDir, sceneId, {
      play_speed: values.play_speed ?? 1,
      camera_enabled: values.camera_enabled ? 1 : 0,
      camera_x: values.camera_x ?? 0,
      camera_y: values.camera_y ?? 0,
      camera_z: values.camera_z ?? 1,
      auto_center_speaker: values.auto_center_speaker ? 1 : 0,
    });
    setSaving(false);
    if (res?.ok) message.success('已保存');
    else message.error(res?.error || '保存失败');
  };

  if (!sceneId) {
    return <Text type="secondary">请先选择场景</Text>;
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleSave} className="scene-settings-form">
      <Form.Item name="play_speed" label="播放速度" extra="1 为正常速度" className="scene-settings-form__item">
        <InputNumber min={0.25} max={4} step={0.25} style={{ width: '100%' }} className="scene-settings-form__play-speed" />
      </Form.Item>
      <Form.Item name="camera_enabled" valuePropName="checked" className="scene-settings-form__item">
        <Checkbox className="scene-settings-form__camera-enabled">启用镜头</Checkbox>
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.camera_enabled !== curr.camera_enabled}>
        {({ getFieldValue }) =>
          getFieldValue('camera_enabled') ? (
            <div className="scene-settings-form__camera-fields">
              <Form.Item name="camera_x" label="镜头 X" className="scene-settings-form__item">
                <InputNumber step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="camera_y" label="镜头 Y" className="scene-settings-form__item">
                <InputNumber step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="camera_z" label="镜头 Z（如景深/缩放）" className="scene-settings-form__item">
                <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          ) : null
        }
      </Form.Item>
      <Form.Item className="scene-settings-form__item">
        <Button type="default" icon={<RobotOutlined />} disabled className="scene-settings-form__ai-camera">AI 自动生成镜头</Button>
      </Form.Item>
      <Form.Item name="auto_center_speaker" valuePropName="checked" className="scene-settings-form__item">
        <Checkbox className="scene-settings-form__auto-center">自动居中说话人物</Checkbox>
      </Form.Item>
      <Form.Item className="scene-settings-form__item">
        <Button type="primary" htmlType="submit" loading={saving} className="scene-settings-form__submit">保存</Button>
      </Form.Item>
    </Form>
  );
}
