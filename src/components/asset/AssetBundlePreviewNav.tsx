/**
 * 预览 Drawer 内：同类组上一项 / 下一项 / 子素材名称（可点编辑）/ 删除
 */
import { Button, Space, theme } from 'antd';
import { LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import { HoverEditableText } from '../antd-plus/HoverEditableText';

export interface AssetBundlePreviewNavProps {
  memberIds: string[];
  currentAssetId: string;
  onChangeCurrent: (assetId: string) => void;
  onDeleteCurrent: () => void;
  /** 当前子素材 assets_index.description */
  memberDescription: string | null;
  /** 无描述时的展示回退（一般为文件名） */
  memberFileLabel: string;
  /** 名称提交（Enter 或失焦）；传入已 trim 的展示用文案，空串表示清空描述 */
  onMemberDescriptionCommit: (nextTrimmed: string) => void | Promise<void>;
  disabled?: boolean;
}

export function AssetBundlePreviewNav({
  memberIds,
  currentAssetId,
  onChangeCurrent,
  onDeleteCurrent,
  memberDescription,
  memberFileLabel,
  onMemberDescriptionCommit,
  disabled,
}: AssetBundlePreviewNavProps) {
  const { token } = theme.useToken();
  const idx = memberIds.indexOf(currentAssetId);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < memberIds.length - 1;

  const displayText =
    (memberDescription?.trim()?.length ? memberDescription.trim() : null) || memberFileLabel || '素材';
  /** 与展示一致：无描述时编辑态预填文件名，避免只看到文案但 Input 为空 */
  const trimmedDesc = memberDescription?.trim() ?? '';
  const editInitialValue = trimmedDesc.length > 0 ? trimmedDesc : memberFileLabel || '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 12,
        padding: '8px 10px',
        borderRadius: 8,
        background: token.colorFillTertiary,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Space size={4}>
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          disabled={disabled || !hasPrev}
          onClick={() => hasPrev && onChangeCurrent(memberIds[idx - 1]!)}
          aria-label="上一个"
        />
        <Button
          type="text"
          size="small"
          icon={<RightOutlined />}
          disabled={disabled || !hasNext}
          onClick={() => hasNext && onChangeCurrent(memberIds[idx + 1]!)}
          aria-label="下一个"
        />
      </Space>
      <HoverEditableText
        displayText={displayText}
        editInitialValue={editInitialValue}
        resetKey={currentAssetId}
        disabled={disabled}
        onCommit={(trimmed) => void Promise.resolve(onMemberDescriptionCommit(trimmed))}
        textProps={{
          ellipsis: true,
          style: {
            textAlign: 'center',
            margin: 0,
            width: '100%',
            cursor: disabled ? 'default' : 'pointer',
          },
          title: displayText,
        }}
        inputProps={{
          size: 'small',
          'aria-label': '子素材名称',
        }}
        style={{ flex: 1, minWidth: 0 }}
      />
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        disabled={disabled}
        onClick={onDeleteCurrent}
        aria-label="删除素材"
      />
    </div>
  );
}
