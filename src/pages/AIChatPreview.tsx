/**
 * AI 对话组件预览页
 * 展示全部展示模式（含底部仅 Sender）+ 多 Agent 切换
 * 仅在 DEV 模式下可访问，路由：/aichat-preview
 * 见功能文档 06 § 12
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Typography, Button, Segmented, Flex, Tag, Divider, Switch, Image, App, Tooltip } from 'antd';
import { CommentOutlined, ImportOutlined } from '@ant-design/icons';
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import { AIChat, MAIN_AGENT_KEY } from '@/components/AIChat';
import { registerFunctionCall, unregisterFunctionCall } from '@/components/AIChat';
import type { AIChatMode, AIChatDrawerSessionSync } from '@/components/AIChat';
import { YimanGenLoaderOverlay } from '@/components/AIChat/YimanGenLoaderOverlay';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { formatScriptContextForAI } from '@/types/scriptChat';
import type { ScriptChatContext } from '@/types/scriptChat';
import '@ant-design/x-markdown/themes/dark.css';

const { Title, Text } = Typography;

const PREVIEW_TEST_FUNCTION_NAME = 'generate_preview_image';
const PREVIEW_MODIFY_FUNCTION_NAME = 'modify_preview_image';
/** Sender 槽位展示用语义化文案（与 registerFunctionCall.senderLabel 一致） */
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

/** 模拟剧本上下文（预览用） */
const MOCK_SCRIPT_CONTEXTS: ScriptChatContext[] = [
  {
    id: 'ctx_1',
    type: 'episode',
    description: '第1集：开端',
    episode: { title: '开端', summary: '主角发现神秘信件', characterRefs: [] },
    epIndex: 0,
  },
  {
    id: 'ctx_2',
    type: 'scene',
    description: '场景1：客厅',
    scene: {
      title: '客厅',
      summary: '两人对话',
      location: '客厅',
      timeOfDay: '傍晚',
      atmosphere: '紧张',
      dramaTags: ['conflict'],
    },
    epIndex: 0,
    sceneIndex: 0,
  },
];

const MODE_OPTIONS: Array<{ label: string; value: AIChatMode }> = [
  { label: 'SidePanel', value: 'SidePanel' },
  { label: 'FloatingBottom', value: 'FloatingBottom' },
  { label: 'Popover', value: 'Popover' },
  { label: 'BottomSender', value: 'BottomSender' },
];

const MODE_DESC: Record<AIChatMode, string> = {
  SidePanel: '侧边栏布局，占据当前容器全部高度，适合设计器侧栏、详情页等场景。',
  FloatingBottom: '固定悬浮在视口右下角，点击气泡按钮展开/收起面板，适合全局入口。',
  Popover: '以任意触发元素打开 Popover 对话框，适合嵌入工具栏或按钮旁。',
  BottomSender: '仅底部输入条（Sender），无对话列表；适合画布底部嵌入。本页附带占位图与测试 Function Call 槽位演示。',
};

function AIChatPreviewContent() {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const [mode, setMode] = useState<AIChatMode>('SidePanel');
  const [agentKey, setAgentKey] = useState(MAIN_AGENT_KEY);
  const [enableReasoning, setEnableReasoning] = useState(false);
  const [contextTags, setContextTags] = useState<Array<{ id: string; description: string }>>([]);

  const [previewDrawerImage, setPreviewDrawerImage] = useState<string | undefined>();
  const [showPreviewFcSlot, setShowPreviewFcSlot] = useState(false);
  const [showModifyFcSlot, setShowModifyFcSlot] = useState(false);
  const [drawerSession, setDrawerSession] = useState<AIChatDrawerSessionSync | null>(null);
  const drawerSessionRef = useRef<AIChatDrawerSessionSync | null>(null);
  drawerSessionRef.current = drawerSession;
  const prevRequestingRef = useRef(false);

  useEffect(() => {
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
  }, []);

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

  const writeBackActions = (lastContent: string) => (
    <>
      <Button size="small" onClick={() => alert(`写回概要（预览）：${lastContent.slice(0, 50)}…`)}>
        写回概要
      </Button>
      <Button size="small" onClick={() => alert(`写回剧本（预览）：${lastContent.slice(0, 50)}…`)}>
        写回剧本
      </Button>
    </>
  );

  const commonProps = {
    agentKey: mode === 'BottomSender' ? 'drawer' : agentKey,
    onAgentChange: mode === 'BottomSender' ? undefined : setAgentKey,
    allowAgentSwitch: mode !== 'BottomSender',
    enableReasoning,
    models,
    projectPrompt: '预览模式：无项目级自定义提示词',
    contextBlocks: [
      { label: '当前概要', content: '主角收到神秘信件，决定追查真相。' },
      { label: '当前剧本', content: '场景1 客厅\n小明：这是什么？\n小红：我也不知道，打开看看。' },
    ],
    contextTags,
    onRemoveContextTag: handleRemoveContext,
    formatContextTags: (tags: typeof contextTags) => {
      const ctx = MOCK_SCRIPT_CONTEXTS.filter((c) => tags.some((t) => t.id === c.id));
      return formatScriptContextForAI(ctx);
    },
    writeBackActions,
    senderPlaceholder: mode === 'BottomSender' ? '描述要生成的画面，Enter 发送' : '输入您的需求',
    storageKeySuffix: `preview-${mode}`,
    extraSenderSlotConfig: mode === 'BottomSender' ? extraSenderSlotConfig : undefined,
    onLastDrawerImageChange: mode === 'BottomSender' ? onLastDrawerImageChange : undefined,
    onDrawerSessionSync: mode === 'BottomSender' ? onDrawerSessionSync : undefined,
    canvasAspectRatio: mode === 'BottomSender' ? '16:9' : undefined,
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
        padding: 24,
        maxWidth: 960,
        margin: '0 auto',
        height: 'calc(100vh - 112px)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Flex justify="space-between" align="flex-start" style={{ flexShrink: 0, marginBottom: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>AI 对话组件预览</Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {MODE_DESC[mode]}
          </Text>
        </div>
        <Tag color="blue" style={{ marginTop: 4 }}>DEV only</Tag>
      </Flex>

      <Flex align="center" gap={16} style={{ flexShrink: 0, marginBottom: 16 }} wrap>
        <Flex align="center" gap={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>展示模式：</Text>
          <Segmented
            options={MODE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            value={mode}
            onChange={(v) => {
              setMode(v as AIChatMode);
              if (v === 'BottomSender') {
                setPreviewDrawerImage(undefined);
                setDrawerSession(null);
                setShowModifyFcSlot(false);
              }
            }}
          />
        </Flex>
        {mode !== 'BottomSender' && (
          <Flex align="center" gap={8}>
            <Switch size="small" checked={enableReasoning} onChange={setEnableReasoning} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              推理内容展示（适用于火山引擎 doubao-seed 等推理模型）
            </Text>
          </Flex>
        )}
      </Flex>

      <Flex
        align="center"
        gap={12}
        wrap
        style={{ flexShrink: 0, marginBottom: 16 }}
      >
        <Text type="secondary" style={{ fontSize: 13, flexShrink: 0 }}>
          剧本上下文（加入 Sender）：
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

      {mode === 'SidePanel' && (
        <Card style={{ flex: 1, minHeight: 0 }} styles={{ body: { height: '100%', padding: 0 } }}>
          <AIChat mode="SidePanel" {...commonProps} />
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
              mode="Popover"
              popoverTitle="AI 助手（预览）"
              popoverWidth={420}
              popoverHeight={540}
              popoverPlacement="topLeft"
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
        <Card
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' } }}
        >
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, flexShrink: 0 }}>
            本模式固定为「绘图师」且不可切换 Agent；需先在设置中配置具备绘图能力的模型。向下滚动主区域时，输入条会 sticky 在卡片底部。
          </Text>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flex: '1 0 auto', minHeight: 360, padding: '8px 0 24px' }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 12 }}>
                （主内容区：模拟画布；增高区域用于验证底部 Sender sticky）
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
                占位与生成图都在主内容区。出图请求中按数量与比例显示占位与加载动画；生成结果右上角可将图加入对话框附件并插入改图 Function Call 槽位；改图请求中在原图上叠加载动画。
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
              {!bottomShowPlaceholders && !previewDrawerImage ?
                <button
                  type="button"
                  onClick={() => setShowPreviewFcSlot(true)}
                  style={{
                    maxWidth: BOTTOM_PREVIEW_MAX_W,
                    width: '100%',
                    minHeight: 140,
                    borderRadius: 8,
                    border: '1px dashed rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 16,
                    textAlign: 'left',
                  }}
                >
                  空白占位（点击后在<strong style={{ color: 'rgba(255,255,255,0.75)' }}>底部 Sender</strong>内显示槽位「
                  <strong style={{ color: 'rgba(120,180,255,0.95)' }}>{PREVIEW_TEST_FUNCTION_SENDER_LABEL}</strong>
                  」，悬停槽位可看 tool 名 <code style={{ color: 'rgba(120,180,255,0.75)' }}>{PREVIEW_TEST_FUNCTION_NAME}</code>）
                </button> :
                null}
            </div>
            <AIChat mode="BottomSender" {...commonProps} />
          </div>
        </Card>
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
