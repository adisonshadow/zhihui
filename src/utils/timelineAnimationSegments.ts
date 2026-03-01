/**
 * 时间线素材条上动画标记线段的位置与长度（见 docs/08-素材动画功能技术方案.md 8.1）
 * 出现：靠左靠下；动作：靠左靠上；消失：靠右靠下；线段长度与动画时长一致
 */
export interface AnimationSegment {
  type: 'appear' | 'action' | 'disappear';
  leftPct: number;
  widthPct: number;
  position: 'top' | 'bottom';
}

export interface AnimationSegmentsResult {
  segments: AnimationSegment[];
  hasAny: boolean;
}

export function getTimelineAnimationSegments(
  startTime: number,
  endTime: number,
  config: {
    appear?: { duration?: number };
    action?: { duration?: number; repeatCount?: number };
    disappear?: { duration?: number };
  } | null
): AnimationSegmentsResult {
  if (!config) return { segments: [], hasAny: false };
  const blockDur = Math.max(0.001, endTime - startTime);
  const segments: AnimationSegment[] = [];

  if (config.appear) {
    const d = config.appear.duration ?? 0.6;
    const widthPct = Math.min(100, (d / blockDur) * 100);
    if (widthPct > 0) {
      segments.push({
        type: 'appear',
        leftPct: 0,
        widthPct,
        position: 'bottom',
      });
    }
  }

  if (config.action) {
    const appearEnd = (config.appear?.duration ?? 0) || 0;
    const disappearStart = blockDur - (config.disappear?.duration ?? 0);
    const actionStart = appearEnd;
    const actionEnd = Math.max(actionStart, disappearStart);
    const actionPhaseDur = actionEnd - actionStart;
    if (actionPhaseDur > 0) {
      const leftPct = (actionStart / blockDur) * 100;
      const widthPct = Math.min(100 - leftPct, (actionPhaseDur / blockDur) * 100);
      if (widthPct > 0) {
        segments.push({
          type: 'action',
          leftPct,
          widthPct,
          position: 'top',
        });
      }
    }
  }

  if (config.disappear) {
    const d = config.disappear.duration ?? 0.6;
    const widthPct = Math.min(100, (d / blockDur) * 100);
    if (widthPct > 0) {
      segments.push({
        type: 'disappear',
        leftPct: 100 - widthPct,
        widthPct,
        position: 'bottom',
      });
    }
  }

  return { segments, hasAny: segments.length > 0 };
}
