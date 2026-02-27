/**
 * 视频/透明视频标签输入：Tag 组件 + 添加标签
 */
import React, { useState, useEffect, useRef } from 'react';
import { Input, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';

function parseTagsStr(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
}

export function VideoTagInput({ value = '', onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { token } = theme.useToken();
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<InputRef>(null);
  const tags = parseTagsStr(value);
  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);
  const handleClose = (removed: string) => {
    const next = tags.filter((t) => t !== removed);
    onChange?.(next.join(','));
  };
  const handleConfirm = () => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) onChange?.([...tags, v].join(','));
    setInputVisible(false);
    setInputValue('');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      {tags.map((tag) => (
        <Tag key={tag} closable onClose={(e) => { e.preventDefault(); handleClose(tag); }}>
          {tag}
        </Tag>
      ))}
      {inputVisible ? (
        <Input
          ref={inputRef}
          type="text"
          size="small"
          style={{ width: 78 }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleConfirm}
          onPressEnter={handleConfirm}
        />
      ) : (
        <Tag onClick={() => setInputVisible(true)} style={{ background: token.colorBgContainer, borderStyle: 'dashed' }}>
          <PlusOutlined /> 添加标签
        </Tag>
      )}
    </div>
  );
}
