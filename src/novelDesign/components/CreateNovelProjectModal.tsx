/**
 * 从故事大纲创建本地小说项目：选择存储路径 → projects.create（registerInAppList: false，仅小说编剧列表，不进漫剧项目库）。
 * 创建成功后可选初始化小说编写工作台并跳转 /screenwriter/novel/:novelId
 */
import { useEffect, useState } from 'react';
import { App, Modal, Form, Input, Space, Button } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { upsertNovel } from '@/novelDesign/storage/novelListStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { initWorkspaceFromOutline } from '@/novelDesign/storage/novelWorkspaceStorage';
import { loadCreationPreference } from '@/novelDesign/storage/novelCreationPreferenceStorage';

function DirPicker({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="输入路径或点击右侧按钮选择目录"
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

/** Electron 创建项目必填；此处固定为横屏占位，不向用户暴露「漫剧画布」选项。 */
const DEFAULT_LANDSCAPE = 1;

export interface OutlineBootstrapPayload {
  /** 进入编辑页置顶「故事大纲」页的 Markdown（不含末尾 JSON 块为佳） */
  outlineMarkdown?: string;
}

export interface CreateNovelProjectModalProps {
  open: boolean;
  suggestedName: string;
  outlineBootstrap?: OutlineBootstrapPayload | null;
  preferenceBlock?: string;
  onClose: () => void;
  onNavigateToNovelWorkspace?: (novelId: string) => void;
}

export function CreateNovelProjectModal({
  open,
  suggestedName,
  outlineBootstrap,
  preferenceBlock,
  onClose,
  onNavigateToNovelWorkspace,
}: CreateNovelProjectModalProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const appSettings = useConfigSubscribe();

  useEffect(() => {
    if (!open) return;
    const root = appSettings?.defaultProjectRoot?.trim() ?? '';
    const raw = suggestedName.trim() || '新小说项目';
    const cleaned = raw.replace(/\s+/g, ' ');
    form.setFieldsValue({
      name: cleaned.slice(0, 120),
      project_dir: root,
    });
  }, [open, suggestedName, appSettings?.defaultProjectRoot, form]);

  const finish = async (values: { name: string; project_dir: string }) => {
    if (!window.yiman?.projects?.create) {
      message.error('请在客户端内使用本项目功能');
      return;
    }
    const dir = values.project_dir?.trim();
    if (!dir) {
      message.warning('请输入或选择项目目录');
      return;
    }
    setSubmitting(true);
    try {
      const res = await window.yiman.projects.create({
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: values.name.trim() || '未命名小说',
        landscape: DEFAULT_LANDSCAPE,
        project_dir: dir,
        cover_path: null,
        registerInAppList: false,
      });
      if (res.ok) {
        const novelId = `novel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const displayTitle = values.name.trim() || '未命名小说';
        const now = new Date().toISOString();
        const listItem: NovelWorkspaceItem = {
          id: novelId,
          title: displayTitle,
          genres: (() => {
            const pref = loadCreationPreference();
            const tags: string[] = [];
            const contentType = pref.customContentType?.trim() || pref.contentType;
            if (contentType) tags.push(contentType);
            if (pref.genre && pref.genre !== '任意') tags.push(pref.genre);
            return tags;
          })(),
          coverDataUrl: null,
          updatedAt: now,
          createdAt: now,
        };
        upsertNovel(listItem);
        const baseMarkdown = outlineBootstrap?.outlineMarkdown?.trim() ?? '';
        const prefBlock = preferenceBlock?.trim();
        const fullOutlineMarkdown = prefBlock ? `${baseMarkdown}\n\n${prefBlock}` : baseMarkdown;
        initWorkspaceFromOutline({
          novelId,
          novelTitle: displayTitle,
          outlineMarkdown: fullOutlineMarkdown,
        });
        message.success('项目已创建');
        form.resetFields();
        onClose();
        modal.confirm({
          title: '是否进入小说编写工作台？',
          content: '本地项目已就绪，可在工作台编辑大纲与各集正文，并使用右侧 AI 辅助创作。',
          okText: '前往',
          cancelText: '留在当前页',
          onOk: () => {
            onNavigateToNovelWorkspace?.(novelId);
          },
        });
      } else {
        message.error(res.error || '创建失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="创建小说项目"
      open={open}
      onCancel={() => {
        onClose();
        form.resetFields();
      }}
      confirmLoading={submitting}
      onOk={() => form.submit()}
      okText="创建"
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical" onFinish={finish}>
        <Form.Item
          name="name"
          label="小说名称"
          rules={[{ required: true, message: '请输入小说名称' }]}
        >
          <Input placeholder="将写入项目信息与本地配置文件" />
        </Form.Item>
        <Form.Item
          name="project_dir"
          label="小说项目存储路径"
          rules={[{ required: true, message: '请选择或填写完整项目目录' }]}
          extra="所选路径将创建本地目录与 project.db（供后续若需接入设计器素材等）；仅加入「小说编剧」小说列表，不会出现在首页「漫剧项目」列表。"
        >
          <DirPicker />
        </Form.Item>
      </Form>
    </Modal>
  );
}
