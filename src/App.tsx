/**
 * 芝绘 - 根组件（见功能文档 2、开发计划 2.2）
 * 路由与布局参考 Biezhi2/web
 * 配置订阅：ConfigProvider 提供 openConfigModal、useConfigSubscribe（见 docs/配置订阅使用.md）
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import { ConfigProvider } from './contexts/ConfigContext';
import { registerAllBuiltInTools } from '@/components/AIChat/tools/builtInTools';

// 注册 orchestrator 原子 Tool（仅在运行时注册一次）
registerAllBuiltInTools();
import AppHeader from './components/AppHeader';
import ProjectList from './pages/ProjectList';
import ProjectEditor from './pages/ProjectEditor';
import Settings from './pages/Settings';
import AIChatPreview from './pages/AIChatPreview';
import LocalTtsPreview from './pages/LocalTtsPreview';
import { ImageEditorPage } from './components/imageEditor/ImageEditorPage';
import ScreenwriterListPage from './novelDesign/pages/ScreenwriterListPage';
import ScreenwriterNovelDetailPage from './novelDesign/pages/ScreenwriterNovelDetailPage';
import ScreenwriterAIDrawPage from './novelDesign/pages/ScreenwriterAIDrawPage';
import AudiobookListPage from './audiobook/pages/AudiobookListPage';
import AudiobookNovelDetailPage from './audiobook/pages/AudiobookNovelDetailPage';
import MusicDesignPage from './musicDesign/pages/MusicDesignPage';
import ToolboxListPage from './toolbox/pages/ToolboxListPage';
import AudioRecorderPage from './audioRecorder/pages/AudioRecorderPage';

const { Content } = Layout;

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <Layout style={{ minHeight: '100vh' }}>
          <AppHeader />
          <Routes>
            <Route
              path="/screenwriter/draw"
              element={
                <Content style={{ padding: 0 }}>
                  <ScreenwriterAIDrawPage />
                </Content>
              }
            />
            <Route
              path="/screenwriter/novel/:id"
              element={
                <Content style={{ padding: 0 }}>
                  <ScreenwriterNovelDetailPage />
                </Content>
              }
            />
            <Route
              path="/screenwriter"
              element={
                <Content style={{ padding: '0px 24px' }}>
                  <ScreenwriterListPage />
                </Content>
              }
            />
            <Route
              path="/audiobook/novel/:id"
              element={
                <Content style={{ padding: 0 }}>
                  <AudiobookNovelDetailPage />
                </Content>
              }
            />
            <Route
              path="/audiobook"
              element={
                <Content style={{ padding: '0px 24px' }}>
                  <AudiobookListPage />
                </Content>
              }
            />
            <Route path="/music-design" element={<Content style={{ padding: 0 }}><MusicDesignPage /></Content>} />
            <Route path="/toolbox" element={<Content style={{ padding: '0px 24px' }}><ToolboxListPage /></Content>} />
            <Route path="/audio-recorder" element={<Content style={{ padding: 0 }}><AudioRecorderPage /></Content>} />
            <Route path="/" element={<Content style={{ padding: '0px 24px' }}><ProjectList /></Content>} />
            <Route path="/project/:id" element={<Content style={{ padding: '0px' }}><ProjectEditor /></Content>} />
            <Route path="/settings" element={<Content style={{ padding: '24px' }}><Settings /></Content>} />
            <Route path="/aichat-preview" element={<Content style={{ padding: '0px' }}><AIChatPreview /></Content>} />
            <Route path="/localtts-preview" element={<Content style={{ padding: '0px' }}><LocalTtsPreview /></Content>} />
            <Route path="/image-editor" element={<Content style={{ padding: 0 }}><ImageEditorPage /></Content>} />
          </Routes>
        </Layout>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
