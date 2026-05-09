// ==============================
// 1. 关键标签（分话/章节用，值为英文 slug）
// ==============================
export const STORY_TAG_OPTIONS = [
  'conflict', // 冲突
  'reversal', // 反转
  'suspense', // 悬念
  'climax', // 高潮
  'hook', // 钩子
  'foreshadow', // 伏笔
  'payoff', // 回收
  'tension', // 紧张
  'comedy', // 喜剧点
  'tearjerker', // 催泪点
  'romance', // 浪漫
  'fight', // 战斗/动作
  'adventure', // 冒险
  'fantasy', // 奇幻
  'sci-fi', // 科幻
  'horror', // 恐怖
  'mystery', // 神秘
  'sexual', // 性暗示/情色
] as const;

export type StoryTag = (typeof STORY_TAG_OPTIONS)[number];

// ==============================
// 2. 基础设定选项（与 components/AIChat/tools/prepareGenStoriesPrompt 列表一致，修改时请两边同步）
// ==============================

export const GENRE_OPTIONS = [
  '任意','悬疑','都市','历史','玄幻','军事','科幻','末日','奇幻','游戏','权谋', '轻小说',
  '现代言情', '古风言情', '幻想言情', '悬疑言情', '双男主',
] as const;

export const AUDIENCE_OPTIONS = ['任意', '男生向', '女生向', '大众向'] as const;

export const CP_MODE_OPTIONS = [
  '任意',
  '无CP剧情向',
  '纯爱',
  '百合/BL',
  '大男主/后宫',
  '大女主',
  '多角恋纠葛',
  '兄弟情/闺蜜情',
  '男男/女女/男女混合',
] as const;

export const TONE_OPTIONS = [
  '任意',
  '轻松搞笑',
  '热血王道',
  '甜宠治愈',
  '暗黑虐心',
  '悬疑烧脑',
  '正剧写实',
  '治愈系',
  '黑暗系',
  '讽刺喜剧',
  '荒诞离奇',
  '清新治愈',
  '悲伤催泪',
] as const;

export const PACE_OPTIONS = ['任意', '快节奏爽文', '慢热铺陈', '张弛有度'] as const;

export const LENGTH_OPTIONS = [
  '30集',
  '60集',
  '90集',
  '120集',
] as const;

/** 作品类型：影响每集时长指引和输出格式 */
export const CONTENT_TYPE_OPTIONS = [
  '漫剧',
  '短剧',
  '电影剧本',
  '有声小说',
  '传统小说',
] as const;

export type ContentType = (typeof CONTENT_TYPE_OPTIONS)[number];

/** 根据作品类型返回每集/每部的时长指引文案 */
export function getContentTypeEpisodeGuide(contentType: ContentType, customType?: string): string {
  switch (contentType) {
    case '漫剧':
      return '漫剧每集建议时长 1～3 分钟，各集时长尽量均匀';
    case '短剧':
      return '短剧每集建议时长 1～3 分钟，各集时长尽量均匀';
    case '电影剧本':
      return '电影剧本为单部完整作品，无分集概念，整体时长约 90～120 分钟';
    case '有声小说':
      return '有声小说每集建议时长 10～20 分钟，各集时长尽量均匀';
    case '传统小说':
      return '传统小说每集建议 3000～8000 字，各集篇幅尽量均匀';
    default:
      return customType ? `${customType}按该类型的行业标准确定每集时长` : '按行业标准确定每集时长';
  }
}

/** 故事情节 */
export const STORY_PLOT_OPTIONS = [
  '任意',
  '穿越',
  '快穿',
  '古穿今',
  '穿书',
  '重生',
  '系统',
  '逆袭',
  '打脸',
  '高武',
  '空间',
  '打怪升级',

  '脑洞',
  '虐渣',

  '种田文',
  '团宠',
  '强者回归',
  '探险',
  '盗墓',
  '风水玄学',
  '灵异',

  '权谋',
  '刑侦',
  '谍战',
  '宫斗',
  '宅斗',
  
  '商战',
  '美食',
  '废材流',
  '凡人流',
  '暴富流',
  '无限流',

  '反派洗白',

  '兵王',
  '特种兵',
  '赘婿',
  '神豪',
  '神医',
  '神算',
  '透视',
  '直播',

  '女扮男装',

  '闪婚',
  '先婚后爱',
  '带球跑',
  '双向奔赴',
  '破镜重圆',
  '暗恋',
  '追妻火葬场',
  '乌龙助攻',
  '虐恋',

  '竹马',
  '甜宠',
  '霸总',
  '姐弟恋',

  '多香艳',
  '多意外亲密',

  '多反转',

  '角色性格鲜明',

] as const;

/** 故事情节（单机选） */
export type StoryPlotPreference = (typeof STORY_PLOT_OPTIONS)[number];

/** 故事基调 */
export type StoryTone = (typeof TONE_OPTIONS)[number];

/** 题材（可多选；可多颗「任意」外条目） */
export type StoryGenre = (typeof GENRE_OPTIONS)[number];

/** 受众倾向 */
export type AudienceType = (typeof AUDIENCE_OPTIONS)[number];

/** CP / 情感线模式（可多选） */
export type CPMode = (typeof CP_MODE_OPTIONS)[number];

/** 叙事节奏 */
export type NarrativeRhythm = (typeof PACE_OPTIONS)[number];

/** 预期篇幅 */
export type StoryLength = (typeof LENGTH_OPTIONS)[number];

export const INNOVATION_LEVEL_OPTIONS = [
  '极低(经典套路)',
  '低(常见套路居多)',
  '中(常见套路和创新元素各占一半)',
  '高(创新元素居多)',
  '极高(完全创新，脑洞优先)',
] as const;

export type InnovationLevel = (typeof INNOVATION_LEVEL_OPTIONS)[number];

// ==============================
// 3. 角色类型
// ==============================

export const ROLE_TYPE_OPTIONS = ['主角', '重要配角', '助攻', '反派', '情敌', '龙套', '配角', '神秘人'] as const;

export type RoleType = (typeof ROLE_TYPE_OPTIONS)[number];

// ==============================
// 4. 基础设定完整接口
// ==============================

export interface BasicConfig {
  tone: StoryTone;
  rhythm: NarrativeRhythm;
  length: StoryLength;
  innovation: InnovationLevel;
  genre: StoryGenre[];
  audience: AudienceType;
  cpMode: CPMode[];
  keyWords: string[];
}

// ==============================
// 5. 角色设定接口（主角/配角/助攻/情敌）
// ==============================

export interface Character {
  name: string;
  type: RoleType;
  age?: number;
  identity: string;
  personality: string;
  typicalTags: string[];
  motivation: string;
  description?: string;
}

// ==============================
// 6. 世界观设定接口
// ==============================

export interface WorldView {
  coreScene: string;
  socialBackground: string;
  coreRules: string[];
  extraSetting?: string;
}

// ==============================
// 7. 章节 / 分话
// ==============================

export interface Chapter {
  chapterNum: number;
  title: string;
  intro: string;
  tags: StoryTag[];
  volumeNum?: number;
  volumeGoal?: string;
}

export interface Volume {
  volumeNum: number;
  title: string;
  goal: string;
  chapters: Chapter[];
}

export interface NovelOutline {
  basic: BasicConfig;
  characters: Character[];
  worldView: WorldView;
  volumes: Volume[];
}

// ==============================
// 8. 提示词生成
// ==============================

export interface PromptTemplate {
  title: string;
  sellPoint: string;
  template: string;
}

export function generateNovelPrompt(config: NovelOutline, template: PromptTemplate): string {
  const { title, sellPoint, template: tpl } = template;

  const charStr = config.characters
    .map(
      (c) =>
        `【${c.type}】${c.name} | 身份：${c.identity} | 性格：${c.personality} | 标签：${c.typicalTags.join('、')} | 动机：${c.motivation}`
    )
    .join('\n');

  const chapterStr = config.volumes
    .map(
      (vol) =>
        `\n=== 第${vol.volumeNum}卷：${vol.title}（目标：${vol.goal}）===\n` +
        vol.chapters
          .map(
            (ch) =>
              `第${ch.chapterNum}话｜${ch.title}｜标签：${ch.tags.join('、')}｜简介：${ch.intro}`
          )
          .join('\n')
    )
    .join('');

  return tpl
    .replace('{{title}}', title)
    .replace('{{sellPoint}}', sellPoint)
    .replace('{{basic}}', JSON.stringify(config.basic, null, 2))
    .replace('{{characters}}', charStr)
    .replace('{{worldView}}', config.worldView.coreRules.join('、'))
    .replace('{{chapters}}', chapterStr);
}

export function onSubmit(
  config: NovelOutline,
  template: PromptTemplate,
  recallFunc: (result: string) => void
) {
  try {
    const prompt = generateNovelPrompt(config, template);
    recallFunc(prompt);
    return prompt;
  } catch (err) {
    console.error('提示词生成失败', err);
    recallFunc('生成错误：' + String(err));
    return '';
  }
}

// ==============================
// 【使用示例】《合租室友的猫系竹马》
// ==============================
/*
import type { NovelOutline } from './index';

const myNovel: NovelOutline = {
  basic: {
    tone: '轻松搞笑',
    rhythm: '张弛有度',
    length: '中篇（10-50话）',
    innovation: '中等(略高于常见)',
    genre: ['现代都市', '轻小说日常'],
    audience: '女生向',
    cpMode: ['纯爱1v1', '闺蜜情'],
    keyWords: ['合租', '竹马', '暗恋', '乌龙助攻'],
  },
  characters: [
    {
      name: '苏糖',
      type: '主角',
      identity: '应届新媒体编辑',
      personality: '软萌迷糊，熬夜笨蛋，认真靠谱',
      typicalTags: ['熬夜打工人', '零食软妹'],
      motivation: '在大城市站稳脚跟，接受被爱',
    },
    {
      name: '林漾',
      type: '重要配角',
      identity: '外科医生',
      personality: '外冷内热，猫系，深情暗恋',
      typicalTags: ['外科冰山', '行动派宠妻'],
      motivation: '追回暗恋多年的苏糖',
    },
  ],
  worldView: {
    coreScene: '一线城市老小区，安保宽松',
    socialBackground: '应届毕业生职场+合租',
    coreRules: ['无超自然', '邻居备用钥匙应急', '乌龙合理'],
  },
  volumes: [
    {
      volumeNum: 1,
      title: '开错门的乌龙',
      goal: '初遇乌龙，建立联系',
      chapters: [
        {
          chapterNum: 1,
          title: '凌晨三点，我睡进了邻居的床',
          intro: '加班迷糊开错门，睡在竹马床上',
          tags: ['comedy', 'hook', 'foreshadow'],
        },
      ],
    },
  ],
};

const myTemplate = {
  title: '合租室友的猫系竹马怎么睡在我床上？',
  sellPoint: '误睡竹马的床，意外开启两男争一女的甜爽日常',
  template: `
请根据以下信息生成小说大纲：
标题：{{title}}
卖点：{{sellPoint}}
基础设定：{{basic}}
角色：{{characters}}
世界观：{{worldView}}
章节：{{chapters}}
要求：甜宠、轻松、搞笑、1v1双向奔赴。
`,
};

onSubmit(myNovel, myTemplate, (res) => {
  console.log('最终提示词：', res);
});
*/
