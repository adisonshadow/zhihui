import React, { useState, useCallback } from 'react';
import { Card } from 'antd';
import type { CardProps } from 'antd/es/card';
import classNames from 'classnames';

import './style.css';

const DEFAULT_HEADER_HEIGHT = 36;

export interface AdaptiveCardProps extends Omit<CardProps, 'cover'> {
  /** 悬停时的 className */
  hoverClasses?: string;
  /** 悬停时的内联样式 */
  hoverStyle?: React.CSSProperties;
  /** 激活（按下）时的 className */
  activeClasses?: string;
  /** 激活（按下）时的内联样式 */
  activeStyle?: React.CSSProperties;
  /** header 区域内容（映射到 Card title） */
  header?: React.ReactNode;
  /** header 高度，默认 36；children 高度 = 卡片高度 - headerHeight */
  headerHeight?: number;
  /** header 的 style */
  headerStyle?: React.CSSProperties;
  /** content 区域是否 overflow: auto，默认 true；为 false 时 overflow: hidden */
  contentOverflow?: boolean;
}

const AdaptiveCard: React.FC<AdaptiveCardProps> = ({
  className,
  style,
  hoverClasses,
  hoverStyle,
  activeClasses,
  activeStyle,
  header,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  headerStyle,
  contentOverflow = true,
  children,
  ...restProps
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setIsActive(false);
  }, []);

  const handleMouseDown = useCallback(() => {
    setIsActive(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsActive(false);
  }, []);

  const mergedClassName = classNames(
    'antd-plus-adaptive-card',
    className,
    isHovered && hoverClasses,
    isActive && activeClasses
  );

  const mergedStyle: React.CSSProperties = {
    height: '100%',
    ...style,
    ...(isHovered && hoverStyle),
    ...(isActive && activeStyle),
  };

  const { title, headStyle: restHeadStyle, bodyStyle: restBodyStyle, ...cardRest } = restProps;
  const cardTitle = header !== undefined ? header : title;
  const headStyleMerged: React.CSSProperties = {
    height: headerHeight,
    minHeight: headerHeight,
    ...headerStyle,
    ...restHeadStyle,
  };
  const bodyStyleMerged: React.CSSProperties = {
    overflow: contentOverflow ? 'auto' : 'hidden',
    ...restBodyStyle,
  };

  return (
    <Card
      className={mergedClassName}
      style={mergedStyle}
      title={cardTitle}
      styles={{
        body: bodyStyleMerged,
        header: headStyleMerged,
      }}
      cover={undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      {...cardRest}
    >
      {children}
    </Card>
  );
};

export { AdaptiveCard };
