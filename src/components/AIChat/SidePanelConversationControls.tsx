/**
 * SidePanel 顶栏：新建对话 + 对话历史下拉
 */
import { useState } from 'react';
import { Button, Dropdown, Flex } from 'antd';
import { PlusOutlined, MessageOutlined } from '@ant-design/icons';
import type { ConversationListMetaItem } from './aiChatPanelHandles';

function conversationTs(c: ConversationListMetaItem): number {
  const t = c.lastActive;
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : 0;
}

export interface SidePanelConversationControlsProps {
  convItems: ConversationListMetaItem[];
  activeKey: string | null;
  onNewConversation: () => void;
  onConversationChange: (key: string) => void;
}

export function SidePanelConversationControls({
  convItems,
  activeKey,
  onNewConversation,
  onConversationChange,
}: SidePanelConversationControlsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Flex align="center" gap={4}>
      <Button type="text" size="small" icon={<PlusOutlined />} onClick={onNewConversation} title="新建对话" />
      <Dropdown
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        trigger={['click']}
        destroyOnHidden
        getPopupContainer={() => document.body}
        classNames={{ root: 'yiman-ai-chat-history-dropdown' }}
        styles={{ root: { zIndex: 2100 } }}
        popupRender={() => {
          const now = Date.now();
          const todayStart = new Date(now).setHours(0, 0, 0, 0);
          const yesterdayStart = todayStart - 86400000;
          const todayItems = convItems.filter((c) => conversationTs(c) >= todayStart);
          const yesterdayItems = convItems.filter(
            (c) => conversationTs(c) >= yesterdayStart && conversationTs(c) < todayStart,
          );
          const olderItems = convItems.filter((c) => conversationTs(c) < yesterdayStart);
          const pick = (c: ConversationListMetaItem) => {
            onConversationChange(c.key);
            setHistoryOpen(false);
          };
          const rowStyle = (key: string) => ({
            padding: '8px 12px',
            cursor: 'pointer' as const,
            fontSize: 13,
            background: activeKey === key ? 'rgba(255,255,255,0.08)' : 'transparent',
          });
          return (
            <div
              style={{
                background: 'var(--ant-color-bg-elevated)',
                borderRadius: 8,
                boxShadow: 'var(--ant-box-shadow)',
                padding: '8px 0',
                minWidth: 220,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {todayItems.length > 0 && (
                <>
                  <div style={{ padding: '4px 12px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>今天</div>
                  {todayItems.map((c) => (
                    <div key={c.key} onClick={() => pick(c)} style={rowStyle(c.key)}>
                      {activeKey === c.key ? '[当前] ' : ''}
                      {c.label}
                    </div>
                  ))}
                </>
              )}
              {yesterdayItems.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.45)',
                      marginTop: 8,
                    }}
                  >
                    昨天
                  </div>
                  {yesterdayItems.map((c) => (
                    <div key={c.key} onClick={() => pick(c)} style={rowStyle(c.key)}>
                      {activeKey === c.key ? '[当前] ' : ''}
                      {c.label}
                    </div>
                  ))}
                </>
              )}
              {olderItems.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.45)',
                      marginTop: 8,
                    }}
                  >
                    更早
                  </div>
                  {olderItems.map((c) => (
                    <div key={c.key} onClick={() => pick(c)} style={rowStyle(c.key)}>
                      {activeKey === c.key ? '[当前] ' : ''}
                      {c.label}
                    </div>
                  ))}
                </>
              )}
              {convItems.length === 0 && (
                <div
                  style={{
                    padding: 16,
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.45)',
                    textAlign: 'center',
                  }}
                >
                  暂无对话记录
                </div>
              )}
            </div>
          );
        }}
      >
        <Button type="text" size="small" icon={<MessageOutlined />} title="对话历史" />
      </Dropdown>
    </Flex>
  );
}
