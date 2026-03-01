/**
 * 动画预览 Modal：用原始素材播放当前配置的动画（见 docs/08-素材动画功能技术方案.md 6.4）
 */
import React, { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import type { AnimationCategory } from '@/constants/animationRegistry';
import { getAnimationById, resolveAnimationCssClass } from '@/constants/animationRegistry';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import './AnimationPreviewModal.css';

interface AnimationPreviewModalProps {
  open: boolean;
  onClose: () => void;
  category: AnimationCategory;
  config: BlockAnimationConfig['appear'] | BlockAnimationConfig['action'] | BlockAnimationConfig['disappear'];
  /** 素材 data URL，用于显示实际内容 */
  assetDataUrl?: string | null;
  assetType?: string;
}

const VIDEO_TYPES = ['video', 'transparent_video'];

export function AnimationPreviewModal({
  open,
  onClose,
  category,
  config,
  assetDataUrl,
  assetType,
}: AnimationPreviewModalProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !config?.animationId || !previewRef.current) return;
    const el = previewRef.current;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
  }, [open, config?.animationId]);

  const def = config?.animationId ? getAnimationById(config.animationId) : null;
  const hasValidConfig = !!config?.animationId && !!def;

  const defaultDir = def?.directionMap ? Object.keys(def.directionMap)[0] : undefined;
  const resolvedClass = hasValidConfig && def ? resolveAnimationCssClass(def, config!.direction ?? defaultDir) : '';
  const duration = hasValidConfig && def ? (config!.duration ?? def.defaultDuration ?? 0.6) : 0;

  return (
    <Modal
      title="动画预览"
      open={open}
      onCancel={onClose}
      footer={null}
      width={280}
      destroyOnHidden
      className="animation-preview-modal"
    >
      <div className="animation-preview-modal__stage">
        {hasValidConfig ? (
          <div
            ref={previewRef}
            className={`animation-preview-modal__block magictime ${resolvedClass}`}
            style={{
              animationDuration: `${duration}s`,
              animationIterationCount: 'infinite',
            }}
          >
            {assetDataUrl ? (
              VIDEO_TYPES.includes(assetType ?? '') ? (
                <video
                  src={assetDataUrl}
                  muted
                  playsInline
                  preload="auto"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              ) : (
                <img
                  src={assetDataUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              )
            ) : (
              <div className="animation-preview-modal__block-inner" />
            )}
          </div>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>暂无动画配置</span>
        )}
      </div>
    </Modal>
  );
}
