/**
 * generate_video：生成中占位 + Tool 气泡结果（结构与 generate_images 对齐；当前固定单条）
 */
import React, { memo } from 'react';
import { VideoCameraOutlined } from '@ant-design/icons';

export const GeneratingVideoPlaceholderCard = memo(function GeneratingVideoPlaceholderCard() {
  return (
    <div
      className="yiman-gen-ph-card"
      style={{
        borderRadius: 8,
        aspectRatio: '16 / 9',
        width: '100%',
        maxWidth: 560,
      }}
    >
      <div className="yiman-gen-ph-shimmer" aria-hidden />
      <div className="yiman-gen-ph-body">
        <div className="yiman-gen-ph-icon-wrap">
          <VideoCameraOutlined className="yiman-gen-ph-icon-main" />
        </div>
        <span className="yiman-gen-ph-label">视频生成中…</span>
      </div>
    </div>
  );
});

/** `role: tool` 下 generate_video JSON 气泡展示（单 URL） */
export function GenerateVideoToolResult({ content }: { content: string }): React.ReactNode {
  if (!content?.trim()) return null;

  let parsed: { ok?: boolean; video?: string; summary?: string; error?: string } | undefined;
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    parsed = undefined;
  }

  if (parsed?.ok === true && typeof parsed.video === 'string' && parsed.video.trim()) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
        <video
          controls
          preload="metadata"
          src={parsed.video.trim()}
          style={{
            width: '100%',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.35)',
          }}
        />
        {parsed.summary ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', whiteSpace: 'pre-wrap' }}>
            {parsed.summary}
          </div>
        ) : null}
      </div>
    );
  }

  if (parsed && parsed.ok === false) {
    const errText = parsed.error ?? '生成失败';
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

  return null;
}
