import React from 'react';
import { ConfigProvider, Tabs } from 'antd';
import type { TabsProps } from 'antd/es/tabs';
import classNames from 'classnames';

import './style.css';

export interface AdaptiveTabsProps extends TabsProps {
  /** Tabs 组件 Token，透传到 ConfigProvider theme.components.Tabs */
  tokens?: Record<string, unknown>;
  /** content-holder 是否 overflow: auto，否则 overflow: hidden（利于子组件如 GrowCard 获得约束高度）。默认 true */
  contentOverflow?: boolean;
}

const AdaptiveTabs: React.FC<AdaptiveTabsProps> = ({
  className,
  tokens,
  styles,
  classNames: customClassNames,
  contentOverflow = true,
  ...restProps
}) => {
  const tabsNode = (
    <Tabs
      className={classNames(
        'antd-plus-adaptive-tabs',
        !contentOverflow && 'antd-plus-adaptive-tabs-content-no-overflow',
        className
      )}
      styles={styles}
      classNames={customClassNames}
      {...restProps}
    />
  );

  if (tokens && Object.keys(tokens).length > 0) {
    return (
      <ConfigProvider
        theme={{
          components: {
            Tabs: tokens,
          },
        }}
        tabs={{
          ...(styles && { styles }),
          ...(customClassNames && { classNames: customClassNames }),
        }}
      >
        {tabsNode}
      </ConfigProvider>
    );
  }

  return tabsNode;
};

export { AdaptiveTabs };
