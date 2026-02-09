/**
 * 芝绘 - 根组件（见功能文档 2、开发计划 2.2）
 * 路由与布局参考 Biezhi2/web
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import AppHeader from './components/AppHeader';
import ProjectList from './pages/ProjectList';
import ProjectEditor from './pages/ProjectEditor';
import Settings from './pages/Settings';

const { Content } = Layout;

function App() {
  return (
    <BrowserRouter>
      <Layout style={{ minHeight: '100vh' }}>
        <AppHeader />
        <Routes>
          <Route path="/" element={<Content style={{ padding: '24px' }}><ProjectList /></Content>} />
          <Route path="/project/:id" element={<Content style={{ padding: '0px' }}><ProjectEditor /></Content>} />
          <Route path="/settings" element={<Content style={{ padding: '24px' }}><Settings /></Content>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
