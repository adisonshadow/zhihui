/**
 * 绘图师生图参数（参考火山方舟 Seedream API）
 */
export type DrawerAspectRatio = 'canvas' | '16:9' | '9:16' | '4:3' | '3:4' | '1:1';

export interface DrawerOptions {
  /** 出图数量 1～4 */
  imageCount: number;
  /** 图比例；canvas 时使用 canvasAspectRatio */
  aspectRatio: DrawerAspectRatio;
}

export const DRAWER_ASPECT_OPTIONS: { value: DrawerAspectRatio; label: string }[] = [
  { value: 'canvas', label: '画布比例' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
];

/** 将 aspectRatio 转为 API 格式（画布比例时用 canvasAspectRatio，缺省则 1:1） */
export function resolveAspectRatio(
  aspectRatio: DrawerAspectRatio,
  canvasAspectRatio?: string
): string {
  if (aspectRatio === 'canvas') {
    return canvasAspectRatio || '1:1';
  }
  return aspectRatio;
}
