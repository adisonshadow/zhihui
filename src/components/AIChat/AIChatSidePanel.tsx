/**
 * AI 对话 - SidePanel 布局模式
 * 使用 Ant Design Layout：Header（agent+对话历史）、Content（提示词/对话）、Footer（Sender，agent+选中对象以 slot 形式在 Sender 内）
 */
import { forwardRef, useImperativeHandle, useState } from 'react';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { Button, Space, Divider, Flex, Select, Layout, Dropdown, InputNumber, Tooltip } from 'antd';
import { PlusOutlined, LinkOutlined, RollbackOutlined, MessageOutlined } from '@ant-design/icons';
import { useAIChatCore } from './AIChatCore';
import type { AIChatCoreProps } from './AIChatCore';
import type { AIChatSidePanelHandle } from './aiChatPanelHandles';
import { DrawerBubbleContent } from './utils/drawerContentRender';
import './AIChatSidePanel.css';

const { Header, Content, Footer } = Layout;

export interface AIChatSidePanelProps extends AIChatCoreProps {
  /** 当前 agent key（可切换） */
  agentKey: string;
  onAgentChange?: (key: string) => void;
}

export const AIChatSidePanel = forwardRef<AIChatSidePanelHandle, AIChatSidePanelProps>(
  function AIChatSidePanel(props, ref) {
  const {
    agentKey,
    onAgentChange,
    enableReasoning,
    ...coreProps
  } = props;

  const core = useAIChatCore({ ...coreProps, agentKey, onAgentChange, enableReasoning });
  const [historyOpen, setHistoryOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      updateGlobalContext: core.updateGlobalContext,
      getSender: () => ({
        setAgentKey: (key: string) => onAgentChange?.(key),
        applyPromptTemplate: core.applyPromptTemplate,
        addImageAttachment: core.attachDrawerImageFromSrc,
        setForcedFunctionCalls: core.setForcedFunctionCallNames,
      }),
    }),
    [
      core.updateGlobalContext,
      core.applyPromptTemplate,
      core.attachDrawerImageFromSrc,
      core.setForcedFunctionCallNames,
      onAgentChange,
    ]
  );

  const {
    convItems,
    activeKey,
    hasMessages,
    bubbleItems,
    promptItems,
    isRequesting,
    senderRef,
    senderHeader,
    missingHint,
    hasValidModel,
    allowAgentSwitch,
    mergedAgents,
    composerNonce,
    composerDefaultText,
    senderSlotConfig,
    senderSkill,
    drawerOptions,
    setDrawerOptions,
    DRAWER_ASPECT_OPTIONS,
    handleNewConversation,
    handleConversationChange,
    handleSubmit,
    handleSenderChange,
    handleRollbackTo,
    userTurnIndices,
    onSenderPasteFile,
    Sender,
    Bubble,
    Prompts,
    writeBackActions,
    senderPlaceholder,
  } = core;

  return (
    <Layout
      className="yiman-ai-chat-side-panel"
      style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Header style={{ padding: '0 16px', height: 40, flexShrink: 0, background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {allowAgentSwitch && onAgentChange && (
            <Select
              size="small"
              value={agentKey}
              onChange={onAgentChange}
              options={mergedAgents.map((e) => ({ value: e.key, label: e.label }))}
              style={{ width: 120 }}
              variant="borderless"
            />
          )}
        </div>
        <Flex align="center" gap={4}>
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleNewConversation} title="新建对话" />
          <Dropdown
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            trigger={['click']}
            popupRender={() => {
              const now = Date.now();
              const todayStart = new Date(now).setHours(0, 0, 0, 0);
              const yesterdayStart = todayStart - 86400000;
              const todayItems = convItems.filter((c) => c.lastActive >= todayStart);
              const yesterdayItems = convItems.filter((c) => c.lastActive >= yesterdayStart && c.lastActive < todayStart);
              const olderItems = convItems.filter((c) => c.lastActive < yesterdayStart);
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
                        <div
                          key={c.key}
                          onClick={() => { handleConversationChange(c.key); setHistoryOpen(false); }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: 13,
                            background: activeKey === c.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                          }}
                        >
                          {activeKey === c.key ? '[当前] ' : ''}{c.label}
                        </div>
                      ))}
                    </>
                  )}
                  {yesterdayItems.length > 0 && (
                    <>
                      <div style={{ padding: '4px 12px', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>昨天</div>
                      {yesterdayItems.map((c) => (
                        <div
                          key={c.key}
                          onClick={() => { handleConversationChange(c.key); setHistoryOpen(false); }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: 13,
                            background: activeKey === c.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                          }}
                        >
                          {activeKey === c.key ? '[当前] ' : ''}{c.label}
                        </div>
                      ))}
                    </>
                  )}
                  {olderItems.length > 0 && (
                    <>
                      <div style={{ padding: '4px 12px', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>更早</div>
                      {olderItems.map((c) => (
                        <div
                          key={c.key}
                          onClick={() => { handleConversationChange(c.key); setHistoryOpen(false); }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: 13,
                            background: activeKey === c.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                          }}
                        >
                          {activeKey === c.key ? '[当前] ' : ''}{c.label}
                        </div>
                      ))}
                    </>
                  )}
                  {convItems.length === 0 && (
                    <div style={{ padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
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
      </Header>

      <Content style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 16px' }}>
        {!hasMessages ? (
          <Prompts
            wrap
            title="常用提示词："
            items={promptItems.map((p) => ({ key: p.key, description: p.label }))}
            onItemClick={(info) => {
              const key = (info?.data as { key?: string })?.key;
              const item = promptItems.find((x) => x.key === key);
              if (item) handleSubmit(item.message);
            }}
            styles={{
              title: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
              item: { display: 'inline-block', margin: '2px 4px 2px 0', padding: '3px 8px' },
            }}
          />
        ) : (
          <Bubble.List
            items={bubbleItems}
              role={{
              assistant: {
                placement: 'start',
                variant: 'borderless',
                contentRender: (content: string, info?: unknown) => {
                  const extra = (info as { extraInfo?: { reasoningContent?: string }; status?: string })?.extraInfo;
                  const status = (info as { status?: string })?.status;
                  return (
                    <DrawerBubbleContent
                      content={content}
                      isDrawerAgent={agentKey === 'drawer'}
                      reasoningContent={enableReasoning ? (extra?.reasoningContent || '') : undefined}
                      status={status}
                    />
                  );
                },
              },
              user: {
                placement: 'end',
                variant: 'borderless',
                contentRender: (content: string, info?: unknown) => {
                  const idx = (info as { extraInfo?: { index?: number } })?.extraInfo?.index;
                  const showRollback = idx != null && userTurnIndices.includes(idx);
                  return (
                    <Flex align="flex-start" gap={8} style={{ width: '100%' }}>
                      {showRollback ? (
                        <Tooltip title="撤回到此步">
                          <Button
                            color="default"
                            variant="filled"
                            // shape="circle"
                            size="small"
                            icon={<RollbackOutlined />}
                            title="撤回到此步"
                            onClick={() => handleRollbackTo(idx)}
                            style={{ flexShrink: 0, marginTop: 2, fontSize: 14 }}
                          />
                        </Tooltip>
                      ) : null}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {content}
                      </div>
                    </Flex>
                  );
                },
              },
              system: { placement: 'start', variant: 'borderless' },
            }}
            autoScroll
            style={{ height: '100%' }}
          />
        )}
      </Content>

      <Footer style={{ padding: '8px 16px', flexShrink: 0, background: 'transparent', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {missingHint && (
          <div style={{ fontSize: 12, color: 'rgba(255,100,100,0.9)', marginBottom: 4 }}>{missingHint}</div>
        )}
        {/* 与 docs/AI-demo/demo.tsx chatSender 一致：纵向留白，输入区独立成块 */}
        <Flex vertical gap={12} className="aichat-sender-wrap" style={{ width: '100%' }}>
        <Sender
          key={`${agentKey}-${composerNonce}`}
          ref={senderRef}
          {...(composerDefaultText != null ? { defaultValue: composerDefaultText } : {})}
          slotConfig={senderSlotConfig as readonly SlotConfigType[]}
          skill={senderSkill}
          header={senderHeader}
          loading={isRequesting}
          placeholder={senderPlaceholder}
          onSubmit={(msg, slotConfig, skill) => {
            handleSubmit(msg, slotConfig, skill);
            senderRef.current?.clear?.();
          }}
          onChange={handleSenderChange}
          onPasteFile={onSenderPasteFile}
          disabled={!hasValidModel}
          autoSize={{ minRows: 1, maxRows: 6 }}
          
          footer={(_oriNode, info) => {
            const comps = info?.components;
            const SendButton = comps?.SendButton;
            const LoadingButton = comps?.LoadingButton;
            const isDrawer = core.agentKey === 'drawer';
            return (
              <Flex justify="space-between" align="center">
                <Button
                  type="text"
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => core.setAttachmentsOpen(!core.attachmentsOpen)}
                />
                <Flex align="center" gap={16}>
                  {isDrawer && drawerOptions && setDrawerOptions && (
                    <>
                      <Flex align="center" gap={4}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>出图数量：</span>
                        <InputNumber
                          min={1}
                          max={4}
                          value={drawerOptions.imageCount}
                          onChange={(v) => setDrawerOptions((p) => ({ ...p, imageCount: v ?? 1 }))}
                          size="small"
                          style={{ width: 64 }}
                        />
                      </Flex>
                      <Flex align="center" gap={4}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>图比例：</span>
                        <Select
                          size="small"
                          value={drawerOptions.aspectRatio}
                          onChange={(v) => setDrawerOptions((p) => ({ ...p, aspectRatio: v }))}
                          options={DRAWER_ASPECT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                          style={{ width: 100 }}
                        />
                      </Flex>
                    </>
                  )}
                  {SendButton && LoadingButton ? (
                    isRequesting ? <LoadingButton type="default" /> : <SendButton type="primary" />
                  ) : (
                    <Button
                      type="primary"
                      disabled={!hasValidModel}
                      loading={isRequesting}
                      onClick={() => {
                        const v = senderRef.current?.getValue?.();
                        const text = (v && typeof v === 'object' && 'value' in v ? v.value : '')?.trim?.();
                        if (text) {
                          handleSubmit(text, v?.slotConfig, v?.skill);
                          senderRef.current?.clear?.();
                        }
                      }}
                    >
                      发送
                    </Button>
                  )}
                </Flex>
              </Flex>
            );
          }}
          onCancel={() => {}}
          suffix={false}
        />
        </Flex>
        {writeBackActions && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Space>{writeBackActions}</Space>
          </>
        )}
      </Footer>
    </Layout>
  );
});
