/**
 * AI 优化 MiMo VoiceDesign「音色描述」：复用 novel/script 文本模型选择与请求形态（与 generate_text 对齐）
 */
import { getAISettings } from '@/utils/settingsStorage';

async function pickNovelScriptTextModel() {
  const settings = await getAISettings();
  if (!settings?.models?.length) return null;
  const caps = ['novel', 'script'];
  return (
    settings.models.find(
      (m) =>
        m.capabilityKeys?.some((k: string) => caps.includes(k)) &&
        m.apiUrl?.trim() &&
        (m.isLocal || m.apiKey?.trim()),
    ) ?? null
  );
}

const SYSTEM_PROMPT = `你是语音合成音色设计方向的助理。用户会给出简短的音色想法，你需要改写成适配 TTS「音色描述 / prompt」的 1～2 句中文白描（适用于 MiMo、Qwen、MiniMax 等声音设计 API）。

硬性约束：
- 只描写声音本体：年龄段、性别或大类型、音色质感、语速节奏习惯、语气与情绪底色；不要写具体剧情、场景地点、对白对象或肢体动作。
- 不要出现括号内的表演提示或拟声括号说明；不要使用「他开始说」「她转过头」一类叙事。
- 总字数尽量控制在约 120 字以内，输出纯净文本一行或两段以内，不要加引号、标题或条目符号。`;

export async function optimizeMimoVoiceDescription(userDraft: string): Promise<
  | { ok: true; text: string }
  | { ok: false; error: string }
> {
  const raw = userDraft.trim();
  if (!raw) return { ok: false, error: '描述为空' };

  const model = await pickNovelScriptTextModel();
  if (!model) {
    return {
      ok: false,
      error: '未找到可用的文本模型，请在设置中添加具备「小说创作」或「生成剧本」能力且 API 就绪的模型',
    };
  }

  const baseUrl = (model.apiUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const modelId =
    model.modelDisplayName
      ? [model.modelDisplayName, model.primaryVersion].filter(Boolean).join('-')
      : (model.model || 'gpt-4o-mini');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(model.isLocal ? {} : { Authorization: `Bearer ${(model.apiKey ?? '').trim()}` }),
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请将以下音色想法改写为符合约束的音色描述：\n\n${raw}` },
      ],
      max_tokens: 512,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    return { ok: false, error: t.slice(0, 400) };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, error: '模型返回内容为空' };

  return { ok: true, text };
}
