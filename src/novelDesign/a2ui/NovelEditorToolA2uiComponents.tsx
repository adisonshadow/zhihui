import type { ReactNode } from 'react';
import { Collapse, Flex, Typography } from 'antd';

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
  const tone = String(props.tone ?? 'neutral');
  const color =
    tone === 'success' ?
      'rgba(120, 220, 160, 0.95)'
    : tone === 'error' ?
      'rgba(255, 140, 130, 0.98)'
    : 'rgba(255,255,255,0.88)';
  return (
    <Text strong style={{ fontSize: 13, color }}>
      {text}
    </Text>
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
      expandIconPosition="end"
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
  NovelToolField,
  NovelToolCollapsibleField,
};
