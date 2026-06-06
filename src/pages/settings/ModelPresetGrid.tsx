/**
 * 常见模型预设卡片（见功能文档 3.1.1）
 */
import { Card, Flex, Space, Tag, Typography } from 'antd';
import type { AIModelConfig } from '@/types/settings';
import { CAPABILITY_TAGS } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';

const { Text } = Typography;

function presetMatchesFilter(preset: ModelPreset, filterKeys: string[]): boolean {
  if (filterKeys.length === 0) return true;
  return filterKeys.some((k) => preset.capabilityKeys.includes(k));
}

export interface ModelPresetGridProps {
  presets: ModelPreset[];
  filterCapabilityKeys: string[];
  models: AIModelConfig[];
  selectedPresetKey: string | null;
  onSelectPreset: (preset: ModelPreset) => void;
}

export function ModelPresetGrid({
  presets,
  filterCapabilityKeys,
  models,
  selectedPresetKey,
  onSelectPreset,
}: ModelPresetGridProps) {
  const visible = presets.filter((p) => presetMatchesFilter(p, filterCapabilityKeys));

  return (
    <div style={{ marginBottom: 20 }}>
      <Text strong style={{ display: 'block', marginBottom: 10 }}>
        常见模型
      </Text>
      <Flex wrap="wrap" gap={10}>
        {visible.map((p) => {
          const addedCount = models.filter((m) => m.presetKey === p.presetKey).length;
          const active = selectedPresetKey === p.presetKey;
          return (
            <Card
              key={p.presetKey}
              size="small"
              hoverable
              onClick={() => onSelectPreset(p)}
              style={{
                width: 200,
                cursor: 'pointer',
                borderColor: active ? 'var(--ant-color-primary)' : undefined,
              }}
              styles={{ body: { padding: 10 } }}
            >
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <Space align="center" size={8} style={{ width: '100%' }}>
                  {p.iconBase64 ? (
                    <img
                      src={p.iconBase64.startsWith('data:') ? p.iconBase64 : `data:image/png;base64,${p.iconBase64}`}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : null}
                  <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                    {p.displayName}
                  </Text>
                </Space>
                <Space size={[0, 4]} wrap>
                  {p.isLocal ? <Tag color="purple">本地</Tag> : null}
                  {addedCount > 0 ? <Tag color="green">已添加 · {addedCount}</Tag> : null}
                  {p.configOnly ? <Tag>仅配置</Tag> : null}
                </Space>
                <Space size={[0, 4]} wrap>
                  {p.capabilityKeys.map((k) => {
                    const tag = CAPABILITY_TAGS.find((t) => t.key === k);
                    return (
                      <Tag key={k} style={{ margin: 0, fontSize: 11 }}>
                        {tag?.label ?? k}
                      </Tag>
                    );
                  })}
                </Space>
              </Space>
            </Card>
          );
        })}
      </Flex>
    </div>
  );
}
