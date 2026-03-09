/**
 * 剧本 AI 对话上下文类型（见功能文档 4.1、docs/04-AI开发文档.md）
 * 用户可将集、场景、对白等内容添加到 AI 对话作为上下文
 */
import type { ScriptEpisode, ScriptScene, SceneContentItem } from './script';
import { SCENE_CONTENT_TYPE_LABELS } from './script';

/** 生成内容项的简短描述（用于 Tag 显示） */
export function getItemDescription(item: SceneContentItem): string {
  const label = SCENE_CONTENT_TYPE_LABELS[item.type];
  if (item.type === 'dialogue') {
    return `${label}${item.speaker ? ` ${item.speaker}` : ''}：${(item.text ?? '').slice(0, 20)}${(item.text?.length ?? 0) > 20 ? '…' : ''}`;
  }
  if (item.type === 'narration') {
    return `${label}：${(item.text ?? '').slice(0, 20)}${(item.text?.length ?? 0) > 20 ? '…' : ''}`;
  }
  return `${label}：${(item.description ?? '').slice(0, 20)}${(item.description?.length ?? 0) > 20 ? '…' : ''}`;
}

export type ScriptChatContextType = 'episode' | 'scene' | 'item';

export interface ScriptChatContextBase {
  id: string;
  type: ScriptChatContextType;
  description: string;
}

export interface ScriptChatContextEpisode extends ScriptChatContextBase {
  type: 'episode';
  episode: Pick<ScriptEpisode, 'title' | 'summary' | 'characterRefs'>;
  epIndex: number;
}

export interface ScriptChatContextScene extends ScriptChatContextBase {
  type: 'scene';
  scene: Pick<ScriptScene, 'title' | 'summary' | 'location' | 'timeOfDay' | 'atmosphere' | 'dramaTags'>;
  epIndex: number;
  sceneIndex: number;
}

export interface ScriptChatContextItem extends ScriptChatContextBase {
  type: 'item';
  item: SceneContentItem;
  epIndex: number;
  sceneIndex: number;
}

export type ScriptChatContext =
  | ScriptChatContextEpisode
  | ScriptChatContextScene
  | ScriptChatContextItem;

/** 将上下文格式化为 AI 可读的文本（用于 system/user 消息） */
export function formatScriptContextForAI(contexts: ScriptChatContext[]): string {
  if (contexts.length === 0) return '';

  const parts: string[] = ['【用户选中的剧本内容，供参考】'];
  for (const ctx of contexts) {
    if (ctx.type === 'episode') {
      parts.push(`\n## 集：${ctx.episode.title ?? `第 ${ctx.epIndex + 1} 集`}`);
      if (ctx.episode.summary) parts.push(`概要：${ctx.episode.summary}`);
    } else if (ctx.type === 'scene') {
      parts.push(
        `\n## 场景：${ctx.scene.title ?? `场景 ${ctx.sceneIndex + 1}`}`
      );
      if (ctx.scene.location) parts.push(`地点：${ctx.scene.location}`);
      if (ctx.scene.summary) parts.push(`概要：${ctx.scene.summary}`);
      if (ctx.scene.dramaTags?.length)
        parts.push(`戏剧标签：${ctx.scene.dramaTags.join('、')}`);
    } else if (ctx.type === 'item') {
      const label = SCENE_CONTENT_TYPE_LABELS[ctx.item.type];
      let content = '';
      if (ctx.item.type === 'dialogue') {
        content = ctx.item.speaker ? `${ctx.item.speaker}：${ctx.item.text ?? ''}` : String(ctx.item.text ?? '');
      } else if (ctx.item.type === 'narration') {
        content = `${ctx.item.narratorType ?? '全知'}：${ctx.item.text ?? ''}`;
      } else {
        content = ctx.item.description ?? '';
      }
      parts.push(`\n### ${label}：${content}`);
    }
  }
  return parts.join('\n');
}
