/**
 * 小说工作台顶栏：封面助手（Popover + novel / drawer 双角色，无 Prompts、无绘图 Slot）
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { Flex, Image, Popover, Typography } from 'antd';
import XMarkdown from '@ant-design/x-markdown';
import type { AIModelConfig } from '@/types/settings';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { AIChat } from '@/components/AIChat';
import type { SidePanelAssistantContentRenderArgs } from '@/components/AIChat/AIChatSidePanel';
import { AGENT_CONFIGS } from '@/components/AIChat/experts';
import { listModelsForAgent } from '@/components/AIChat/hooks/useAgentModel';
import { buildNovelCoverPopoverFunctionCalls } from '@/novelDesign/AITools/novelCoverPopoverFunctionCalls';
import { NovelEditorThoughtChain } from '@/novelDesign/components/NovelEditorThoughtChain';
import { parseDrawerContent } from '@/components/AIChat/utils/drawerContentRender';
import { NOVEL_COVER_POPOVER_PROJECT_PROMPT } from '@/novelDesign/prompts/novelCoverPopoverPrompt';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';

const { Text } = Typography;

const NOVEL_CFG = AGENT_CONFIGS.find((a) => a.key === 'novel')!;
const DRAWER_CFG = AGENT_CONFIGS.find((a) => a.key === 'drawer')!;

export interface NovelCoverAiPopoverProps {
  novelId: string;
  models: AIModelConfig[] | undefined;
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  onCoverSaved: () => void;
  /** 顶栏触发控件 */
  trigger: ReactNode;
}

export function NovelCoverAiPopover({ novelId, models, getSnapshot, onCoverSaved, trigger }: NovelCoverAiPopoverProps) {
  const coverCandidatesRef = useRef<string[]>([]);
  const config = useConfigSubscribe();
  const coverCount = config?.novelWriter?.coverImageCount ?? 4;

  const novelOk = listModelsForAgent(models, NOVEL_CFG).length > 0;
  const drawerModels = listModelsForAgent(models, DRAWER_CFG);
  const drawerOk = drawerModels.length > 0;
  const canUse = novelOk && drawerOk;

  const imageModelRef = useRef<AIModelConfig | null>(null);
  imageModelRef.current = drawerModels[0] ?? null;

  const extraFunctionCalls = useMemo(
    () =>
      buildNovelCoverPopoverFunctionCalls({
        getSnapshot,
        novelId,
        getImageModel: () => imageModelRef.current,
        coverCandidatesRef,
        onCoverSaved,
        coverCount,
      }),
    [getSnapshot, novelId, onCoverSaved, coverCount]
  );

  if (!canUse) {
    return (
      <Popover
        trigger="click"
        content={
          <div style={{ maxWidth: 280, padding: 4 }}>
            <Text type="secondary">
              请先在设置中为模型勾选「小说创作」与「绘图」能力并配置 API，再使用封面助手。
            </Text>
          </div>
        }
      >
        {trigger}
      </Popover>
    );
  }

  return (
    <AIChat
      mode="Popover"
      agentKey="novel"
      allowAgentSwitch
      models={models}
      storageKeySuffix={`novel-cover-popover:${novelId}`}
      projectPrompt={NOVEL_COVER_POPOVER_PROJECT_PROMPT}
      extraFunctionCalls={extraFunctionCalls}
      suppressEmptyConversationPrompts
      suppressAgentSenderWelcome
      suppressSenderAgentSkill
      suppressDrawerSenderSlots
      renderToolMessageContent={() => null}
      sidePanelAssistantContentRender={({
        content,
        toolCallNames,
        status,
        bubbleMessageIndex,
        conversationBubbleSnapshot,
        defaultNode,
      }: SidePanelAssistantContentRenderArgs) => {
        const isStreaming = status === 'loading' || status === 'updating';

        // 从 coverCandidatesRef 读取新生成的封面图（不加入 tool result 以避免撑爆 LLM 上下文）。
        // choice 落盘后 ref 被清空，故后续消息不会重复展示。
        const refImages = coverCandidatesRef.current.length > 0
          ? coverCandidatesRef.current.filter(Boolean)
          : [];

        // 解析 AI 回复中的图片
        const { images: contentImages, text: contentText } = parseDrawerContent(content);
        const allImages = [...new Set([...contentImages, ...refImages])];
        const displayText = contentText || content;

        // 构建 ThoughtChain
        const bubbleToolResults: string[] = [];
        if (
          conversationBubbleSnapshot?.length &&
          typeof bubbleMessageIndex === 'number' &&
          (toolCallNames?.length ?? 0) > 0
        ) {
          for (let i = bubbleMessageIndex + 1; i < conversationBubbleSnapshot.length; i++) {
            const row = conversationBubbleSnapshot[i];
            if (row?.role === 'tool') {
              bubbleToolResults.push(row.content);
            } else if (row?.role === 'user' || row?.role === 'assistant') {
              break;
            }
          }
        }

        const toolChainNodes =
          toolCallNames?.length
            ? toolCallNames.map((name, i) => (
                <NovelEditorThoughtChain
                  key={`${name}_${bubbleMessageIndex}_${i}`}
                  toolCallNames={[name]}
                  toolResultContents={[bubbleToolResults[i] ?? '']}
                  streaming={isStreaming}
                />
              ))
            : null;

        // 有图片：Markdown → ThoughtChain → 图片网格
        if (allImages.length > 0) {
          return (
            <Flex vertical gap={8}>
              {displayText ? (
                <XMarkdown
                  content={displayText}
                  streaming={{ hasNextChunk: isStreaming, enableAnimation: true }}
                />
              ) : null}
              {toolChainNodes}
              <Image.PreviewGroup>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      allImages.length === 1
                        ? '1fr'
                        : 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: 8,
                    maxWidth: 400,
                  }}
                >
                  {allImages.map((src, i) => (
                    <Image
                      key={`cover_${bubbleMessageIndex}_${i}_${src.slice(0, 48)}`}
                      src={src}
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        objectFit: 'contain',
                        maxHeight: 200,
                      }}
                      alt={`封面候选 ${i + 1}`}
                    />
                  ))}
                </div>
              </Image.PreviewGroup>
            </Flex>
          );
        }

        // 无图片：默认渲染 + ThoughtChain
        if (toolChainNodes) {
          return (
            <Flex vertical gap={8}>
              {defaultNode}
              {toolChainNodes}
            </Flex>
          );
        }

        return defaultNode;
      }}
      sidePanelEmptyExtras={
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.72)',
            minHeight: 120,
            padding: '4px 0 12px',
          }}
        >
          <p style={{ margin: '0 0 8px' }}>在下方输入并发送即可开始（例如「开始」或描述想要的封面气质）。</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            助手会先调用工具读取故事大纲，再生成 {coverCount} 张候选图；选定后请回复「第 N 张」完成封面。
          </p>
        </div>
      }
      popoverTitle="封面助手"
      popoverTrigger={trigger}
      popoverWidth={440}
      popoverHeight={580}
      popoverPlacement="bottomLeft"
      senderPlaceholder="例如：开始根据大纲生成封面候选"
      enableReasoning={false}
    />
  );
}
