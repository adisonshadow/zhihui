/**
 * 素材动画注册表（见 docs/08-素材动画功能技术方案.md 4）
 * 各动画库通过 registerAnimation 注册，UI 与数据层只依赖注册表，不写死
 */

/** 动画分类：出现 / 动作 / 消失 */
export type AnimationCategory = 'appear' | 'action' | 'disappear';

/** 动画定义（来自某动画库） */
export interface AnimationDef {
  /** 唯一 ID，建议格式：库名.类名，如 magic.puffIn */
  id: string;
  /** 中文显示名 */
  label: string;
  /** 分类，可多选（如 slide 可同时用于出现/消失） */
  categories: AnimationCategory[];
  /** CSS 类名（不含 magictime，由运行时拼接） */
  cssClass: string;
  /** 所属动画库标识，用于加载对应 CSS */
  libraryId: string;
  /** 默认时长（秒） */
  defaultDuration: number;
  /** 是否支持方向参数（如 up/down/left/right），有则用 param 选择具体类名 */
  hasDirectionParam?: boolean;
  /** 方向与类名映射，如 { up: 'spaceInUp', down: 'spaceInDown' } */
  directionMap?: Record<string, string>;
  /** 其他参数 schema（后续扩展） */
  paramsSchema?: Record<string, unknown>;
}

/** 素材块上的动画配置 */
export interface BlockAnimationConfig {
  /** 出现动画 */
  appear?: {
    animationId: string;
    duration: number;
    direction?: string;
    [key: string]: unknown;
  };
  /** 动作动画（可循环） */
  action?: {
    animationId: string;
    duration: number;
    repeatCount: number;
    direction?: string;
    [key: string]: unknown;
  };
  /** 消失动画 */
  disappear?: {
    animationId: string;
    duration: number;
    direction?: string;
    [key: string]: unknown;
  };
}

const registry: AnimationDef[] = [];

export function registerAnimation(def: AnimationDef): void {
  if (registry.some((d) => d.id === def.id)) return;
  registry.push(def);
}

export function getAnimationsByCategory(cat: AnimationCategory): AnimationDef[] {
  return registry.filter((d) => d.categories.includes(cat));
}

export function getAnimationById(id: string): AnimationDef | undefined {
  return registry.find((d) => d.id === id);
}

/** 根据 animationId 和 direction 解析出实际 CSS 类名 */
export function resolveAnimationCssClass(def: AnimationDef, direction?: string): string {
  if (def.hasDirectionParam && def.directionMap && direction) {
    return def.directionMap[direction] ?? def.cssClass;
  }
  return def.cssClass;
}
