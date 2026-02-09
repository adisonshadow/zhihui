/**
 * 关键帧按钮（见功能文档 6.7、6.8）：钻石形 + 左右箭头
 * - 禁用：时间轴未与素材条重叠，提示「请先将时间轴移动到素材之上」
 * - 添加：钻石空心+加号，提示「添加关键帧」
 * - 删除：钻石填充颜色+减号，提示「删除关键帧」
 * - 左右箭头：跳转上一个/下一个关键帧，无则置灰
 */
import React, { useState } from 'react';
import { Tooltip } from 'antd';
import { LeftOutlined, PlusOutlined, MinusOutlined, RightOutlined } from '@ant-design/icons';

export type KeyframeButtonState = 'disabled' | 'add' | 'delete';

export interface KeyframeButtonProps {
  /** 是否禁用（时间轴未在素材条上） */
  disabled: boolean;
  /** 当前是否有关键帧（时间轴与关键帧重叠） */
  hasKeyframe: boolean;
  /** 是否有上一个关键帧 */
  hasPrev: boolean;
  /** 是否有下一个关键帧 */
  hasNext: boolean;
  /** 点击钻石：添加或删除关键帧 */
  onToggle: () => void;
  /** 点击左箭头：跳转上一个关键帧 */
  onPrev: () => void;
  /** 点击右箭头：跳转下一个关键帧 */
  onNext: () => void;
  /** 添加关键帧 loading */
  loading?: boolean;
}

const btnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  borderRadius: 4,
  padding: 0,
};

const disabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.4,
  cursor: 'not-allowed',
};

export function KeyframeButton({
  disabled,
  hasKeyframe,
  hasPrev,
  hasNext,
  onToggle,
  onPrev,
  onNext,
  loading,
}: KeyframeButtonProps) {
  const [hover, setHover] = useState(false);

  const tooltipText = disabled
    ? '请先将时间轴移动到素材之上'
    : hasKeyframe
      ? '删除关键帧'
      : '添加关键帧';

  const diamondBg = hasKeyframe ? 'rgba(0,229,255,0.6)' : hover && !disabled ? 'rgba(255,255,255,0.15)' : 'transparent';
  const diamondColor = hasKeyframe ? '#fff' : 'rgba(255,255,255,0.85)';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Tooltip title={hasPrev ? '上一个关键帧' : undefined}>
        <button
          type="button"
          style={hasPrev ? btnStyle : disabledStyle}
          onClick={hasPrev ? onPrev : undefined}
          disabled={!hasPrev}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <LeftOutlined style={{ fontSize: 10 }} />
        </button>
      </Tooltip>
      <Tooltip title={tooltipText}>
        <button
          type="button"
          style={{
            ...btnStyle,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: diamondBg,
            transform: 'rotate(45deg)',
          }}
          onClick={disabled ? undefined : onToggle}
          disabled={disabled}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <span style={{ transform: 'rotate(-45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <span style={{ fontSize: 10 }}>…</span>
            ) : hasKeyframe ? (
              <MinusOutlined style={{ fontSize: 10, color: diamondColor }} />
            ) : (
              <PlusOutlined style={{ fontSize: 10, color: diamondColor }} />
            )}
          </span>
        </button>
      </Tooltip>
      <Tooltip title={hasNext ? '下一个关键帧' : undefined}>
        <button
          type="button"
          style={hasNext ? btnStyle : disabledStyle}
          onClick={hasNext ? onNext : undefined}
          disabled={!hasNext}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <RightOutlined style={{ fontSize: 10 }} />
        </button>
      </Tooltip>
    </span>
  );
}
