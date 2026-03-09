/**
 * 剧本实体与实体关系（见 docs/短漫剧剧本元素说明.md 15）
 * 场景内容项统一为 SceneContentItem（8 种类型），支持列表/时间线两种编辑模式
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

/** 场景内容类型（8 种） */
export type SceneContentType =
  | 'dialogue'
  | 'action'
  | 'narration'
  | 'stage'
  | 'prop'
  | 'foreground'
  | 'music'
  | 'sfx';

/** 场景内容项：统一结构，含类型、编剧启止时间、类型相关字段（见功能文档 15.3.1） */
export interface SceneContentItem {
  id: string;
  path: string;
  type: SceneContentType;
  startTime: number;
  endTime: number;
  layerIndex?: number;
  /** 对白：说话人 */
  speaker?: string;
  /** 对白：说话对象；动作：对象（动作针对谁/什么） */
  target?: string;
  /** 对白/旁白：文本 */
  text?: string;
  /** 旁白：全知/第一人称主角/第一人称配角 */
  narratorType?: '全知' | '第一人称主角' | '第一人称配角';
  /** 动作/舞台/道具/前景/音乐/音效：描述文本 */
  description?: string;
  /** 动作：涉及角色 */
  characters?: string[];
  /** 对白/旁白：情绪 */
  emotion?: string;
  /** 对白：音量 */
  volume?: '正常' | '轻声' | '大喊' | string;
}

/** 对白（兼容旧格式，迁移后使用 SceneContentItem） */
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

/** 旁白（兼容旧格式） */
export interface ScriptNarration {
  id: string;
  path: string;
  narratorType: '全知' | '第一人称主角' | '第一人称配角';
  text: string;
  emotion?: string;
  order: number;
}

/** 动作（兼容旧格式） */
export interface ScriptAction {
  id: string;
  path: string;
  description: string;
  characters?: string[];
  target?: string;
  order: number;
}

/** 场景：items 为主，兼容 dialogues/narrations/actions（加载时迁移） */
export interface ScriptScene {
  id: string;
  path: string;
  title: string;
  summary?: string;
  location?: string;
  timeOfDay?: string;
  atmosphere?: string;
  /** 场景内容项（主格式） */
  items?: SceneContentItem[];
  /** 兼容旧格式 */
  dialogues?: ScriptDialogue[];
  narrations?: ScriptNarration[];
  actions?: ScriptAction[];
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

/** 场景内容类型中文名 */
export const SCENE_CONTENT_TYPE_LABELS: Record<SceneContentType, string> = {
  dialogue: '对白',
  action: '动作',
  narration: '旁白',
  stage: '舞台说明',
  prop: '道具说明',
  foreground: '前景说明',
  music: '音乐说明',
  sfx: '音效说明',
};

/** 构建 path */
export function buildPath(episodeIndex: number, sceneIndex?: number): string {
  const ep = `episode.${episodeIndex + 1}`;
  if (sceneIndex == null) return ep;
  return `${ep}.scene.${sceneIndex + 1}`;
}

/** 将旧格式 dialogues/narrations/actions 迁移为 items */
export function migrateSceneToItems(scene: ScriptScene, epIndex: number, sceneIndex: number): SceneContentItem[] {
  const items: SceneContentItem[] = [];
  let time = 0;
  const defaultDuration = 3;

  const pushItem = (item: SceneContentItem) => {
    items.push(item);
    time = item.endTime;
  };

  (scene.dialogues ?? []).forEach((d, i) => {
    const start = time;
    const end = start + defaultDuration;
    time = end;
    pushItem({
      id: d.id,
      path: `episode.${epIndex + 1}.scene.${sceneIndex + 1}.item.${items.length + 1}`,
      type: 'dialogue',
      startTime: start,
      endTime: end,
      layerIndex: 0,
      speaker: d.speaker,
      target: d.target,
      text: d.text,
      emotion: d.emotion,
      volume: d.volume,
    });
  });

  (scene.narrations ?? []).forEach((n, i) => {
    const start = time;
    const end = start + defaultDuration;
    time = end;
    pushItem({
      id: n.id,
      path: `episode.${epIndex + 1}.scene.${sceneIndex + 1}.item.${items.length + 1}`,
      type: 'narration',
      startTime: start,
      endTime: end,
      layerIndex: 0,
      narratorType: n.narratorType,
      text: n.text,
      emotion: n.emotion,
    });
  });

  (scene.actions ?? []).forEach((a, i) => {
    const start = time;
    const end = start + defaultDuration;
    time = end;
    pushItem({
      id: a.id,
      path: `episode.${epIndex + 1}.scene.${sceneIndex + 1}.item.${items.length + 1}`,
      type: 'action',
      startTime: start,
      endTime: end,
      layerIndex: 0,
      description: a.description,
      characters: a.characters,
      target: a.target,
    });
  });

  return items;
}

/** 获取场景的 items，若无则从旧格式迁移 */
export function getSceneItems(scene: ScriptScene, epIndex: number, sceneIndex: number): SceneContentItem[] {
  if (scene.items && scene.items.length > 0) return scene.items;
  return migrateSceneToItems(scene, epIndex, sceneIndex);
}
