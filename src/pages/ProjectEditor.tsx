/**
 * 项目编辑页：剧情大纲、人物设计、AI 配置、漫剧视频设计器（见功能文档 4、开发计划 2.5）
 * 默认选中的 Tab 持久化到 localStorage（见功能文档 1.1）
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Tabs, Result, Spin, Space, Typography } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, UserOutlined, SettingOutlined, VideoCameraOutlined, FolderOutlined, CommentOutlined, MenuOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useProject } from '@/hooks/useProject';
import OutlineTab from './OutlineTab';
import CharactersTab from './CharactersTab';
import AiConfigTab from './AiConfigTab';
import AssetLibraryTab from './AssetLibraryTab';
import DesignerTab from './DesignerTab';

const { Text } = Typography;

const STORAGE_KEY_TAB = 'yiman:projectEditor:activeKey';
const STORAGE_KEY_SHOW_NAV = 'yiman:designer:showNav';
const STORAGE_KEY_SHOW_CHAT = 'yiman:designer:showChat';

function getStoredTab(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY_TAB);
    if (v && ['outline', 'characters', 'ai-config', 'assets', 'designer'].includes(v)) return v;
  } catch (_) {}
  return 'outline';
}

function getStoredShowNav(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_SHOW_NAV);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch (_) {}
  return true;
}

function getStoredShowChat(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_SHOW_CHAT);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch (_) {}
  return true;
}

function getStoredCurrentEpisode(projectId: string): { id: string; title: string } | null {
  try {
    const v = localStorage.getItem(`yiman:designer:${projectId}:selectedEpisode`);
    if (!v) return null;
    const parsed = JSON.parse(v) as { id?: string; title?: string };
    if (parsed?.id) return { id: parsed.id, title: parsed.title ?? '' };
  } catch (_) {}
  return null;
}

const ProjectEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProject(id);
  const [activeKey, setActiveKey] = useState(getStoredTab);
  const [showNav, setShowNav] = useState(getStoredShowNav);
  const [showChat, setShowChat] = useState(getStoredShowChat);
  const [currentEpisode, setCurrentEpisode] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (activeKey) {
      try {
        localStorage.setItem(STORAGE_KEY_TAB, activeKey);
      } catch (_) {}
    }
  }, [activeKey]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_NAV, showNav ? '1' : '0');
    } catch (_) {}
  }, [showNav]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_CHAT, showChat ? '1' : '0');
    } catch (_) {}
  }, [showChat]);

  useEffect(() => {
    if (project?.id) setCurrentEpisode(getStoredCurrentEpisode(project.id));
  }, [project?.id]);

  const handleEpisodeChange = React.useCallback((ep: { id: string; title: string } | null) => {
    setCurrentEpisode(ep);
    if (ep && project?.id) {
      try {
        localStorage.setItem(`yiman:designer:${project.id}:selectedEpisode`, JSON.stringify(ep));
      } catch (_) {}
    }
  }, [project?.id]);

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" tip="加载项目…">
          <div style={{ minHeight: 120 }} />
        </Spin>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ padding: 24 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
          返回项目列表
        </Button>
        <Result status="warning" title="项目不存在或加载失败" subTitle={error ?? '请返回列表重新打开项目'} extra={<Button type="primary" onClick={() => navigate('/')}>返回列表</Button>} />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'outline',
      label: (
        <span>
          <FileTextOutlined /> 大纲
        </span>
      ),
      children: <OutlineTab project={project} />,
    },
    {
      key: 'characters',
      label: (
        <span>
          <UserOutlined /> 人物
        </span>
      ),
      children: <CharactersTab project={project} />,
    },
    {
      key: 'ai-config',
      label: (
        <span>
          <SettingOutlined /> AI
        </span>
      ),
      children: <AiConfigTab project={project} />,
    },
    {
      key: 'assets',
      label: (
        <span>
          <FolderOutlined /> 素材
        </span>
      ),
      children: <AssetLibraryTab project={project} />,
    },
    {
      key: 'designer',
      label: (
        <span>
          <VideoCameraOutlined /> 设计器
        </span>
      ),
      children: <DesignerTab project={project} onBack={() => navigate('/')} showNav={showNav} onShowNavChange={setShowNav} showChat={showChat} onShowChatChange={setShowChat} onEpisodeChange={handleEpisodeChange} />,
    },
  ];

  const operationsSlot: any = {
    left: <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
              项目列表
            </Button>
            <span style={{ fontWeight: 600 }}>{project.name}</span>
            {currentEpisode && <Text type="secondary">{currentEpisode.title || '未命名集'}</Text>}
          </div>,
    right: (
      <Space>
        {activeKey === 'designer' && (
          <>
            <Button type="text" icon={<PlayCircleOutlined />}>
              全集
            </Button>
            <Button
              color={showNav ? 'default' : 'cyan'}
              variant="text"
              icon={<MenuOutlined />}
              onClick={() => setShowNav(!showNav)}
            >
            </Button>
            <Button
              color={showChat ? 'default' : 'light'}
              variant="text"
              icon={<CommentOutlined />}
              onClick={() => setShowChat(!showChat)}
            >
            </Button>
          </>
        )}
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={() => navigate('/settings')}
        >
        </Button>
      </Space>
    ),
  };

  return (
    <div style={{ paddingTop: '8px' }}>
      <Tabs
        centered
        activeKey={activeKey}
        onChange={setActiveKey}
        items={tabItems}
        type="card"
        tabBarExtraContent={operationsSlot}
        styles= {{
          header: {
            margin: 0,
          },
          content: {
            backgroundColor: '#171717',
            height: 'calc(100vh - 48px)',
          }
        }}
      />
    </div>
  );
};

export default ProjectEditor;
