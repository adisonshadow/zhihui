/**
 * 会话内插图网格（火山 TOS 等 URL 走适配层），供绘图师 Markdown 与 generate_images Tool 共用
 */
import React, { memo } from 'react';
import { Image, Spin } from 'antd';
import { useVolcArkDisplayableImageSrc } from '../adapters/volcArkImageAdapter';
import { useUnifiedStyle } from './unifiedStyle';

/** 缩略图最大高度（px）；占位卡片与之对齐，避免生成前后跳动 */
export const IMAGE_ARTIFACT_THUMB_MAX_HEIGHT_PX = 240;

const DrawerArtifactImage = memo(function DrawerArtifactImage({
  originalSrc,
  style,
}: {
  originalSrc: string;
  style?: React.CSSProperties;
}) {
  const { displaySrc, loading, error } = useVolcArkDisplayableImageSrc(originalSrc);

  if (error) {
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 120,
          color: 'rgba(255,255,255,0.45)',
          fontSize: 12,
          textAlign: 'center',
          padding: 8,
        }}
      >
        图片加载失败
      </div>
    );
  }

  if (loading || displaySrc == null) {
    return (
      <Spin>
        <div
          style={{
            ...style,
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      </Spin>
    );
  }

  const useLazyLoad = /^https?:\/\//i.test(displaySrc ?? '');
  return (
    <Image
      src={displaySrc}
      alt=""
      style={style}
      {...(useLazyLoad ? { loading: 'lazy' as const } : {})}
    />
  );
});

/** 多图网格 + PreviewGroup（方案 §6.1） */
export function ImagesArtifactGrid({ images }: { images: string[] }): React.ReactElement | null {
  const styleCtx = useUnifiedStyle();
  if (!images.length) return null;
  return (
    <Image.PreviewGroup>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: styleCtx.imageGap,
          maxWidth: styleCtx.imageMaxWidth,
        }}
      >
        {images.map((src, i) => (
          <DrawerArtifactImage
            key={`${i}-${src.slice(0, 64)}`}
            originalSrc={src}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: styleCtx.imageBorderRadius,
              objectFit: 'contain',
              maxHeight: IMAGE_ARTIFACT_THUMB_MAX_HEIGHT_PX,
            }}
          />
        ))}
      </div>
    </Image.PreviewGroup>
  );
}
