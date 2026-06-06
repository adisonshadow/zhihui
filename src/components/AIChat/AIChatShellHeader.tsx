/**
 * FloatingBottom / Popover 外壳顶栏：标题 + 右侧插槽（会话控件、关闭等）
 */
import { Flex } from 'antd';
import type { ReactNode } from 'react';

export interface AIChatShellHeaderProps {
  title: string;
  trailing?: ReactNode;
}

export function AIChatShellHeader({ title, trailing }: AIChatShellHeaderProps) {
  return (
    <Flex
      justify="space-between"
      align="center"
      style={{
        padding: '0 12px 0 16px',
        height: 40,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{title}</span>
      {trailing ? (
        <Flex align="center" gap={4}>
          {trailing}
        </Flex>
      ) : null}
    </Flex>
  );
}
