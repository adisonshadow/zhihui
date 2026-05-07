/** 流式尚无卡片时为整块占位；已有卡片时可 `variant="footer"` 作为列表下方的轻量进度条 */
import { Flex, Spin } from 'antd';

export type StorySeedStreamingPlaceholderProps = {
  /** `solo`：尚无小说雏形卡片（默认）；`footer`：已出现卡片且 SSE 未结束时跟在卡片列表下 */
  variant?: 'solo' | 'footer';
};

export function StorySeedStreamingPlaceholder({ variant = 'solo' }: StorySeedStreamingPlaceholderProps) {
  const footer = variant === 'footer';

  const body = footer ? (
    <Flex align="center" gap={10} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      <Spin size="small" />
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>正在生成小说雏形…</span>
    </Flex>
  ) : (
    <Flex vertical align="center" justify="center" gap={14} style={{ minHeight: 100 }}>
      <Spin size="default" />
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>正在生成小说雏形…</span>
    </Flex>
  );

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        padding: footer ? '10px 14px' : '20px 16px',
        width: '100%',
      }}
    >
      {body}
    </div>
  );
}
