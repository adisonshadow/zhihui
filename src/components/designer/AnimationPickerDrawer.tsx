/**
 * 动画选择 Drawer（无 mask，见 docs/08-素材动画功能技术方案.md 6.3）
 * 列表展示动画名称、预览、使用按钮；已选中有标记
 */
import React, { useState, useEffect } from 'react';
import { Drawer, Button, Space, Typography, App } from 'antd';
import type { AnimationCategory } from '@/constants/animationRegistry';
import { getAnimationsByCategory, resolveAnimationCssClass } from '@/constants/animationRegistry';
import type { AnimationDef } from '@/constants/animationRegistry';
import './AnimationPickerDrawer.css';

// 确保 Magic 动画已注册
import '@/constants/animationsMagic';

const { Text } = Typography;

interface AnimationPickerDrawerProps {
  open: boolean;
  onClose: () => void;
  category: AnimationCategory;
  selectedAnimationId?: string | null;
  selectedDirection?: string;
  onSelect: (animationId: string, direction?: string) => void;
}

export function AnimationPickerDrawer({
  open,
  onClose,
  category,
  selectedAnimationId,
  selectedDirection,
  onSelect,
}: AnimationPickerDrawerProps) {
  const { message } = App.useApp();
  const [animations, setAnimations] = useState<AnimationDef[]>([]);

  useEffect(() => {
    if (open) {
      setAnimations(getAnimationsByCategory(category));
    }
  }, [open, category]);

  const categoryLabel = { appear: '出现', action: '动作', disappear: '消失' }[category];

  return (
    <Drawer
      title={`选择${categoryLabel}动画`}
      open={open}
      onClose={onClose}
      mask={false}
      width={360}
      className="animation-picker-drawer"
      styles={{ body: { padding: 12 } }}
    >
      <ul className="animation-picker-drawer__list" role="list">
        {animations.map((def) => {
          const isSelected = selectedAnimationId === def.id;
          const defaultDir = def.directionMap ? Object.keys(def.directionMap)[0] : undefined;
          const resolvedClass = resolveAnimationCssClass(def, selectedDirection ?? defaultDir);
          const directionOptions = def.hasDirectionParam && def.directionMap ? Object.keys(def.directionMap) : null;

          return (
            <li
              key={def.id}
              className={`animation-picker-drawer__item ${isSelected ? 'animation-picker-drawer__item--selected' : ''}`}
              role="listitem"
            >
              <div className="animation-picker-drawer__item-header">
                <span className="animation-picker-drawer__item-name">{def.label}</span>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    const dir = def.hasDirectionParam && directionOptions?.length ? directionOptions[0] : undefined;
                    onSelect(def.id, dir);
                    message.success(`已选择「${def.label}」`);
                    onClose();
                  }}
                  className="animation-picker-drawer__use-btn"
                >
                  使用
                </Button>
              </div>
              <div className="animation-picker-drawer__preview-wrap">
                <div
                  className={`animation-picker-drawer__preview magictime ${resolvedClass}`}
                  style={{
                    animationDuration: `${def.defaultDuration}s`,
                    animationIterationCount: 'infinite',
                  }}
                >
                  <div className="animation-picker-drawer__preview-inner" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
