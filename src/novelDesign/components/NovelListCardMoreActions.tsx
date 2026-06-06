import { useState } from 'react';
import { App, Button, Dropdown, Modal } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, MoreOutlined } from '@ant-design/icons';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { deleteNovelProject, openNovelProjectDirectory } from '@/novelDesign/utils/novelProjectListActions';

export interface NovelListCardMoreActionsProps {
  novel: NovelWorkspaceItem;
  /** 删除成功后刷新列表 */
  onDeleted?: () => void;
}

/** 小说 / 有声书列表卡片右上角 more（与漫剧项目列表一致） */
export function NovelListCardMoreActions({ novel, onDeleted }: NovelListCardMoreActionsProps) {
  const { message } = App.useApp();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const doDelete = async (deleteOnDisk: boolean) => {
    setDeleteOpen(false);
    const res = await deleteNovelProject(novel, deleteOnDisk);
    if (res.ok) {
      message.success(deleteOnDisk ? '已删除项目及本地目录' : '已从列表移除');
      onDeleted?.();
    } else {
      message.error(res.error || '操作失败');
    }
  };

  return (
    <>
      <Dropdown
        menu={{
          items: [
            {
              key: 'openFolder',
              label: '打开项目目录',
              icon: <FolderOpenOutlined />,
              onClick: () => {
                void openNovelProjectDirectory(novel).catch((e) => {
                  message.error(e instanceof Error ? e.message : '无法打开目录');
                });
              },
            },
            {
              key: 'delete',
              label: '删除项目',
              danger: true,
              icon: <DeleteOutlined />,
              onClick: () => setDeleteOpen(true),
            },
          ],
        }}
        trigger={['click']}
        placement="bottomRight"
      >
        <Button type="text" icon={<MoreOutlined />} style={{ color: 'rgba(255,255,255,0.85)' }} />
      </Dropdown>

      <Modal
        title="删除项目"
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeleteOpen(false)}>
            取消
          </Button>,
          <Button key="remove" onClick={() => void doDelete(false)}>
            仅从列表移除
          </Button>,
          <Button key="disk" danger onClick={() => void doDelete(true)}>
            同时删除本地目录
          </Button>,
        ]}
        destroyOnHidden
      >
        <p>
          确定要删除「{novel.title}」吗？可选择仅从列表移除，或同时删除本地项目目录及资源。
        </p>
      </Modal>
    </>
  );
}
