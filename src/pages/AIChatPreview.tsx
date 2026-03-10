/**
 * AI 对话组件预览页
 * 展示全部三种模式（SidePanel / FloatingBottom / Popover）+ 多 Agent 切换
 * 仅在 DEV 模式下可访问，路由：/aichat-preview
 * 见功能文档 06 § 12
 */
import { useState } from 'react';
import { Card, Typography, Button, Segmented, Flex, Tag, Divider, Switch } from 'antd';
import { CommentOutlined } from '@ant-design/icons';
import { AIChat, MAIN_AGENT_KEY } from '@/components/AIChat';
import type { AIChatMode } from '@/components/AIChat';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { formatScriptContextForAI } from '@/types/scriptChat';
import type { ScriptChatContext } from '@/types/scriptChat';
import '@ant-design/x-markdown/themes/dark.css';

const { Title, Text } = Typography;

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
];

const MODE_DESC: Record<AIChatMode, string> = {
  SidePanel: '侧边栏布局，占据当前容器全部高度，适合设计器侧栏、详情页等场景。',
  FloatingBottom: '固定悬浮在视口右下角，点击气泡按钮展开/收起面板，适合全局入口。',
  Popover: '以任意触发元素打开 Popover 对话框，适合嵌入工具栏或按钮旁。',
};

function contextTagsFromScript(ctx: ScriptChatContext[]): { id: string; description: string }[] {
  return ctx.map((c) => ({ id: c.id, description: c.description }));
}

export default function AIChatPreview() {
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const [mode, setMode] = useState<AIChatMode>('SidePanel');
  const [agentKey, setAgentKey] = useState(MAIN_AGENT_KEY);
  const [enableReasoning, setEnableReasoning] = useState(false);
  const [contextTags, setContextTags] = useState(() => contextTagsFromScript(MOCK_SCRIPT_CONTEXTS));

  const handleRemoveContext = (id: string) => {
    setContextTags((prev) => prev.filter((t) => t.id !== id));
  };

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
    agentKey,
    onAgentChange: setAgentKey,
    allowAgentSwitch: true,
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
    senderPlaceholder: '输入您的需求',
    storageKeySuffix: `preview-${mode}`,
  };

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
            onChange={(v) => setMode(v as AIChatMode)}
          />
        </Flex>
        <Flex align="center" gap={8}>
          <Switch
            size="small"
            checked={enableReasoning}
            onChange={setEnableReasoning}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            推理内容展示（适用于火山引擎 doubao-seed 等推理模型）
          </Text>
        </Flex>
      </Flex>

      {mode === 'SidePanel' && (
        <Card
          style={{ flex: 1, minHeight: 0 }}
          styles={{ body: { height: '100%', padding: 0 } }}
        >
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
    </div>
  );
}
