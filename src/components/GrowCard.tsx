/**
 * GrowCard：填充父容器宽高，分为固定高度的 header 与 overflow auto 的 body。
 * 除宽高/布局外无默认样式，可通过 props 为 header/body 传入 className、style。
 */
import React from 'react';

const DEFAULT_HEADER_HEIGHT = 28;

export interface GrowCardProps {
  /** header 区域内容 */
  header?: React.ReactNode;
  /** body 区域内容（即 children） */
  children?: React.ReactNode;
  /** header 高度（默认 28px） */
  headerHeight?: number;
  /** header 的 className */
  headerClassName?: string;
  /** header 的 style */
  headerStyle?: React.CSSProperties;
  /** body 的 className */
  bodyClassName?: string;
  /** body 的 style */
  bodyStyle?: React.CSSProperties;
  /** 根容器的 className */
  className?: string;
  /** 根容器的 style */
  style?: React.CSSProperties;
}

export function GrowCard({
  header,
  children,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  headerClassName,
  headerStyle,
  bodyClassName,
  bodyStyle,
  className,
  style,
}: GrowCardProps) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
      <div
        className={headerClassName}
        style={{
          flexShrink: 0,
          height: headerHeight,
          minHeight: headerHeight,
          overflow: 'hidden',
          ...headerStyle,
        }}
      >
        {header}
      </div>
      <div
        className={bodyClassName}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
