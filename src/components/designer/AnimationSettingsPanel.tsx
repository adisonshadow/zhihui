/**
 * 动画设置主面板（3 Tab：出现、动作、消失）
 * 见 docs/08-素材动画功能技术方案.md 6.2
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, App } from 'antd';
import { getAnimationById } from '@/constants/animationRegistry';
import type { AnimationCategory } from '@/constants/animationRegistry';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import { AnimationTabContent } from './AnimationTabContent';
import { AnimationPickerDrawer } from './AnimationPickerDrawer';
import { AnimationPreviewModal } from './AnimationPreviewModal';
import './AnimationSettingsPanel.css';

interface AnimationSettingsPanelProps {
  projectDir: string;
  blockId: string;
  animationConfig: BlockAnimationConfig | null;
  /** 素材路径，用于预览时加载实际内容 */
  assetPath?: string | null;
  assetType?: string;
  projectDirForAsset?: string;
  onUpdate: () => void;
}

export function AnimationSettingsPanel({
  projectDir,
  blockId,
  animationConfig,
  assetPath,
  assetType,
  projectDirForAsset,
  onUpdate,
}: AnimationSettingsPanelProps) {
  const { message } = App.useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<AnimationCategory>('appear');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<AnimationCategory>('appear');
  const [assetDataUrl, setAssetDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewOpen || !assetPath || !projectDirForAsset || !window.yiman?.project?.getAssetDataUrl) {
      if (!previewOpen) setAssetDataUrl(null);
      return;
    }
    let cancelled = false;
    window.yiman.project.getAssetDataUrl(projectDirForAsset, assetPath).then((url) => {
      if (!cancelled && typeof url === 'string') setAssetDataUrl(url);
    });
    return () => { cancelled = true; };
  }, [previewOpen, assetPath, projectDirForAsset]);

  const saveAnimationConfig = useCallback(
    async (config: BlockAnimationConfig) => {
      if (!window.yiman?.project?.updateTimelineBlock) return;
      const json = JSON.stringify(config);
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        animation_config: json,
      });
      if (res?.ok) onUpdate();
      else message.error(res?.error || '保存失败');
    },
    [projectDir, blockId, onUpdate, message]
  );

  const openPicker = (cat: AnimationCategory) => {
    setPickerCategory(cat);
    setPickerOpen(true);
  };

  const handleSelect = useCallback(
    (category: AnimationCategory, animationId: string, direction?: string) => {
      const def = getAnimationById(animationId);
      const duration = def?.defaultDuration ?? 0.6;
      const prev = animationConfig ?? {};
      const next = { ...prev };
      if (category === 'appear') {
        next.appear = { animationId, duration, direction };
      } else if (category === 'action') {
        next.action = { animationId, duration, repeatCount: 1, direction };
      } else {
        next.disappear = { animationId, duration, direction };
      }
      saveAnimationConfig(next);
    },
    [animationConfig, saveAnimationConfig]
  );

  const handleSettingsChange = useCallback(
    (category: AnimationCategory, data: { duration?: number; repeatCount?: number; direction?: string }) => {
      const prev = animationConfig ?? {};
      const next = { ...prev };
      if (category === 'appear' && next.appear) {
        next.appear = { ...next.appear, ...data };
      } else if (category === 'action' && next.action) {
        next.action = { ...next.action, ...data };
      } else if (category === 'disappear' && next.disappear) {
        next.disappear = { ...next.disappear, ...data };
      }
      saveAnimationConfig(next);
    },
    [animationConfig, saveAnimationConfig]
  );

  const configByCategory = {
    appear: animationConfig?.appear,
    action: animationConfig?.action,
    disappear: animationConfig?.disappear,
  };

  const hasAnyAnimation = !!(configByCategory.appear || configByCategory.action || configByCategory.disappear);
  const handleDeleteAnimation = useCallback(() => {
    saveAnimationConfig({});
  }, [saveAnimationConfig]);

  return (
    <div className="animation-settings-panel">
      <Tabs
        defaultActiveKey="appear"
        className="animation-settings-panel__tabs"
        items={[
          {
            key: 'appear',
            label: '出现',
            children: (
              <AnimationTabContent
                category="appear"
                config={configByCategory.appear}
                onAddClick={() => openPicker('appear')}
                onChangeClick={() => openPicker('appear')}
                onPreviewClick={() => { setPreviewOpen(true); setPreviewCategory('appear'); }}
                onSettingsChange={(d) => handleSettingsChange('appear', d)}
                onDeleteClick={hasAnyAnimation ? handleDeleteAnimation : undefined}
              />
            ),
          },
          {
            key: 'action',
            label: '动作',
            children: (
              <AnimationTabContent
                category="action"
                config={configByCategory.action}
                onAddClick={() => openPicker('action')}
                onChangeClick={() => openPicker('action')}
                onPreviewClick={() => { setPreviewOpen(true); setPreviewCategory('action'); }}
                onSettingsChange={(d) => handleSettingsChange('action', d)}
                onDeleteClick={hasAnyAnimation ? handleDeleteAnimation : undefined}
              />
            ),
          },
          {
            key: 'disappear',
            label: '消失',
            children: (
              <AnimationTabContent
                category="disappear"
                config={configByCategory.disappear}
                onAddClick={() => openPicker('disappear')}
                onChangeClick={() => openPicker('disappear')}
                onPreviewClick={() => { setPreviewOpen(true); setPreviewCategory('disappear'); }}
                onSettingsChange={(d) => handleSettingsChange('disappear', d)}
                onDeleteClick={hasAnyAnimation ? handleDeleteAnimation : undefined}
              />
            ),
          },
        ]}
      />
      <AnimationPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        category={pickerCategory}
        selectedAnimationId={configByCategory[pickerCategory]?.animationId}
        selectedDirection={configByCategory[pickerCategory]?.direction}
        onSelect={(animationId, direction) => handleSelect(pickerCategory, animationId, direction)}
      />
      <AnimationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        category={previewCategory}
        config={configByCategory[previewCategory]}
        assetDataUrl={assetDataUrl}
        assetType={assetType}
      />
    </div>
  );
}
