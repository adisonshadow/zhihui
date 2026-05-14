/**
 * 项目/小说卡片 —— 统一的列表卡片组件
 *
 * Props: title, cover (url + aspect), lastUpdate, tags (name + color), moreActions, onClick
 */
import React from 'react';
import { Card, Col, Image, Tag, Space } from 'antd';
import { ClockCircleOutlined, FolderOutlined } from '@ant-design/icons';

export interface ProjectCardProps {
  title: string;
  cover?: { url?: string | null; aspect?: number };
  lastUpdate: string;
  tags?: Array<{ name: string; color?: string }>;
  moreActions?: React.ReactNode;
  onClick: () => void;
}

export function ProjectCard({
  title,
  cover,
  lastUpdate,
  tags,
  moreActions,
  onClick,
}: ProjectCardProps) {
  const aspect = cover?.aspect ?? 16 / 9;

  const coverContent = cover?.url ? (
    <Image
      src={cover.url}
      alt={title}
      style={{ width: '100%', aspectRatio: aspect, objectFit: 'cover' }}
      preview={false}
    />
  ) : (
    <div
      style={{
        width: '100%',
        aspectRatio: aspect,
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
    <Col xs={24} sm={12} md={8} lg={6}>
      <Card
        hoverable
        variant="borderless"
        onClick={onClick}
        styles={{ root: { backgroundColor: 'rgba(0, 0, 0, 0.2)' } }}
        cover={
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            {coverContent}
            {moreActions && (
              <div
                style={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                {moreActions}
              </div>
            )}
            {tags && tags.length > 0 && (
              <div
                style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Space size={[4, 4]} wrap>
                  {tags.map((t) => (
                    <Tag key={t.name} color="default" style={{ margin: 0, backgroundColor: '#111a2c4f', backdropFilter: 'blur(4px)' }}>
                      {t.name}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </div>
        }
      >
        <Card.Meta
          title={
            <span
              style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          }
          description={
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              <ClockCircleOutlined />{' '}
              {lastUpdate ? new Date(lastUpdate).toLocaleString('zh-CN') : '-'}
            </div>
          }
        />
      </Card>
    </Col>
  );
}
