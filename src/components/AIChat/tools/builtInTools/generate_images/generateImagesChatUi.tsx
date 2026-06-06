/**
 * generate_images：生成中占位 + Tool 气泡结果渲染（方案 §173-183，交互后续可在此扩展）
 * API 请求与注册见同目录 `handler.ts`，入口 `index.ts`
 */
import React, { memo } from 'react';
import { PictureOutlined } from '@ant-design/icons';
import { useUnifiedStyle } from '@/components/AIChat/utils/unifiedStyle';
import {
  ImagesArtifactGrid,
  IMAGE_ARTIFACT_THUMB_MAX_HEIGHT_PX,
} from '@/components/AIChat/utils/imageArtifactGrid';
import { extractImageUrlsFromToolMessageContent } from './toolResultParse';

/** §173-175：流光占位 + 图标 +「生成中…」；样式类名见 `AIChatSidePanel.css` */
export const GeneratingImagesPlaceholderGrid = memo(function GeneratingImagesPlaceholderGrid({
  count,
  aspectRatio = '1:1',
}: {
  count: number;
  aspectRatio?: string;
}) {
  const style = useUnifiedStyle();
  const n = Math.min(6, Math.max(1, count));
  const aspectCss = aspectRatio.includes('/') ? aspectRatio : aspectRatio.replace(':', ' / ');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: n === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: style.imageGap,
        maxWidth: style.imageMaxWidth,
      }}
    >
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="yiman-gen-ph-card"
          style={{
            borderRadius: style.imageBorderRadius,
            aspectRatio: aspectCss,
            maxHeight: IMAGE_ARTIFACT_THUMB_MAX_HEIGHT_PX,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div className="yiman-gen-ph-shimmer" aria-hidden />
          <div className="yiman-gen-ph-body">
            <div className="yiman-gen-ph-icon-wrap">
              <PictureOutlined className="yiman-gen-ph-icon-main" />
            </div>
            <span className="yiman-gen-ph-label">生成中…</span>
          </div>
        </div>
      ))}
    </div>
  );
});

/** `role: tool` 下 `generate_images` 返回体的气泡展示 */
export function GenerateImagesToolResult({ content }: { content: string }): React.ReactNode {
  if (!content?.trim()) return null;

  let parsed:
    | { ok?: boolean; images?: string[]; errors?: string[]; summary?: string; error?: string }
    | undefined;
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    parsed = undefined;
  }

  if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
    const errs = Array.isArray(parsed.errors) ? parsed.errors : [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ImagesArtifactGrid images={parsed.images} />
        {errs.length ? (
          <div style={{ color: 'rgba(255,140,140,0.85)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {errs.join('\n')}
          </div>
        ) : null}
      </div>
    );
  }

  if (parsed && parsed.ok === false) {
    const errText = parsed.error || (parsed.errors ?? []).join('\n') || '生成失败';
    return (
      <div
        style={{
          color: 'rgba(255,140,140,0.9)',
          fontSize: 12,
          padding: '6px 10px',
          border: '1px solid rgba(255,80,80,0.35)',
          borderRadius: 6,
          background: 'rgba(255,80,80,0.08)',
          maxWidth: 400,
        }}
      >
        {errText}
      </div>
    );
  }

  const loose = extractImageUrlsFromToolMessageContent(content);
  if (loose.length) return <ImagesArtifactGrid images={loose} />;
  return null;
}
