/**
 * 素材分类（设计器素材面板 Tab 与素材库页分类共用，见功能文档 5.1）
 * showInAssetLibrary: false 表示有专门处理界面（如人物设计），不在素材库显示
 */
import {
  PictureOutlined,
  AppstoreOutlined,
  UserOutlined,
  VideoCameraOutlined,
  ThunderboltOutlined,
  SoundOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';

export const ASSET_CATEGORIES = [
  { value: 'image', label: '图片', showInAssetLibrary: true, icon: PictureOutlined },
  { value: 'sprite', label: '精灵图', showInAssetLibrary: true, icon: PictureOutlined },
  { value: 'character_sprite', label: '人物精灵图', showInAssetLibrary: false, icon: UserOutlined },
  { value: 'component', label: '元件', showInAssetLibrary: true, icon: AppstoreOutlined },
  { value: 'character_component', label: '人物元件', showInAssetLibrary: false, icon: UserOutlined },
  { value: 'video', label: '视频', showInAssetLibrary: true, icon: VideoCameraOutlined },
  { value: 'transparent_video', label: '透明视频', showInAssetLibrary: true, icon: ThunderboltOutlined },
  { value: 'sfx', label: '声效', showInAssetLibrary: true, icon: SoundOutlined },
  { value: 'music', label: '音乐', showInAssetLibrary: true, icon: CustomerServiceOutlined },
] as const;

export type AssetCategoryValue = (typeof ASSET_CATEGORIES)[number]['value'];

/** 素材库页可选的分类（仅 showInAssetLibrary 为 true） */
export const ASSET_LIBRARY_CATEGORIES = ASSET_CATEGORIES.filter((c) => c.showInAssetLibrary);

