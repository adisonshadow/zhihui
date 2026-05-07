/**
 * 编剧抽卡左侧：历史会话列表（与 @ant-design/x Conversations + AIChat 元信息对接）
 */
import { useMemo, useCallback } from 'react';
import { Conversations } from '@ant-design/x';
import type { ConversationItemType } from '@ant-design/x';
import { Typography, Flex, type MenuProps } from 'antd';
import {
  MessageOutlined,
  VerticalAlignTopOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ConversationListMetaItem } from '@/components/AIChat/aiChatPanelHandles';

export function screenwriterSidebarGroup(ts: number, now = Date.now()): string {
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  if (ts >= todayStart) return '今天';
  if (ts >= yesterdayStart) return '昨天';
  return '更早';
}

function sortSidebarConversationMeta(items: ConversationListMetaItem[]): ConversationListMetaItem[] {
  return [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.lastActive || 0) - (a.lastActive || 0);
  });
}

export interface ScreenwriterHistoryConversationsProps {
  items: ConversationListMetaItem[];
  activeKey: string | null;
  onActiveChange: (key: string) => void;
  onRenameRequest: (key: string, currentLabel: string) => void;
  onDeleteRequest: (key: string, label: string) => void;
  onTogglePin: (key: string, pinned: boolean) => void;
}

export function ScreenwriterHistoryConversations({
  items,
  activeKey,
  onActiveChange,
  onRenameRequest,
  onDeleteRequest,
  onTogglePin,
}: ScreenwriterHistoryConversationsProps) {
  const sorted = useMemo(() => sortSidebarConversationMeta(items), [items]);

  const conversationRows = useMemo((): ConversationItemType[] => {
    const now = Date.now();
    return sorted.map((it) => ({
      key: it.key,
      label: (
        <Flex align="center" gap={8} style={{ minWidth: 0, width: '100%' }}>
          <Typography.Text ellipsis style={{ flex: 1, marginBottom: 0, color: 'inherit' }}>
            {it.label}
          </Typography.Text>
          {it.pinned ? (
            <VerticalAlignTopOutlined style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />
          ) : null}
        </Flex>
      ),
      icon: (
        <MessageOutlined className="screenwriter-history-conv-msg-icon" style={{ fontSize: 14 }} />
      ),
      group: it.pinned ? '置顶' : screenwriterSidebarGroup(it.lastActive || 0, now),
    }));
  }, [sorted]);

  const menuForConversation = useCallback(
    (conversation: ConversationItemType): MenuProps => {
      const key = String(conversation.key ?? '');
      const meta = sorted.find((i) => i.key === key);
      const pinned = !!meta?.pinned;
      const labelStr = typeof meta?.label === 'string' ? meta.label : '';

      return {
        className: 'screenwriter-history-conv-dropdown-root',
        items: [
          {
            key: 'pin',
            icon: <VerticalAlignTopOutlined />,
            label: pinned ? '取消置顶' : '置顶',
          },
          {
            key: 'rename',
            icon: <EditOutlined />,
            label: '重命名',
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除',
            danger: true,
          },
        ],
        onClick: ({ key: menuKey, domEvent }) => {
          domEvent?.stopPropagation();
          if (menuKey === 'pin') {
            onTogglePin(key, !pinned);
            return;
          }
          if (menuKey === 'rename') {
            onRenameRequest(key, labelStr);
            return;
          }
          if (menuKey === 'delete') {
            onDeleteRequest(key, labelStr);
          }
        },
      };
    },
    [sorted, onDeleteRequest, onRenameRequest, onTogglePin]
  );

  return (
    <Conversations
      groupable
      items={conversationRows}
      activeKey={
        activeKey && conversationRows.some((item) => item.key === activeKey) ? activeKey : undefined
      }
      menu={menuForConversation}
      onActiveChange={(k) => {
        const ks = String(k);
        if (ks) onActiveChange(ks);
      }}
      styles={{ root: { padding: '8px 12px', flex: 1, overflow: 'auto', minHeight: 0 } }}
    />
  );
}
