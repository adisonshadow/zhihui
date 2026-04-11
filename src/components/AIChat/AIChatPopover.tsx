/**
 * AI 对话 - Popover 布局模式
 * 以触发元素打开 Popover 展示对话界面，适合嵌入到任意 UI 位置
 */
import React, { forwardRef, useState } from 'react';
import { Popover, Button } from 'antd';
import type { TooltipPlacement } from 'antd/es/tooltip';
import { CommentOutlined } from '@ant-design/icons';
import { AIChatSidePanel } from './AIChatSidePanel';
import type { AIChatCoreProps } from './AIChatCore';
import type { AIChatSidePanelHandle } from './aiChatPanelHandles';

export interface AIChatPopoverProps extends AIChatCoreProps {
  agentKey: string;
  onAgentChange?: (key: string) => void;
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
}

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
    ...coreProps
  },
  ref
) {
  const [open, setOpen] = useState(defaultOpen);

  const content = (
    <div style={{ width: popoverWidth, height: popoverHeight }}>
      <AIChatSidePanel
        ref={ref}
        agentKey={agentKey}
        onAgentChange={onAgentChange}
        {...coreProps}
      />
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      title={title}
      trigger="click"
      placement={placement}
      destroyOnHidden
      overlayStyle={{ padding: 0 }}
      styles={{ container: { padding: 0, overflow: 'hidden', borderRadius: 8 }}}
    >
      {triggerNode ?? (
        <Button type="primary" icon={<CommentOutlined />}>
          AI 对话
        </Button>
      )}
    </Popover>
  );
});
