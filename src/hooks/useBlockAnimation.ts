/**
 * 根据 currentTime 与 animationConfig 计算当前动画状态（见 docs/08-素材动画功能技术方案.md 7）
 */
import type { CSSProperties } from 'react';
import type { BlockAnimationConfig } from '@/constants/animationRegistry';
import { getAnimationById, resolveAnimationCssClass } from '@/constants/animationRegistry';
import {
  BRANCH_SWAY_ANIMATION_ID,
  branchSwayEffectiveDuration,
  branchSwayLayerStyleFromAction,
  parseBranchSwayParams,
} from '@/constants/branchSwayAnimation';

export type AnimationPhase = 'appear' | 'action' | 'disappear' | 'static';

export interface AnimationState {
  phase: AnimationPhase;
  cssClass: string | null;
  duration: number;
  /** 负值表示动画已进行的时间，用于 animation-delay 实现 seek 时正确显示 */
  delaySeconds?: number;
  /** 动作：CSS animation-iteration-count（数字或 infinite） */
  actionIterationCount?: number | 'infinite';
  /** 附加到动画层的样式（如微风摇摆的 CSS 变量与 transform-origin） */
  layerStyle?: CSSProperties;
}

export function getBlockAnimationState(
  currentTime: number,
  startTime: number,
  endTime: number,
  config: BlockAnimationConfig | null
): AnimationState | null {
  if (!config) return null;
  const blockDur = endTime - startTime;
  const localT = currentTime - startTime;

  if (config.appear) {
    const d = config.appear.duration ?? 0.6;
    if (localT >= 0 && localT < d) {
      const def = getAnimationById(config.appear.animationId);
      if (!def) return null;
      const cssClass = resolveAnimationCssClass(def, config.appear.direction);
      return { phase: 'appear', cssClass, duration: d, delaySeconds: -localT };
    }
  }

  if (config.disappear) {
    const d = config.disappear.duration ?? 0.6;
    const disappearStart = blockDur - d;
    if (localT >= disappearStart && localT <= blockDur) {
      const def = getAnimationById(config.disappear.animationId);
      if (!def) return null;
      const cssClass = resolveAnimationCssClass(def, config.disappear.direction);
      const elapsed = localT - disappearStart;
      return { phase: 'disappear', cssClass, duration: d, delaySeconds: -elapsed };
    }
  }

  if (config.action) {
    const appearEnd = (config.appear?.duration ?? 0) || 0;
    const disappearStart = blockDur - (config.disappear?.duration ?? 0);
    const actionStart = appearEnd;
    const actionEnd = Math.max(actionStart, disappearStart);
    const actionDur = config.action.duration ?? 1;
    const rc = config.action.repeatCount;
    const isInfinite = rc === 0 || rc === -1;
    const actionIterationCount: number | 'infinite' = isInfinite
      ? 'infinite'
      : rc != null && rc >= 1
        ? rc
        : 1;

    if (localT >= actionStart && localT < actionEnd && actionDur > 0) {
      const def = getAnimationById(config.action.animationId);
      if (!def) return null;
      const cssClass = resolveAnimationCssClass(def, config.action.direction);
      let durationOut = actionDur;
      let layerStyle: CSSProperties | undefined;
      if (config.action.animationId === BRANCH_SWAY_ANIMATION_ID) {
        const { swaySpeed } = parseBranchSwayParams(config.action.params);
        durationOut = branchSwayEffectiveDuration(actionDur, swaySpeed);
        layerStyle = branchSwayLayerStyleFromAction(config.action);
      }
      return { phase: 'action', cssClass, duration: durationOut, actionIterationCount, layerStyle };
    }
  }

  return null;
}
