/**
 * 推荐变体单条（见 components/AIChat/constants/modelPresets 中 PRESET_META[*].modals 派生）；
 * 字段小写名：name、description、io 等。
 */

/** 单条模态：中文名 + iconfont 类名（与基类 `iconfont` 组合使用，如 `iconfont icon-text-outline`） */
export type ModelIoTypeMeta = { label: string; icon: string };

/**
 * 各逻辑类型的展示配置。JSON 的 io 数组里写这些对象的键（如 text、image）。
 * icon 为 iconfont 的字体类，不含 `iconfont` 基类。
 */
export const MODEL_IO_TYPE_CONFIG = {
  text: { label: '文字', icon: 'icon-text-outline' },
  image: { label: '图片', icon: 'icon-image2' },
  video: { label: '视频', icon: 'icon-video' },
  audio: { label: '音频', icon: 'icon-audio' },
  voice: { label: '声音', icon: 'icon-voice1' },
  generic: { label: '其他', icon: 'icon-common-functions' },
} as const;

export type ModelIoTypeKey = keyof typeof MODEL_IO_TYPE_CONFIG;

/** 与 ModelIoTypeKey 相同，供 preset 声明 io 时与 I/O 类型命名一致 */
export type ModelIOTypeKey = ModelIoTypeKey;

/** 「输入类型 / 输出类型」行首小图标的 iconfont 类名 */
export const MODEL_IO_SECTION_ICON_CLASS = {
  input: 'icon-upload-laptop-filled',
  output: 'icon-mail-download-filled',
} as const;

const IO_CFG = MODEL_IO_TYPE_CONFIG as Record<string, ModelIoTypeMeta>;

export function getModelIoTypeLabel(key: string | undefined): string {
  if (!key) return '';
  return IO_CFG[key]?.label ?? key;
}

export function getModelIoTypeIconClass(key: string | undefined): string {
  if (!key) return IO_CFG.generic.icon;
  return IO_CFG[key]?.icon ?? IO_CFG.generic.icon;
}

/**
 * 输入/输出为逻辑键数组，如
 * { "input": ["text", "image"], "output": ["text"] }
 */
export interface ModelIoInfo {
  input: string[];
  output: string[];
}

export interface RecommendedModalEntry {
  name: string;
  description?: string;
  vendorName?: string;
  displayName: string;
  /**
   * 易变主版本，与 name 以「-」拼接为完整 model id；空字符串表示无独立主版本段（如部分 TTS）
   */
  primaryVersion?: string;
  /** 与 settings 中 capability 的 key 一致；有则保存模型时优先采用 */
  abilityTags?: string[];
  /** 若配置则覆盖家族默认 baseUrl，写入该条模型的 apiUrl（如专用 HTTP 路径，非 OpenAI 兼容 /v1/chat） */
  baseUrl?: string;
  /** 输入/输出为逻辑键数组，与 MODEL_IO_TYPE_CONFIG 对应 */
  io?: ModelIoInfo;
  /** 是否是 WWS 模型 （ RealTime WebSocket） */
  isWWS?: boolean;
}
