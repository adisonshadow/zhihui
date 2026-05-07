/**
 * 绘图师消息内容解析与渲染
 * 支持：JSON {"images": [...]}、Markdown ![](url)、base64 data URL
 * 推理过程使用 @ant-design/x 的 Think 包裹 XMarkdown 流式展示（见
 * https://ant-design-x.antgroup.com/components/think-cn ）
 */
import React, { memo, useEffect, useState } from 'react';
import { Image, Spin } from 'antd';
import XMarkdown from '@ant-design/x-markdown';
import { Think } from '@ant-design/x';
import { useVolcArkDisplayableImageSrc } from '../adapters/volcArkImageAdapter';

/** 与官方 Think 文档一致：流式中展开，结束后默认收起，可再展开 */
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

/** 从 content 中解析出图片 URL 列表和可选文本 */
export function parseDrawerContent(content: string): ParsedDrawerContent {
  if (!content?.trim()) return { images: [] };

  // 1. JSON 格式：{"images": ["url1", "url2"]} 或 {"images": [{"url": "..."}]}
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { images?: unknown }).images)) {
      const arr = (parsed as { images: Array<string | { url?: string }> }).images;
      const urls = arr
        .map((item) => (typeof item === 'string' ? item : item?.url))
        .filter((u): u is string => !!u && typeof u === 'string');
      if (urls.length > 0) {
        const text = (parsed as { text?: string }).text;
        return { images: urls, text };
      }
    }
  } catch {
    /* not JSON */
  }

  // 2. Markdown 图片：![](url) 或 ![alt](url)
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

  // 3. 行内 data URL 或 http(s) 图片 URL
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
  /** 推理内容（启用 enableReasoning 时由 contentRender 传入） */
  reasoningContent?: string;
  /** 消息状态（来自 Bubble.List contentRender info.status） */
  status?: string;
}

/** 单张生成图：火山 TOS 链接经适配器拉成 blob URL 后再交给 antd Image，避免 attachment 触发下载 */
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

  return <Image src={displaySrc} alt="" style={style} />;
});

/** 绘图师模式下：有图片则渲染图片网格 + 文本；否则渲染 Markdown。推理内容用 Think 在正文上方展示。 */
export function DrawerBubbleContent({
  content,
  isDrawerAgent,
  reasoningContent,
  status,
}: DrawerBubbleContentProps): React.ReactNode {
  const isStreaming = status === 'loading' || status === 'updating';
  const rc = reasoningContent?.trim() ? reasoningContent : undefined;

  const mainMarkdown = (
    <XMarkdown content={content} streaming={{ hasNextChunk: isStreaming, enableAnimation: true }} />
  );

  if (!isDrawerAgent) {
    if (!rc) return mainMarkdown;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} />
        {mainMarkdown}
      </div>
    );
  }

  const { images, text } = parseDrawerContent(content);
  if (images.length === 0) {
    if (!rc) return mainMarkdown;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} />
        {mainMarkdown}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rc && <ReasoningThinkBlock reasoningContent={rc} isStreaming={isStreaming} />}
      <Image.PreviewGroup>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
            maxWidth: 400,
          }}
        >
          {images.map((src, i) => (
            <DrawerArtifactImage
              key={`${i}-${src.slice(0, 64)}`}
              originalSrc={src}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                objectFit: 'contain',
                maxHeight: 240,
              }}
            />
          ))}
        </div>
      </Image.PreviewGroup>
      {text ? (
        <XMarkdown content={text} streaming={{ hasNextChunk: isStreaming, enableAnimation: true }} />
      ) : null}
    </div>
  );
}
