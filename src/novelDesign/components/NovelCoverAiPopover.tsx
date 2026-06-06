/**
 * 小说工作台顶栏：封面助手（Popover + novel / drawer 双角色，无 Prompts、无绘图 Slot）
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { Popover, Typography } from 'antd';
import type { AIModelConfig } from '@/types/settings';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { AIChat } from '@/components/AIChat';
import { AGENT_CONFIGS } from '@/components/AIChat/experts';
import { listModelsForAgent } from '@/components/AIChat/hooks/useAgentModel';
import { buildNovelCoverPopoverFunctionCalls } from '@/novelDesign/AITools/novelCoverPopoverFunctionCalls';
import { buildNovelCoverPopoverProjectPrompt } from '@/novelDesign/prompts/novelCoverPopoverPrompt';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { normalizeNovelWriterAuthorName } from '@/utils/novelWriterAuthorName';

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
  const sanitizedAuthorName = normalizeNovelWriterAuthorName(config?.novelWriter?.authorName);

  const projectPrompt = useMemo(
    () => buildNovelCoverPopoverProjectPrompt({ authorName: sanitizedAuthorName }),
    [sanitizedAuthorName],
  );

  const novelOk = listModelsForAgent(models, NOVEL_CFG).length > 0;
  const drawerModels = listModelsForAgent(models, DRAWER_CFG);
  const drawerOk = drawerModels.length > 0;
  const canUse = novelOk && drawerOk;

  const extraFunctionCalls = useMemo(
    () =>
      buildNovelCoverPopoverFunctionCalls({
        getSnapshot,
        novelId,
        coverCandidatesRef,
        onCoverSaved,
        coverCount,
        ...(sanitizedAuthorName ? { coverAuthorName: sanitizedAuthorName } : {}),
      }),
    [getSnapshot, novelId, onCoverSaved, coverCount, sanitizedAuthorName],
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
      enableReasoning={true}
      storageKeySuffix={`novel-cover-popover:${novelId}`}
      projectPrompt={projectPrompt}
      extraFunctionCalls={extraFunctionCalls}
      suppressEmptyConversationPrompts
      suppressAgentSenderWelcome
      suppressSenderAgentSkill
      suppressDrawerSenderSlots
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
            {sanitizedAuthorName ? ` 封面将按设置要求带上「作者 ${sanitizedAuthorName}」署名。` : ''}
          </p>
        </div>
      }
      popoverTitle="封面助手"
      popoverTrigger={trigger}
      popoverWidth={440}
      popoverHeight={580}
      popoverPlacement="bottomLeft"
      senderPlaceholder="例如：开始根据大纲生成封面候选"
      senderInitialText="开始吧"
    />
  );
}
