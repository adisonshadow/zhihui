/**
 * SidePanel ref 与 Sender 命令式 API。见 docs/06 §13
 */
import type { AIChatContextTag } from './types';
import type { TemplateSlotValue } from './registryTypes';

export interface AIChatSenderHandle {
  setAgentKey: (key: string) => void;
  applyPromptTemplate: (templateId: string, slotValues: TemplateSlotValue[]) => void;
  addImageAttachment: (src: string) => Promise<void>;
  setForcedFunctionCalls: (names: string[]) => void;
}

export interface AIChatSidePanelHandle {
  updateGlobalContext: (opts: {
    contextBlocks?: Array<{ label: string; content: string }>;
    contextTags?: AIChatContextTag[];
    /** true：传入的 blocks/tags 整表替换；false：blocks 追加，tags 按 id 合并 */
    replace?: boolean;
  }) => void;
  getSender: () => AIChatSenderHandle;
}
