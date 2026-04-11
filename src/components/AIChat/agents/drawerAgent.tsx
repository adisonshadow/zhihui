/**
 * 绘图师 Agent 提示词模版与 Sender slot 配置
 * 根据绘图类型（通用、背景、道具、角色/动物）调整提示词
 */
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';
import type { AgentPrompts } from '../types';

export const DRAWER_SLOT_KEY = 'drawer_type';

export const DRAWER_TYPE_OPTIONS = [
  { value: 'general', label: '任意类型' },
  { value: 'background', label: '背景' },
  { value: 'props', label: '道具' },
  { value: 'character', label: '角色/动物' },
] as const;

export type DrawerType = (typeof DRAWER_TYPE_OPTIONS)[number]['value'];

const BASE_PROMPT_MAP: Record<DrawerType, string> = {
  general: `你是漫剧绘图师，帮助用户生成各类图片。根据用户描述生成符合要求的图片。支持通用场景、角色、道具等。回复时若生成图片，请按约定格式返回图片。`,
  background: `你是漫剧背景绘图师，专门生成场景背景图。根据用户描述生成适合漫剧使用的背景图，注意：构图、透视、氛围、风格统一。背景图应适合作为场景底图，留出角色/道具摆放空间。`,
  props: `你是漫剧道具绘图师，专门生成道具、物品图。根据用户描述生成适合漫剧使用的道具图，注意：造型清晰、风格统一、适合抠图后叠加到场景。道具图建议纯色或简洁背景。`,
  character: `你是漫剧角色/动物绘图师，专门生成角色形象。根据用户描述生成适合漫剧使用的角色图，注意：造型清晰、表情到位、风格统一、多角度或可复用。角色/动物图建议便于后续抠图、生成精灵图。`,
};

export const drawerAgentPrompts: AgentPrompts = {
  agentKey: 'drawer',
  basePrompt: BASE_PROMPT_MAP.general,
  prompts: [
    { key: 'gen-general', label: '生成图片', message: '请根据我的描述生成一张图片' },
    { key: 'gen-background', label: '生成背景', message: '请生成一个适合漫剧的场景背景' },
    { key: 'gen-props', label: '生成道具', message: '请生成一个漫剧道具图' },
    { key: 'gen-character', label: '生成角色', message: '请生成一个漫剧角色形象' },
  ],
};

export function getDrawerBasePrompt(drawerType: DrawerType): string {
  return BASE_PROMPT_MAP[drawerType] ?? BASE_PROMPT_MAP.general;
}

/** 绘图师 Sender slotConfig：选择类型 + 提示文案（与官方 demo 一致，仅 text/select） */
export function getDrawerSlotConfig(): SlotConfigType[] {
  return [
    { type: 'text', value: '，请帮绘制一个' },
    {
      type: 'select',
      key: DRAWER_SLOT_KEY,
      props: {
        options: DRAWER_TYPE_OPTIONS.map((o) => o.label),
        placeholder: '选择类型',
        defaultValue: '任意类型',
      },
    },
    { type: 'text', value: '的图片：' },
  ];
}

/** 从 slotConfig 中解析 drawer_type（label -> value） */
export function parseDrawerTypeFromSlotConfig(slotConfig?: SlotConfigType[]): DrawerType {
  const slot = slotConfig?.find((s) => s.key === DRAWER_SLOT_KEY && 'value' in s);
  const label = (slot as { value?: string })?.value;
  return (DRAWER_TYPE_OPTIONS.find((o) => o.label === label)?.value ?? 'general') as DrawerType;
}
