/**
 * 剧本实体与实体关系（见 docs/短漫剧剧本元素说明.md 15）
 * 暂不包含节拍（Beat），场景直接包含对白、旁白、动作
 */

/** 戏剧效果标签（冲突、反转、悬念等，Tag 化） */
export type DramaTag =
  | 'conflict'
  | 'reversal'
  | 'suspense'
  | 'climax'
  | 'hook'
  | 'foreshadow'
  | 'payoff'
  | 'tension'
  | 'relief'
  | 'comedy'
  | 'tearjerker'
  | 'conflict.person'
  | 'conflict.environment'
  | 'conflict.self'
  | 'conflict.fate';

/** 对白：单独结构化，便于 TTS 绑定与局部修改 */
export interface ScriptDialogue {
  id: string;
  path: string;
  speaker: string;
  target?: string;
  text: string;
  emotion?: string;
  volume?: '正常' | '轻声' | '大喊' | string;
  order: number;
}

/** 旁白：与对白分离 */
export interface ScriptNarration {
  id: string;
  path: string;
  narratorType: '全知' | '第一人称主角' | '第一人称配角';
  text: string;
  emotion?: string;
  order: number;
}

/** 动作/舞台说明 */
export interface ScriptAction {
  id: string;
  path: string;
  description: string;
  characters?: string[];
  order: number;
}

/** 场景：直接包含对白、旁白、动作（暂无节拍） */
export interface ScriptScene {
  id: string;
  path: string;
  title: string;
  summary?: string;
  location?: string;
  timeOfDay?: string;
  atmosphere?: string;
  dialogues: ScriptDialogue[];
  narrations: ScriptNarration[];
  actions: ScriptAction[];
  transition?: string;
  dramaTags: DramaTag[];
}

/** 集（戏剧效果标签仅绑定场景，不绑定剧集） */
export interface ScriptEpisode {
  id: string;
  path: string;
  title: string;
  summary?: string;
  characterRefs: string[];
  scenes: ScriptScene[];
}

/** 角色引用 */
export interface ScriptCharacterRef {
  id: string;
  name: string;
  role?: string;
  description?: string;
}

/** 剧本顶层 */
export interface Script {
  id: string;
  title: string;
  summary?: string;
  episodes: ScriptEpisode[];
  characters: ScriptCharacterRef[];
  tags?: string[];
}

// ---------- 实体关系 ----------
//
// Script 1 ──* Episode
// Episode 1 ──* Scene
// Scene 1 ──* Dialogue
// Scene 1 ──* Narration
// Scene 1 ──* Action
// Script 1 ──* CharacterRef （剧本级角色列表）
// Episode N ──* CharacterRef （通过 characterRefs 引用角色 ID）
//
// path 规则（无节拍）：
//   episode.{i}
//   episode.{i}.scene.{j}
//   episode.{i}.scene.{j}.dialogue.{k}
//   episode.{i}.scene.{j}.narration.{k}
//   episode.{i}.scene.{j}.action.{k}

/** 构建 path */
export function buildPath(episodeIndex: number, sceneIndex?: number): string {
  const ep = `episode.${episodeIndex + 1}`;
  if (sceneIndex == null) return ep;
  return `${ep}.scene.${sceneIndex + 1}`;
}
