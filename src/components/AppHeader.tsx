/**
 * 芝绘 - 顶部导航（参考 Biezhi2/web AppHeader 布局）
 * 见功能文档 2、开发计划 2.2；设置以 Modal 打开（见 docs/配置订阅使用.md）
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SoundOutlined } from '@ant-design/icons';
import { useConfigModal } from '@/contexts/ConfigContext';
import './AppHeader.css';

const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openConfigModal } = useConfigModal();
  const isProjectEditor = location.pathname.startsWith('/project/');
  const isImageEditor = location.pathname === '/image-editor';
  const isScreenwriterDraw = location.pathname === '/screenwriter/draw';
  const isScreenwriterNovelWorkspace = /^\/screenwriter\/novel\/[^/]+$/.test(location.pathname);
  const isAudiobookNovelWorkspace = /^\/audiobook\/novel\/[^/]+$/.test(location.pathname);
  const isMusicDesign = location.pathname === '/music-design';
  const isAudioRecorder = location.pathname === '/audio-recorder';
  if (
    isProjectEditor ||
    isImageEditor ||
    isScreenwriterDraw ||
    isScreenwriterNovelWorkspace ||
    isAudiobookNovelWorkspace ||
    isMusicDesign ||
    isAudioRecorder
  ) {
    return null;
  }

  return (
    <div className="yiman-header">
      <div className="yiman-header-inner">
        <div
          className="yiman-header-brand"
        >
          <img className="yiman-header-logo" src="/logo.png" alt="芝绘" />
          <span className="yiman-header-title">芝绘</span>
        </div>
        <nav className="yiman-header-menu">
          <a
            className={`yiman-header-link ${location.pathname.startsWith('/screenwriter') ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/screenwriter');
            }}
          >
            <span className="yiman-header-icon">
              <svg className="font-svg-icon" aria-hidden="true">
                <use xlinkHref="#icon-notebook"></use>
              </svg>
            </span>
            <span className="yiman-header-label">小说</span>
          </a>
          <a
            className={`yiman-header-link ${location.pathname === '/' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <span className="yiman-header-icon">
              <svg className="font-svg-icon" aria-hidden="true">
                <use xlinkHref="#icon-tv"></use>
              </svg>
            </span>
            <span className="yiman-header-label">漫剧</span>
          </a>
          <a
            className={`yiman-header-link ${location.pathname.startsWith('/audiobook') ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/audiobook');
            }}
          >
            <span className="yiman-header-icon">
              <svg className="font-svg-icon" aria-hidden="true">
                <use xlinkHref="#icon-microphone"></use>
              </svg>
            </span>
            <span className="yiman-header-label">有声书</span>
          </a>
          <a
            className={`yiman-header-link ${location.pathname.startsWith('/toolbox') ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/toolbox');
            }}
          >
            <span className="yiman-header-icon">
              <svg className="font-svg-icon" aria-hidden="true">
                <use xlinkHref="#icon-helmet"></use>
              </svg>
            </span>
            <span className="yiman-header-label">工具</span>
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
              <svg className="font-svg-icon" aria-hidden="true">
                <use xlinkHref="#icon-setting"></use>
              </svg>
            </span>
            <span className="yiman-header-label">设置</span>
          </a>
        </nav>
      </div>
    </div>
  );
};

export default AppHeader;
