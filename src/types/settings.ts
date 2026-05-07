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
  { key: 'novel', label: '小说创作' },
  { key: 'voice_over', label: '生成配音' },
  { key: 'music', label: '生成音乐' },
  { key: 'sound_effect', label: '生成语音特效' },
  { key: 'exec_script', label: '生成执行脚本' },
  { key: 'video', label: '生视频' },
  { key: 'video_edit', label: '视频编辑' },
  { key: 'image_edit', label: '图像编辑' },
  /** Wan-Image 等可拆分的多能力（可叠加勾选） */
  { key: 'remove_watermark', label: '去水印' },
  { key: 'image_outpaint', label: '扩图' },
  { key: 'image_clarity', label: '图像变清晰' },
  { key: 'extract_image_elements', label: '提取图像元素' },
  { key: 'image_camera_angle', label: '镜头与视角' },
  { key: 'multi_image_fusion', label: '多图融合' },
  { key: 'interactive_image_edit', label: '交互式图像编辑' },
  { key: 'agent_orchestration', label: 'Agent 调度' },
];

export interface AIModelConfig {
  id: string;
  name?: string;
  provider?: string;
  apiUrl: string;
  apiKey: string;
  /** 已保存的完整 model（兼容旧版）；有 modelDisplayName 时以 resolveRequestModelId 为准 */
  model?: string;
  /**
   * 服务商控制台上的模型名称/显示名（如 Doubao-Seed3D-2.0 或 API 用 slug），
   * 与 primaryVersion 在请求时组合，避免随版本全量重填一整串 ID
   */
  modelDisplayName?: string;
  /** 易变主版本，如 260328；可单独编辑，请求时与 modelDisplayName 用「-」拼接 */
  primaryVersion?: string;
  /** 能力 tag 的 key 列表，一个模型可拥有多种能力 */
  capabilityKeys: string[];
  /** 常见模型预设 key，自定义模型无此字段（见功能文档 3.1.2） */
  presetKey?: string;
  /**
   * 同一厂商可复用 API Key（如 aliyun_dashscope）；来自常见模型预设，自定义模型通常无
   * @see findReusableApiKeyForPreset
   */
  vendorKey?: string;
  /** 本地部署：可无密钥，请求不带 Authorization（见功能文档 3.1.4） */
  isLocal?: boolean;
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
  /** 新建漫剧项目时「本地项目目录」的默认父路径（可选） */
  defaultProjectRoot?: string;
  /** 设计器画布：视口尺寸变化时自动按画布适配缩放（见 CanvasContainer fit） */
  canvasAutoFitViewport?: boolean;
  /**
   * 弹窗遮罩是否使用模糊效果；默认 true（未写入配置时视为开启）
   * 对应 antd Modal / AdaptiveModal：`mask: { blur: true }` 与 `mask: true`
   */
  modalMaskBlur?: boolean;
}
