import { Input, Space, Typography } from 'antd';
import type { SceneStaging } from '@/constants/Script';

const { Text } = Typography;

const FIELD_ROWS: { key: keyof SceneStaging; label: string; placeholder: string; rows: number }[] = [
  { key: 'background', label: '背景', placeholder: '环境、布景、空间氛围…', rows: 2 },
  { key: 'foreground', label: '前景', placeholder: '近景层次、遮挡物、景深前景…', rows: 2 },
  { key: 'props', label: '道具', placeholder: '关键道具、陈设、手持物…', rows: 2 },
  { key: 'lighting', label: '光线', placeholder: '光效、色调、明暗氛围…', rows: 2 },
];

interface NovelSceneStagingFieldsProps {
  staging: SceneStaging | undefined;
  onChange: (staging: SceneStaging | undefined) => void;
}

function isStagingEmpty(s: SceneStaging): boolean {
  return !s.background?.trim() && !s.foreground?.trim() && !s.props?.trim() && !s.lighting?.trim();
}

export function NovelSceneStagingFields({ staging, onChange }: NovelSceneStagingFieldsProps) {
  const s = staging ?? {};

  const patch = (key: keyof SceneStaging, value: string) => {
    const next = { ...s, [key]: value || undefined };
    onChange(isStagingEmpty(next) ? undefined : next);
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Text type="secondary" style={{ fontSize: 12 }}>
        场景要素
      </Text>
      {FIELD_ROWS.map(({ key, label, placeholder, rows }) => (
        <Space.Compact key={key} style={{ width: '100%' }}>
          <Input
            readOnly
            tabIndex={-1}
            value={label}
            style={{
              width: 56,
              textAlign: 'center',
              cursor: 'default',
              color: 'var(--ant-color-text-secondary)',
              background: 'var(--ant-color-fill-tertiary)',
            }}
          />
          <Input.TextArea
            rows={rows}
            style={{ width: 'calc(100% - 56px)' }}
            placeholder={placeholder}
            value={s[key] ?? ''}
            onChange={(e) => patch(key, e.target.value)}
          />
        </Space.Compact>
      ))}
    </Space>
  );
}
