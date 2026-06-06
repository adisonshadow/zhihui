/**
 * 录音列表：列出 audio-recorder 目录录音，支持选择/重命名/删除
 */
import { useCallback, useState } from 'react';
import { Button, List, Modal, Input, message, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, SoundOutlined } from '@ant-design/icons';
import type { RecordingEntry } from '../utils/audioRecorderApi';

const { Text } = Typography;

interface RecordingListProps {
  recordings: RecordingEntry[];
  selected: RecordingEntry | null;
  loading: boolean;
  onSelect: (r: RecordingEntry | null) => void;
  onDelete: (r: RecordingEntry) => Promise<boolean>;
  onRename: (r: RecordingEntry, name: string) => Promise<boolean>;
}

export function RecordingList({ recordings, selected, loading, onSelect, onDelete, onRename }: RecordingListProps) {
  const [renaming, setRenaming] = useState<RecordingEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRenameOpen = useCallback((r: RecordingEntry) => {
    setRenaming(r);
    setRenameValue(r.name.replace(/\.[^.]+$/, ''));
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      message.warning('文件名不能为空');
      return;
    }
    const ok = await onRename(renaming, trimmed);
    if (ok) message.success('已重命名');
    setRenaming(null);
  }, [renaming, renameValue, onRename]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height:30, padding: '0px 12px' }}>
        <Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>录音列表</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{recordings.length} 条</Text>
      </div>
      <List
        loading={loading}
        dataSource={recordings}
        locale={{ emptyText: '暂无录音' }}
        renderItem={(item) => (
          <List.Item
            key={item.path}
            onClick={() => onSelect(item)}
            style={{
              cursor: 'pointer',
              padding: '8px 12px',
              borderRadius: 6,
              background: selected?.path === item.path ? 'rgba(24,144,255,0.15)' : undefined,
              border: selected?.path === item.path ? '1px solid rgba(24,144,255,0.3)' : '1px solid transparent',
            }}
            actions={[
              <Button
                key="rename"
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => { e.stopPropagation(); handleRenameOpen(item); }}
              />,
              <Button
                key="delete"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  Modal.confirm({
                    title: '删除录音',
                    content: `确认删除「${item.name}」？`,
                    onOk: () => onDelete(item),
                  });
                }}
              />,
            ]}
          >
            <List.Item.Meta
              avatar={<div style={{ display: 'flex', alignItems: 'center', height: '100%' }}><SoundOutlined style={{ fontSize: 20, color: 'rgba(255,255,255,0.45)' }} /></div>}
              title={
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 500 }}>
                  {new Date(item.mtime).toLocaleString('zh-CN')}
                </span>
              }
              description={
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                  {formatSize(item.size)}
                </span>
              }
              style={{ alignItems: 'center' }}
            />
          </List.Item>
        )}
        style={{ maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
      />

      <Modal
        title="重命名录音"
        open={!!renaming}
        onOk={handleRenameConfirm}
        onCancel={() => setRenaming(null)}
        width={400}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameConfirm}
          placeholder="输入新文件名"
          autoFocus
        />
      </Modal>
    </>
  );
}
