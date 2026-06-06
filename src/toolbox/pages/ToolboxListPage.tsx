/**
 * 实用工具列表页：启动器，复用 ProjectCard + 背景视频
 * 内嵌图片编辑、声音录制、Strudel 音乐工作台三个工具入口
 */
import { useNavigate } from 'react-router-dom';
import { Row } from 'antd';
import { ProjectCard } from '@/components/ProjectCard';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import './ToolboxListPage.css';

interface ToolDefinition {
  id: string;
  title: string;
  icon: React.ReactNode;
  route: string;
  cover: string;
  description: string;
}

const TOOLS: ToolDefinition[] = [
  {
    id: 'image-editor',
    title: '图片编辑',
    cover: '/images/tool-img-edit.png',
    icon: (
      <svg className="font-svg-icon" aria-hidden="true" style={{ fontSize: 56 }}>
        <use xlinkHref="#icon-microphone"></use>
      </svg>
    ),
    route: '/image-editor',
    description: '裁剪、标注、抠图、滤镜',
  },
  {
    id: 'audio-recorder',
    title: '声音录制',
    cover: '/images/tool-audio-recorder.png',
    icon: (
      <svg className="font-svg-icon" aria-hidden="true" style={{ fontSize: 56 }}>
        <use xlinkHref="#icon-microphone"></use>
      </svg>
    ),
    route: '/audio-recorder',
    description: '录制、裁剪、降噪、导出',
  },
  {
    id: 'strudel',
    title: 'Strudel 音乐工作台',
    cover: '/images/tool-music-layout.png',
    icon: (
      <svg className="font-svg-icon" aria-hidden="true" style={{ fontSize: 56 }}>
        <use xlinkHref="#icon-music"></use>
      </svg>
    ),
    route: '/music-design',
    description: 'Tidal Cycles 风格音乐创作',
  },
];

export default function ToolboxListPage() {
  const navigate = useNavigate();
  const config = useConfigSubscribe();
  const bgVideo = config?.toolboxBgVideo ?? config?.novelBgVideo;

  return (
    <div className="toolbox-list-page">
      {bgVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          key={bgVideo}
          src={`/medias/${bgVideo}`}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      <div className="toolbox-content" style={{ position: 'relative', zIndex: 2 }}>
        <h2 className="toolbox-heading">实用工具</h2>
        <Row gutter={[16, 16]}>
          {TOOLS.map((tool) => (
            <ProjectCard
              key={tool.id}
              isShowLastUpdate={false}
              title={tool.title}
              colProps={{ lg: 6 }}
              cover={{ url: tool.cover, aspect: 1 / 1 }}
              tags={[{ name: tool.description, color: 'default' }]}
              onClick={() => navigate(tool.route)}
            />
          ))}
        </Row>
      </div>
    </div>
  );
}
