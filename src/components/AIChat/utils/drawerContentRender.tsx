/**
 * 绘图师消息内容解析与渲染
 * 支持：JSON {"images": [...]}、Markdown ![](url)、base64 data URL
 * 推理过程使用 @ant-design/x 的 Think 包裹 XMarkdown 流式展示
 *
 * generate_images / generate_video 的对话占位与 tool 气泡渲染见对应 builtInTools 子目录
 */
import React, { memo, useEffect, useState } from 'react';
import { Skeleton } from 'antd';
import XMarkdown from '@ant-design/x-markdown';
import { Think } from '@ant-design/x';
import { GeneratingImagesPlaceholderGrid } from '../tools/builtInTools/generate_images/generateImagesChatUi';
import { stripOrchestratorEchoedGenerateImagesJson } from '../tools/builtInTools/generate_images/assistantContentStrip';
import { GeneratingVideoPlaceholderCard } from '../tools/builtInTools/generate_video/generateVideoChatUi';
import { stripOrchestratorEchoedGenerateVideoJson } from '../tools/builtInTools/generate_video/assistantContentStrip';
import { findBalancedJsonSlice } from './balancedJsonSlice';
import { ImagesArtifactGrid } from './imageArtifactGrid';
import { useUnifiedStyle } from './unifiedStyle';

/** 兼容旧引用：统一样式上下文已迁至 `unifiedStyle.tsx` */
export { UnifiedStyleProvider, useUnifiedStyle } from './unifiedStyle';

/** 生成中占位骨架屏（非 generate_images 场景的轻量备选） */
export function DrawerBubbleSkeleton({
  count = 1,
  aspectRatio = '1:1',
}: {
  count?: number;
  aspectRatio?: string;
}) {
  const style = useUnifiedStyle();
  const aspectCss = aspectRatio.includes('/') ? aspectRatio : aspectRatio.replace(':', ' / ');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: count === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: style.imageGap,
        maxWidth: style.imageMaxWidth,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            borderRadius: style.imageBorderRadius,
            overflow: 'hidden',
            aspectRatio: aspectCss,
          }}
        >
          <Skeleton.Node
            active
            style={{
              width: '100%',
              height: '100%',
              borderRadius: style.imageBorderRadius,
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>生成中…</div>
          </Skeleton.Node>
        </div>
      ))}
    </div>
  );
}

const ReasoningThinkBlock = memo(function ReasoningThinkBlock({
  reasoningContent,
  isStreaming,
}: {
  reasoningContent: string;
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const done = !isStreaming;
  useEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  return (
    <Think
      title={done ? '思考过程' : '思考中…'}
      loading={isStreaming}
      expanded={expanded}
      onExpand={setExpanded}
      blink={isStreaming}
    >
      <XMarkdown
        content={reasoningContent}
        streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
      />
    </Think>
  );
});

export interface ParsedDrawerContent {
  images: string[];
  text?: string;
}

export { findBalancedJsonSlice };

function urlsFromImagesJsonField(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { images?: unknown }).images)) {
    return [];
  }
  const arr = (parsed as { images: Array<string | { url?: string }> }).images;
  return arr
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter((u): u is string => !!u && typeof u === 'string');
}

/** 从 content 中解析出图片 URL 列表和可选文本 */
export function parseDrawerContent(content: string): ParsedDrawerContent {
  if (!content?.trim()) return { images: [] };

  const tryFromParsed = (
    parsed: unknown,
    restContent: string,
    jsonBlob?: string,
  ): ParsedDrawerContent | null => {
    const urls = urlsFromImagesJsonField(parsed);
    if (urls.length === 0) return null;
    const innerText =
      typeof (parsed as { text?: unknown }).text === 'string' ? (parsed as { text: string }).text : undefined;
    const stripped = jsonBlob ? restContent.replace(jsonBlob, ' ').trim() : restContent.trim();
    const preamble = stripped || innerText;
    return { images: urls, text: preamble || undefined };
  };

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(content)) !== null) {
    const inner = fm[1]?.trim();
    if (!inner?.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(inner) as unknown;
      const hit = tryFromParsed(parsed, content.replace(fm[0], ' ').trim());
      if (hit) return hit;
    } catch {
      /* skip */
    }
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const urls = urlsFromImagesJsonField(parsed);
    if (urls.length > 0) {
      const t = typeof (parsed as { text?: unknown }).text === 'string' ? (parsed as { text: string }).text : undefined;
      return { images: urls, text: t };
    }
  } catch {
    /* not single JSON blob */
  }

  let lastEmbedded: ParsedDrawerContent | null = null;
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue;
    const hit = findBalancedJsonSlice(content, i);
    if (!hit) continue;
    i = hit.end;
    try {
      const parsed = JSON.parse(hit.slice) as unknown;
      const trial = tryFromParsed(parsed, content, hit.slice);
      if (trial) lastEmbedded = trial;
    } catch {
      /* skip */
    }
  }
  if (lastEmbedded) return lastEmbedded;

  const mdImgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const mdUrls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = mdImgRe.exec(content)) !== null) {
    const url = m[2]?.trim();
    if (url && (url.startsWith('http') || url.startsWith('data:'))) mdUrls.push(url);
  }
  if (mdUrls.length > 0) {
    return { images: mdUrls, text: content.replace(mdImgRe, '').trim() || undefined };
  }

  const dataUrlRe = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  const httpImgRe = /https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s"'<>]*)?/gi;
  const dataUrls = content.match(dataUrlRe) ?? [];
  const httpUrls = content.match(httpImgRe) ?? [];
  const allUrls = [...new Set([...dataUrls, ...httpUrls])];
  if (allUrls.length > 0) {
    const text = content
      .replace(dataUrlRe, '')
      .replace(httpImgRe, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { images: allUrls, text: text || undefined };
  }

  return { images: [], text: content };
}

interface DrawerBubbleContentProps {
  content: string;
  isDrawerAgent: boolean;
  reasoningContent?: string;
  status?: string;
  pendingGenerateImagesCount?: number;
  pendingGenerateImagesAspect?: string;
  /** generate_video：模型已发起 tool_call、尚未落 tool 结果 */
  pendingGenerateVideo?: boolean;
  drawerConfiguredImageCount?: number;
  drawerPlaceholderAspectRatio?: string;
  toolResultImages?: string[];
  toolResultVideoUrl?: string;
}

export function DrawerBubbleContent({
  content,
  isDrawerAgent,
  reasoningContent,
  status,
  pendingGenerateImagesCount,
  pendingGenerateImagesAspect,
  pendingGenerateVideo,
  drawerConfiguredImageCount,
  drawerPlaceholderAspectRatio,
  toolResultImages,
  toolResultVideoUrl,
}: DrawerBubbleContentProps): React.ReactNode {
  const isStreaming = status === 'loading' || status === 'updating';
  const rc = reasoningContent?.trim() ? reasoningContent : undefined;

  const displayContent = !isDrawerAgent
    ? stripOrchestratorEchoedGenerateVideoJson(stripOrchestratorEchoedGenerateImagesJson(content))
    : content;

  const mainMarkdown = (
    <XMarkdown
      content={displayContent}
      streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
    />
  );

  const { images, text } = parseDrawerContent(displayContent);

  const displayImages = toolResultImages?.length ? toolResultImages : images;
  const displayVideoSrc = typeof toolResultVideoUrl === 'string' ? toolResultVideoUrl.trim() : '';

  const drawerAspectForCard =
    drawerPlaceholderAspectRatio && drawerPlaceholderAspectRatio !== 'canvas'
      ? drawerPlaceholderAspectRatio
      : '1:1';

  const placeholderCountResolved =
    typeof pendingGenerateImagesCount === 'number' && pendingGenerateImagesCount > 0
      ? pendingGenerateImagesCount
      : isDrawerAgent && isStreaming && images.length === 0 && !content.trim()
        ? Math.min(6, Math.max(1, drawerConfiguredImageCount ?? 1))
        : undefined;

  const placeholderAspectResolved =
    typeof pendingGenerateImagesCount === 'number' && pendingGenerateImagesCount > 0
      ? pendingGenerateImagesAspect ?? '1:1'
      : drawerAspectForCard;

  if (displayVideoSrc.length > 0 || displayImages.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rc ? <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} /> : null}
        {displayVideoSrc ?
          <video
            controls
            preload="metadata"
            src={displayVideoSrc}
            style={{
              width: '100%',
              maxWidth: 560,
              borderRadius: 8,
              background: 'rgba(0,0,0,0.35)',
            }}
          /> :
          null}
        {displayImages.length ? <ImagesArtifactGrid images={displayImages} /> : null}
        {text ? (
          <XMarkdown content={text} streaming={{ hasNextChunk: isStreaming, enableAnimation: true }} />
        ) : null}
      </div>
    );
  }

  if (placeholderCountResolved != null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rc ? <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} /> : null}
        {displayContent.trim() ? mainMarkdown : null}
        <GeneratingImagesPlaceholderGrid
          count={placeholderCountResolved}
          aspectRatio={placeholderAspectResolved}
        />
      </div>
    );
  }

  if (pendingGenerateVideo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rc ? <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} /> : null}
        {displayContent.trim() ? mainMarkdown : null}
        <GeneratingVideoPlaceholderCard />
      </div>
    );
  }

  if (!isDrawerAgent) {
    if (!rc) return mainMarkdown;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} />
        {mainMarkdown}
      </div>
    );
  }

  if (!rc) return mainMarkdown;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} />
      {mainMarkdown}
    </div>
  );
}
