/** 编剧区 A2UI v0.9 复用入口：Catalog、命令构建、React 组件与 Deck */
export { STORY_SEED_CATALOG_ID, registerStorySeedA2uiCatalog } from './registerStorySeedCatalog';
export {
  buildStorySeedSurfaceCommands,
  buildMultiStorySeedCommands,
  type StorySeedUiNode,
} from './buildStorySeedCommands';
export { STORY_SEED_UI_COMPONENT_MAP } from './StorySeedA2uiComponents';
export { StorySeedA2uiDeck, type StorySeedA2uiDeckProps } from './StorySeedA2uiDeck';
export { NOVEL_EDITOR_TOOL_CATALOG_ID, registerNovelEditorToolA2uiCatalog } from './registerNovelEditorToolCatalog';
export { buildNovelEditorToolSurfaceCommands } from './buildNovelEditorToolCommands';
export { NovelEditorToolA2uiBubble } from './NovelEditorToolA2uiBubble';
export { NOVEL_EDITOR_TOOL_UI_COMPONENT_MAP } from './NovelEditorToolA2uiComponents';
