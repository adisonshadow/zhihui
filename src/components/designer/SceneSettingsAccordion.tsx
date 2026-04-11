/**
 * 当前场景（手风琴项）：启用镜头（见功能文档 6.6、开发计划 2.11）
 * 镜头 XYZ、AI 自动生成镜头、自动居中说话角色 已移至镜头设置（选中镜头素材条时显示）
 */
import React, { useState, useEffect } from 'react';
import { Form, Checkbox, Typography, App, Flex } from 'antd';
import type { ProjectInfo } from '@/hooks/useProject';

const { Text } = Typography;

interface SceneRow {
  id: string;
  camera_enabled?: number;
  auto_center_speaker?: number;
  subtitle_enabled?: number;
}

interface SceneSettingsAccordionProps {
  project: ProjectInfo;
  sceneId: string | null;
  /** 启用镜头并创建镜头层/块后调用，传入镜头块 id 用于默认选中 */
  onCameraEnabledChange?: (cameraBlockId: string | null) => void;
  /** 启用字幕并创建字幕层/块后调用，传入字幕块 id 用于默认选中 */
  onSubtitleEnabledChange?: (subtitleBlockId: string | null) => void;
  /** 保存成功后刷新（如镜头层、画布） */
  onUpdate?: () => void;
}

export function SceneSettingsAccordion({ project, sceneId, onCameraEnabledChange, onSubtitleEnabledChange, onUpdate }: SceneSettingsAccordionProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const projectDir = project.project_dir;

  useEffect(() => {
    if (!sceneId || !window.yiman?.project?.getScene) return;
    setLoading(true);
    window.yiman.project
      .getScene(projectDir, sceneId)
      .then((row: SceneRow | null) => {
        if (row) {
          form.setFieldsValue({ camera_enabled: !!row.camera_enabled, subtitle_enabled: !!row.subtitle_enabled });
        }
      })
      .finally(() => setLoading(false));
  }, [projectDir, sceneId, form]);

  const handleCameraChange = async (checked: boolean) => {
    if (!sceneId || !window.yiman?.project?.updateScene) return;
    setUpdating(true);
    try {
      const res = await window.yiman.project.updateScene(projectDir, sceneId, { camera_enabled: checked ? 1 : 0 });
      if (res?.ok) {
        if (checked && window.yiman?.project?.ensureCameraLayerAndBlock) {
          const ensureRes = await window.yiman.project.ensureCameraLayerAndBlock(projectDir, sceneId);
          if (ensureRes?.ok && ensureRes.cameraBlockId) {
            onCameraEnabledChange?.(ensureRes.cameraBlockId);
          }
        } else {
          onCameraEnabledChange?.(null);
        }
        onUpdate?.();
      } else {
        message.error(res?.error || '操作失败');
        form.setFieldsValue({ camera_enabled: !checked });
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleSubtitleChange = async (checked: boolean) => {
    if (!sceneId || !window.yiman?.project?.updateScene) return;
    setUpdating(true);
    try {
      const res = await window.yiman.project.updateScene(projectDir, sceneId, { subtitle_enabled: checked ? 1 : 0 });
      if (res?.ok) {
        if (checked && window.yiman?.project?.ensureSubtitleLayerAndBlock) {
          const ensureRes = await window.yiman.project.ensureSubtitleLayerAndBlock(projectDir, sceneId);
          if (ensureRes?.ok && ensureRes.subtitleBlockId) {
            onSubtitleEnabledChange?.(ensureRes.subtitleBlockId);
          }
        } else {
          onSubtitleEnabledChange?.(null);
        }
        onUpdate?.();
      } else {
        message.error(res?.error || '操作失败');
        form.setFieldsValue({ subtitle_enabled: !checked });
      }
    } finally {
      setUpdating(false);
    }
  };

  if (!sceneId) {
    return <Text type="secondary">请先选择场景</Text>;
  }

  return (
    <Form form={form}>
      <Flex vertical gap={18} style={{ padding: '20px' }}>
        <Form.Item name="camera_enabled" valuePropName="checked" noStyle>
          <Checkbox
            disabled={loading || updating}
            onChange={(e) => handleCameraChange(e.target.checked)}
          >
            启用镜头
          </Checkbox>
        </Form.Item>
        <Form.Item name="subtitle_enabled" valuePropName="checked" noStyle>
          <Checkbox
            disabled={loading || updating}
            onChange={(e) => handleSubtitleChange(e.target.checked)}
          >
            启用字幕
          </Checkbox>
        </Form.Item>
      </Flex>
    </Form>
  );
}
