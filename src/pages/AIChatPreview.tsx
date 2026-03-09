/**
 * AI 对话组件预览页
 * 用于开发调试与 Web 模式下快速体验，展示 SidePanel 模式 + 剧本专家
 */
import { useState } from 'react';
import { Card, Typography, Button } from 'antd';
import { AIChat, MAIN_AGENT_KEY } from '@/components/AIChat';
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

function contextTagsFromScript(ctx: ScriptChatContext[]): { id: string; description: string }[] {
  return ctx.map((c) => ({ id: c.id, description: c.description }));
}

export default function AIChatPreview() {
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const [agentKey, setAgentKey] = useState(MAIN_AGENT_KEY);
  const [contextTags, setContextTags] = useState(() => contextTagsFromScript(MOCK_SCRIPT_CONTEXTS));

  const handleRemoveContext = (id: string) => {
    setContextTags((prev) => prev.filter((t) => t.id !== id));
  };

  const writeBackActions = (lastContent: string) => (
    <>
      <Button size="small" onClick={() => alert(`写回概要（预览模式）：${lastContent.slice(0, 50)}…`)}>
        写回概要
      </Button>
      <Button size="small" onClick={() => alert(`写回剧本（预览模式）：${lastContent.slice(0, 50)}…`)}>
        写回剧本
      </Button>
    </>
  );

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 900,
        margin: '0 auto',
        height: 'calc(100vh - 112px)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Title level={4} style={{ flexShrink: 0 }}>AI 对话组件预览</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16, flexShrink: 0 }}>
        展示 SidePanel 模式 + 剧本专家，支持切换专家角色、对话列表、回退、附件、上下文 Tag。
        在 Web 模式下可通过项目列表 header 的「AI 对话预览」进入。
      </Text>

      <Card
        styles={{ body: { height: '100vh' } }}
      >
        <AIChat
          mode="SidePanel"
          agentKey={agentKey}
          onAgentChange={setAgentKey}
          allowAgentSwitch
          models={models}
          projectPrompt="预览模式：无项目级自定义提示词"
          contextBlocks={[
            { label: '当前概要', content: '主角收到神秘信件，决定追查真相。' },
            { label: '当前剧本', content: '场景1 客厅\n小明：这是什么？\n小红：我也不知道，打开看看。' },
          ]}
          contextTags={contextTags}
          onRemoveContextTag={handleRemoveContext}
          formatContextTags={(tags) => {
            const ctx = MOCK_SCRIPT_CONTEXTS.filter((c) => tags.some((t) => t.id === c.id));
            return formatScriptContextForAI(ctx);
          }}
          writeBackActions={writeBackActions}
          senderPlaceholder="输入您的需求"
          storageKeySuffix="preview"
        />
      </Card>
    </div>
  );
}
