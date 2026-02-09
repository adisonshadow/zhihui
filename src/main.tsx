/**
 * 芝绘 - 渲染进程入口（见技术文档 2、开发计划 2.1）
 * Ant Design 仅 dark 主题，参考 Biezhi2/web/main.tsx
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

const customTheme = {
  "components": {
      "Steps": {
        "colorPrimary": "rgb(255,255,255)",
        "colorTextLightSolid": "rgb(21,50,91)"
      },
      "Select": {
        "optionSelectedBg": "rgba(255,255,255,0.1)"
      },
      "Slider": {
        "handleColor": "rgb(140,140,140)",
        "trackBg": "rgb(113,113,113)",
        "trackHoverBg": "rgb(156,204,255)",
        "colorPrimaryBorderHover": "rgb(156,204,255)",
        "colorBgElevated": "rgb(45,45,45)"
      },
      "Switch": {
        "colorPrimary": "rgb(156,204,255)"
      },
      "Collapse": {
        "colorBorder": "rgba(131,131,131,0.15)",
        "colorPrimaryBorder": "rgba(131,131,131,0.15)"
      },
      "Segmented": {
        "itemActiveBg": "rgba(216,232,255,0.3)"
      },
      "Tabs": {
        "itemSelectedColor": "rgb(255,255,255)",
        "itemColor": "rgb(151,151,151)",
        "cardBg": "rgba(0,0,0,0)", // tab item 选中 的背景色
        "colorBgContainer": "#171717", // tab item 选中 的背景色
        "inkBarColor": "rgb(207,227,255)",
        "colorBorderSecondary": "rgba(250,219,20,0)",
      },
      "Tooltip": {
        "colorBgSpotlight": "rgb(65,65,65)"
      },
      "Modal": {
        "colorText": "rgba(179,179,179,0.85)"
      },
      "Button": {
        "defaultHoverBorderColor": "rgb(255,255,255)",
        "defaultHoverColor": "rgb(233,243,255)",
        "defaultActiveBorderColor": "rgb(182,182,182)",
        "defaultActiveColor": "rgb(181,209,255)",
        "colorPrimary": "rgb(49,51,54)",
        "colorPrimaryBgHover": "rgb(43,43,43)",
        "colorPrimaryActive": "rgb(65,80,102)",
        "colorPrimaryHover": "rgb(78,85,94)",
        "primaryShadow": "0 2px 0 rgba(0,0,0,0.3)",
        "colorBgContainer": "rgba(255,255,255,0)"
      },
      "Menu": {
        "itemSelectedBg": "rgba(255,255,255,0.12)",
        "itemSelectedColor": "rgb(177,209,255)",
        "itemHoverBg": "rgba(255,255,255,0.05)",
        "subMenuItemSelectedColor": "rgb(177,209,255)"
      },
      "Pagination": {
        "itemActiveColor": "rgba(255,255,255,0.99)",
        "colorPrimary": "rgb(185,214,253)"
      },
      "Input": {
        "activeBorderColor": "rgb(22,119,255)",
        "hoverBorderColor": "rgba(170,208,255,0.76)"
      }
    },
    "token": {
      "colorInfo": "#f1f7ff"
    },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        ...customTheme,
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
