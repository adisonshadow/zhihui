/**
 * AI 对话通用组件入口
 * 支持多种展示模式：SidePanel、FloatingBottom、Popover（后两种待实现）
 */
import React from 'react';
import type { AIChatMode } from './types';
import { AIChatSidePanel } from './AIChatSidePanel';
import type { AIChatCoreProps } from './AIChatCore';

export interface AIChatProps extends Omit<AIChatCoreProps, 'agentKey'> {
  /** 展示模式 */
  mode: AIChatMode;
  /** Agent 角色 key */
  agentKey: string;
  /** Agent 切换回调（用于支持已渲染对话变更 agent） */
  onAgentChange?: (key: string) => void;
}

export function AIChat({ mode, agentKey, onAgentChange, ...coreProps }: AIChatProps) {
  switch (mode) {
    case 'SidePanel':
      return (
        <AIChatSidePanel
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          {...coreProps}
        />
      );
    case 'FloatingBottom':
      return (
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>FloatingBottom 模式待实现</div>
          <AIChatSidePanel
            agentKey={agentKey}
            onAgentChange={onAgentChange}
            {...coreProps}
          />
        </div>
      );
    case 'Popover':
      return (
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Popover 模式待实现</div>
          <AIChatSidePanel
            agentKey={agentKey}
            onAgentChange={onAgentChange}
            {...coreProps}
          />
        </div>
      );
    default:
      return (
        <AIChatSidePanel
          agentKey={agentKey}
          onAgentChange={onAgentChange}
          {...coreProps}
        />
      );
  }
}
