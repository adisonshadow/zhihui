/**
 * AI 对话通用组件入口
 * 支持多种展示模式：SidePanel、FloatingBottom、Popover、BottomSender
 * 见功能文档 06 § 3
 */
import React, { forwardRef, type ComponentType } from 'react';
import type { TooltipPlacement } from 'antd/es/tooltip';
import type { AIChatMode } from './types';
import { AIChatSidePanel, type SidePanelAssistantContentRenderArgs } from './AIChatSidePanel';
import { AIChatFloatingBottom } from './AIChatFloatingBottom';
import { AIChatPopover } from './AIChatPopover';
import { AIChatBottomSender } from './AIChatBottomSender';
import type { AIChatCoreProps } from './AIChatCore';
import type { AIChatSidePanelHandle } from './aiChatPanelHandles';

export interface AIChatProps extends Omit<AIChatCoreProps, 'agentKey'> {
  /** 展示模式 */
  mode: AIChatMode;
  /** Agent 角色 key */
  agentKey: string;
  /** Agent 切换回调（用于支持已渲染对话变更 agent） */
  onAgentChange?: (key: string) => void;

  // ---- FloatingBottom 专属 ----
  /** 悬浮面板标题（FloatingBottom / Popover 模式，默认 'AI 助手'） */
  floatingTitle?: string;
  /** 悬浮面板宽度 px（FloatingBottom，默认 380） */
  floatingPanelWidth?: number;
  /** 悬浮面板高度 px（FloatingBottom，默认 560） */
  floatingPanelHeight?: number;
  /** 悬浮按钮距右边距 px（FloatingBottom，默认 24） */
  floatingOffsetRight?: number;
  /** 悬浮按钮距底部 px（FloatingBottom，默认 24） */
  floatingOffsetBottom?: number;

  // ---- Popover 专属 ----
  /** Popover 标题（默认 'AI 助手'） */
  popoverTitle?: string;
  /** Popover 自定义触发元素；不传则使用默认按钮 */
  popoverTrigger?: React.ReactNode;
  /** Popover 内容区宽度 px（默认 400） */
  popoverWidth?: number;
  /** Popover 内容区高度 px（默认 520） */
  popoverHeight?: number;
  /** Popover 弹出方向（默认 'topRight'） */
  popoverPlacement?: TooltipPlacement;

  // ---- BottomSender 专属 ----
  /** 底部仅 Sender 模式：输入框上方的自定义区域 */
  bottomSenderAbove?: React.ReactNode;

  // ---- 共享 ----
  /** 初始是否展开（FloatingBottom / Popover，默认 false） */
  defaultOpen?: boolean;

  /** SidePanel 专属（仅 mode=SidePanel 使用） */
  prepareGenStoriesCardComponent?: ComponentType<{ onStart: (userPrompt: string) => void }>;
  sidePanelEmptyExtras?: React.ReactNode;
  sidePanelExternalConversationControl?: boolean;
  /** 顶栏显示关闭按钮，点击回调（抽卡页等全屏模式） */
  sidePanelOnClose?: () => void;
  /** 自定义 SidePanel assistant 消息渲染 */
  sidePanelAssistantContentRender?: (args: SidePanelAssistantContentRenderArgs) => React.ReactNode;
}

export const AIChat = forwardRef<AIChatSidePanelHandle, AIChatProps>(function AIChat(
  {
    mode,
    agentKey,
    onAgentChange,
    floatingTitle,
    floatingPanelWidth,
    floatingPanelHeight,
    floatingOffsetRight,
    floatingOffsetBottom,
    popoverTitle,
    popoverTrigger,
    popoverWidth,
    popoverHeight,
    popoverPlacement,
    bottomSenderAbove,
    defaultOpen,
    prepareGenStoriesCardComponent,
    sidePanelEmptyExtras,
    sidePanelExternalConversationControl,
    sidePanelOnClose,
    sidePanelAssistantContentRender,
    ...coreProps
  },
  ref
) {
  switch (mode) {
    case 'SidePanel':
      return (
        <AIChatSidePanel
          ref={ref}
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          prepareGenStoriesCardComponent={prepareGenStoriesCardComponent}
          sidePanelEmptyExtras={sidePanelEmptyExtras}
          sidePanelExternalConversationControl={sidePanelExternalConversationControl}
          sidePanelOnClose={sidePanelOnClose}
          sidePanelAssistantContentRender={sidePanelAssistantContentRender}
          {...coreProps}
        />
      );
    case 'FloatingBottom':
      return (
        <AIChatFloatingBottom
          ref={ref}
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          title={floatingTitle}
          panelWidth={floatingPanelWidth}
          panelHeight={floatingPanelHeight}
          offsetRight={floatingOffsetRight}
          offsetBottom={floatingOffsetBottom}
          defaultOpen={defaultOpen}
          {...coreProps}
        />
      );
    case 'Popover':
      return (
        <AIChatPopover
          ref={ref}
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          title={popoverTitle}
          trigger={popoverTrigger}
          popoverWidth={popoverWidth}
          popoverHeight={popoverHeight}
          placement={popoverPlacement}
          defaultOpen={defaultOpen}
          {...coreProps}
        />
      );
    case 'BottomSender':
      return (
        <AIChatBottomSender
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          aboveSender={bottomSenderAbove}
          {...coreProps}
        />
      );
    default:
      return (
        <AIChatSidePanel
          ref={ref}
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          prepareGenStoriesCardComponent={prepareGenStoriesCardComponent}
          sidePanelEmptyExtras={sidePanelEmptyExtras}
          sidePanelExternalConversationControl={sidePanelExternalConversationControl}
          sidePanelOnClose={sidePanelOnClose}
          sidePanelAssistantContentRender={sidePanelAssistantContentRender}
          {...coreProps}
        />
      );
  }
});
