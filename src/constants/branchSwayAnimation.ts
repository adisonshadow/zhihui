/**
 * 微风摇摆 yiman.branchSway：锚点、速度、幅度（见 animationsYiman 注册）
 */
import type { CSSProperties } from 'react';
import type { BlockAnimationConfig } from './animationRegistry';

export const BRANCH_SWAY_ANIMATION_ID = 'yiman.branchSway';

export const BRANCH_SWAY_ANCHOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'topLeft', label: '左上' },
  { value: 'top', label: '上' },
  { value: 'topRight', label: '右上' },
  { value: 'left', label: '左' },
  { value: 'center', label: '中间' },
  { value: 'right', label: '右' },
  { value: 'bottomLeft', label: '左下' },
  { value: 'bottom', label: '下' },
  { value: 'bottomRight', label: '右下' },
];

const ANCHOR_TO_ORIGIN: Record<string, string> = {
  topLeft: '0% 0%',
  top: '50% 0%',
  topRight: '100% 0%',
  left: '0% 50%',
  center: '50% 50%',
  right: '100% 50%',
  bottomLeft: '0% 100%',
  bottom: '50% 100%',
  bottomRight: '100% 100%',
};

export function branchSwayTransformOrigin(anchor: string | undefined): string {
  if (anchor && ANCHOR_TO_ORIGIN[anchor]) return ANCHOR_TO_ORIGIN[anchor];
  return '50% 100%';
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && !Number.isNaN(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseBranchSwayParams(params: unknown): {
  swayAnchor: string;
  swaySpeed: number;
  swayAmplitude: number;
} {
  const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  const anchor = typeof p.swayAnchor === 'string' ? p.swayAnchor : 'bottom';
  return {
    swayAnchor: ANCHOR_TO_ORIGIN[anchor] ? anchor : 'bottom',
    swaySpeed: clampInt(p.swaySpeed, 1, 10, 5),
    swayAmplitude: clampInt(p.swayAmplitude, 1, 10, 5),
  };
}

/** 基准时长 × (5/速度)，速度越大周期越短 */
export function branchSwayEffectiveDuration(baseSeconds: number, swaySpeed: number): number {
  const s = Math.min(10, Math.max(1, swaySpeed));
  return baseSeconds * (5 / s);
}

/** 幅度 1～10 → 主摇摆角（度），驱动 keyframes 中 rotateZ 幅值 */
export function branchSwayRzDeg(amplitude: number): number {
  const a = Math.min(10, Math.max(1, amplitude));
  return 0.8 + ((a - 1) / 9) * 5.7;
}

export function branchSwayLayerStyle(params: unknown): CSSProperties {
  const { swayAnchor, swayAmplitude } = parseBranchSwayParams(params);
  const rz = branchSwayRzDeg(swayAmplitude);
  return {
    transformOrigin: branchSwayTransformOrigin(swayAnchor),
    ...({
      '--yiman-sway-rz': `${rz}deg`,
    } as CSSProperties),
  };
}

export function branchSwayLayerStyleFromAction(
  action: NonNullable<BlockAnimationConfig['action']>
): CSSProperties | undefined {
  if (action.animationId !== BRANCH_SWAY_ANIMATION_ID) return undefined;
  return branchSwayLayerStyle(action.params);
}

export const BRANCH_SWAY_DEFAULT_PARAMS: Record<string, string | number> = {
  swayAnchor: 'bottom',
  swaySpeed: 5,
  swayAmplitude: 5,
};
