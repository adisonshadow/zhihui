/**
 * 添加形象 Modal：本地上传、从素材库选择、AI 绘画（开发中）
 * 见功能文档 4.2
 */
import { Modal, Button, Space, Typography } from 'antd';
import { UploadOutlined, PictureOutlined, RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

const BUTTON_STYLE: React.CSSProperties = {
  width: 140,
  height: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
};

const DISABLED_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  opacity: 0.5,
  cursor: 'not-allowed',
  border: 'none',
};

export interface AddCharacterImageModalProps {
  open: boolean;
  onClose: () => void;
  onLocalUpload: () => void;
  onPickFromLibrary: () => void;
}

export function AddCharacterImageModal({
  open,
  onClose,
  onLocalUpload,
  onPickFromLibrary,
}: AddCharacterImageModalProps) {
  const handleLocalUpload = () => {
    onLocalUpload();
    onClose();
  };

  const handlePickFromLibrary = () => {
    onPickFromLibrary();
    onClose();
  };

  return (
    <Modal
      title="添加形象"
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnHidden
    >
      <Space size="middle" wrap style={{ justifyContent: 'center', width: '100%' }}>
        <Button
          type="default"
          style={BUTTON_STYLE}
          icon={<UploadOutlined style={{ fontSize: 24 }} />}
          onClick={handleLocalUpload}
        >
          <Text>本地上传</Text>
        </Button>
        <Button
          type="default"
          style={BUTTON_STYLE}
          icon={<PictureOutlined style={{ fontSize: 24 }} />}
          onClick={handlePickFromLibrary}
        >
          <Text>从素材库选择</Text>
        </Button>
        <Button type="default" style={DISABLED_BUTTON_STYLE} icon={<RobotOutlined style={{ fontSize: 24 }} />} disabled>
          <Text type="secondary">AI 绘画（开发中）</Text>
        </Button>
      </Space>
    </Modal>
  );
}
