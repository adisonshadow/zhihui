/**
 * AI 模型配置类型（见功能文档 3.1）
 * 能力 tag 化：不同模型有不同擅长方向，一个模型可拥有多种能力
 */
export interface CapabilityTag {
  key: string;
  label: string;
}

/** 预设能力 tag（key | label） */
export const CAPABILITY_TAGS: CapabilityTag[] = [
  { key: 'draw', label: '绘图' },
  { key: 'matting', label: '抠图' },
  { key: 'sprite', label: '生成精灵图' },
  { key: 'skeleton_skinning', label: '生成骨骼蒙皮' },
  { key: 'action_script', label: '生成动作脚本' },
  { key: 'script', label: '生成剧本' },
  { key: 'voice_over', label: '生成配音' },
  { key: 'music', label: '生成音乐' },
  { key: 'sound_effect', label: '生成语音特效' },
  { key: 'exec_script', label: '生成执行脚本' },
  { key: 'video', label: '生视频' },
];

export interface AIModelConfig {
  id: string;
  name?: string;
  provider?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
  /** 能力 tag 的 key 列表，一个模型可拥有多种能力 */
  capabilityKeys: string[];
}

/** AI 抠图服务提供商（见 docs/AI抠图配置说明.md） */
export type AIMattingProvider = 'volcengine';

/** 单条 AI 抠图配置 */
export interface AIMattingConfig {
  id: string;
  /** 显示名称，可选 */
  name?: string;
  /** 服务提供商，如 volcengine */
  provider: AIMattingProvider;
  /** 火山引擎：Access Key ID */
  accessKeyId: string;
  /** 火山引擎：Secret Access Key */
  secretAccessKey: string;
  /** 火山引擎：区域，如 cn-north-1 */
  region?: string;
  /** 是否启用（可禁用某条配置而不删除） */
  enabled?: boolean;
}

export interface AISettings {
  models: AIModelConfig[];
  /** AI 抠图配置列表（与模型配置分离，因抠图服务非 OpenAI 协议） */
  aiMattingConfigs?: AIMattingConfig[];
}
