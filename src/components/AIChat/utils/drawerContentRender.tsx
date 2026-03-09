/**
 * 绘图师消息内容解析与渲染
 * 支持：JSON {"images": [...]}、Markdown ![](url)、base64 data URL
 */
import React from 'react';
import XMarkdown from '@ant-design/x-markdown';

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
  markdownComponent: React.ComponentType<{ children: string }>;
}

/** 绘图师模式下：有图片则渲染图片网格 + 文本；否则渲染 Markdown */
export function DrawerBubbleContent({
  content,
  isDrawerAgent,
  markdownComponent: Markdown,
}: DrawerBubbleContentProps): React.ReactNode {
  if (!isDrawerAgent) {
    return <Markdown>{content}</Markdown>;
  }
  const { images, text } = parseDrawerContent(content);
  if (images.length === 0) {
    return <Markdown>{content}</Markdown>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 8,
          maxWidth: 400,
        }}
      >
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
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
      {text && <Markdown>{text}</Markdown>}
    </div>
  );
}
