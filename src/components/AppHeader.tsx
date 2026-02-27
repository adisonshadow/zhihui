/**
 * 芝绘 - 顶部导航（参考 Biezhi2/web AppHeader 布局）
 * 见功能文档 2、开发计划 2.2；设置以 Modal 打开（见 docs/配置订阅使用.md）
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SettingOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useConfigModal } from '@/contexts/ConfigContext';
import './AppHeader.css';

const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openConfigModal } = useConfigModal();
  const isProjectEditor = location.pathname.startsWith('/project/');
  if (isProjectEditor) return null;

  return (
    <div className="yiman-header">
      <div className="yiman-header-inner">
        <div
          className="yiman-header-brand"
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
        >
          <img className="yiman-header-logo" src="/logo.png" alt="芝绘" />
          <span className="yiman-header-title">芝绘</span>
        </div>
        <nav className="yiman-header-menu">
          <a
            className={`yiman-header-link ${location.pathname === '/' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <span className="yiman-header-icon">
              <VideoCameraOutlined />
            </span>
            <span className="yiman-header-label">漫剧项目</span>
          </a>
          <a
            className={`yiman-header-link ${location.pathname === '/settings' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openConfigModal();
            }}
          >
            <span className="yiman-header-icon">
              <SettingOutlined />
            </span>
            <span className="yiman-header-label">设置</span>
          </a>
        </nav>
      </div>
    </div>
  );
};

export default AppHeader;
