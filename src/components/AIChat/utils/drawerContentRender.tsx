/**
 * 绘图师消息内容解析与渲染
 * 支持：JSON {"images": [...]}、Markdown ![](url)、base64 data URL
 * 当 reasoningContent 存在时，使用官方 Think 组件展示推理过程（<think> 标签注入 XMarkdown）
 * 见官方 demo：@ant-design/x Think + XMarkdown streaming 用法
 */
import React, { memo, useEffect, useState } from 'react';
import { Image, Spin } from 'antd';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { Think } from '@ant-design/x';
import { useVolcArkDisplayableImageSrc } from '../adapters/volcArkImageAdapter';

/**
 * 推理内容折叠/展开组件，对应 XMarkdown <think> 标签
 * - 流式中：展开（显示推理过程）
 * - 完成后：自动折叠，用户可手动展开
 */
const ThinkComponent = memo(({ children, streamStatus }: ComponentProps) => {
  const isDone = streamStatus === 'done';
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (isDone) {
      setExpanded(false);
    }
  }, [isDone]);

  return (
    <Think
      title={isDone ? '推理过程' : '推理中…'}
      loading={!isDone}
      expanded={expanded}
      onExpand={setExpanded}
    >
      {children}
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

/**
 * 将推理内容和正文拼接为带 <think> 标签的 Markdown 字符串，
 * 配合 XMarkdown 的 components.think = ThinkComponent 渲染官方折叠推理框。
 */
function buildMarkdownText(content: string, reasoningContent?: string): string {
  if (!reasoningContent) return content;
  const closeTag = content ? '\n\n</think>\n\n' : '';
  return `<think>\n\n${reasoningContent}${closeTag}${content}`;
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

/** 绘图师模式下：有图片则渲染图片网格 + 文本；否则渲染 Markdown。推理内容通过 Think 组件在正文上方展示。 */
export function DrawerBubbleContent({
  content,
  isDrawerAgent,
  reasoningContent,
  status,
}: DrawerBubbleContentProps): React.ReactNode {
  const isStreaming = status === 'loading' || status === 'updating';
  const markdownText = buildMarkdownText(content, reasoningContent);

  if (!isDrawerAgent) {
    return (
      <XMarkdown
        content={markdownText}
        components={{ think: ThinkComponent }}
        streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
      />
    );
  }

  const { images, text } = parseDrawerContent(content);
  if (images.length === 0) {
    return (
      <XMarkdown
        content={markdownText}
        components={{ think: ThinkComponent }}
        streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
      />
    );
  }

  const textMarkdown = buildMarkdownText(text ?? '', reasoningContent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {reasoningContent && (
        <XMarkdown
          content={`<think>\n\n${reasoningContent}\n\n</think>`}
          components={{ think: ThinkComponent }}
          streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
        />
      )}
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
      {text && (
        <XMarkdown
          content={textMarkdown}
          components={{ think: ThinkComponent }}
          streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
        />
      )}
    </div>
  );
}
