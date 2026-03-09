/** 项目级未绑定人物的精灵图存储：使用虚拟 character 的 sprite_sheets，与 electron/main/projectDb 保持一致 */
export const STANDALONE_SPRITES_CHARACTER_ID = '__standalone_sprites__';

/** 项目级未绑定人物的元件存储：使用虚拟 character 的 component_groups */
export const STANDALONE_COMPONENTS_CHARACTER_ID = '__standalone_components__';

/** 元件块 asset_id 前缀，格式：component:${characterId}:${groupId} */
export const COMPONENT_BLOCK_PREFIX = 'component:';

/** 镜头块 asset_id（镜头层上唯一的虚拟素材条，无真实素材） */
export const CAMERA_BLOCK_ASSET_ID = '__camera__';
