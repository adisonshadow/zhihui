/**
 * 响应式卡片网格：display grid + repeat(auto-fill, minmax(Xpx, 1fr))
 * 用于素材页、人物页、设计器素材面板等分类列表的卡片布局
 */
import React from 'react';

export interface ResponsiveCardGridProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 最小项宽度（px），响应式自动分列 */
  minItemWidth?: number;
  /** 网格间距 */
  gap?: number;
  /** 内边距 */
  padding?: number;
  /** 额外样式 */
  style?: React.CSSProperties;
  /** 额外 className */
  className?: string;
}

export function ResponsiveCardGrid({
  children,
  minItemWidth = 140,
  gap = 12,
  padding = 8,
  style,
  className,
}: ResponsiveCardGridProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
        gap,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
