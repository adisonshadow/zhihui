/**
 * Bubble / A2UI 统一样式上下文（§1.5），独立文件避免与其它 UI 模块循环依赖
 */
import React, { createContext, useContext } from 'react';
import type { UnifiedStyleSchema } from '../registryTypes';

export const DEFAULT_UNIFIED_STYLE: UnifiedStyleSchema = {
  imageMaxWidth: 400,
  imageBorderRadius: 8,
  imageGap: 8,
  audioPlayerWidth: 320,
  videoMaxWidth: 400,
  videoBorderRadius: 8,
  cardGap: 8,
};

const UnifiedStyleContext = createContext<UnifiedStyleSchema>(DEFAULT_UNIFIED_STYLE);

/** 提供 unifiedStyleSchema；由 SidePanel 根包一层传入 a2ui 配置 */
export function UnifiedStyleProvider({
  value,
  children,
}: {
  value?: UnifiedStyleSchema;
  children: React.ReactNode;
}) {
  const merged = { ...DEFAULT_UNIFIED_STYLE, ...value };
  return <UnifiedStyleContext.Provider value={merged}>{children}</UnifiedStyleContext.Provider>;
}

/** 绘图占位、插图网格、draped 气泡等统一消费间距与圆角 */
export function useUnifiedStyle(): UnifiedStyleSchema {
  return useContext(UnifiedStyleContext);
}
