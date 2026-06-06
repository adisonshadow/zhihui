import { Button, App } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { loadNovelList } from '@/novelDesign/storage/novelListStorage';
import {
  enableAudiobookForNovel,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';

interface CreateAudiobookProjectButtonProps {
  novelId: string;
  workspace: NovelWorkspaceSnapshot | null;
  onWorkspaceChange: (snap: NovelWorkspaceSnapshot) => void;
}

export function CreateAudiobookProjectButton({
  novelId,
  workspace,
  onWorkspaceChange,
}: CreateAudiobookProjectButtonProps) {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const listItem = loadNovelList().find((x) => x.id === novelId);
  const enabled = Boolean(listItem?.audiobookEnabled);

  const openAudiobook = () => {
    modal.confirm({
      title: enabled ? '打开有声书编辑' : '有声书项目已创建',
      content: enabled ?
        '是否进入有声书编辑页？'
      : '已与当前小说共用项目目录，是否现在进入有声书编辑页？',
      okText: '进入',
      cancelText: '留在此页',
      onOk: () => navigate(`/audiobook/novel/${novelId}`),
    });
  };

  const handleClick = () => {
    if (!workspace) {
      message.warning('工作区未就绪');
      return;
    }
    if (enabled) {
      openAudiobook();
      return;
    }
    const next = enableAudiobookForNovel(workspace);
    onWorkspaceChange(next);
    message.success('有声书项目已开通');
    openAudiobook();
  };

  return (
    <Button type="default" icon={<SoundOutlined />} onClick={handleClick}>
      {enabled ? '打开有声书' : '创建有声书项目'}
    </Button>
  );
}
