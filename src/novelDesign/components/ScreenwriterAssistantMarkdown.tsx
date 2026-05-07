/**
 * 与 AI Chat 助手气泡一致的 Markdown（XMarkdown）渲染；用于抽卡页自定义分支中与 defaultNode 视觉一致。
 */
import XMarkdown from '@ant-design/x-markdown';

export interface ScreenwriterAssistantMarkdownProps {
  content: string;
  /** true 时使用流式动效（与 DrawerBubbleContent 对齐） */
  streaming?: boolean;
}

export function ScreenwriterAssistantMarkdown({ content, streaming = false }: ScreenwriterAssistantMarkdownProps) {
  return (
    <XMarkdown content={content} streaming={{ hasNextChunk: streaming, enableAnimation: true }} />
  );
}
