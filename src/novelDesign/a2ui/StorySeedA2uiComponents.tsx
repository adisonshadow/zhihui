import type { ComponentType, ReactNode, SyntheticEvent } from 'react';
import { Button, Flex, Typography } from 'antd';
import { StarOutlined, StarFilled, FileTextOutlined } from '@ant-design/icons';

const { Text } = Typography;

type OnActionInjector = (
  name: string,
  context?: Record<string, unknown>
) => void;

/** 外层垂直布局 —— 对齐 A2UI Column 语义 */
export function StorySeedColumn(props: Record<string, unknown>) {
  const gap = typeof props.gap === 'number' ? props.gap : 10;
  const children = props.children as ReactNode[] | undefined;
  return (
    <Flex vertical gap={gap} style={{ width: '100%' }}>
      {children}
    </Flex>
  );
}

/** 操作区横向排列 */
export function StorySeedButtonRow(props: Record<string, unknown>) {
  const gap = typeof props.gap === 'number' ? props.gap : 10;
  const children = props.children as ReactNode[] | undefined;
  return (
    <Flex wrap="wrap" gap={gap} style={{ marginTop: 8 }}>
      {children}
    </Flex>
  );
}

export function StorySeedBadge(props: Record<string, unknown>) {
  const text = String(props.text ?? '');
  return (
    <Text
      style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.5,
      }}
    >
      {text}
    </Text>
  );
}

export function StorySeedHeading(props: Record<string, unknown>) {
  const title = String(props.title ?? '');
  return (
    <Typography.Title level={4} style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.95)' }}>
      {title}
    </Typography.Title>
  );
}

export function StorySeedField(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const body = String(props.body ?? '');
  if (!body.trim()) return null;
  return (
    <Flex vertical gap={4} style={{ width: '100%' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {body}
      </Text>
    </Flex>
  );
}

export function StorySeedCharBlock(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const bulletText = String(props.bulletText ?? '');
  return (
    <Flex vertical gap={4} style={{ width: '100%' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</Text>
      <Text
        style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.85,
          fontFamily: 'inherit',
        }}
      >
        {bulletText}
      </Text>
    </Flex>
  );
}

export function StorySeedSummary(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const body = String(props.body ?? '');
  if (!body.trim()) return null;
  return (
    <Flex vertical gap={4} style={{ width: '100%' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap', lineHeight: 1.85 }}>
        {body}
      </Text>
    </Flex>
  );
}

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function StorySeedFavoriteButton(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const favorited = Boolean(props.favorited);
  const onAction = props.onAction as OnActionInjector | undefined;
  const action = props.action as { event?: { name?: string; context?: Record<string, unknown> } } | undefined;
  const evt = action?.event;
  return (
    <span onMouseDown={stop} onClick={stop}>
      <Button
        size="small"
        icon={
          favorited ? (
            <StarFilled style={{ color: '#ff4d4f' }} />
          ) : (
            <StarOutlined />
          )
        }
        onClick={() => evt?.name && onAction?.(evt.name, evt.context ?? {})}
      >
        {label}
      </Button>
    </span>
  );
}

export function StorySeedOutlineButton(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const btnType = props.type === 'primary' ? 'primary' : 'default';
  const onAction = props.onAction as OnActionInjector | undefined;
  const action = props.action as { event?: { name?: string; context?: Record<string, unknown> } } | undefined;
  const evt = action?.event;
  return (
    <span onMouseDown={stop} onClick={stop}>
      <Button
        type={btnType}
        size="small"
        icon={<FileTextOutlined />}
        onClick={() => evt?.name && onAction?.(evt.name, evt.context ?? {})}
      >
        {label}
      </Button>
    </span>
  );
}

/** 供 Box 的 components 映射；名称须与 Catalog / updateComponents.component 一致 */
export const STORY_SEED_UI_COMPONENT_MAP: Record<string, ComponentType<Record<string, unknown>>> = {
  StorySeedColumn,
  StorySeedButtonRow,
  StorySeedBadge,
  StorySeedHeading,
  StorySeedField,
  StorySeedCharBlock,
  StorySeedSummary,
  StorySeedFavoriteButton,
  StorySeedOutlineButton,
};
