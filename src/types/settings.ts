/**
 * 多模态 AI 供应商配置类型（见功能文档 3.1）
 */
export interface AIModalityConfig {
  provider?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
}

export interface AISettings {
  text: AIModalityConfig;
  image: AIModalityConfig;
  video: AIModalityConfig;
  audio: AIModalityConfig;
}
