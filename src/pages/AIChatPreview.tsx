/**
 * AI 对话组件预览页
 * 展示全部展示模式（含底部仅 Sender）+ 多 Agent 切换
 * 仅在 DEV 模式下可访问，路由：/aichat-preview
 * 见功能文档 06 § 12
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Typography, Button, Segmented, Flex, Tag, Divider, Image, App, Tooltip, Splitter } from 'antd';
import { CommentOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { Conversations } from '@ant-design/x';
import type { ConversationItemType } from '@ant-design/x';
import { AIChat, MAIN_AGENT_KEY, type RefIndicatorType, type AIChatSidePanelHandle } from '@/components/AIChat';
// ── 新架构废弃：使用 Footer Agent 按钮组替代 senderLabel slot 机制 ──
// import { registerFunctionCall, unregisterFunctionCall } from '@/components/AIChat';
import type { AIChatMode, AIChatDrawerSessionSync } from '@/components/AIChat';
import { YimanGenLoaderOverlay } from '@/components/AIChat/YimanGenLoaderOverlay';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { formatScriptContextForAI } from '@/types/scriptChat';
import type { ScriptChatContext } from '@/types/scriptChat';
import type { ConversationListMetaItem } from '@/components/AIChat/aiChatPanelHandles';
import { screenwriterSidebarGroup } from '@/novelDesign/components/ScreenwriterHistoryConversations';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';

const { Text } = Typography;

// BottomSender 演示槽位用（与注释掉的 registerFunctionCall 名称对齐）
const PREVIEW_TEST_FUNCTION_NAME = 'generate_preview_image';
const PREVIEW_MODIFY_FUNCTION_NAME = 'modify_preview_image';
const PREVIEW_TEST_FUNCTION_SENDER_LABEL = '生成预览图';
const PREVIEW_MODIFY_FUNCTION_SENDER_LABEL = '按参考图改画';

/** BottomSender 主内容区：占位格与生成结果同宽，便于对齐比例框 */
const BOTTOM_PREVIEW_MAX_W = 520;

function resolvedAspectToCss(ratio: string): string {
  const parts = ratio.split(':').map((s) => s.trim());
  if (parts.length === 2 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return '1 / 1';
}

/** 预览左侧 Conversations：置顶优先，其余按活跃时间倒序 */
function sortPreviewRailConvMeta(items: ConversationListMetaItem[]): ConversationListMetaItem[] {
  return [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const ta = typeof a.lastActive === 'number' && Number.isFinite(a.lastActive) ? a.lastActive : 0;
    const tb = typeof b.lastActive === 'number' && Number.isFinite(b.lastActive) ? b.lastActive : 0;
    return tb - ta;
  });
}

/** 模拟剧本上下文（预览用） */
const MOCK_SCRIPT_CONTEXTS: any[] = [
  {
    id: 'ctx_1',
    type: 'props',
    description: '附加物',
    item: ['樱花书', '喷泉', '孔雀'],
  },
  {
    id: 'ctx_2',
    type: 'props',
    description: '环境',
    item: ['微风', '阳光'],
    epIndex: 12,
    sceneIndex: 27,
  },
];

const MODE_OPTIONS: Array<{ label: string; value: AIChatMode }> = [
  { label: 'SidePanel', value: 'SidePanel' },
  { label: 'FloatingBottom', value: 'FloatingBottom' },
  { label: 'Popover', value: 'Popover' },
  { label: 'BottomSender', value: 'BottomSender' },
];

const MODE_DESC: Record<AIChatMode, string> = {
  SidePanel: '侧边栏布局，占据容器全部高度。',
  FloatingBottom: '固定悬浮在视口右下角，点击气泡按钮展开/收起面板，适合全局入口。',
  Popover: '以任意触发元素打开 Popover 对话框，适合嵌入工具栏或按钮旁。',
  BottomSender: '画布 + 固定在视口底部的仅 Sender',
};

function AIChatPreviewContent() {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const [mode, setMode] = useState<AIChatMode>('SidePanel');
  const [agentKey, setAgentKey] = useState(MAIN_AGENT_KEY);
  const [enableReasoning] = useState(false);
  const [contextTags, setContextTags] = useState<Array<{ id: string; description: string }>>([]);
  /** 预览页：写入 AIChat RefIndicator 条（与 contextTags 独立） */
  const [refIndicatorPreviewItems, setRefIndicatorPreviewItems] = useState<RefIndicatorType[]>([]);
  const chatRef = useRef<AIChatSidePanelHandle | null>(null);

  /** SidePanel：与 AIChat Core 会话列表同步，供左侧常驻 Conversations（对齐 demo.tsx / ScreenwriterAIDrawPage） */
  const [previewConvRail, setPreviewConvRail] = useState<{
    items: ConversationListMetaItem[];
    activeKey: string | null;
  }>({ items: [], activeKey: null });

  /**
   * 切换展示模式时再清空左侧会话预览（仅 UI；与 FloatingBottom/Popover 共用同一 `storageKeySuffix: "preview"`，
   * 顶栏下拉历史与 SidePanel 数据源一致）。
   * 注意：**不要在首次挂载时用 [mode] 无条件清空**：子组件会先通过 onConversationListChange 写入列表，
   * 父级 effect 若在同一轮提交后清空，会把历史记录整块抹掉（表现为「永远看不到历史」）。
   */
  const previewModePrevRef = useRef<AIChatMode | undefined>(undefined);
  useEffect(() => {
    const prev = previewModePrevRef.current;
    if (prev !== undefined && prev !== mode) {
      setPreviewConvRail({ items: [], activeKey: null });
    }
    previewModePrevRef.current = mode;
  }, [mode]);

  const previewRailConversationRows = useMemo((): ConversationItemType[] => {
    const sorted = sortPreviewRailConvMeta(previewConvRail.items);
    const now = Date.now();
    return sorted.map((it) => ({
      key: it.key,
      label: (
        <Typography.Text ellipsis style={{ marginBottom: 0, display: 'block', color: 'inherit' }}>
          {it.label}
        </Typography.Text>
      ),
      group: it.pinned ? '置顶' : screenwriterSidebarGroup(
        typeof it.lastActive === 'number' && Number.isFinite(it.lastActive) ? it.lastActive : 0,
        now,
      ),
    }));
  }, [previewConvRail.items]);

  const [previewDrawerImage, setPreviewDrawerImage] = useState<string | undefined>();
  // ── 新架构：SKILL-SLOT 已废弃，保留状态为 false（Footer Agent 按钮组替代） ──
  const [showPreviewFcSlot, setShowPreviewFcSlot] = useState(false);
  const [showModifyFcSlot, setShowModifyFcSlot] = useState(false);
  const [drawerSession, setDrawerSession] = useState<AIChatDrawerSessionSync | null>(null);
  const drawerSessionRef = useRef<AIChatDrawerSessionSync | null>(null);
  drawerSessionRef.current = drawerSession;
  const prevRequestingRef = useRef(false);

  // ── 新架构废弃：使用 Footer Agent 按钮组替代 senderLabel slot 机制 ──
  /* useEffect(() => {
    registerFunctionCall({
      name: PREVIEW_TEST_FUNCTION_NAME,
      senderLabel: PREVIEW_TEST_FUNCTION_SENDER_LABEL,
      description: '[预览] 测试用工具：在 Sender 中以槽位展示；真实出图请发送描述并等待模型返回',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string', description: '画面描述' } },
      },
      scope: { type: 'agent', agentKey: 'drawer' },
      handler: async () => ({ ok: true, note: 'preview_stub' }),
    });
    registerFunctionCall({
      name: PREVIEW_MODIFY_FUNCTION_NAME,
      senderLabel: PREVIEW_MODIFY_FUNCTION_SENDER_LABEL,
      description: '[预览] 基于附件参考图修改画面；发送时随附件提交，成功后主区域预览更新为首图',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string', description: '修改说明' } },
      },
      scope: { type: 'agent', agentKey: 'drawer' },
      handler: async () => ({ ok: true, note: 'preview_modify_stub' }),
    });
    return () => {
      unregisterFunctionCall(PREVIEW_TEST_FUNCTION_NAME);
      unregisterFunctionCall(PREVIEW_MODIFY_FUNCTION_NAME);
    };
  }, []); */

  const onLastDrawerImageChange = useCallback((src: string | undefined) => {
    setPreviewDrawerImage(src);
  }, []);

  const onDrawerSessionSync = useCallback((s: AIChatDrawerSessionSync) => {
    setDrawerSession(s);
  }, []);

  useEffect(() => {
    const cur = drawerSession?.isRequesting ?? false;
    if (prevRequestingRef.current && !cur && showModifyFcSlot) {
      drawerSessionRef.current?.clearDrawerAttachments();
      setShowModifyFcSlot(false);
    }
    prevRequestingRef.current = cur;
  }, [drawerSession?.isRequesting, showModifyFcSlot]);

  const addPreviewImageToDialog = useCallback(async () => {
    if (!previewDrawerImage?.trim()) return;
    const session = drawerSessionRef.current;
    if (!session) {
      message.warning('会话尚未就绪，请稍后再试');
      return;
    }
    try {
      await session.attachDrawerImageFromSrc(previewDrawerImage);
      setShowPreviewFcSlot(false);
      setShowModifyFcSlot(true);
    } catch (e) {
      console.error(e);
      message.error(e instanceof Error ? e.message : '添加图片到附件失败');
    }
  }, [previewDrawerImage, message]);

  const extraSenderSlotConfig: SlotConfigType[] = useMemo(() => {
    const slots: SlotConfigType[] = [];
    if (showModifyFcSlot) {
      slots.push({
        type: 'custom',
        key: 'preview_fc_modify_preview_image',
        props: {},
        formatResult: () => '',
        customRender: () => (
          <Tooltip title={`tool: ${PREVIEW_MODIFY_FUNCTION_NAME}()`}>
            <Tag
              color="purple"
              style={{ margin: 0, fontSize: 12 }}
              closable
              onClose={() => {
                setShowModifyFcSlot(false);
                drawerSessionRef.current?.clearDrawerAttachments();
              }}
            >
              {PREVIEW_MODIFY_FUNCTION_SENDER_LABEL}
            </Tag>
          </Tooltip>
        ),
      });
    }
    if (showPreviewFcSlot) {
      slots.push({
        type: 'custom',
        key: 'preview_fc_generate_preview_image',
        props: {},
        formatResult: () => '',
        customRender: () => (
          <Tooltip title={`tool: ${PREVIEW_TEST_FUNCTION_NAME}()`}>
            <Tag
              color="geekblue"
              style={{ margin: 0, fontSize: 12 }}
              closable
              onClose={() => setShowPreviewFcSlot(false)}
            >
              {PREVIEW_TEST_FUNCTION_SENDER_LABEL}
            </Tag>
          </Tooltip>
        ),
      });
    }
    return slots;
  }, [showModifyFcSlot, showPreviewFcSlot]);

  const handleRemoveContext = (id: string) => {
    setContextTags((prev) => prev.filter((t) => t.id !== id));
  };

  const addMockContextTag = useCallback((ctx: ScriptChatContext) => {
    setContextTags((prev) => {
      if (prev.some((t) => t.id === ctx.id)) return prev;
      return [...prev, { id: ctx.id, description: ctx.description }];
    });
  }, []);

  const addMockToRefIndicator = useCallback((ctx: ScriptChatContext) => {
    const key = `preview_ref_${ctx.id}`;
    setRefIndicatorPreviewItems((prev) => {
      if (prev.some((x) => x.key === key)) return prev;
      return [
        ...prev,
        {
          key,
          description: ctx.description,
          content: ctx.description,
          icon: <i className='iconfont'>&#xe715;</i>,
        },
      ];
    });
  }, []);

  useEffect(() => {
    if (mode === 'BottomSender') return;
    chatRef.current?.setRefIndicator(refIndicatorPreviewItems);
  }, [mode, refIndicatorPreviewItems]);

  // const writeBackActions = (lastContent: string) => (
  //   <>
  //     <Button size="small" onClick={() => alert(`写回概要（预览）：${lastContent.slice(0, 50)}…`)}>
  //       写回概要
  //     </Button>
  //     <Button size="small" onClick={() => alert(`写回剧本（预览）：${lastContent.slice(0, 50)}…`)}>
  //       写回剧本
  //     </Button>
  //   </>
  // );

  /* commonProps 是 AIChat 组件的通用属性，用于配置 AIChat 组件的通用属性 */
  const commonProps = {
    agentKey, // 指定 Agent 类型
    onAgentChange: setAgentKey, // 切换 Agent 类型
    allowAgentSwitch: true,
    enableReasoning, // 是否启用推理内容展示
    models, // 模型列表
    projectPrompt: '国风修仙漫剧创作项目', // 项目级提示词
    contextBlocks: [ // 上下文 Preset
      { label: '绘图风格设定', content: '国风修仙动漫风格，注重画面细节和色彩搭配，符合国风修仙动漫的审美标准。' },
    ],
    contextTags, // 上下文 Tags
    onRemoveContextTag: handleRemoveContext, // 移除上下文 Tags
    /** 格式化上下文 Tags 为 AI 可读文本 */
    formatContextTags: (tags: typeof contextTags) => {
      const ctx = MOCK_SCRIPT_CONTEXTS.filter((c) => tags.some((t) => t.id === c.id));
      return formatScriptContextForAI(ctx);
    },
    // writeBackActions, // 写回回调（不同专家不同，如剧本专家：写回概要/剧本），接收最后一条 assistant 内容
    senderPlaceholder: '输入您的需求', // Sender 占位提示
    /** 各展示模式共用，使顶栏下拉与会话列表与 SidePanel 读同一套 localStorage */
    storageKeySuffix: 'preview',
    /** BottomSender 分栏内仍演示绘图 Sender 槽位（选「绘图」Agent 后生效） */
    extraSenderSlotConfig: mode === 'BottomSender' ? extraSenderSlotConfig : undefined, // Slot配置
    onLastDrawerImageChange,
    onDrawerSessionSync,
    canvasAspectRatio: '16:9',
    ...(mode === 'SidePanel' ?
      {
        sidePanelExternalConversationControl: true as const,
        onConversationListChange: setPreviewConvRail,
      } :
      {}),
  };

  const bottomShowPlaceholders =
    mode === 'BottomSender' && !!drawerSession?.isRequesting && !drawerSession.hasImageAttachment;
  const bottomShowModifyLoading =
    mode === 'BottomSender' &&
    !!drawerSession?.isRequesting &&
    drawerSession.hasImageAttachment &&
    !!previewDrawerImage;
  const bottomPlaceholderAspect = drawerSession ?
    resolvedAspectToCss(drawerSession.resolvedAspect) :
    '1 / 1';
  const bottomPhCount = Math.min(Math.max(drawerSession?.imageCount ?? 1, 1), 4);

  return (
    <div
      style={{
        padding: 0,
        maxWidth: 960,
        margin: '0 auto',
        height: 'calc(100vh - 112px)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >

      <Flex align="center" gap={16} style={{ flexShrink: 0, marginBottom: 16 }} wrap>
        <Flex align="center" gap={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>模式：</Text>
          <Segmented
            options={MODE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            value={mode}
            onChange={(v) => {
              setMode(v as AIChatMode);
            }}
          />
        </Flex>
        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {MODE_DESC[mode]}
          </Text>
      </Flex>

      <Flex
        align="center"
        gap={12}
        wrap
        style={{ flexShrink: 0, marginBottom: 16 }}
      >
        <Text type="secondary" style={{ fontSize: 13, flexShrink: 0 }}>
          添加到Sender：
        </Text>
        <Flex gap={8} wrap>
          {MOCK_SCRIPT_CONTEXTS.map((c) => {
            const added = contextTags.some((t) => t.id === c.id);
            return (
              <Button
                key={c.id}
                size="small"
                type={added ? 'default' : 'dashed'}
                disabled={added}
                onClick={() => addMockContextTag(c)}
              >
                {added ? `已加入：${c.description}` : `加入「${c.description}」`}
              </Button>
            );
          })}
        </Flex>
      </Flex>

      <Flex
        align="center"
        gap={12}
        wrap
        style={{ flexShrink: 0, marginBottom: 16 }}
      >

        <Text type="secondary" style={{ fontSize: 13, flexShrink: 0 }}>
          添加到RefIndicator：
        </Text>
        <Flex gap={8} wrap>
          {MOCK_SCRIPT_CONTEXTS.map((c) => {
            const key = `preview_ref_${c.id}`;
            const added = refIndicatorPreviewItems.some((x) => x.key === key);
            return (
              <Button
                key={c.id}
                size="small"
                type={added ? 'default' : 'dashed'}
                disabled={added}
                onClick={() => addMockToRefIndicator(c)}
              >
                {added ? `已加入：${c.description}` : `加入「${c.description}」`}
              </Button>
            );
          })}
        </Flex>
      </Flex>

      {mode === 'SidePanel' && (
        <Card
          style={{ flex: 1, minHeight: 0 }}
          styles={{
            body: {
              height: '100%',
              padding: 0,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            },
          }}
        >
          <Splitter orientation="horizontal" style={{ flex: 1, minHeight: 0, height: '100%' }}>
            <Splitter.Panel defaultSize={236} min={176} max={380}>
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  borderRight: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ padding: 10, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <Button
                    block
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => chatRef.current?.newConversation()}
                  >
                    新建对话
                  </Button>
                </div>
                <Typography.Text type="secondary" style={{ padding: '8px 14px 2px', fontSize: 12, flexShrink: 0 }}>
                  历史对话（本地会话）
                </Typography.Text>
                <Conversations
                  groupable
                  items={previewRailConversationRows}
                  activeKey={
                    previewConvRail.activeKey &&
                    previewRailConversationRows.some((item) => String(item.key) === previewConvRail.activeKey) ?
                      previewConvRail.activeKey :
                      undefined
                  }
                  onActiveChange={(key) => {
                    const ks = String(key ?? '');
                    if (!ks || ks === previewConvRail.activeKey) return;
                    chatRef.current?.selectConversation(ks);
                  }}
                  styles={{
                    root: {
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      paddingLeft: 6,
                      paddingRight: 6,
                      paddingBottom: 8,
                    },
                  }}
                />
              </div>
            </Splitter.Panel>
            <Splitter.Panel defaultSize="70%" min={280}>
              <div style={{ height: '100%', minHeight: 0 }}>
                <AIChat ref={chatRef} mode="SidePanel" {...commonProps} />
              </div>
            </Splitter.Panel>
          </Splitter>
        </Card>
      )}

      {mode === 'FloatingBottom' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Card style={{ height: '100%' }}>
            <Text type="secondary">
              FloatingBottom 模式：右下角可见悬浮按钮，点击展开对话面板。面板固定于视口，不受当前卡片影响。
            </Text>
            <Divider />
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              页面其他内容区域…
            </Text>
          </Card>
          <AIChat
            ref={chatRef}
            mode="FloatingBottom"
            floatingTitle="AI 助手（预览）"
            floatingPanelWidth={380}
            floatingPanelHeight={560}
            floatingOffsetRight={32}
            floatingOffsetBottom={32}
            {...commonProps}
          />
        </div>
      )}

      {mode === 'Popover' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Card style={{ height: '100%' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
              Popover 模式：点击下方按钮打开对话框。可将触发元素替换为工具栏图标等。
            </Text>
            <AIChat
              ref={chatRef}
              mode="Popover"
              popoverTitle="AI 助手（预览）"
              popoverWidth={420}
              popoverHeight={540}
              popoverPlacement="right"
              popoverTrigger={
                <Button type="primary" icon={<CommentOutlined />} size="large">
                  打开 AI 对话
                </Button>
              }
              {...commonProps}
            />
          </Card>
        </div>
      )}

      {mode === 'BottomSender' && (
        <>
          <Card
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{
              body: {
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
              },
            }}
          >
            <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                上方为主内容区（可滚动），底栏为真实{' '}
                <Typography.Text code style={{ fontSize: 12 }}>AIChat mode=&quot;BottomSender&quot;</Typography.Text>
                （固定于视口底部）。选「绘图」后演示占位图、预览与添加到附件流程。
              </Text>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                padding: '12px 16px',
                /** 防止内容被固定在视口底部的 Sender 遮住 */
                paddingBottom: 220,
              }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 8 }}>
                （模拟画布区，可滚动）
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
                Sender 独立于本卡片区；DOM 可查 class{' '}
                <Typography.Text code style={{ fontSize: 12 }}>aichat-bottom-sender-container</Typography.Text>。
              </Text>
              {bottomShowPlaceholders && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(bottomPhCount, 2)}, minmax(0, 1fr))`,
                    gap: 10,
                    width: '100%',
                    maxWidth: BOTTOM_PREVIEW_MAX_W,
                    marginBottom: 16,
                  }}
                >
                  {Array.from({ length: bottomPhCount }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,0.06)',
                        width: '100%',
                        aspectRatio: bottomPlaceholderAspect,
                      }}
                    >
                      <YimanGenLoaderOverlay />
                    </div>
                  ))}
                </div>
              )}
              {!bottomShowPlaceholders && previewDrawerImage ?
                <div style={{ width: '100%', maxWidth: BOTTOM_PREVIEW_MAX_W }}>
                  <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>生成结果</Text>
                    <Button type="link" size="small" onClick={() => setPreviewDrawerImage(undefined)}>
                      清除预览
                    </Button>
                  </Flex>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: BOTTOM_PREVIEW_MAX_W,
                      aspectRatio: bottomPlaceholderAspect,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 4 }}>
                      <Button
                        type="primary"
                        size="small"
                        shape="circle"
                        icon={<ImportOutlined />}
                        onClick={addPreviewImageToDialog}
                        title="添加到对话框"
                      />
                    </div>
                    <Image
                      src={previewDrawerImage}
                      alt="预览生成图"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                      preview={{ mask: '预览' }}
                    />
                    {bottomShowModifyLoading ?
                      <YimanGenLoaderOverlay /> :
                      null}
                  </div>
                </div> :
                null}
            </div>
          </Card>
          {/*
            BottomSender 不转发 ref → chatRef.setRefIndicator 无效；画布与底栏并排由页面布局承载。
           */}
          <AIChat mode="BottomSender" {...commonProps} />
        </>
      )}
    </div>
  );
}

export default function AIChatPreview() {
  return (
    <App>
      <AIChatPreviewContent />
    </App>
  );
}
