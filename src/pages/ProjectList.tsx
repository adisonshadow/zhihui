/**
 * 漫剧项目列表页（见功能文档 2、开发计划 2.2）
 * 布局参考 Biezhi2/web WorkflowList：工具栏 + 卡片/表格 + 新建/删除/打开
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  App,
  Row,
  Col,
  Input,
  Button,
  Space,
  Select,
  Modal,
  Form,
  Radio,
  Table,
  Tag,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  ImportOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ProjectCard from '@/components/ProjectCard';
import type { ProjectItem } from '@/types/project';

const { Search } = Input;

type SortBy = 'updated_at' | 'created_at' | 'name';

/** 目录选择器（Space.Compact，供 Form.Item 绑定 value/onChange；支持手工输入或点击按钮选择） */
function DirPicker({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="输入路径或点击右侧按钮选择项目存放目录"
        style={{ flex: 1 }}
      />
      <Button
        type="primary"
        icon={<FolderOpenOutlined />}
        onClick={async () => {
          const dir = await window.yiman?.dialog?.openDirectory();
          if (dir) onChange?.(dir);
        }}
      >
        选择目录
      </Button>
    </Space.Compact>
  );
}

const ProjectList: React.FC = () => {
  const { message } = App.useApp();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [pathValids, setPathValids] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updated_at');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; project: ProjectItem | null }>({
    open: false,
    project: null,
  });
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const navigate = useNavigate();

  const loadProjects = async () => {
    if (!window.yiman?.projects) return;
    setLoading(true);
    try {
      const list = await window.yiman.projects.list();
      setProjects(list);
      const next: Record<string, boolean> = {};
      if (window.yiman?.fs) {
        await Promise.all(
          list.map(async (p) => {
            next[p.id] = await window.yiman!.fs.pathExists(p.project_dir);
          })
        );
        setPathValids(next);
      } else {
        list.forEach((p) => (next[p.id] = true));
        setPathValids(next);
      }
    } catch (e: unknown) {
      message.error('加载项目列表失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredAndSorted = useMemo(() => {
    let list = [...projects];
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.project_dir.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'updated_at':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
    return list;
  }, [projects, searchText, sortBy]);

  const handleCreate = async (values: { name: string; landscape: number; project_dir: string }) => {
    if (!window.yiman?.projects?.create) return;
    const dir = values.project_dir?.trim();
    if (!dir) {
      message.warning('请输入或选择项目目录');
      return;
    }
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await window.yiman.projects.create({
      id,
      name: values.name.trim() || '未命名项目',
      landscape: values.landscape ?? 1,
      project_dir: dir,
      cover_path: null,
    });
    if (res.ok) {
      message.success('项目已创建');
      setCreateModalVisible(false);
      form.resetFields();
      loadProjects();
      navigate(`/project/${id}`);
    } else {
      message.error(res.error || '创建失败');
    }
  };

  /** 导入项目：选择已有项目目录，解析 project.db 后加入列表（见功能文档 2） */
  const handleImport = async (values: { project_dir: string }) => {
    const dir = values.project_dir?.trim();
    if (!dir) {
      message.warning('请选择项目目录');
      return;
    }
    if (!window.yiman?.projects) return;
    const res = await window.yiman.projects.import(dir);
    if (res.ok && res.id) {
      message.success('导入成功');
      setImportModalVisible(false);
      importForm.resetFields();
      loadProjects();
      navigate(`/project/${res.id}`);
    } else {
      message.error(res?.error || '无法解析 project.db，导入失败');
    }
  };

  const handleDelete = (project: ProjectItem) => {
    setDeleteModal({ open: true, project });
  };

  const doDelete = async (deleteOnDisk: boolean) => {
    const p = deleteModal.project;
    if (!p || !window.yiman?.projects?.delete) return;
    const res = await window.yiman.projects.delete(p.id, deleteOnDisk);
    setDeleteModal({ open: false, project: null });
    if (res.ok) {
      message.success(deleteOnDisk ? '已删除项目及本地目录' : '已从列表移除');
      loadProjects();
    } else message.error(res.error || '操作失败');
  };

  const handleOpen = (project: ProjectItem) => {
    navigate(`/project/${project.id}`);
  };

  return (
    <div>
      {/* 工具栏：参考 Biezhi2 WorkflowList */}
      <div style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                新建
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
                导入
              </Button>
            </Space>
          </Col>
          <Col>
            <Space>
              <Search
                placeholder="搜索项目名称或路径"
                allowClear
                style={{ width: 220 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={(v) => setSearchText(v)}
              />
              <Select<SortBy>
                placeholder="排序"
                style={{ width: 120 }}
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: 'updated_at', label: '修改时间' },
                  { value: 'created_at', label: '创建时间' },
                  { value: 'name', label: '名称' },
                ]}
              />
              <Radio.Group
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
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

      {/* 列表 */}
      {viewMode === 'card' ? (
        <Row gutter={[16, 16]}>
          {filteredAndSorted.map((project) => (
            <Col key={project.id} xs={24} sm={12} md={8} lg={6}>
              <ProjectCard
                project={project}
                pathValid={pathValids[project.id] ?? true}
                onOpen={() => handleOpen(project)}
                onDelete={() => handleDelete(project)}
                onOpenFolder={async () => {
                  const err = await window.yiman?.shell?.openPath?.(project.project_dir);
                  if (err) message.error(err || '无法打开目录');
                }}
              />
            </Col>
          ))}
        </Row>
      ) : (
        <Table<ProjectItem>
          dataSource={filteredAndSorted}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无项目" /> }}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              key: 'name',
              width: 180,
              ellipsis: true,
              render: (text: string, record: ProjectItem) => (
                <a onClick={() => handleOpen(record)} style={{ cursor: 'pointer' }}>
                  {text}
                </a>
              ),
            },
            {
              title: '横竖屏',
              dataIndex: 'landscape',
              key: 'landscape',
              width: 80,
              render: (v: number) => (v ? <Tag color="blue">横屏</Tag> : <Tag color="green">竖屏</Tag>),
            },
            {
              title: '项目目录',
              dataIndex: 'project_dir',
              key: 'project_dir',
              ellipsis: true,
              render: (text: string, record: ProjectItem) => (
                <span>
                  {text}
                  {pathValids[record.id] === false && (
                    <Tag color="error" style={{ marginLeft: 8 }}>路径无效</Tag>
                  )}
                </span>
              ),
            },
            {
              title: '更新时间',
              dataIndex: 'updated_at',
              key: 'updated_at',
              width: 160,
              render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
            },
            {
              title: '操作',
              key: 'action',
              width: 160,
              fixed: 'right',
              render: (_: unknown, record: ProjectItem) => (
                <Space size="small">
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleOpen(record)}
                  >
                    打开
                  </Button>
                  <Button
                    type="link"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record)}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      )}

      {viewMode === 'card' && filteredAndSorted.length === 0 && !loading && (
        <Empty
          style={{ marginTop: 48 }}
          description="暂无漫剧项目，点击「新建项目」创建"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}

      {/* 删除确认弹窗（见功能文档 2.3：仅移除 / 同时删除本地目录） */}
      <Modal
        title="删除项目"
        open={deleteModal.open}
        onCancel={() => setDeleteModal({ open: false, project: null })}
        footer={[
          <Button key="cancel" onClick={() => setDeleteModal({ open: false, project: null })}>
            取消
          </Button>,
          <Button key="remove" onClick={() => doDelete(false)}>
            仅从列表移除
          </Button>,
          <Button key="disk" danger onClick={() => doDelete(true)}>
            同时删除本地目录
          </Button>,
        ]}
      >
        {deleteModal.project && (
          <p>确定要删除「{deleteModal.project.name}」吗？可选择仅从列表移除，或同时删除本地项目目录及资源。</p>
        )}
      </Modal>

      {/* 新建项目弹窗（见功能文档 2.2） */}
      <Modal
        title="新建项目"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="创建"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ landscape: 1 }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入漫剧项目名称" />
          </Form.Item>
          <Form.Item
            name="landscape"
            label="画布方向"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value={1}>横屏</Radio>
              <Radio value={0}>竖屏</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="project_dir"
            label="本地项目目录"
            rules={[{ required: true, message: '请输入或选择项目目录' }]}
          >
            <DirPicker />
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入项目弹窗：选择已有项目目录，解析 project.db 后加入列表（见功能文档 2） */}
      <Modal
        title="导入项目"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false);
          importForm.resetFields();
        }}
        onOk={() => importForm.submit()}
        okText="导入"
      >
        <Form
          form={importForm}
          layout="vertical"
          onFinish={handleImport}
        >
          <Form.Item
            name="project_dir"
            label="项目目录"
            rules={[{ required: true, message: '请选择项目目录' }]}
          >
            <DirPicker />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectList;
