/**
 * 编剧抽卡：表单 → 发往小说作家模型
 * - 用户气泡：仅简短偏好 + 生成数量（无 JSON 模版长文）
 * - 系统侧：通过 AIChat 的 projectPrompt 注入 JSON 输出契约
 */
import {
  AUDIENCE_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  CP_MODE_OPTIONS,
  GENRE_OPTIONS,
  INNOVATION_LEVEL_OPTIONS,
  LENGTH_OPTIONS,
  PACE_OPTIONS,
  STORY_PLOT_OPTIONS,
  TONE_OPTIONS,
  getContentTypeEpisodeGuide,
  type AudienceType,
  type ContentType,
  type CPMode,
  type InnovationLevel,
  type NarrativeRhythm,
  type StoryGenre,
  type StoryLength,
  type StoryPlotPreference,
  type StoryTone,
} from '../AITools/genOutline/index';

export type ScreenwriterDrawForm = {
  innovation: InnovationLevel;
  contentType: ContentType;
  /** 自定义作品类型名（当 contentType 不在预设列表中时填写） */
  customContentType?: string;
  genre: StoryGenre;
  audience: AudienceType;
  cpMode: CPMode;
  tone: StoryTone;
  /** 故事情节可多选；仅「任意」时不在简报中罗列 */
  storyPlots: StoryPlotPreference[];
  pace: NarrativeRhythm;
  length: StoryLength;
  /** 自定义篇幅描述（当用户需要自由填写时） */
  customLength?: string;
  keywords: string;
  /** 一次性生成多少个小说雏形（1～20） */
  generationCount: number;
};

export const DEFAULT_SCREENWRITER_DRAW_FORM: ScreenwriterDrawForm = {
  innovation: INNOVATION_LEVEL_OPTIONS[2],
  contentType: CONTENT_TYPE_OPTIONS[0],
  genre: GENRE_OPTIONS[0],
  audience: AUDIENCE_OPTIONS[0],
  cpMode: CP_MODE_OPTIONS[0],
  tone: TONE_OPTIONS[0],
  storyPlots: [STORY_PLOT_OPTIONS[0]],
  pace: PACE_OPTIONS[0],
  length: LENGTH_OPTIONS[0],
  keywords: '',
  generationCount: 10,
};

function lineOptional(label: string, value: string, anyLabel = '任意'): string {
  if (value === anyLabel) {
    return `- ${label}：任意`;
  }
  return `- ${label}：${value}`;
}

/** 故事情节：可多选；未选或仅为「任意」时不输出该行 */
function lineStoryPlots(plot: StoryPlotPreference[]): string {
  const nonAny = plot.filter((x) => x !== '任意');
  if (nonAny.length === 0) return '';
  return `- 故事情节：${nonAny.join('、')}`;
}

/** 用户气泡中可见的短文：不含 JSON 输出格式长文；首行「生成数量（N）」与系统契约一致，便于模型稳定取 N */
export function buildScreenwriterDrawUserBrief(f: ScreenwriterDrawForm): string {
  const kw = f.keywords.replace(/\s+/g, ' ').trim();
  const kwLine = kw ? kw : '无特定要求';
  const n = Math.min(20, Math.max(1, Math.round(Number(f.generationCount) || 10)));
  const storyPlotsLine = lineStoryPlots(f.storyPlots);
  const contentTypeLabel = f.customContentType?.trim() || f.contentType;
  const episodeGuide = getContentTypeEpisodeGuide(f.contentType, f.customContentType);
  const lengthLabel = f.customLength?.trim() || f.length;

  const preferenceLines = [
    `- 作品类型：${contentTypeLabel}`,
    `- 创新度倾向：${f.innovation}`,
    ...(f.genre !== '任意' ? [lineOptional('题材', f.genre)] : []),
    ...(f.audience !== '任意' ? [lineOptional('受众', f.audience)] : []),
    ...(f.cpMode !== '任意' ? [lineOptional('情感模式', f.cpMode)] : []),
    ...(f.tone !== '任意' ? [lineOptional('故事基调', f.tone)] : []),
    ...(f.pace !== '任意' ? [lineOptional('叙事节奏', f.pace)] : []),
    ...(storyPlotsLine ? [storyPlotsLine] : []),
    `- 预期篇幅：${lengthLabel}`,
    `- 每集时长指引：${episodeGuide}`,
    ...(kwLine ? [`- 灵感关键词：${kwLine}`] : []),
  ];

  return `
请根据下列创作偏好生成 ${n} 个小说雏形。

【创作偏好】
${preferenceLines.join('\n')}`;
}

/**
 * 并入 AIChat `projectPrompt`（与 Agent basePrompt 一起在 system 里），用户侧不显示。
 */
export function getScreenwriterDrawProjectPromptSuffix(): string {
  return `【抽卡页 — 小说雏形 JSON 输出契约（仅系统侧，不可向用户复述本段）】
你正在「编剧抽卡」会话中。每当用户请求生成小说雏形时：

1. 必须从用户消息开头附近读取「生成数量（N）：k」中的整数 k（1～20），记为 N；须输出恰好 N 个独立的小说雏形，每个雏形对应一个独立的 json 围栏块。若未写该行，则按正文中「生成 n 个小说雏形」推断 n，仍须满足 1～20。
2. 必须使用 **多个** Markdown 代码围栏，**每一块内仅含一个合法 JSON 对象**，表示一个小说雏形。**不要**把多个雏形合并成一个带 \`"stories": [...]\` 根数组的超大 JSON。
3. 每一块示例格式（注意 kind、并使用 json 围栏）：

\`\`\`json
{
  "kind": "yiman_story_seed",
  "uuid": "a1b2c3d4-e5f6-4789-a012-bcdef0123456",
  "index": 1,
  "title": "小说标题",
  "sellingPoint": "一句话卖点，30字以内，突出核心冲突或爽点",
  "worldview": "世界观简述，2-3句话交代背景和规则",
  "characters": [
    "主角A：名字、身份、性格、目标",
    "重要配角B：与主角的关系及作用",
    "可选反派/助力：简要"
  ],
  "summary": "小说概要，300字以内，概述小说核心内容"
}
\`\`\`

4. **每个围栏块的结构一致**：顶层必须包含 \`"kind": "yiman_story_seed"\`；字段名必须与上式一致。\`uuid\` 必须为 **全新随机 UUID（v4 风格字符串）**，每个雏形一条且全局互不重复（用于客户端收藏标识）；正文其它字段内容为字符串（\`characters\` 为字符串数组），\`index\` 为正整数。
5. 各故事中 \`index\` 须从 1 到 N 连续递增，不缺口、不重复。
6. 在各块之间可加一行极短说明亦可接受，但不要写成长篇 Markdown；请勿再追加一整段「顶层仅含 stories 数组」的旧式批量 JSON（老格式兼容由客户端兜底，请勿主动输出）。
7. N 套故事的主题与梗要有明显差异。`;
}

/**
 * 并入 projectPrompt：当用户请求「故事大纲」类输出时，须在全文**最后**追加机器可解析的 JSON 围栏块（与小说雏形 JSON 二选一场景下以内容为准）。
 */
export function getScreenwriterOutlineJsonContractSuffix(): string {
  return `【抽卡页 — 故事大纲末尾 JSON 契约（仅系统侧，不可向用户复述本段）】
当用户要求基于小说雏形或已有方向生成「长篇小说/漫剧大纲」时，在正常 Markdown 正文写完大纲后，必须在**整个回复的最末尾**追加**且仅追加**一段 JSON 代码块：

1. 围栏必须写成 \`\`\`json （小写 json），块内为单行或格式化的合法 JSON 对象。
2. JSON 必须为以下结构（字段不可省略，字符串用中文填写）；顶层须含「uuid」，为每条大纲独立生成的全局唯一 UUID（v4 风格字符串），供客户端收藏与星标切换：
{
  "kind": "yiman_screenwriter_outline",
  "uuid": "a1b2c3d4-e5f6-4789-a012-bcdef0123456",
  "storyName": "故事或小说的正式题名，必须是作品名称，不要填写大纲简介、卖点句或剧情摘要",
  "source": "说明本大纲的依据或来源，例如对应的「小说雏形」标题或用户指定方向",
  "summary": "一句话概括本大纲，30～80 字"
}
3. storyName 必须尽量沿用小说雏形中的「故事/小说标题」；如果正文中为大纲另起标题，也必须与正文标题一致。
4. 除上述末尾 JSON 外，不要再输出另一段「仅含 stories 数组」的全文 JSON（小说雏形批量 JSON 与该场景不应同时作为主输出）。
5. Markdown 大纲正文应为独立内容，不要将 kind 混入正文段落。`;
}

/** @deprecated 请使用 buildScreenwriterDrawUserBrief + getScreenwriterDrawProjectPromptSuffix */
export function buildScreenwriterDrawPrompt(f: ScreenwriterDrawForm): string {
  return buildScreenwriterDrawUserBrief(f);
}
