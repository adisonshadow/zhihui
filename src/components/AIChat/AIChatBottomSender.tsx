/**
 * AI 对话 - 仅底部 Sender 条（无对话列表、无顶栏），用于嵌入画布底部等场景
 */
import type { ReactNode } from 'react';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { Button, Flex, Select, InputNumber } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { useAIChatCore } from './AIChatCore';
import type { AIChatCoreProps } from './AIChatCore';

export interface AIChatBottomSenderProps extends AIChatCoreProps {
  agentKey: string;
  onAgentChange?: (key: string) => void;
  /** 渲染在输入条上方的区域（如预览图） */
  aboveSender?: ReactNode;
}

export function AIChatBottomSender({
  agentKey,
  onAgentChange,
  enableReasoning,
  aboveSender,
  ...coreProps
}: AIChatBottomSenderProps) {
  const core = useAIChatCore({ ...coreProps, agentKey, onAgentChange, enableReasoning });

  const {
    isRequesting,
    senderRef,
    senderHeader,
    missingHint,
    hasValidModel,
    composerNonce,
    composerDefaultText,
    senderSlotConfig,
    senderSkill,
    drawerOptions,
    setDrawerOptions,
    DRAWER_ASPECT_OPTIONS,
    handleSubmit,
    handleSenderChange,
    onSenderPasteFile,
    Sender,
  } = core;

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        flexShrink: 0,
        marginTop: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        background: 'var(--ant-color-bg-layout)',
        boxShadow: '0 -10px 28px rgba(0,0,0,0.45)',
        padding: '10px 16px 12px',
      }}
    >
      {aboveSender}
      {missingHint && (
        <div style={{ fontSize: 12, color: 'rgba(255,100,100,0.9)', marginBottom: 6 }}>{missingHint}</div>
      )}
      <Flex vertical gap={12} className="aichat-sender-wrap" style={{ width: '100%' }}>
        <Sender
          key={`${agentKey}-${composerNonce}`}
          ref={senderRef}
          {...(composerDefaultText != null ? { defaultValue: composerDefaultText } : {})}
          slotConfig={senderSlotConfig as readonly SlotConfigType[]}
          skill={senderSkill}
          header={senderHeader}
          loading={isRequesting}
          placeholder={core.senderPlaceholder}
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
            const isDrawer = agentKey === 'drawer';
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
    </div>
  );
}
