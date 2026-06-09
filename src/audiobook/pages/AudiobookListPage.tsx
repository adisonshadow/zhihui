/**
 * 有声书：已开通有声书的小说列表（无创建入口，须从小说编剧详情开通）
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Row,
  Col,
  Space,
  Input,
  Table,
  Tag,
  Empty,
  Image as AntImage,
  ConfigProvider,
} from 'antd';
import type { RadioChangeEvent } from 'antd/es/radio';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Radio } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { loadNovelList } from '@/novelDesign/storage/novelListStorage';
import { NovelListCardMoreActions } from '@/novelDesign/components/NovelListCardMoreActions';
import { resolveNovelCoverForDisplay } from '@/novelDesign/utils/novelCoverImageCache';
import { ProjectCard } from '@/components/ProjectCard';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import './AudiobookListPage.css';

const { Search } = Input;

type SortBy = 'updated_at' | 'created_at' | 'title';

export default function AudiobookListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = useConfigSubscribe();
  const bgVideo = config?.audiobookBgVideo ?? config?.novelBgVideo;
  const [novels, setNovels] = useState<NovelWorkspaceItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updated_at');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [coverDisplayById, setCoverDisplayById] = useState<Record<string, string>>({});

  const refreshList = () => setNovels(loadNovelList().filter((n) => n.audiobookEnabled));

  useEffect(() => {
    refreshList();
  }, [location.key]);

  useEffect(() => {
    let cancelled = false;
    const list = novels;
    if (!list.length) {
      setCoverDisplayById({});
      return;
    }
    void (async () => {
      const entries = await Promise.all(
        list.map(async (n) => {
          if (!n.coverDataUrl?.trim()) return [n.id, ''] as const;
          const url = await resolveNovelCoverForDisplay(n.coverDataUrl, {
            novelId: n.id,
            persistIfCached: true,
          });
          return [n.id, url ?? ''] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setCoverDisplayById(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [novels]);

  const coverUrlForNovel = (n: NovelWorkspaceItem): string | undefined => {
    const resolved = coverDisplayById[n.id];
    if (resolved) return resolved;
    const raw = n.coverDataUrl?.trim();
    if (!raw) return undefined;
    if (raw.startsWith('file://') || raw.startsWith('data:')) return raw;
    return undefined;
  };

  const filteredSorted = useMemo(() => {
    let list = [...novels];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.genres.some((g) => g.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_at':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated_at':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
    return list;
  }, [novels, searchText, sortBy]);

  return (
    <div style={{ position: 'relative' }}>
      {bgVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          key={bgVideo}
          src={`/medias/${bgVideo}`}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 24 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                有声书项目须先在「小说编剧」工作台详情页创建
              </span>
            </Col>
            <Col>
              <Space>
                <Search
                  placeholder="搜索小说名或题材"
                  allowClear
                  value={searchText}
                  onChange={(ev) => setSearchText(ev.target.value)}
                  onSearch={(v) => setSearchText(v)}
                  style={{ width: 220, backdropFilter: 'blur(10px)' }}
                />
                <Radio.Group
                  style={{ backdropFilter: 'blur(10px)' }}
                  value={sortBy}
                  onChange={(ev: RadioChangeEvent) => setSortBy(ev.target.value)}
                  buttonStyle="solid"
                  optionType="button"
                  options={[
                    { value: 'updated_at', label: '修改时间' },
                    { value: 'created_at', label: '创建时间' },
                    { value: 'title', label: '名称' },
                  ]}
                />
                <Radio.Group
                  style={{ backdropFilter: 'blur(10px)' }}
                  value={viewMode}
                  onChange={(ev: RadioChangeEvent) => setViewMode(ev.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { value: 'card', label: <AppstoreOutlined /> },
                    { value: 'list', label: <UnorderedListOutlined /> },
                  ]}
                />
              </Space>
            </Col>
          </Row>
        </div>

        {viewMode === 'card' ? (
          <Row gutter={[16, 16]} className="screenwriter-list-cards">
            {filteredSorted.map((n) => (
              <ProjectCard
                key={n.id}
                title={n.title}
                colProps={{ lg: 4 }}
                cover={{ url: coverUrlForNovel(n), aspect: 1 / 1 }}
                lastUpdate={n.updatedAt}
                tags={n.genres.map((g) => ({ name: g, color: 'purple' }))}
                moreActions={<NovelListCardMoreActions novel={n} onDeleted={refreshList} />}
                onClick={() => navigate(`/audiobook/novel/${n.id}`)}
              />
            ))}
          </Row>
        ) : (
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  borderColor: 'rgba(255,255,255,0.1)',
                  colorBgContainer: 'transparent',
                  rowHoverBg: 'rgba(0, 0, 0, 0.25)',
                },
              },
            }}
          >
            <Table<NovelWorkspaceItem>
              dataSource={filteredSorted}
              className="screenwriter-list-table"
              rowKey="id"
              pagination={false}
              showHeader={false}
              locale={{
                emptyText: (
                  <Empty description="暂无有声书项目，请先在小说编剧工作台创建。" />
                ),
              }}
              onRow={(n) => ({
                onClick: () => navigate(`/audiobook/novel/${n.id}`),
                style: { cursor: 'pointer' },
              })}
              columns={[
                {
                  key: 'cover',
                  width: 96,
                  render: (_, n) => (
                    <div style={{ width: 56 }}>
                      {coverUrlForNovel(n) ? (
                        <AntImage
                          src={coverUrlForNovel(n)}
                          alt={n.title}
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                            borderRadius: 8,
                            objectFit: 'cover',
                          }}
                          preview={{ mask: '预览' }}
                        />
                      ) : (
                        <div
                          aria-hidden
                          style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 8 }}
                        />
                      )}
                    </div>
                  ),
                },
                {
                  dataIndex: 'title',
                  ellipsis: true,
                },
                {
                  dataIndex: 'genres',
                  width: 220,
                  render: (gens: string[]) =>
                    gens?.length ?
                      <Space wrap size={[4, 4]}>{gens.map((g) => <Tag key={g}>{g}</Tag>)}</Space>
                    : '—',
                },
                {
                  dataIndex: 'updatedAt',
                  width: 176,
                  render: (x: string) => (x ? new Date(x).toLocaleString('zh-CN') : '-'),
                },
              ]}
            />
          </ConfigProvider>
        )}

        {viewMode === 'card' && filteredSorted.length === 0 && (
          <Empty
            style={{ marginTop: 48 }}
            description="暂无有声书项目，请先在小说编剧工作台详情页点击「创建有声书项目」"
          />
        )}
      </div>
    </div>
  );
}
