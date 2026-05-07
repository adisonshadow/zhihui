/**
 * 基于 antd Modal 的增强封装：全屏、固定内容区高度、body 内滚动
 */
import { useMemo, type CSSProperties } from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import classNames from 'classnames';

import './style.css';

function mergeModalStyles(
  computed: { container: CSSProperties; body: CSSProperties },
  user: ModalProps['styles'] | undefined,
): ModalProps['styles'] {
  if (!user) {
    return { container: computed.container, body: computed.body };
  }
  if (typeof user === 'function') {
    return (info) => {
      const u = user(info);
      return {
        ...u,
        container: { ...computed.container, ...u.container },
        body: { ...computed.body, ...u.body },
      };
    };
  }
  return {
    ...user,
    container: { ...computed.container, ...user.container },
    body: { ...computed.body, ...user.body },
  };
}

export interface AdaptiveModalProps extends ModalProps {
  /** 全屏：视口宽度 100%，内容区高度 100vh（与 containerHeight 同时存在时以全屏为准） */
  fullScreen?: boolean;
  /**
   * 内容容器（.ant-modal-container）高度。
   * - `number`：像素
   * - 以 `%` 结尾的字符串：按**视口高度**计（如 `90%` → `90vh`）
   * - 其它字符串：作为 CSS length 原样用于 `height`（如 `80vh`、`400px`）
   */
  containerHeight?: number | string;
  /**
   * 是否在 modal body 内纵向滚动。
   * 需配合 `fullScreen` 或 `containerHeight`，通过 flex 布局让 body 占据「容器高度 − header − footer」的剩余空间。
   */
  bodyScrollY?: boolean;
}

function resolveContainerHeightCss(
  fullScreen: boolean,
  containerHeight: number | string | undefined,
): CSSProperties | null {
  if (fullScreen) {
    return { height: '100vh', maxHeight: '100dvh' };
  }
  if (containerHeight === undefined) return null;
  if (typeof containerHeight === 'number') {
    return { height: `${containerHeight}px` };
  }
  const s = containerHeight.trim();
  if (/^\d+(\.\d+)?%$/.test(s)) {
    return { height: `${parseFloat(s)}vh` };
  }
  return { height: s };
}

export function AdaptiveModal({
  fullScreen = false,
  containerHeight,
  bodyScrollY = false,
  styles,
  wrapClassName,
  width,
  centered,
  ...rest
}: AdaptiveModalProps) {
  const mergedStyles = useMemo(() => {
    const sizeStyle = resolveContainerHeightCss(fullScreen, fullScreen ? undefined : containerHeight);
    const hasFixedShell = Boolean(sizeStyle);

    const container: CSSProperties = { ...(sizeStyle ?? {}) };
    if (bodyScrollY && hasFixedShell) {
      container.display = 'flex';
      container.flexDirection = 'column';
      container.overflow = 'hidden';
    }

    const body: CSSProperties = {};
    if (bodyScrollY && hasFixedShell) {
      body.flex = 1;
      body.minHeight = 0;
      body.overflowY = 'auto';
    }

    return mergeModalStyles({ container, body }, styles);
  }, [bodyScrollY, containerHeight, fullScreen, styles]);

  const mergedWrapClassName = classNames(fullScreen && 'antd-plus-adaptive-modal-fullscreen', wrapClassName);

  const mergedWidth = fullScreen ? (width ?? '100%') : width;
  const mergedCentered = fullScreen ? false : centered;

  return (
    <Modal
      {...rest}
      width={mergedWidth}
      centered={mergedCentered}
      styles={mergedStyles}
      wrapClassName={mergedWrapClassName || undefined}
    />
  );
}
