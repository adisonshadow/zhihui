import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Flex, Input, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import { AdaptiveModal } from '@/components/antd-plus/AdaptiveModal';
import {
  loadScreenwriterFavorites,
  removeScreenwriterFavorite,
  searchScreenwriterFavorites,
  stripTrailingDrawBriefAppendix,
  type ScreenwriterFavoriteStory,
} from '../storage/screenwriterFavoriteStorage';
import {
  loadScreenwriterOutlineFavorites,
  removeScreenwriterOutlineFavorite,
  searchScreenwriterOutlineFavorites,
  type ScreenwriterFavoriteOutline,
} from '../storage/screenwriterOutlineFavoriteStorage';
import { ScreenwriterAssistantMarkdown } from './ScreenwriterAssistantMarkdown';
import { buildGenerateOutlinePrompt, buildRegenerateOutlinePrompt } from './ScreenwriterStoryToolPanel';

const { Text, Title, Paragraph } = Typography;

type FavoriteRow =
  | { kind: 'story'; item: ScreenwriterFavoriteStory }
  | { kind: 'outline'; item: ScreenwriterFavoriteOutline };

function rowKey(row: FavoriteRow): string {
  return row.kind === 'story' ? `s:${row.item.id}` : `o:${row.item.id}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function loadMergedRows(query: string): FavoriteRow[] {
  const stories = query.trim() ? searchScreenwriterFavorites(query) : loadScreenwriterFavorites();
  const outlines = query.trim() ? searchScreenwriterOutlineFavorites(query) : loadScreenwriterOutlineFavorites();
  const rows: FavoriteRow[] = [
    ...stories.map((item): FavoriteRow => ({ kind: 'story', item })),
    ...outlines.map((item): FavoriteRow => ({ kind: 'outline', item })),
  ];
  rows.sort(
    (a, b) => new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime()
  );
  return rows;
}

export interface ScreenwriterFavoritesModalProps {
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  onGenerateOutline: (prompt: string) => void;
}

export function ScreenwriterFavoritesModal({
  open,
  onClose,
  refreshKey,
  onGenerateOutline,
}: ScreenwriterFavoritesModalProps) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<FavoriteRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = loadMergedRows(query);
    setRows(next);
    setActiveKey((prev) => {
      if (next.length === 0) return null;
      if (prev && next.some((row) => rowKey(row) === prev)) return prev;
      return rowKey(next[0]);
    });
  }, [open, query, refreshKey]);

  const activeRow = useMemo(
    () => rows.find((row) => rowKey(row) === activeKey) ?? null,
    [rows, activeKey]
  );

  const handleDeleteActive = () => {
    if (!activeRow) return;
    if (activeRow.kind === 'story') {
      removeScreenwriterFavorite(activeRow.item.id);
    } else {
      removeScreenwriterOutlineFavorite(activeRow.item.id);
    }
    const nextRows = loadMergedRows(query);
    setRows(nextRows);
    setActiveKey(nextRows[0] ? rowKey(nextRows[0]) : null);
  };

  return (
    <AdaptiveModal
      title="我的收藏"
      open={open}
      onCancel={onClose}
      footer={null}
      fullScreen
      bodyScrollY
      destroyOnHidden
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
    >
      <Flex style={{ height: '100%', minHeight: 0, background: '#141414' }}>
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索小说雏形与大纲收藏"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {rows.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无收藏" />
            ) : (
              rows.map((row) => {
                const k = rowKey(row);
                const activeItem = k === activeKey;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveKey(k)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'rgba(255,255,255,0.86)',
                      background: activeItem ? 'rgba(22,119,255,0.24)' : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <Flex justify="space-between" gap={8} align="center">
                      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
                        <Tag color={row.kind === 'outline' ? 'geekblue' : 'cyan'} style={{ flexShrink: 0 }}>
                          {row.kind === 'outline' ? '大纲' : '雏形'}
                        </Tag>
                        <Text
                          style={{
                            color: 'inherit',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                          title={
                            row.kind === 'story'
                              ? row.item.title
                              : `${row.item.panel.storyName || row.item.panel.summary || row.item.title}`
                          }
                        >
                          {(row.kind === 'story'
                            ? row.item.title
                            : row.item.panel.storyName || row.item.panel.summary || row.item.title
                          ).slice(0, 56)}
                        </Text>
                      </Flex>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, flexShrink: 0 }}>
                        {formatTime(row.item.createdAt)}
                      </Text>
                    </Flex>
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', padding: 24 }}>
          {!activeRow ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一个收藏" />
          ) : activeRow.kind === 'story' ? (
            <Flex vertical gap={16}>
              <Flex justify="space-between" gap={16} align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Title level={4} style={{ marginTop: 0, color: 'rgba(255,255,255,0.92)' }}>
                    {activeRow.item.title}
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.45)' }}>
                    收藏时间：{formatTime(activeRow.item.createdAt)}
                  </Text>
                </div>
                <Space>
                  <Button icon={<DeleteOutlined />} onClick={handleDeleteActive}>
                    删除
                  </Button>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                      onGenerateOutline(
                        buildGenerateOutlinePrompt(
                          stripTrailingDrawBriefAppendix(activeRow.item.content)
                        )
                      );
                      onClose();
                    }}
                  >
                    生成大纲
                  </Button>
                </Space>
              </Flex>
              <Paragraph
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'rgba(255,255,255,0.86)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                {activeRow.item.content}
              </Paragraph>
            </Flex>
          ) : (
            <Flex vertical gap={16}>
              <Flex justify="space-between" gap={16} align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Title level={4} style={{ marginTop: 0, color: 'rgba(255,255,255,0.92)' }}>
                    {activeRow.item.title}
                  </Title>
                  {activeRow.item.panel.storyName ? (
                    <Text style={{ color: 'rgba(255,255,255,0.65)', display: 'block', marginBottom: 4 }}>
                      故事名称：{activeRow.item.panel.storyName}
                    </Text>
                  ) : null}
                  <Text style={{ color: 'rgba(255,255,255,0.45)', display: 'block' }}>
                    大纲来源：{activeRow.item.panel.source}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', marginTop: 4, display: 'block' }}>
                    收藏时间：{formatTime(activeRow.item.createdAt)}
                  </Text>
                </div>
                <Space>
                  <Button icon={<DeleteOutlined />} onClick={handleDeleteActive}>
                    删除
                  </Button>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                      onGenerateOutline(buildRegenerateOutlinePrompt(activeRow.item.prose));
                      onClose();
                    }}
                  >
                    重新生成大纲
                  </Button>
                </Space>
              </Flex>
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: 16,
                }}
                className="screenwriter-assistant-md"
              >
                <Paragraph style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>大纲正文（Markdown）</Paragraph>
                <ScreenwriterAssistantMarkdown content={activeRow.item.prose} streaming={false} />
              </div>
              {activeRow.item.favoriteAppendix?.trim() ? (
                <Paragraph
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: 'rgba(255,255,255,0.72)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 0,
                  }}
                >
                  {activeRow.item.favoriteAppendix.trim()}
                </Paragraph>
              ) : null}
            </Flex>
          )}
        </main>
      </Flex>
    </AdaptiveModal>
  );
}
