/**
 * 编剧：小说列表（布局参考漫剧项目列表，数据存 localStorage）
 */
import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Row,
  Col,
  Button,
  Space,
  Input,
  Modal,
  Form,
  Table,
  Tag,
  Empty,
  Image as AntImage,
  Select,
  ConfigProvider,
} from 'antd';
import type { RadioChangeEvent } from 'antd/es/radio';
import {
  PlusOutlined,
  ImportOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Radio } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { loadNovelList, saveNovelList } from '@/novelDesign/storage/novelListStorage';
import './ScreenwriterListPage.css';

const { Search } = Input;

type SortBy = 'updated_at' | 'created_at' | 'title';

/** 占位封面（无图时） */
function NovelCover({ src, title }: { src?: string | null; title: string }) {
  const base = (
    <div
      aria-hidden
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 8,
        background: 'linear-gradient(145deg, rgba(80,100,140,0.55), rgba(35,42,62,0.92))',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    />
  );
  if (!src?.trim()) return base;
  return (
    <AntImage
      src={src}
      alt={title}
      style={{
        width: '100%',
        aspectRatio: '3 / 4',
        borderRadius: 8,
        objectFit: 'cover',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
      preview={{ mask: '预览' }}
      fallback=""
    />
  );
}

export default function ScreenwriterListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [novels, setNovels] = useState<NovelWorkspaceItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updated_at');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm<{ title: string; genres: string[] }>();

  useEffect(() => {
    setNovels(loadNovelList());
  }, []);

  const filteredSorted = useMemo(() => {
    let list = [...novels];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.genres.some((g) => g.toLowerCase().includes(q))
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

  const openNovel = (n: NovelWorkspaceItem) => navigate(`/screenwriter/novel/${n.id}`);

  const onCreate = (v: { title: string; genres: string[] }) => {
    const title = (v.title ?? '').trim() || '未命名小说';
    const id = `novel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const item: NovelWorkspaceItem = {
      id,
      title,
      genres: Array.isArray(v.genres) ? v.genres.slice(0, 8) : [],
      coverDataUrl: null,
      updatedAt: now,
      createdAt: now,
    };
    saveNovelList([item, ...loadNovelList()]);
    setNovels(loadNovelList());
    setCreateOpen(false);
    form.resetFields();
    navigate(`/screenwriter/novel/${id}`);
  };

  const parseImportFile = (file: File): Promise<NovelWorkspaceItem[] | null> =>
    new Promise((resolve) => {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const txt = String(rd.result ?? '');
          const parsed = JSON.parse(txt) as unknown;
          const arr = Array.isArray(parsed) ? parsed : (parsed as { novels?: unknown })?.novels;
          if (!Array.isArray(arr)) {
            resolve(null);
            return;
          }
          const out: NovelWorkspaceItem[] = [];
          for (const x of arr) {
            if (!x || typeof x !== 'object') continue;
            const o = x as Record<string, unknown>;
            if (typeof o.id !== 'string' || typeof o.title !== 'string') continue;
            out.push({
              id: o.id,
              title: o.title,
              genres: Array.isArray(o.genres) ? o.genres.filter((g) => typeof g === 'string') : [],
              coverDataUrl: typeof o.coverDataUrl === 'string' ? o.coverDataUrl : null,
              updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
              createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
            });
          }
          resolve(out);
        } catch {
          resolve(null);
        }
      };
      rd.onerror = () => resolve(null);
      rd.readAsText(file);
    });

  const onImportPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const list = await parseImportFile(f);
    if (!list?.length) {
      message.error('无法解析 JSON，需要为数组或 { novels: [...] }');
      return;
    }
    const seen = new Map<string, NovelWorkspaceItem>();
    loadNovelList().forEach((n) => seen.set(n.id, n));
    list.forEach((n) => seen.set(n.id, n));
    const next = [...seen.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    saveNovelList(next);
    setNovels(next);
    message.success(`已合并 ${list.length} 条草稿`);
    setImportOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
        src="/medias/touch_my_face.mp4" // grok-052.mp4   // grok-05239329-8e2.mp4
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
              <Space>
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate('/screenwriter/draw')}>
                  AI抽卡
                </Button>
                <Button
                  styles={{
                    root: {
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    },
                  }}
                  icon={<PlusOutlined />}
                  onClick={() => {
                    form.setFieldsValue({ title: '', genres: [] });
                    setCreateOpen(true);
                  }}
                >
                  手工新建
                </Button>
                <Button
                  styles={{
                    root: {
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    },
                  }}
                  icon={<ImportOutlined />}
                  onClick={() => setImportOpen(true)}
                >
                  导入
                </Button>
              </Space>
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
                  styles={{
                    button: {
                      root: { backgroundColor: 'rgba(255,255,255,0.1)' },
                    },
                  }}
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
          <Row gutter={[16, 16]} className='screenwriter-list-cards'>
            {filteredSorted.map((n) => (
              <Col key={n.id} xs={24} sm={12} md={8} lg={6}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNovel(n)}
                  onKeyDown={(ev) => ev.key === 'Enter' && openNovel(n)}
                  style={{
                    borderRadius: 10,
                    padding: 12,
                    background: 'rgba(30,30,30,0.75)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <NovelCover src={n.coverDataUrl} title={n.title} />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
                      {n.title}
                    </div>
                    <Space size={[4, 4]} wrap>
                      {n.genres.length ?
                        n.genres.map((g) => (
                          <Tag key={g} color="blue" style={{ margin: 0 }}>
                            {g}
                          </Tag>
                        )) :
                        <Tag style={{ margin: 0 }}>未设置题材</Tag>}
                    </Space>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
                      更新 {n.updatedAt ? new Date(n.updatedAt).toLocaleString('zh-CN') : '-'}
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : (
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  /* 这里是你的组件 token */
                  borderColor: 'rgba(255,255,255,0.1)',
                  colorBgContainer: 'transparent',
                  rowHoverBg: 'rgba(0, 0, 0, 0.25)',
                },
              },
            }}
          >
            <Table<NovelWorkspaceItem>
              dataSource={filteredSorted}
              className='screenwriter-list-table'
              rowKey="id"
              pagination={false}
              showHeader={false}
              // virtual={true}
              locale={{ emptyText: <Empty description="暂无小说项目，请创建。建议从「AI抽卡」开始创作。" /> }}
              columns={[
                {
                  title: '封面',
                  key: 'cover',
                  width: 96,
                  render: (_, n) => (
                    <div style={{ width: 56 }}>
                      <NovelCover src={n.coverDataUrl} title={n.title} />
                    </div>
                  ),
                },
                {
                  title: '小说名',
                  dataIndex: 'title',
                  ellipsis: true,
                  render: (t: string, n: NovelWorkspaceItem) => (
                    <a href={`/screenwriter/novel/${n.id}`} onClick={(e) => { e.preventDefault(); openNovel(n); }}>
                      {t}
                    </a>
                  ),
                },
                {
                  title: '题材类型',
                  dataIndex: 'genres',
                  width: 220,
                  ellipsis: true,
                  render: (gens: string[]) =>
                    gens?.length ?
                      <Space wrap size={[4, 4]}>{gens.map((g) => <Tag key={g}>{g}</Tag>)}</Space> :
                      '—',
                },
                {
                  title: '最后更新',
                  dataIndex: 'updatedAt',
                  width: 176,
                  render: (x: string) => (x ? new Date(x).toLocaleString('zh-CN') : '-'),
                },
              ]}
              styles={{
                root: {
                  // height: 'calc(100vh - 78px - 2 * 24px - 2 * 32px)',
                  // overflow: 'auto',
                  // backgroundColor: 'transparent',
                },
                content: {
                  // backgroundColor: 'transparent',
                },
                body: {
                  
                  wrapper:{
                    // backgroundColor: 'transparent',
                  },
                  row: {
                    // backgroundColor: 'red',
                  }

                },
              }}
            />
          </ConfigProvider>
        )}

        {viewMode === 'card' && filteredSorted.length === 0 && (
          <Empty style={{ marginTop: 48 }} description="暂无小说，可「手工新建」或试试「AI抽卡」" />
        )}

        <Modal
          title="新建小说"
          open={createOpen}
          onCancel={() => {
            setCreateOpen(false);
            form.resetFields();
          }}
          onOk={() => form.submit()}
          okText="创建"
          destroyOnHidden
        >
          <Form form={form} layout="vertical" onFinish={onCreate}>
            <Form.Item name="title" label="书名" rules={[{ required: true, message: '请输入书名' }]}>
              <Input placeholder="书名" />
            </Form.Item>
            <Form.Item name="genres" label="题材标签（回车分隔）">
              <Select mode="tags" placeholder="玄幻、都市……" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="导入小说草稿"
          open={importOpen}
          footer={[
            <Button key="cancel" onClick={() => setImportOpen(false)}>
              取消
            </Button>,
            <label key="pick" style={{ cursor: 'pointer', marginInlineStart: 8 }}>
              <span className="ant-btn ant-btn-default">选择 JSON 文件</span>
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={onImportPick}
              />
            </label>,
          ]}
          destroyOnHidden
          onCancel={() => setImportOpen(false)}
        >
          <p style={{ color: 'rgba(255,255,255,0.72)' }}>
            JSON 应为 NovelWorkspaceItem 数组或带 novels 字段的对象；条目按 id 合并进本地列表。
          </p>
        </Modal>
      </div>
    </div>
  );
}
