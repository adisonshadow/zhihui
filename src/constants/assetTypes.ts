/**
 * 素材分类枚举（见功能文档 5.1、开发计划 2.8）
 */
export const ASSET_TYPES = [
  { value: 'character', label: '人物' },
  { value: 'scene_bg', label: '场景背景' },
  { value: 'prop', label: '情景道具' },
  { value: 'sfx', label: '声效' },
  { value: 'transparent_video', label: '透明视频特效' },
  { value: 'music', label: '音乐' },
  { value: 'sticker', label: '贴纸' },
] as const;

export type AssetTypeValue = (typeof ASSET_TYPES)[number]['value'];
