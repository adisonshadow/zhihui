/**
 * 内联可编辑标题：header 中始终显示输入框
 */
import React from 'react';
import { Input } from 'antd';

export interface EditableTitleProps {
  /** 当前值 */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
  /** 占位符 */
  placeholder?: string;
  /** 前缀文案，如「编辑元件组：」 */
  prefix?: string;
  /** Input 的 style */
  inputStyle?: React.CSSProperties;
}

export function EditableTitle({ value, onChange, placeholder = '未命名', prefix, inputStyle }: EditableTitleProps) {
  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed !== value) onChange(trimmed);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {prefix}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        style={{ width: 140, fontSize: 16, ...inputStyle }}
      />
    </span>
  );
}
