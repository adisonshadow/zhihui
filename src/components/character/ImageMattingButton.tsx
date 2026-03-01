/**
 * 可复用的单图抠图按钮：调用 matteImageAndSave 并将结果回调给父组件
 * 用于元件设计器、精灵图编辑等场景
 */
import { useState } from 'react';
import { Button, App } from 'antd';
import { ScissorOutlined } from '@ant-design/icons';

export interface ImageMattingButtonProps {
  projectDir: string;
  imagePath: string;
  matteImageAndSave: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  onSuccess: (newPath: string) => void;
  /** 可选：自定义按钮文案 */
  children?: React.ReactNode;
  /** 按钮尺寸 */
  size?: 'small' | 'middle' | 'large';
}

export function ImageMattingButton({
  projectDir,
  imagePath,
  matteImageAndSave,
  onSuccess,
  children,
  size,
}: ImageMattingButtonProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!imagePath) return;
    setLoading(true);
    try {
      const res = await matteImageAndSave(projectDir, imagePath);
      if (res.ok && res.path) {
        onSuccess(res.path);
        message.success('抠图完成');
      } else {
        message.error(res.error ?? '抠图失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<ScissorOutlined />}
      onClick={handleClick}
      loading={loading}
      size={size}
    >
      {children ?? '抠图'}
    </Button>
  );
}
