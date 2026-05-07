/**
 * 自定义模型列表（见功能文档 3.1.1）
 */
import { Button, Flex, Space, Tag, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import { CAPABILITY_TAGS } from '@/types/settings';

const { Text } = Typography;

function modelMatchesFilter(m: AIModelConfig, filterKeys: string[]): boolean {
  if (filterKeys.length === 0) return true;
  const keys = m.capabilityKeys ?? [];
  return filterKeys.some((k) => keys.includes(k));
}

export interface CustomModelListProps {
  models: AIModelConfig[];
  filterCapabilityKeys: string[];
  onAdd: () => void;
  onEdit: (m: AIModelConfig) => void;
  onDelete: (id: string) => void;
  /** 列表标题，默认「自定义模型」；与 hideTitle 互斥时以 hideTitle 为准 */
  listTitle?: string;
  /** 为 true 时不显示左侧标题（仅保留可选的添加按钮行） */
  hideTitle?: boolean;
  /** 是否显示右上角「添加模型」按钮 */
  showAddButton?: boolean;
  /** 是否显示本地部署说明小字 */
  showLocalDeployTip?: boolean;
}

export function CustomModelList({
  models,
  filterCapabilityKeys,
  onAdd,
  onEdit,
  onDelete,
  listTitle = '自定义模型',
  hideTitle = false,
  showAddButton = true,
  showLocalDeployTip = true,
}: CustomModelListProps) {
  const filtered = models.filter((m) => modelMatchesFilter(m, filterCapabilityKeys));
  const displayTitle = hideTitle ? null : listTitle;
  const showHeaderRow = displayTitle != null || showAddButton;

  return (
    <div>
      {showHeaderRow ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {displayTitle ? <Text strong>{displayTitle}</Text> : <span />}
          {showAddButton ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
              添加模型
            </Button>
          ) : null}
        </div>
      ) : null}
      {showLocalDeployTip ? (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
          勾选「本地部署」可接入 Ollama / 本地 LLAMA 等（默认 API 根路径 http://127.0.0.1:11434/v1），无需填写密钥。
        </Text>
      ) : null}
      <Flex vertical gap={0}>
        {filtered.map((m) => (
          <Flex
            key={m.id}
            justify="space-between"
            align="flex-start"
            gap={12}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--ant-color-split)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space wrap>
                <Text>{m.name || resolveRequestModelId(m) || '未命名'}</Text>
                {m.isLocal ? <Tag color="purple">本地</Tag> : null}
                {m.capabilityKeys?.length ? (
                  <Space size={[0, 4]} wrap>
                    {m.capabilityKeys.map((k) => {
                      const tag = CAPABILITY_TAGS.find((t) => t.key === k);
                      return (
                        <Tag key={k} style={{ margin: 0 }}>
                          {tag?.label ?? k}
                        </Tag>
                      );
                    })}
                  </Space>
                ) : null}
              </Space>
            </div>
            <Space size={0} wrap={false}>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(m)}>
                编辑
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => void onDelete(m.id)} />
            </Space>
          </Flex>
        ))}
      </Flex>
    </div>
  );
}
