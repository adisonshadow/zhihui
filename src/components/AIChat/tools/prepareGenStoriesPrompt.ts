/**
 * 故事抽卡：表单值 → 用户提示词（见 docs/tools/prepare-gen-stories.md）
 */
export const GENRE_OPTIONS = [
  '任意',
  '玄幻仙侠',
  '历史架空',
  '现代都市',
  '科幻末世',
  '悬疑惊悚',
  '无限流',
  '游戏异界',
  '末日废土',
  '古风权谋',
  '轻小说日常',
] as const;

export const AUDIENCE_OPTIONS = ['任意', '男生向', '女生向', '大众向'] as const;

export const CP_MODE_OPTIONS = [
  '任意',
  '无CP剧情向',
  '纯爱1v1',
  '大女主/大男主万人迷',
  '多角恋纠葛',
  '兄弟情/闺蜜情',
] as const;

export const TONE_OPTIONS = [
  '任意',
  '轻松搞笑',
  '热血王道',
  '甜宠治愈',
  '暗黑虐心',
  '悬疑烧脑',
  '正剧写实',
] as const;

export const PACE_OPTIONS = ['任意', '快节奏爽文', '慢热铺陈', '张弛有度'] as const;

export const LENGTH_OPTIONS = [
  '任意',
  '短篇（1-10话）',
  '中篇（10-50话）',
  '长篇连载（50+话）',
] as const;

export type PrepareGenStoriesForm = {
  /** 0-100 创新度滑块 */
  innovation: number;
  genre: (typeof GENRE_OPTIONS)[number];
  audience: (typeof AUDIENCE_OPTIONS)[number];
  cpMode: (typeof CP_MODE_OPTIONS)[number];
  tone: (typeof TONE_OPTIONS)[number];
  pace: (typeof PACE_OPTIONS)[number];
  length: (typeof LENGTH_OPTIONS)[number];
  keywords: string;
};

export const DEFAULT_PREPARE_GEN_STORIES_FORM: PrepareGenStoriesForm = {
  innovation: 50,
  genre: '任意',
  audience: '任意',
  cpMode: '任意',
  tone: '任意',
  pace: '任意',
  length: '任意',
  keywords: '',
};

function innovationNarration(v: number): string {
  if (v <= 20) {
    return '请严格遵循经典商业叙事模板，角色定型化，情节可预测。';
  }
  if (v < 80) {
    return '在经典框架中加入适量创新元素，保留熟悉感的同时提供惊喜。';
  }
  return '请颠覆套路，大胆采用反常规设定、反转结构和非典型主角，脑洞优先。';
}

function lineOptional(label: string, value: string, anyLabel = '任意'): string {
  if (value === anyLabel) {
    return `- ${label}：不设限`;
  }
  return `- ${label}：${value}`;
}

/**
 * 生成发给模型的完整 user 提示词
 */
export function buildPrepareGenStoriesPrompt(f: PrepareGenStoriesForm): string {
  const kw = f.keywords.replace(/\s+/g, ' ').trim();
  const kwLine = kw ? kw : '无特定要求';

  return `你是一位专业的漫剧//轻小说作家。请根据以下创作偏好，生成10个小说雏形。

【核心要求】
- 创新度：${innovationNarration(f.innovation)}
${lineOptional('题材', f.genre)}
${lineOptional('受众', f.audience)}
${lineOptional('情感模式', f.cpMode)}
${lineOptional('故事基调', f.tone)}
${lineOptional('叙事节奏', f.pace)}
${lineOptional('预期篇幅', f.length)}
- 灵感关键词：${kwLine}

【输出格式】（请严格按此结构返回）
1. 故事/小说标题：（一个吸引人的标题）
2. 一句话卖点：（30字以内，突出核心冲突或爽点）
3. 世界观简述：（2-3句话交代背景和规则）
4. 主要角色：
   - 主角A：（名字、身份、性格、目标）
   - 重要配角B：（与主角的关系及作用）
   - 可选反派/助力：（简要）
5. 故事概要：（300字以内，概述故事核心内容）`;
}
