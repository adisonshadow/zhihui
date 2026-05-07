import React, { useMemo, useState } from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd/es/button';
import classNames from 'classnames';

export interface CheckButtonOption<T extends string | number = string | number> {
  label: React.ReactNode;
  value: T;
  disabled?: boolean;
}

/** 各视觉态样式（后列覆盖前列）；hover / activePress 为交互叠加态。
 * 请勿混用 CSS `border` 简写与同层的 `borderColor`/`borderWidth`/`borderStyle`，否则合并后可能触发 React 样式警告；
 * 建议边框统一写：`borderWidth` + `borderStyle` + `borderColor`。 */
export interface CheckButtonGroupStateStyles {
  /** 未选中默认态 */
  idle?: React.CSSProperties;
  /** 选中 */
  selected?: React.CSSProperties;
  /** 鼠标悬停（与其它态合并） */
  hover?: React.CSSProperties;
  /** 按下未释放（与其它态合并） */
  activePress?: React.CSSProperties;
}

type CheckButtonGroupExclusive<T extends string | number> = readonly T[] | undefined;

type CheckButtonGroupShared<T extends string | number = string | number> = {
  options: CheckButtonOption<T>[];
  /** 按钮间距，默认 8 */
  gap?: number | string;
  /** 与 antd Button 一致 */
  size?: ButtonProps['size'];
  /** 与 antd Button 一致，默认 outlined 更接近卡片勾选外观 */
  variant?: ButtonProps['variant'];
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** 单颗按钮的 className，便于外层写选择器 */
  buttonClassName?: string;
  stateStyles?: CheckButtonGroupStateStyles;
  /**
   * 与 `multiple` 联用：选中之项与列表中任意非互斥项互斥；
   * 点选某项时若该项在 exclusiveValues 中，选中结果仅此一项（如「任意」）。
   */
  exclusiveValues?: CheckButtonGroupExclusive<T>;
};

/** 单选（默认） */
export type CheckButtonGroupSingleProps<T extends string | number = string | number> = CheckButtonGroupShared<T> & {
  multiple?: false;
  options: CheckButtonOption<T>[];
  value?: T | null;
  defaultValue?: T | null;
  onChange?: (value: T) => void;
};

/** 多选 */
export type CheckButtonGroupMultipleProps<T extends string | number = string | number> = CheckButtonGroupShared<T> & {
  multiple: true;
  options: CheckButtonOption<T>[];
  value?: T[];
  defaultValue?: T[];
  onChange?: (value: T[]) => void;
};

export type CheckButtonGroupProps<T extends string | number = string | number> =
  | CheckButtonGroupSingleProps<T>
  | CheckButtonGroupMultipleProps<T>;

function mergeStyle(
  base: React.CSSProperties,
  ...layers: (React.CSSProperties | undefined)[]
): React.CSSProperties {
  let out: React.CSSProperties = { ...base };
  for (const layer of layers) {
    if (layer && Object.keys(layer).length) {
      out = { ...out, ...layer };
    }
  }
  return out;
}

function normalizeExclusiveRemoval<T extends string | number>(
  list: T[],
  exclusiveVals: readonly T[] | undefined
): T[] {
  if (!exclusiveVals?.length) return list;
  const exc = new Set(exclusiveVals);
  return list.filter((x) => !exc.has(x));
}

/**
 * 多选一的按钮组（默认），或多选一的「多选」模式（`multiple`），
 * 基于 antd Button + flex 换行。
 */
export function CheckButtonGroup<T extends string | number = string | number>(
  props: CheckButtonGroupProps<T>
) {
  const {
    options,
    gap = 8,
    size = 'middle',
    variant = 'outlined',
    disabled: groupDisabled = false,
    className,
    style: rootStyle,
    buttonClassName,
    stateStyles,
    exclusiveValues,
    multiple,
  } = props;

  const isMultiple = !!multiple;

  const [innerSingle, setInnerSingle] = useState<T | null | undefined>(
    !isMultiple && 'defaultValue' in props ? (props as CheckButtonGroupSingleProps<T>).defaultValue : undefined
  );
  const [innerMulti, setInnerMulti] = useState<T[]>(
    isMultiple && 'defaultValue' in props && Array.isArray((props as CheckButtonGroupMultipleProps<T>).defaultValue)
      ? ((props as CheckButtonGroupMultipleProps<T>).defaultValue as T[])
      : []
  );

  const isControlledSingle = !isMultiple && (props as CheckButtonGroupSingleProps<T>).value !== undefined;
  const isControlledMulti = isMultiple && (props as CheckButtonGroupMultipleProps<T>).value !== undefined;

  const singleVal = !isMultiple
    ? ((isControlledSingle ? (props as CheckButtonGroupSingleProps<T>).value : innerSingle) ?? null)
    : null;

  const multiVal: T[] = isMultiple
    ? isControlledMulti
      ? ((props as CheckButtonGroupMultipleProps<T>).value as T[])
      : innerMulti
    : [];

  const [hovered, setHovered] = useState<T | string | number | null>(null);
  const [pressed, setPressed] = useState<T | string | number | null>(null);

  const exclusives = useMemo(
    () => (exclusiveValues?.length ? new Set(exclusiveValues) : null),
    [exclusiveValues]
  );

  const toggleSingle = (next: T) => {
    if (!isControlledSingle && !isMultiple) setInnerSingle(next);
    if (!isMultiple) (props as CheckButtonGroupSingleProps<T>).onChange?.(next);
  };

  const toggleMulti = (clicked: T) => {
    const curRaw = [...multiVal];
    const wasSelected = curRaw.includes(clicked);

    let next: T[];
    if (exclusives?.has(clicked)) {
      next = !wasSelected ? [clicked] : [];
    } else if (wasSelected) {
      next = normalizeExclusiveRemoval(
        curRaw.filter((x) => x !== clicked),
        exclusiveValues as readonly T[] | undefined
      );
    } else {
      next = [...normalizeExclusiveRemoval(curRaw, exclusiveValues), clicked];
    }

    if (!isControlledMulti) setInnerMulti(next);
    (props as CheckButtonGroupMultipleProps<T>).onChange?.(next);
  };

  const idle = stateStyles?.idle;
  const sel = stateStyles?.selected;
  const hoverSt = stateStyles?.hover;
  const pressSt = stateStyles?.activePress;

  return (
    <div
      role={isMultiple ? 'group' : 'listbox'}
      aria-orientation="horizontal"
      aria-multiselectable={isMultiple ? true : undefined}
      className={classNames('antd-plus-check-button-group', className)}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap,
        ...rootStyle,
      }}
    >
      {options.map((opt) => {
        const isSelected = isMultiple
          ? multiVal.includes(opt.value)
          : singleVal !== null && singleVal === opt.value;
        const isHover = hovered === opt.value;
        const isPress = pressed === opt.value;
        const disabled = groupDisabled || opt.disabled;

        let merged: React.CSSProperties = idle ? { ...idle } : {};
        if (isSelected && sel) merged = mergeStyle(merged, sel);
        if (isHover && !disabled && hoverSt) merged = mergeStyle(merged, hoverSt);
        if (isPress && !disabled && pressSt) merged = mergeStyle(merged, pressSt);

        return (
          <Button
            key={String(opt.value)}
            type="default"
            variant={variant}
            size={size}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-selected={isSelected}
            className={classNames(
              'antd-plus-check-button-group__btn',
              buttonClassName,
              isSelected && 'antd-plus-check-button-group__btn--selected'
            )}
            style={Object.keys(merged).length ? merged : undefined}
            onClick={() => {
              if (disabled) return;
              if (isMultiple) toggleMulti(opt.value);
              else toggleSingle(opt.value);
            }}
            onMouseEnter={() => !disabled && setHovered(opt.value)}
            onMouseLeave={() => {
              setHovered((h) => (h === opt.value ? null : h));
              setPressed((p) => (p === opt.value ? null : p));
            }}
            onMouseDown={() => !disabled && setPressed(opt.value)}
            onMouseUp={() => setPressed((p) => (p === opt.value ? null : p))}
            onBlur={() => {
              setHovered(null);
              setPressed(null);
            }}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
