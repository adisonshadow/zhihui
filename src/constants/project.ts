/** 项目级未绑定角色的精灵图存储：使用虚拟 character 的 sprite_sheets，与 electron/main/projectDb 保持一致 */
export const STANDALONE_SPRITES_CHARACTER_ID = '__standalone_sprites__';

/** 项目级未绑定角色的元件存储：使用虚拟 character 的 component_groups */
export const STANDALONE_COMPONENTS_CHARACTER_ID = '__standalone_components__';

/** 元件块 asset_id 前缀，格式：component:${characterId}:${groupId} */
export const COMPONENT_BLOCK_PREFIX = 'component:';

/** 镜头块 asset_id（镜头层上唯一的虚拟素材条，无真实素材） */
export const CAMERA_BLOCK_ASSET_ID = '__camera__';

/** 文字组件块 asset_id 前缀，格式：textgadget:${presetId} */
export const TEXT_GADGET_BLOCK_PREFIX = 'textgadget:';

/** 脚本特效块 asset_id 前缀，格式：particlesgadget:${presetId} */
export const PARTICLES_GADGET_BLOCK_PREFIX = 'particlesgadget:';

/** 字幕块 asset_id（字幕层上唯一的虚拟素材条，无真实素材） */
export const SUBTITLE_BLOCK_ASSET_ID = '__subtitle__';
