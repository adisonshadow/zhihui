/**
 * 小说创意策划 Agent：故事抽卡、设定搭建、世界观、起名、大纲等前期创意
 *
 * 新架构：同时注册为标准化 SkillAgentDefinition
 */
import type { AgentPrompts } from '../types';
import { registerSkillAgent } from '../registryTypes';

export const novelIdeaAgentPrompts: AgentPrompts = {
  agentKey: 'novel-idea',
  basePrompt: `你是资深的网文/轻小说创意策划，协助用户完成小说的前期创意与设定工作。你擅长从零到一搭建故事框架，而不是替用户写正文。

你的核心能力：
1. 故事抽卡与梗概生成：根据用户偏好的题材、风格、元素，快速生成多个故事雏形
2. 世界观搭建：帮助用户完善故事的世界观体系（力量体系、势力分布、地理设定、时代背景等）
3. 故事大纲：设计完整的故事结构（三幕式/起承转合），含主线、支线、关键冲突与伏笔
4. 人物设计：塑造有记忆点的角色（外貌、性格、动机、成长弧光、关系网）
5. 取名创意：为小说、章节、角色、地点提供有吸引力的命名方案

回复时思路清晰、有结构感，直接给出可用的创意方案而非空洞建议。不同方案请用序号或小标题区分，方便用户挑选。`,
  prompts: [
    {
      key: 'gen-stories',
      label: '故事抽卡',
      message: '生成10个轻小说的故事梗概,每篇不超过100字',
      launchTool: 'prepare-gen-stories',
    },
    { key: 'outline', label: '故事大纲', message: '请根据我目前的想法，整理一份完整的故事大纲，含主线、支线、主要冲突与关键转折点' },
    { key: 'worldbuild', label: '世界观搭建', message: '帮我搭建一个完整且自洽的世界观体系，含力量规则、势力格局、地理分布等' },
    { key: 'character-design', label: '人物设计', message: '请为这个故事设计几个核心角色，含外貌、性格、动机、成长弧光与人物关系网' },
    { key: 'story-title', label: '起书名', message: '请为这本书起几个有吸引力的标题备选，兼顾网文风格与辨识度' },
    { key: 'opening-plan', label: '开篇方案', message: '请根据故事设定，提供几种差异化的开篇切入方案，含第一章的大致内容走向' },
    { key: 'plot-review', label: '设定校对', message: '请检查当前设定是否存在逻辑漏洞、战力崩坏或剧情矛盾，给出修正建议' },
    { key: 'target-audience', label: '读者分析', message: '请分析这本书的目标读者画像、市场定位与卖点优化建议' },
    { key: 'chapter-title', label: '分章命名', message: '请为已规划的各章节起一个吸引人的章标题，风格统一、有悬念感' },
  ],
};

// ── 新架构：标准化 Skill Agent 注册 ──
registerSkillAgent({
  agentId: 'novel_idea',
  agentName: '小说创意',
  agentType: 'skill',
  description: '擅长小说前期创意策划：故事抽卡、世界观搭建、大纲设计、角色塑造、取名创意等',
  skillPromptTemplate: `${novelIdeaAgentPrompts.basePrompt}\n\n【额外需求】\n{{extra_requirements}}`,
  supportedModels: ['novel'],
  allowedTools: ['generate_text'],
  inputType: 'text',
  outputType: 'text',
});
