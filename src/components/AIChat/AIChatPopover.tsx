/**
 * AI 对话 - Popover 布局模式
 * 以触发元素打开 Popover 展示对话界面，适合嵌入到任意 UI 位置
 */
import React, { forwardRef, useCallback, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Popover, Button } from 'antd';
import type { TooltipPlacement } from 'antd/es/tooltip';
import { CommentOutlined } from '@ant-design/icons';
import { AIChatSidePanel } from './AIChatSidePanel';
import { AIChatShellHeader } from './AIChatShellHeader';
import type { AIChatSidePanelHandle } from './aiChatPanelHandles';

type SidePanelPassthrough = ComponentPropsWithoutRef<typeof AIChatSidePanel>;

/** Popover 壳 + 与 SidePanel 一致的对话能力 */
export type AIChatPopoverProps = SidePanelPassthrough & {
  /** Popover 标题，默认 'AI 助手' */
  title?: string;
  /** 自定义触发元素；不传则渲染默认按钮 */
  trigger?: React.ReactNode;
  /** Popover 内容区宽度（px），默认 400 */
  popoverWidth?: number;
  /** Popover 内容区高度（px），默认 520 */
  popoverHeight?: number;
  /** 初始是否展开，默认 false */
  defaultOpen?: boolean;
  /** Popover 弹出方向，默认 'topRight' */
  placement?: TooltipPlacement;
};

export const AIChatPopover = forwardRef<AIChatSidePanelHandle, AIChatPopoverProps>(function AIChatPopover(
  {
    agentKey,
    onAgentChange,
    title = 'AI 助手',
    trigger: triggerNode,
    popoverWidth = 400,
    popoverHeight = 520,
    defaultOpen = false,
    placement = 'topRight',
    sidePanelSuppressBuiltInHeader: _ignored,
    onHeaderTrailingChange: _ignored2,
    ...sidePanelProps
  },
  ref,
) {
  const [open, setOpen] = useState(defaultOpen);
  const [headerTrailing, setHeaderTrailing] = useState<ReactNode>(null);
  const onHeaderTrailingChange = useCallback((node: ReactNode) => {
    setHeaderTrailing(node);
  }, []);

  const content = (
    <div
      style={{
        width: popoverWidth,
        height: popoverHeight,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <AIChatShellHeader title={title} trailing={headerTrailing} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <AIChatSidePanel
          ref={ref}
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          sidePanelSuppressBuiltInHeader
          onHeaderTrailingChange={onHeaderTrailingChange}
          {...sidePanelProps}
        />
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      trigger="click"
      placement={placement}
      destroyOnHidden
      overlayStyle={{ padding: 0 }}
      styles={{ container: { padding: 0, overflow: 'hidden', borderRadius: 8 } }}
    >
      {triggerNode ?? (
        <Button type="primary" icon={<CommentOutlined />}>
          AI 对话
        </Button>
      )}
    </Popover>
  );
});
