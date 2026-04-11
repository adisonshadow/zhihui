/**
 * 推理对话 Provider（OpenAI stream 兼容，支持 reasoning_content 字段）
 *
 * 适配来源：火山引擎（volcengine）等具有推理步骤的模型
 * 协议：OpenAI chat.completions 流式格式，delta 中携带可选的 reasoning_content 字段
 *
 * ⚠️ 关键实现细节：
 * XRequest 处理 SSE 流时，每个 SSE data 行以 { data: 'json_string' } 形式传入 transformMessage，
 * chunk.data 是原始 JSON 字符串，需要手动 JSON.parse 后才能访问 choices[0].delta。
 *
 * 参考：https://ant-design-x.antgroup.com/x-sdks/chat-provider-custom-cn
 * 见功能文档 06 § Provider 配置
 */
import { AbstractChatProvider, XRequest } from '@ant-design/x-sdk';
import type { AIModelConfig } from '@/types/settings';

/**
 * XRequest SSE 流式单元格式：
 * 每个 SSE `data:` 行的内容被包裹为 { data: string }，
 * data 字段为原始 JSON 字符串（或 '[DONE]' 结束标记）
 */
type SseChunk = { data: string };

/** 请求参数（OpenAI chat.completions 格式） */
interface ChatInput {
  messages: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

/** 包含推理内容的对话消息类型 */
export interface ReasoningMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 推理/思考过程（流式累积，仅 assistant 消息存在） */
  reasoningContent?: string;
}

/**
 * ReasoningChatProvider — OpenAI 兼容流式 Chat Provider
 *
 * 相比内置 OpenAIChatProvider，额外处理 delta.reasoning_content 字段（火山引擎等推理模型）。
 * 当流式响应中无 reasoning_content 时，行为与 OpenAIChatProvider 完全一致。
 *
 * enableReasoning=false 时，向火山引擎等支持 thinking 参数的 API 发送
 * `thinking: { type: 'disabled' }` 以关闭模型推理过程，减少延迟和 token 消耗。
 */
export class ReasoningChatProvider extends AbstractChatProvider<
  ReasoningMessage,
  ChatInput,
  SseChunk
> {
  constructor(modelConfig: AIModelConfig | null, enableReasoning: boolean = true) {
    const baseURL =
      (modelConfig?.apiUrl?.trim() || 'https://api.openai.com/v1')
        .replace(/\/$/, '') + '/chat/completions';

    const params: Record<string, unknown> = {
      stream: true,
      model: modelConfig?.model?.trim() || 'gpt-3.5-turbo',
    };

    // 火山引擎 doubao-seed 等支持 thinking 参数的模型：
    // enableReasoning=false 时发送 thinking.type=disabled 关闭推理，节省延迟
    if (!enableReasoning) {
      params.thinking = { type: 'disabled' };
    }

    super({
      request: XRequest<ChatInput, SseChunk>(baseURL, {
        manual: true,
        params,
        headers: modelConfig?.apiKey
          ? { Authorization: `Bearer ${modelConfig.apiKey}` }
          : undefined,
      }),
    });
  }

  transformParams(
    requestParams: Partial<ChatInput>,
    options: { params?: Partial<ChatInput> }
  ): ChatInput {
    return {
      messages: [],
      ...(options?.params || {}),
      ...(requestParams || {}),
    } as ChatInput;
  }

  transformLocalMessage(requestParams: Partial<ChatInput>): ReasoningMessage {
    const msgs = requestParams?.messages ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    return { role: 'user', content: lastUser?.content ?? '' };
  }

  /**
   * 增量累加每个 SSE chunk 的 delta，与官方 demo 的 originMessage + chunk 模式一致。
   *
   * 关键：XRequest 将每个 SSE `data:` 行以 { data: 'json_string' } 传入，
   * 必须先 JSON.parse(chunk.data) 才能拿到 choices[0].delta。
   * 使用 originMessage 保存已累积内容，每次只处理当前 chunk，避免流式阶段 chunks 不可用导致内容消失。
   */
  transformMessage(info: {
    originMessage?: ReasoningMessage;
    chunk: SseChunk;
    chunks: SseChunk[];
    status: string;
  }): ReasoningMessage {
    const { originMessage, chunk } = info;

    const prevContent = originMessage?.content ?? '';
    const prevReasoning = originMessage?.reasoningContent ?? '';

    // 无新 chunk → 返回当前已累积状态（onSuccess 最终调用时）
    if (!chunk) {
      return {
        role: 'assistant',
        content: prevContent,
        ...(prevReasoning ? { reasoningContent: prevReasoning } : {}),
      };
    }

    const dataStr = (chunk as SseChunk)?.data?.trim();
    if (!dataStr || dataStr === '[DONE]') {
      return {
        role: 'assistant',
        content: prevContent,
        ...(prevReasoning ? { reasoningContent: prevReasoning } : {}),
      };
    }

    let parsed: {
      choices?: Array<{
        delta?: {
          content?: string;
          reasoning_content?: string;
          role?: string;
        };
      }>;
      error?: { message?: string };
    };

    try {
      parsed = JSON.parse(dataStr);
    } catch {
      return {
        role: 'assistant',
        content: prevContent,
        ...(prevReasoning ? { reasoningContent: prevReasoning } : {}),
      };
    }

    // API 层错误（如认证失败），以 error 字段返回
    if (parsed?.error?.message) {
      return { role: 'assistant', content: parsed.error.message };
    }

    const delta = parsed?.choices?.[0]?.delta;
    if (!delta) {
      return {
        role: 'assistant',
        content: prevContent,
        ...(prevReasoning ? { reasoningContent: prevReasoning } : {}),
      };
    }

    const newContent = prevContent + (delta.content ?? '');
    const newReasoning = prevReasoning + (delta.reasoning_content ?? '');

    return {
      role: 'assistant',
      content: newContent,
      ...(newReasoning ? { reasoningContent: newReasoning } : {}),
    };
  }
}
