/**
 * 动画设置单 Tab 内容（出现/动作/消失其一）
 * 未配置显示「添加动画」，已配置显示变更/预览 + 设置表单（见 docs/08-素材动画功能技术方案.md 6.2）
 */
import React from 'react';
import { Button, Space, Form, InputNumber, Select, Typography } from 'antd';
import type { AnimationCategory } from '@/constants/animationRegistry';
import { getAnimationById } from '@/constants/animationRegistry';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';

const { Text } = Typography;

const DIRECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'up', label: '上' },
  { value: 'down', label: '下' },
  { value: 'left', label: '左' },
  { value: 'right', label: '右' },
];

const OPEN_DIRECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'downLeft', label: '左下' },
  { value: 'downRight', label: '右下' },
  { value: 'upLeft', label: '左上' },
  { value: 'upRight', label: '右上' },
];

interface AnimationTabContentProps {
  category: AnimationCategory;
  config: BlockAnimationConfig['appear'] | BlockAnimationConfig['action'] | BlockAnimationConfig['disappear'];
  onAddClick: () => void;
  onChangeClick: () => void;
  onPreviewClick: () => void;
  onSettingsChange: (data: { duration?: number; repeatCount?: number; direction?: string }) => void;
  /** 已配置时显示删除按钮，点击后移除整个动画配置 */
  onDeleteClick?: () => void;
}

export function AnimationTabContent({
  category,
  config,
  onAddClick,
  onChangeClick,
  onPreviewClick,
  onSettingsChange,
  onDeleteClick,
}: AnimationTabContentProps) {
  const isAction = category === 'action';
  const hasConfig = !!config?.animationId;

  if (!hasConfig) {
    return (
      <div className="animation-tab-content animation-tab-content--empty">
        <Button type="primary" onClick={onAddClick} className="animation-tab-content__add-btn">
          添加动画
        </Button>
      </div>
    );
  }

  const def = getAnimationById(config.animationId);
  const label = def?.label ?? config.animationId;
  const needsDirection = def?.hasDirectionParam && def?.directionMap;
  const directionKeys = def?.directionMap ? Object.keys(def.directionMap) : [];
  const isOpenFamily = directionKeys.some((k) => ['downLeft', 'downRight', 'upLeft', 'upRight'].includes(k));
  const directionOptions = isOpenFamily ? OPEN_DIRECTION_OPTIONS.filter((o) => directionKeys.includes(o.value)) : DIRECTION_OPTIONS.filter((o) => directionKeys.includes(o.value));

  return (
    <div className="animation-tab-content animation-tab-content--configured">
      <div className="animation-tab-content__actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button size="small" onClick={onChangeClick} className="animation-tab-content__change-btn">
            变更
          </Button>
          <Button size="small" onClick={onPreviewClick} className="animation-tab-content__preview-btn">
            预览
          </Button>
        </Space>
        {onDeleteClick && (
          <Button size="small" danger onClick={onDeleteClick} className="animation-tab-content__delete-btn">
            删除
          </Button>
        )}
      </div>
      <div className="animation-tab-content__settings">
        <Form layout="vertical" size="small" style={{ marginTop: 8 }}>
          <Form.Item label={<Text type="secondary">时长（秒）</Text>}>
            <InputNumber
              min={0.1}
              max={10}
              step={0.1}
              value={config.duration}
              onChange={(v) => onSettingsChange({ duration: typeof v === 'number' ? v : 0.5 })}
              className="animation-tab-content__duration-input"
              style={{ width: '100%' }}
            />
          </Form.Item>
          {isAction && (
            <Form.Item label={<Text type="secondary">运行次数</Text>}>
              <InputNumber
                min={1}
                max={999}
                value={config.repeatCount ?? 1}
                onChange={(v) => onSettingsChange({ repeatCount: typeof v === 'number' ? v : 1 })}
                className="animation-tab-content__repeat-input"
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
          {needsDirection && directionOptions.length > 0 && (
            <Form.Item label={<Text type="secondary">方向</Text>}>
              <Select
                value={config.direction ?? directionKeys[0]}
                onChange={(v) => onSettingsChange({ direction: v })}
                options={directionOptions}
                className="animation-tab-content__direction-select"
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
        </Form>
      </div>
    </div>
  );
}
