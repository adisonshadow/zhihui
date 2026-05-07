import { Button, Space, message } from 'antd';
import { StarOutlined, FileTextOutlined } from '@ant-design/icons';
import { addScreenwriterFavorite, composeStoryFavoriteContent } from '../storage/screenwriterFavoriteStorage';

export interface ScreenwriterStoryToolPanelProps {
  content: string;
  sourceConversationKey?: string | null;
  /** 同一条助手消息上下文中的用户抽卡偏好，收藏雏形时附在末尾 */
  rawDrawBrief?: string;
  onGenerateOutline: (content: string) => void;
  onFavoriteChange?: () => void;
}

export function buildGenerateOutlinePrompt(content: string): string {
  return `请基于下面这个小说雏形，生成一份可用于长篇小说/漫剧开发的完整大纲。

要求：
1. 保留原始小说雏形的核心设定、主角目标和主要冲突。
2. 输出世界观设定、角色小传、主线剧情、阶段性剧情节点、主要反转、结局方向。
3. 如果适合漫剧，请补充前 10 集的分集看点。
4. 结构清晰，方便后续继续扩写。
5. 全文正文结束后，在最后单独输出系统约定的 JSON 代码块（kind 为 yiman_screenwriter_outline），用于界面展示大纲来源与简介；不要有其它 JSON。

【小说雏形】
${content}`;
}

/** 上一轮已生成 Markdown 大纲时，请求按同一契约重写 */
export function buildRegenerateOutlinePrompt(previousOutlineProse: string): string {
  const body = previousOutlineProse.trim() || '(无正文)';
  return `请在不改变核心设定与用户意图的前提下，**重新生成**一整份长篇小说/漫剧用故事大纲（可与上一版结构调整、润色）。
须满足与原「生成大纲」相同的结构与质量要求，并在全文最后附上 kind 为 yiman_screenwriter_outline 的 JSON 代码块。

【上一轮大纲正文】
${body}`;
}

export function ScreenwriterStoryToolPanel({
  content,
  sourceConversationKey,
  rawDrawBrief,
  onGenerateOutline,
  onFavoriteChange,
}: ScreenwriterStoryToolPanelProps) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      <Space size={8}>
        <Button
          size="small"
          icon={<StarOutlined />}
          onClick={() => {
            addScreenwriterFavorite({
              titleSourceBody: content,
              content: composeStoryFavoriteContent(content, rawDrawBrief),
              sourceConversationKey,
            });
            onFavoriteChange?.();
            message.success('已收藏雏形');
          }}
        >
          收藏雏形
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<FileTextOutlined />}
          onClick={() => onGenerateOutline(buildGenerateOutlinePrompt(content))}
        >
          生成大纲
        </Button>
      </Space>
    </div>
  );
}
