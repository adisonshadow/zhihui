/**
 * AI 对话 - FloatingBottom 布局模式
 * 固定在视口右下角的悬浮按钮，点击展开/收起对话面板
 */
import { forwardRef, useState } from 'react';
import { Button, Flex } from 'antd';
import { CommentOutlined, CloseOutlined } from '@ant-design/icons';
import { AIChatSidePanel } from './AIChatSidePanel';
import type { AIChatCoreProps } from './AIChatCore';
import type { AIChatSidePanelHandle } from './aiChatPanelHandles';

export interface AIChatFloatingBottomProps extends AIChatCoreProps {
  agentKey: string;
  onAgentChange?: (key: string) => void;
  /** 面板标题，默认 'AI 助手' */
  title?: string;
  /** 面板宽度（px），默认 380 */
  panelWidth?: number;
  /** 面板高度（px），默认 560 */
  panelHeight?: number;
  /** 初始是否展开，默认 false */
  defaultOpen?: boolean;
  /** 悬浮按钮距视口右边距（px），默认 24 */
  offsetRight?: number;
  /** 悬浮按钮距视口底部（px），默认 24 */
  offsetBottom?: number;
}

export const AIChatFloatingBottom = forwardRef<AIChatSidePanelHandle, AIChatFloatingBottomProps>(
  function AIChatFloatingBottom(
    {
      agentKey,
      onAgentChange,
      title = 'AI 助手',
      panelWidth = 380,
      panelHeight = 560,
      defaultOpen = false,
      offsetRight = 24,
      offsetBottom = 24,
      ...coreProps
    },
    ref
  ) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        position: 'fixed',
        right: offsetRight,
        bottom: offsetBottom,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      {open && (
        <div
          style={{
            width: panelWidth,
            height: panelHeight,
            marginBottom: 12,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'var(--ant-color-bg-elevated)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>
              {title}
            </span>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setOpen(false)}
            />
          </Flex>
          <div style={{ flex: 1, minHeight: 0 }}>
            <AIChatSidePanel
              ref={ref}
              agentKey={agentKey}
              onAgentChange={onAgentChange}
              {...coreProps}
            />
          </div>
        </div>
      )}
      <Button
        type="primary"
        shape="circle"
        icon={open ? <CloseOutlined /> : <CommentOutlined />}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 52,
          height: 52,
          fontSize: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  );
});
