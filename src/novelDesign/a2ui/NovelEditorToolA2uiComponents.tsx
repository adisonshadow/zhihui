import type { ReactNode } from 'react';
import { Collapse, Flex, Typography } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

export function NovelToolColumn(props: Record<string, unknown>) {
  const gap = typeof props.gap === 'number' ? props.gap : 8;
  const children = props.children as ReactNode[] | undefined;
  return (
    <Flex vertical gap={gap} style={{ width: '100%' }}>
      {children}
    </Flex>
  );
}

export function NovelToolTitle(props: Record<string, unknown>) {
  const text = String(props.text ?? '');
  const iconType = String(props.iconType ?? 'success');
  const isError = iconType === 'error';
  const isLoading = iconType === 'loading';
  const iconColor = isError ? 'rgba(255, 140, 130, 0.98)' : 'rgba(120, 220, 160, 0.95)';
  const IconComponent = isLoading ? LoadingOutlined : isError ? InfoCircleOutlined : CheckCircleOutlined;
  return (
    <Flex align="center" gap={6}>
      {isLoading ?
        <LoadingOutlined style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14 }} spin />
      : <IconComponent style={{ color: iconColor, fontSize: 14 }} />}
      <Text strong style={{ fontSize: 13, color: isError ? iconColor : 'rgba(255,255,255,0.88)' }}>
        {text}
      </Text>
    </Flex>
  );
}

/** 可折叠容器：默认收起，包裹所有数据字段 */
export function NovelToolCollapsibleCard(props: Record<string, unknown>) {
  const children = props.children as ReactNode[] | undefined;
  return (
    <Collapse
      size="small"
      bordered={false}
      style={{ background: 'transparent' }}
      defaultActiveKey={[]}
      expandIconPlacement="end"
      items={[
        {
          key: 'body',
          label: <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>查看详情</span>,
          styles: {
            header: {
              alignItems: 'center',
              padding: '4px 0',
            },
            body: { padding: '8px 0 0' },
          },
          children: (
            <Flex vertical gap={10} style={{ width: '100%' }}>
              {children}
            </Flex>
          ),
        },
      ]}
    />
  );
}

export function NovelToolField(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const body = String(props.body ?? '');
  return (
    <Flex vertical gap={4} style={{ width: '100%' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)' }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.86)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.65,
          maxHeight: 320,
          overflow: 'auto',
        }}
      >
        {body}
      </Text>
    </Flex>
  );
}

/** 长文本（如 novel_get_episode 正文）默认折叠，点击展开 */
export function NovelToolCollapsibleField(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const body = String(props.body ?? '');
  const defaultCollapsed = props.defaultCollapsed !== false;
  return (
    <Collapse
      size="small"
      bordered={false}
      style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}
      defaultActiveKey={defaultCollapsed ? [] : ['md']}
      expandIconPlacement="end"
      items={[
        {
          key: 'md',
          label: <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{label}</span>,
          styles: { body: { paddingBlockStart: 8 } },
          children: (
            <Text
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.86)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.65,
                maxHeight: 320,
                overflow: 'auto',
                display: 'block',
              }}
            >
              {body}
            </Text>
          ),
        },
      ]}
    />
  );
}

export const NOVEL_EDITOR_TOOL_UI_COMPONENT_MAP: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = {
  NovelToolColumn,
  NovelToolTitle,
  NovelToolCollapsibleCard,
  NovelToolField,
  NovelToolCollapsibleField,
};
