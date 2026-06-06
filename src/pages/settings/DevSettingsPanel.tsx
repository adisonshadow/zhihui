/**
 * 开发模式专用设置入口（仅 import.meta.env.DEV 下展示 Dev 页签）
 */
import { Button, Space, Typography } from 'antd';
import { CommentOutlined, SoundOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Paragraph, Text } = Typography;

export interface DevSettingsPanelProps {
  /** Modal 模式下跳转前关闭配置面板 */
  onBeforeNavigate?: () => void;
}

export function DevSettingsPanel({ onBeforeNavigate }: DevSettingsPanelProps) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onBeforeNavigate?.();
    navigate(path);
  };

  return (
    <div>
      <Paragraph>
        <Text strong>开发工具</Text>
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下入口仅在开发模式（<Text code>yarn dev</Text>）下可用，不会出现在生产构建中。
      </Paragraph>
      <Space orientation="vertical" size={16}>
        <div>
          <Button type="primary" icon={<CommentOutlined />} onClick={() => go('/aichat-preview')}>
            AI Chat 预览
          </Button>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
            打开 AI 对话组件调试页，试用 SidePanel / 多 Agent 等布局。
          </Text>
        </div>
        <div>
          <Button type="primary" icon={<SoundOutlined />} onClick={() => go('/localtts-preview')}>
            本地 TTS 预览
          </Button>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
            打开本地 TTS 调试页，直接请求 AI 服务（19815）做合成试听。
          </Text>
        </div>
        <div>
          <Button type="primary" onClick= { () => go('/music-design') }>
             Strudel 音乐工作台
          </Button>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
            打开 Strudel 音乐工作台，试用 Tidal Cycles 音乐设计。
          </Text>
        </div>
      </Space>
    </div>
  );
}
