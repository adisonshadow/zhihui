import type { ComponentType, ReactNode, SyntheticEvent } from 'react';
import { Button, Flex, Typography } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';

const { Text } = Typography;

type OnActionInjector = (name: string, context?: Record<string, unknown>) => void;

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function OutlinePanelColumn(props: Record<string, unknown>) {
  const gap = typeof props.gap === 'number' ? props.gap : 10;
  const children = props.children as ReactNode[] | undefined;
  return (
    <Flex vertical gap={gap} style={{ width: '100%' }}>
      {children}
    </Flex>
  );
}

export function OutlinePanelButtonRow(props: Record<string, unknown>) {
  const gap = typeof props.gap === 'number' ? props.gap : 10;
  const children = props.children as ReactNode[] | undefined;
  return (
    <Flex wrap="wrap" gap={gap} style={{ marginTop: 8 }}>
      {children}
    </Flex>
  );
}

export function OutlinePanelBadge(props: Record<string, unknown>) {
  const text = String(props.text ?? '');
  return (
    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5 }}>{text}</Text>
  );
}

export function OutlinePanelHeading(props: Record<string, unknown>) {
  const title = String(props.title ?? '');
  return (
    <Typography.Title level={4} style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.95)' }}>
      {title}
    </Typography.Title>
  );
}

export function OutlinePanelField(props: Record<string, unknown>) {
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

export function OutlinePanelButton(props: Record<string, unknown>) {
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
        onClick={() => evt?.name && onAction?.(evt.name, evt.context ?? {})}
      >
        {label}
      </Button>
    </span>
  );
}

/** 收藏大纲：与 StorySeedFavoriteButton 一致，空心星 / 实心红星 */
export function OutlinePanelFavoriteButton(props: Record<string, unknown>) {
  const label = String(props.label ?? '');
  const favorited = Boolean(props.favorited);
  const onAction = props.onAction as OnActionInjector | undefined;
  const action = props.action as { event?: { name?: string; context?: Record<string, unknown> } } | undefined;
  const evt = action?.event;
  return (
    <span onMouseDown={stop} onClick={stop}>
      <Button
        size="small"
        type="default"
        icon={
          favorited ? <StarFilled style={{ color: '#ff4d4f' }} /> : <StarOutlined />
        }
        onClick={() => evt?.name && onAction?.(evt.name, evt.context ?? {})}
      >
        {label}
      </Button>
    </span>
  );
}

export const OUTLINE_PANEL_UI_COMPONENT_MAP: Record<string, ComponentType<Record<string, unknown>>> = {
  OutlinePanelColumn,
  OutlinePanelButtonRow,
  OutlinePanelBadge,
  OutlinePanelHeading,
  OutlinePanelField,
  OutlinePanelButton,
  OutlinePanelFavoriteButton,
};
