/**
 * 原子 Tool：生成文本（generate_text）
 *
 * 使用具备「novel」或「script」能力的模型生成文本段落、故事情节、对白等。
 * 文本通过 chat completions API 完成，返回纯文本内容。
 */
import type { FunctionCallDef } from '../../utils/functionRegistry';
import { registerFunctionCall } from '../../utils/functionRegistry';

async function getTextModel() {
  const { getAISettings } = await import('@/utils/settingsStorage');
  const settings = await getAISettings();
  if (!settings?.models?.length) return null;
  const targetCaps = ['novel', 'script'];
  return settings.models.find(
    (m) =>
      m.capabilityKeys?.some((k: string) => targetCaps.includes(k)) &&
      m.apiUrl?.trim() &&
      (m.isLocal || m.apiKey?.trim()),
  ) ?? null;
}

async function handler(args: {
  prompt: string;
  context?: string;
  tone?: string;
  maxTokens?: number;
}): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  const prompt = (args.prompt ?? '').trim();
  if (!prompt) return { ok: false, error: 'prompt 不能为空' };

  const model = await getTextModel();
  if (!model) {
    return { ok: false, error: '未找到可用的文本生成模型，请在设置中添加具备「小说创作」或「生成剧本」能力的模型' };
  }

  const baseUrl = (model.apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const modelId =
    model.modelDisplayName
      ? [model.modelDisplayName, model.primaryVersion].filter(Boolean).join('-')
      : (model.model || 'gpt-4o-mini');

  const systemMsg = args.tone
    ? `请用「${args.tone}」的语气和风格进行创作。`
    : '你是一个专业的创作助手。';

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemMsg },
  ];
  if (args.context?.trim()) {
    messages.push({ role: 'user', content: `背景上下文：\n${args.context.trim()}` });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(model.isLocal ? {} : { Authorization: `Bearer ${(model.apiKey ?? '').trim()}` }),
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: args.maxTokens ?? 2048,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    return { ok: false, error: t.slice(0, 300) };
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) return { ok: false, error: '模型返回内容为空' };

  return { ok: true, text };
}

export function registerGenerateTextTool(): void {
  const def: FunctionCallDef = {
    name: 'generate_text',
    description:
      '生成文本内容。传入创作提示词（prompt）和可选上下文，调用文本模型生成一段文字（故事情节、对白、描写、说明等）。返回纯文本。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '创作提示词，说明需要生成什么内容。',
        },
        context: {
          type: 'string',
          description: '可选。背景上下文，模型据此进行创作。',
        },
        tone: {
          type: 'string',
          description: '可选。语气风格，如「轻松幽默」「严肃史诗」「悬疑紧张」。',
        },
        maxTokens: {
          type: 'integer',
          description: '可选。生成最大 token 数，默认 2048。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    scope: { type: 'orchestrator' },
    handler,
  };

  registerFunctionCall(def);
}
