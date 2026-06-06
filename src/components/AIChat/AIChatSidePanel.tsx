/**
 * AI 对话 - SidePanel 布局模式
 * 使用 Ant Design Layout：Header（agent+对话历史）、Content（提示词/对话）、Footer（ref 指示条 + Sender + 附件等）
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { SlotConfigType, SkillType } from '@ant-design/x/lib/sender/interface';
import { Button, Space, Divider, Flex, Select, Layout, Dropdown, InputNumber, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { LinkOutlined, RollbackOutlined, CloseOutlined } from '@ant-design/icons';
import { useAIChatCore } from './AIChatCore';
import type { AIChatCoreProps } from './AIChatCore';
import type { AIChatSidePanelHandle, AIChatEmitUserMessagePayload } from './aiChatPanelHandles';
import {
  getAllSkillAgents,
  buildExposedMultimodalAgents,
  expertKeyFromSkillAgentId,
  skillAgentIdFromExpertKey,
  getSkillAgent,
} from './registryTypes';
import { MAIN_AGENT_KEY } from './experts';
import type {
  SkillAgentDefinition,
  AgentUIConfigField,
} from './registryTypes';
import { formatModelSelectLabel } from '@/utils/presetModelInstances';
import { getToolCardIdFromContent, isToolCardContent } from './utils/toolCardMarkers';
import { PrepareGenStoriesCard } from './tools/PrepareGenStoriesCard';
import { DrawerBubbleContent } from './utils/drawerContentRender';
import { UnifiedStyleProvider } from './utils/unifiedStyle';
import { GenerateImagesToolResult } from './tools/builtInTools/generate_images/generateImagesChatUi';
import { GenerateVideoToolResult } from './tools/builtInTools/generate_video/generateVideoChatUi';
import './AIChatSidePanel.css';
import type { AIChatSidePanelOnSubmit, RefIndicatorType } from './types';
import { resolveAspectRatio, type DrawerAspectRatio } from './types/drawerOptions';
import { IconButton } from '@/components/antd-plus/IconButton';
import { SidePanelConversationControls } from './SidePanelConversationControls';

const { Header, Content, Footer } = Layout;

function RefIndicatorBar({
  items,
  onRemoveKey,
}: {
  items: RefIndicatorType[];
  onRemoveKey: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <Flex wrap="wrap" gap={6} align="center" className="yiman-sender-ref-indicator-row">
      {items.map((item) => (
        <Tooltip key={item.key} title={item.description}>
          <span className="yiman-ref-indicator-tag">
            {item.icon ? <span className="yiman-ref-indicator-icon">{item.icon}</span> : null}
            <span className="yiman-ref-indicator-content">{item.content}</span>
            <Button
              type="text"
              size="small"
              className="yiman-ref-indicator-close"
              icon={<CloseOutlined />}
              aria-label="移除"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemoveKey(item.key);
              }}
            />
          </span>
        </Tooltip>
      ))}
    </Flex>
  );
}

export interface SidePanelAssistantContentRenderArgs {
  content: string;
  reasoningContent?: string;
  status?: string;
  messageId?: string | number;
  toolCallNames?: string[];
  /** 本条 assistant 在完整会话里紧随其后的 tool 回包（Bubble 快照里可能已过滤掉 tool 行） */
  toolChainResultContents?: string[];
  /** 对应 Bubble.List items 中下标，与普通泡顺序一致（含占位条；与 conversationBubbleSnapshot 对齐） */
  bubbleMessageIndex?: number;
  /** 当前会话本条消息所在列表的快照：`role` + `content`，与 bubble 顺序一致 */
  conversationBubbleSnapshot?: Array<{ role: string; content: string }>;
  defaultNode: ReactNode;
}

export interface AIChatSidePanelProps extends AIChatCoreProps {
  /** 当前 agent key（可切换） */
  agentKey: string;
  onAgentChange?: (key: string) => void;
  /**
   * Bubble 内 prepare-gen-stories 工具卡（默认 PrepareGenStoriesCard；编剧页可换为基于 genOutline 的卡片）
   */
  prepareGenStoriesCardComponent?: ComponentType<{ onStart: (userPrompt: string) => void }>;
  /** 无消息时在「常用提示词」上方插入（编剧页：默认抽卡表单） */
  sidePanelEmptyExtras?: React.ReactNode;
  /** true：隐藏顶栏「新建对话」「对话历史」（由外部如 @ant-design/x Conversations 接管） */
  sidePanelExternalConversationControl?: boolean;
  /** 顶栏右侧显示关闭按钮，点击时回调（抽卡页等全屏模式使用） */
  sidePanelOnClose?: () => void;
  /**
   * true：不渲染 SidePanel 内置顶栏，会话控件通过 onHeaderTrailingChange 交给外层 Shell（FloatingBottom / Popover）
   */
  sidePanelSuppressBuiltInHeader?: boolean;
  /** 与 sidePanelSuppressBuiltInHeader 配合：向父级 Shell 顶栏右侧注入「新建对话 / 对话历史」 */
  onHeaderTrailingChange?: (node: ReactNode) => void;
  /** 自定义 assistant 消息渲染（抽卡页用于给每个小说雏形注入工具面板） */
  sidePanelAssistantContentRender?: (args: SidePanelAssistantContentRenderArgs) => ReactNode;
  /**
   * 发送前回调：参数在 Sender `onSubmit` 基础上增加 `refIndicator`。
   * 若返回对象，可覆盖随后提交给后端的 `message` / `slotConfig` / `skill`（与 Sender 前三参对齐）。
   */
  onSubmit?: AIChatSidePanelOnSubmit;
}

export const AIChatSidePanel = forwardRef<AIChatSidePanelHandle, AIChatSidePanelProps>(
  function AIChatSidePanel(props, ref) {
  const {
    agentKey,
    onAgentChange,
    enableReasoning,
    prepareGenStoriesCardComponent,
    sidePanelEmptyExtras,
    sidePanelExternalConversationControl = false,
    sidePanelOnClose,
    sidePanelSuppressBuiltInHeader = false,
    onHeaderTrailingChange,
    sidePanelAssistantContentRender,
    onSubmit: sidePanelOnSubmit,
    renderToolMessageContent,
    suppressEmptyConversationPrompts = false,
    suppressDrawerSenderSlots = false,
    allowAgentSwitch = true,
    suppressSenderAgentSkill: suppressSenderAgentSkillProp,
    ...coreProps
  } = props;

  const PrepCardResolved = prepareGenStoriesCardComponent ?? PrepareGenStoriesCard;

  const core = useAIChatCore({
    ...coreProps,
    agentKey,
    onAgentChange,
    enableReasoning,
    suppressDrawerSenderSlots,
    allowAgentSwitch,
    suppressSenderAgentSkill:
      suppressSenderAgentSkillProp ?? (allowAgentSwitch && !!onAgentChange),
  });
  const [refIndicatorItems, setRefIndicatorItems] = useState<RefIndicatorType[]>([]);
  const refIndicatorRef = useRef<RefIndicatorType[]>([]);

  /** 可用 Agent 按钮组：合并注册表 + 暴露的多模态；排除禁止列表；仅保留当前页 mergedAgents 中存在的专家 */
  const availableSkillAgents: SkillAgentDefinition[] = useMemo(() => {
    const { exposedMultimodalAgents: exposedDecls } = coreProps;
    const banned = new Set(coreProps.bannedAgentIds ?? []);
    const registered = getAllSkillAgents();
    const exposed = exposedDecls ? buildExposedMultimodalAgents(exposedDecls) : [];
    const map = new Map<string, SkillAgentDefinition>();
    for (const a of registered) map.set(a.agentId, a);
    for (const a of exposed) map.set(a.agentId, a);
    return Array.from(map.values()).filter((a) => !banned.has(a.agentId));
  }, [coreProps.exposedMultimodalAgents, coreProps.bannedAgentIds]);

  const handleCloseSkillAgent = useCallback(() => {
    onAgentChange?.(MAIN_AGENT_KEY);
  }, [onAgentChange]);

  const handleSelectSkillAgent = useCallback(
    (agentId: string) => {
      const key = expertKeyFromSkillAgentId(agentId);
      if (key) onAgentChange?.(key);
    },
    [onAgentChange]
  );

  /** 配置区字段值 */
  const [configValues, setConfigValues] = useState<Record<string, string | number | boolean>>({});
  const handleConfigChange = useCallback((name: string, value: string | number | boolean) => {
    setConfigValues((prev) => ({ ...prev, [name]: value }));
  }, []);
  useEffect(() => {
    refIndicatorRef.current = refIndicatorItems;
  }, [refIndicatorItems]);

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
    abort,
    handlePromptItemClick,
    dismissToolCardAndSubmit,
    handleSenderChange,
    handleRollbackTo,
    userTurnIndices,
    onSenderPasteFile,
    Sender,
    Bubble,
    Prompts,
    writeBackActions,
    senderPlaceholder,
    validModels,
    selectedChatModelId,
    onChatModelChange,
    reasoningEnabled,
    allowThinkToggle,
    setReasoningEnabled,
  } = core;

  const mergedAgentKeySet = useMemo(() => new Set(mergedAgents.map((a) => a.key)), [mergedAgents]);

  const availableSkillAgentsFiltered = useMemo(
    () =>
      availableSkillAgents.filter((a) => {
        const k = expertKeyFromSkillAgentId(a.agentId);
        return k ? mergedAgentKeySet.has(k) : false;
      }),
    [availableSkillAgents, mergedAgentKeySet]
  );

  const selectedSkillAgent: SkillAgentDefinition | undefined = useMemo(() => {
    if (agentKey === MAIN_AGENT_KEY) return undefined;
    const sid = skillAgentIdFromExpertKey(agentKey);
    return sid ? getSkillAgent(sid) : undefined;
  }, [agentKey]);

  const activeNonMainLabel =
    agentKey !== MAIN_AGENT_KEY ? mergedAgents.find((m) => m.key === agentKey)?.label ?? agentKey : '';

  const footerSkillBarEnabled = allowAgentSwitch && !!onAgentChange && availableSkillAgentsFiltered.length > 0;

  /** draw_tool 的 uiConfig 已含出图数量/比例，写入 core.drawerOptions 供图片请求使用 */
  useEffect(() => {
    if (agentKey !== 'drawer') return;
    if (!selectedSkillAgent?.uiConfig?.showPanel) return;
    const n = configValues.imageCount;
    const ar = configValues.aspectRatio;
    setDrawerOptions((prev) => ({
      ...prev,
      ...(typeof n === 'number' ? { imageCount: n } : {}),
      ...(typeof ar === 'string' && ar ? { aspectRatio: ar as DrawerAspectRatio } : {}),
    }));
  }, [
    agentKey,
    selectedSkillAgent?.uiConfig?.showPanel,
    configValues.imageCount,
    configValues.aspectRatio,
    setDrawerOptions,
  ]);

  /** Sender、emitUserMessage、Prompts：统一走注册的 `onSubmit`（含 refIndicator）；后两者忽略模板 pending */
  const commitOutboundSubmit = useCallback(
    (
      message: string,
      slotConfig: SlotConfigType[] | undefined,
      skill: SkillType | undefined,
      ignorePendingOutbound: boolean
    ) => {
      const trimmed = (message ?? '').trim();
      if (!trimmed) return;
      const refs = refIndicatorRef.current;
      const ret = sidePanelOnSubmit?.(trimmed, slotConfig, skill, refs);
      const finalMessage = typeof ret?.message === 'string' && ret.message.trim() ? ret.message.trim() : trimmed;
      const finalSlots = ret?.slotConfig ?? slotConfig;
      const finalSkill = ret?.skill ?? skill;
      const ephem = (ret?.ephemeralSystemAppend ?? '').trim();
      handleSubmit(finalMessage, finalSlots, finalSkill, {
        ignorePendingOutbound,
        ephemeralSystemAppend: ephem || undefined,
      });
      senderRef.current?.clear?.();
    },
    [sidePanelOnSubmit, handleSubmit, senderRef]
  );

  const handleSenderSubmit = useCallback(
    (message: string, slotConfig?: SlotConfigType[], skill?: SkillType) => {
      commitOutboundSubmit(message, slotConfig, skill, false);
    },
    [commitOutboundSubmit]
  );

  useImperativeHandle(
    ref,
    () => ({
      setRefIndicator: (items: RefIndicatorType[]) => {
        setRefIndicatorItems(Array.isArray(items) ? items : []);
      },
      updateGlobalContext: core.updateGlobalContext,
      emitUserMessage: (textOrPayload: string | AIChatEmitUserMessagePayload) => {
        if (typeof textOrPayload === 'string') {
          commitOutboundSubmit(textOrPayload, undefined, undefined, true);
          return;
        }
        const trimmed = (textOrPayload.displayContent ?? '').trim();
        if (!trimmed) return;
        const ephem = (textOrPayload.ephemeralSystemInstructions ?? '').trim();
        const refs = refIndicatorRef.current;
        const ret = sidePanelOnSubmit?.(trimmed, undefined, undefined, refs);
        const finalMessage =
          typeof ret?.message === 'string' && ret.message.trim() ? ret.message.trim() : trimmed;
        void handleSubmit(finalMessage, undefined, undefined, {
          ignorePendingOutbound: true,
          ephemeralSystemAppend: ephem || undefined,
        });
        senderRef.current?.clear?.();
      },
      emitUserMessageInNewConversation: (text: string) => {
        const trimmed = (text ?? '').trim();
        if (!trimmed) return;
        const refs = refIndicatorRef.current;
        const ret = sidePanelOnSubmit?.(trimmed, undefined, undefined, refs);
        const finalMessage =
          typeof ret?.message === 'string' && ret.message.trim() ? ret.message.trim() : trimmed;
        core.handleSubmitInNewConversation(finalMessage);
      },
      selectConversation: (key: string) => core.handleConversationChange(key),
      newConversation: () => core.handleNewConversation(),
      getActiveConversationKey: () => core.activeKey,
      getConversationsMeta: () => core.convItems,
      renameConversation: (key: string, title: string) => core.renameConversation(key, title),
      setConversationPinned: (key: string, pinned: boolean) => core.setConversationPinned(key, pinned),
      deleteConversation: (key: string) => core.deleteConversation(key),
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
      core.handleSubmitInNewConversation,
      core.handleConversationChange,
      core.handleNewConversation,
      core.renameConversation,
      core.setConversationPinned,
      core.deleteConversation,
      core.activeKey,
      core.convItems,
      onAgentChange,
      commitOutboundSubmit,
      handleSubmit,
      sidePanelOnSubmit,
    ]
  );

  const conversationControls = useMemo(
    () =>
      !sidePanelExternalConversationControl ? (
        <SidePanelConversationControls
          convItems={convItems}
          activeKey={activeKey}
          onNewConversation={handleNewConversation}
          onConversationChange={handleConversationChange}
        />
      ) : null,
    [
      sidePanelExternalConversationControl,
      convItems,
      activeKey,
      handleNewConversation,
      handleConversationChange,
    ],
  );

  useLayoutEffect(() => {
    if (!sidePanelSuppressBuiltInHeader || !onHeaderTrailingChange) return;
    onHeaderTrailingChange(conversationControls);
    return () => onHeaderTrailingChange(null);
  }, [sidePanelSuppressBuiltInHeader, onHeaderTrailingChange, conversationControls]);

  const showBuiltInHeader =
    !sidePanelSuppressBuiltInHeader && (!sidePanelExternalConversationControl || sidePanelOnClose);

  return (
    <Layout
      className="yiman-ai-chat-side-panel"
      style={{
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {showBuiltInHeader && (
      <Header style={{ padding: '0 16px', height: 40, flexShrink: 0, background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Flex align="center" gap={8} />
        <Flex align="center" gap={4}>
          {conversationControls}
          {sidePanelOnClose && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={sidePanelOnClose}
              title="关闭"
            />
          )}
        </Flex>
      </Header>
      )}

      <Content style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', padding: '8px 16px' }}>
        {!hasMessages ? (
          <>
          {sidePanelEmptyExtras && (
            <div style={{ marginBottom: 16 }}>{sidePanelEmptyExtras}</div>
          )}
          {!suppressEmptyConversationPrompts ? (
          <Prompts
            wrap
            title="常用提示词："
            items={promptItems.map((p) => ({ key: p.key, description: p.label }))}
            onItemClick={(info) => {
              const key = (info?.data as { key?: string })?.key;
              const item = promptItems.find((x) => x.key === key);
              if (!item) return;
              // Prompts 点击不经过 Sender onSubmit；与 emitUserMessage 一样走注册的 onSubmit + ref
              if (item.launchTool === 'prepare-gen-stories') {
                handlePromptItemClick(item);
                return;
              }
              commitOutboundSubmit(item.message, undefined, undefined, true);
            }}
            styles={{
              title: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
              item: { display: 'inline-block', margin: '2px 4px 2px 0', padding: '3px 8px' },
            }}
          />
          ) : null}
          </>
        ) : (
          <UnifiedStyleProvider value={coreProps.a2uiConfig?.unifiedStyleSchema}>
          <Bubble.List
            items={bubbleItems}
            className="yiman-bubble-list"
            role={{
              assistant: {
                placement: 'start',
                variant: 'borderless',
                contentRender: (content: string, info?: unknown) => {
                  const ex = (info as {
                    extraInfo?: {
                      reasoningContent?: string;
                      messageId?: string | number;
                      index?: number;
                      toolCallNames?: string[];
                      toolChainResultContents?: string[];
                      pendingGenerateImagesCount?: number;
                      pendingGenerateImagesAspect?: string;
                      pendingGenerateVideo?: boolean;
                      toolResultImages?: string[];
                      toolResultVideoUrl?: string;
                    };
                    status?: string;
                  })?.extraInfo;
                  const status = (info as { status?: string })?.status;
                  const messageId = ex?.messageId;
                  const bubbleMessageIndex =
                    typeof ex?.index === 'number' ? ex.index : undefined;
                  const conversationBubbleSnapshot = bubbleItems.map((bi) => ({
                    role: String(bi.role ?? ''),
                    content: typeof bi.content === 'string' ? bi.content : String(bi.content ?? ''),
                  }));
                  if (
                    typeof content === 'string' &&
                    isToolCardContent(content) &&
                    getToolCardIdFromContent(content) === 'prepare-gen-stories' &&
                    messageId != null
                  ) {
                    return (
                      <PrepCardResolved
                        onStart={(prompt) => dismissToolCardAndSubmit(messageId, prompt)}
                      />
                    );
                  }
                  const defaultNode = (
                    <DrawerBubbleContent
                      content={content}
                      isDrawerAgent={agentKey === 'drawer'}
                      reasoningContent={reasoningEnabled ? (ex?.reasoningContent || '') : undefined}
                      status={status}
                      pendingGenerateImagesCount={ex?.pendingGenerateImagesCount}
                      pendingGenerateImagesAspect={ex?.pendingGenerateImagesAspect}
                      pendingGenerateVideo={ex?.pendingGenerateVideo}
                      toolResultImages={ex?.toolResultImages}
                      toolResultVideoUrl={ex?.toolResultVideoUrl}
                      drawerConfiguredImageCount={agentKey === 'drawer' ? drawerOptions.imageCount : undefined}
                      drawerPlaceholderAspectRatio={
                        agentKey === 'drawer'
                          ? resolveAspectRatio(drawerOptions.aspectRatio, coreProps.canvasAspectRatio)
                          : undefined
                      }
                    />
                  );
                  if (sidePanelAssistantContentRender) {
                    return sidePanelAssistantContentRender({
                      content,
                      reasoningContent: reasoningEnabled ? (ex?.reasoningContent || '') : undefined,
                      status,
                      messageId,
                      toolCallNames: ex?.toolCallNames,
                      toolChainResultContents: ex?.toolChainResultContents,
                      bubbleMessageIndex,
                      conversationBubbleSnapshot,
                      defaultNode,
                    });
                  }
                  return defaultNode;
                },
              },
              user: {
                placement: 'end',
                variant: 'filled',
                shape: 'corner',
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
                        user: {content}
                      </div>
                    </Flex>
                  );
                },
              },
              tool: {
                placement: 'start',
                variant: 'borderless',
                contentRender: (content: string, info?: unknown) => {
                  const toolName = (info as { extraInfo?: { toolCallName?: string } })?.extraInfo
                    ?.toolCallName;
                  if (typeof renderToolMessageContent === 'function') {
                    return renderToolMessageContent(content, { toolName });
                  }
                  if (toolName === 'generate_images') {
                    return <GenerateImagesToolResult content={content} />;
                  }
                  if (toolName === 'generate_video') {
                    return <GenerateVideoToolResult content={content} />;
                  }
                  return null;
                },
              },
              system: { placement: 'start', variant: 'borderless' },
            }}
            autoScroll
            style={{ height: '100%' }}
          />
          </UnifiedStyleProvider>
        )}
      </Content>

      <Footer style={{ padding: '8px 16px', flexShrink: 0, minWidth: 0, overflow: 'hidden', background: 'transparent', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {missingHint && (
          <div style={{ fontSize: 12, color: 'rgba(255,100,100,0.9)', marginBottom: 4 }}>{missingHint}</div>
        )}

        {/* 与 docs/AI-demo/demo.tsx chatSender 一致：纵向留白，输入区独立成块 */}
        <Flex vertical gap={6} className="aichat-sender-wrap" style={{ width: '100%', minWidth: 1, overflow: 'hidden' }}>
        {refIndicatorItems.length > 0 ? (
          <RefIndicatorBar
            items={refIndicatorItems}
            onRemoveKey={(k) => setRefIndicatorItems((p) => p.filter((x) => x.key !== k))}
          />
        ) : null}
        <Sender
          key={`${agentKey}-${composerNonce}`}
          ref={senderRef}
          {...(composerDefaultText != null ? { defaultValue: composerDefaultText } : {})}
          slotConfig={
            senderSkill || (senderSlotConfig?.length ?? 0) > 0
              ? (senderSlotConfig as readonly SlotConfigType[])
              : undefined
          }
          skill={senderSkill}
          header={senderHeader}
          loading={isRequesting}
          placeholder={senderPlaceholder}
          onSubmit={handleSenderSubmit}
          onChange={handleSenderChange}
          onPasteFile={onSenderPasteFile}
          disabled={!hasValidModel}
          autoSize={{ minRows: 1, maxRows: 6 }}

          allowSpeech={true}

          footer={(_oriNode, info) => {
            const comps = info?.components;
            const SendButton = comps?.SendButton;
            const LoadingButton = comps?.LoadingButton;
            const isDrawer = core.agentKey === 'drawer';

            /** 业务方案 §5：上传 → 模型 → 深度思考 → 可用 Agent；选中专家时名称/配置区占位；发送独立靠右 */
            const skillMiddle =
              footerSkillBarEnabled ?
                agentKey !== MAIN_AGENT_KEY ?
                  <>
                    
                    <Button
                      type="primary"
                      size="small"
                      icon={<CloseOutlined />}
                      iconPlacement="end"
                      onClick={handleCloseSkillAgent}
                      aria-label="关闭专家模式"
                    >
                      {selectedSkillAgent?.agentName ?? activeNonMainLabel}
                    </Button>

                    {selectedSkillAgent?.uiConfig?.showPanel &&
                      selectedSkillAgent.uiConfig.fields.map((field) => (
                        <AgentConfigFieldInput
                          key={field.name}
                          field={field}
                          value={configValues[field.name] ?? field.defaultValue}
                          onChange={(v) => handleConfigChange(field.name, v)}
                        />
                      ))}
                    {isDrawer && drawerOptions && !selectedSkillAgent?.uiConfig?.showPanel ?
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
                    : null}
                  </>
                : (
                  renderAgentButtonGroup(
                    availableSkillAgentsFiltered,
                    handleSelectSkillAgent,
                    agentKey
                  )
                )
              : null;

            return (
              <Flex justify="space-between" align="center" gap={8} wrap="wrap" style={{ width: '100%' }}>
                <Flex align="center" gap={8} wrap style={{ flex: 1, minWidth: 0 }}>
                  {/* 附件 / 上传按钮 */}
                  <Button
                    type="text"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => core.setAttachmentsOpen(!core.attachmentsOpen)}
                    title="附件 / 上传"
                  />
                  {/* 模型切换下拉框 */}
                  {validModels.length > 1 && selectedChatModelId && onChatModelChange ?
                    <Select
                      size="small"
                      value={selectedChatModelId}
                      onChange={onChatModelChange}
                      options={validModels.map((m) => ({
                        value: m.id,
                        label: formatModelSelectLabel(m, validModels),
                      }))}
                      style={{ minWidth: 80, maxWidth: 160, width: 'auto', cursor: 'pointer' }}
                      variant="borderless"
                      popupMatchSelectWidth={false}
                      showSearch={{
                        optionFilterProp: 'label',
                      }}
                    />
                  : null}
                  {/* 深度思考按钮 */}
                  {allowThinkToggle ?
                    <IconButton
                      type="default"
                      size="small"
                      icon={<i className="iconfont">&#xe71f;</i>}
                      iconSize={18}
                      enabled={reasoningEnabled}
                      enabledStyle={{ background: 'rgba(23,119,255,0.25)' }}
                      tooltip={
                        reasoningEnabled
                          ? '深度思考已开启，点击关闭'
                          : '深度思考已关闭，点击开启'
                      }
                      aria-label={reasoningEnabled ? '关闭深度思考' : '开启深度思考'}
                      onClick={() => setReasoningEnabled(!reasoningEnabled)}
                    >
                      深度思考
                    </IconButton>
                  : null}
                  {/* 专家模式按钮组 */}
                  {skillMiddle}
                </Flex>
                {/* 发送按钮 */}
                <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
                  {SendButton && LoadingButton ? (
                    isRequesting ? <LoadingButton type="default" /> : <SendButton type="primary" />
                  ) : (
                    <Button
                      type="primary"
                      disabled={!hasValidModel}
                      loading={isRequesting}
                      onClick={() => {
                        const v = senderRef.current?.getValue?.();
                        const raw =
                          v && typeof v === 'object' && 'value' in v ?
                            String((v as { value?: unknown }).value ?? '')
                          : '';
                        const text = raw.trim();
                        if (text) {
                          handleSenderSubmit(
                            text,
                            (v as { slotConfig?: SlotConfigType[] })?.slotConfig,
                            (v as { skill?: SkillType })?.skill
                          );
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
          onCancel={() => {
            abort();
          }}
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

// ── 新架构 §5：辅助组件 ──

/** 渲染可用 Agent 按钮组，超出宽度折叠为 Dropdown */
function renderAgentButtonGroup(
  agents: SkillAgentDefinition[],
  onSelect: (agentId: string) => void,
  activeExpertKey: string,
): ReactNode {
  if (agents.length === 0) return null;

  const maxVisible = 4;
  const visible = agents.slice(0, maxVisible);
  const overflow = agents.slice(maxVisible);

  const overflowMenu: MenuProps['items'] = overflow.map((a) => ({
    key: a.agentId,
    label: a.agentName,
    onClick: () => onSelect(a.agentId),
  }));

  return (
    <>
      {visible.map((a) => {
        const expertKey = expertKeyFromSkillAgentId(a.agentId);
        const active = expertKey != null && expertKey === activeExpertKey;
        return (
          <Button
            key={a.agentId}
            size="small"
            type={active ? 'primary' : 'default'}
            style={{
              fontSize: 12,
              borderRadius: 4,
              ...(!active ?
                {
                  borderColor: 'rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.75)',
                }
              : {}),
            }}
            onClick={() => onSelect(a.agentId)}
          >
            {a.agentName}
          </Button>
        );
      })}
      {overflow.length > 0 && (
        <Dropdown menu={{ items: overflowMenu }} trigger={['click']}>
          <Button
            size="small"
            type="default"
            style={{
              fontSize: 12,
              borderRadius: 4,
              borderColor: 'rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            +{overflow.length} 更多
          </Button>
        </Dropdown>
      )}
    </>
  );
}

/** 渲染 Agent 配置区字段输入控件 */
function AgentConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: AgentUIConfigField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}): ReactNode {
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    whiteSpace: 'nowrap',
  };

  switch (field.type) {
    case 'select':
      return (
        <Flex key={field.name} align="center" gap={4}>
          <span style={labelStyle}>{field.label}：</span>
          <Select
            size="small"
            value={String(value ?? field.defaultValue ?? '')}
            onChange={(v) => onChange(v)}
            options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
            style={{ width: 100 }}
          />
        </Flex>
      );
    case 'number':
      return (
        <Flex key={field.name} align="center" gap={4}>
          <span style={labelStyle}>{field.label}：</span>
          <InputNumber
            size="small"
            min={field.min}
            max={field.max}
            step={field.step}
            value={typeof value === 'number' ? value : (field.defaultValue as number) ?? 1}
            onChange={(v) => onChange(v ?? 1)}
            style={{ width: 64 }}
          />
        </Flex>
      );
    default:
      return null;
  }
}
