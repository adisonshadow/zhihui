/**
 * 默认展示 Typography.Text；悬停仅展开 Input（不聚焦），点击/tap 后聚焦；未聚焦时鼠标离开即回到 Text。
 */
import { useState, useLayoutEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Typography, Input } from 'antd';
import type { InputProps, InputRef } from 'antd';
import type { TextProps } from 'antd/es/typography/Text';

const { Text } = Typography;

export interface HoverEditableTextProps {
  /** 只读展示文案 */
  displayText: string;
  /** 进入编辑时 Input 的初始内容（如原始 description，可为空） */
  editInitialValue: string;
  /** 当 key 变化时退出编辑态（如同一 Drawer 内切换关联 id） */
  resetKey?: string | number;
  disabled?: boolean;
  /** 编辑态下 Input 内容变化 */
  onChange?: (value: string) => void;
  /** 失焦或按下 Enter 时提交，值为 trim 后 */
  onCommit?: (trimmed: string) => void;
  /** 透传给 Typography.Text（勿与内部冲突时可包含 style/className） */
  textProps?: Omit<TextProps, 'children'>;
  /** 透传给 Input；内部会合并 value/onChange/onBlur/onKeyUp */
  inputProps?: Omit<InputProps, 'value' | 'defaultValue'>;
  style?: CSSProperties;
  className?: string;
}

export function HoverEditableText({
  displayText,
  editInitialValue,
  resetKey,
  disabled,
  onChange,
  onCommit,
  textProps,
  inputProps,
  style,
  className,
}: HoverEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<InputRef | null>(null);
  /** 仅当 resetKey 相对上一次渲染发生变化时重置，避免 useEffect 晚于 mouseenter 把 draft 清空 */
  const resetKeyRef = useRef(resetKey);
  /** 本次进入编辑后是否要在 layout 阶段 focus（悬停 false，点击/tap true） */
  const focusAfterOpenRef = useRef(false);
  /** 因鼠标离开退出预览时跳过 blur 提交，并避免卸载 Input 触发误提交 */
  const closingWithoutCommitRef = useRef(false);

  const {
    onBlur: inputOnBlur,
    onKeyDown: inputOnKeyDown,
    onKeyUp: inputOnKeyUp,
    onChange: inputPropOnChange,
    style: inputStyle,
    ...restInputProps
  } = inputProps ?? {};

  const startEdit = useCallback(
    (withFocus: boolean) => {
      if (disabled || editing) return;
      closingWithoutCommitRef.current = false;
      setDraft(editInitialValue);
      setEditing(true);
      focusAfterOpenRef.current = withFocus;
    },
    [disabled, editing, editInitialValue],
  );

  useLayoutEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setEditing(false);
      setDraft('');
    }
  }, [resetKey]);

  useLayoutEffect(() => {
    if (!editing || !focusAfterOpenRef.current) return;
    focusAfterOpenRef.current = false;
    inputRef.current?.focus?.();
  }, [editing]);

  const finishEdit = useCallback(() => {
    if (!editing) return;
    const v = draft.trim();
    setEditing(false);
    onCommit?.(v);
  }, [editing, draft, onCommit]);

  const handleMouseEnter = useCallback(() => {
    if (!disabled) startEdit(false);
  }, [disabled, startEdit]);

  const handleMouseLeave = useCallback(() => {
    if (disabled || !editing) return;
    const el = inputRef.current?.input ?? null;
    if (document.activeElement === el) return;
    closingWithoutCommitRef.current = true;
    setEditing(false);
  }, [disabled, editing]);

  const handleWrapperClick = useCallback(() => {
    if (disabled) return;
    if (!editing) startEdit(true);
    else inputRef.current?.focus?.();
  }, [disabled, editing, startEdit]);

  return (
    <div
      className={className}
      style={{ display: 'block', ...style }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleWrapperClick}
      role="presentation"
    >
      {editing ? (
        <Input
          ref={inputRef}
          {...restInputProps}
          style={{ width: '100%', ...inputStyle }}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            onChange?.(v);
            inputPropOnChange?.(e);
          }}
          onBlur={(e) => {
            if (closingWithoutCommitRef.current) {
              closingWithoutCommitRef.current = false;
              inputOnBlur?.(e);
              return;
            }
            finishEdit();
            inputOnBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              inputRef.current?.blur?.();
            }
            inputOnKeyDown?.(e);
          }}
          onKeyUp={inputOnKeyUp}
        />
      ) : (
        <Text {...textProps}>{displayText}</Text>
      )}
    </div>
  );
}
