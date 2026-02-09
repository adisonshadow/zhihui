/**
 * 漫剧项目卡片（参考 Biezhi2 WorkflowCard，见功能文档 2.2）
 */
import React from 'react';
import { Card, Tag, Button, Space, Image, Dropdown } from 'antd';
import { FolderOutlined, FolderOpenOutlined, ClockCircleOutlined, MoreOutlined, DeleteOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { ProjectItem } from '@/types/project';

interface ProjectCardProps {
  project: ProjectItem;
  pathValid: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onOpenFolder: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, pathValid, onOpen, onDelete, onOpenFolder }) => {
  const menuItems: MenuProps['items'] = [
    { key: 'openFolder', label: '打开项目目录', icon: <FolderOpenOutlined />, onClick: () => onOpenFolder() },
    { key: 'delete', label: '删除项目', danger: true, icon: <DeleteOutlined />, onClick: () => onDelete() },
  ];

  const coverContent = project.cover_path ? (
    <Image
      src={`file://${project.cover_path}`}
      alt={project.name}
      height={140}
      style={{ objectFit: 'cover' }}
      preview={false}
    />
  ) : (
    <div
      style={{
        height: 140,
        background: 'rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.35)',
      }}
    >
      <FolderOutlined style={{ fontSize: 48 }} />
    </div>
  );

  return (
    <Card
      hoverable
      onClick={onOpen}
      cover={
        <div style={{ position: 'relative' }}>
          {coverContent}
          {/* 左下角：横竖屏 Tag */}
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              zIndex: 1,
            }}
          >
            <Tag color={project.landscape ? 'blue' : 'green'}>
              {project.landscape ? '横屏' : '竖屏'}
            </Tag>
          </div>
          {/* 右上角：more 按钮 + Dropdown */}
          <div
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              zIndex: 1,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                icon={<MoreOutlined />}
                style={{ color: 'rgba(255,255,255,0.85)' }}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        </div>
      }
    >
      <Card.Meta
        title={
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </span>
        }
        description={
          <Space size="small" wrap orientation="vertical" style={{ width: '100%' }}>
            {!pathValid && (
              <Tag color="error">路径无效</Tag>
            )}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              <ClockCircleOutlined /> {new Date(project.updated_at).toLocaleDateString('zh-CN')}
            </div>
          </Space>
        }
      />
    </Card>
  );
};

export default ProjectCard;
