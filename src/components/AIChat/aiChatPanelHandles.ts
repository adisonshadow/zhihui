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

export interface ConversationListMetaItem {
  key: string;
  label: string;
  lastActive: number;
  /** 置顶：列表最前展示 */
  pinned?: boolean;
  /** 用户曾手动改名，不再自动标题推导 */
  titleUserLocked?: boolean;
}

export interface AIChatSidePanelHandle {
  updateGlobalContext: (opts: {
    contextBlocks?: Array<{ label: string; content: string }>;
    contextTags?: AIChatContextTag[];
    /** true：传入的 blocks/tags 整表替换；false：blocks 追加，tags 按 id 合并 */
    replace?: boolean;
  }) => void;
  /** 与 Sender submit 等价，写入一条用户消息并触发请求（编剧抽卡卡片等） */
  emitUserMessage: (text: string) => void;
  /** 新建空会话后发送用户消息，避免收藏/工具操作污染当前上下文 */
  emitUserMessageInNewConversation: (text: string) => void;
  /** 切换当前对话会话 */
  selectConversation: (key: string) => void;
  /** 新建会话 */
  newConversation: () => void;
  /** 当前会话 key */
  getActiveConversationKey: () => string | null;
  /** 当前会话列表元信息 */
  getConversationsMeta: () => ConversationListMetaItem[];
  /** 会话元信息持久化改名（写入 titleUserLocked，不再自动推导标题） */
  renameConversation: (key: string, title: string) => void;
  /** 置顶 / 取消置顶 */
  setConversationPinned: (key: string, pinned: boolean) => void;
  /** 删除会话；若删除当前选中则切换到余下最近的一条 */
  deleteConversation: (key: string) => void;
  getSender: () => AIChatSenderHandle;
}
