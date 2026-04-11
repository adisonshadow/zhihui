/**
 * /images/generations 类接口的请求与流式响应形状（OpenAI 兼容 + 各云厂商扩展字段）
 */

export interface ImagesApiParams {
  /** 发送前由 Provider.transformParams 写入；XRequest 默认 params 可无此项 */
  prompt?: string;
  model?: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  output_format?: string;
  /** OpenAI 兼容：url | b64_json；方舟 Seedream 用 b64_json 可避免 TOS 直链 CORS */
  response_format?: string;
  stream?: boolean;
  watermark?: boolean;
  image?: string;
  image2?: string;
  [key: string]: unknown;
}

export interface ImagesApiResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  type?: string;
  url?: string;
  image_index?: number;
}
