/**
 * 关键帧补间：位置/平面旋转/3D旋转/缩放 使用一个 Transform 组合，模糊/透明度/色彩单独插值（见功能文档 6.8）
 * 关键帧按属性独立；补间时按时间在相邻关键帧之间线性插值，输出用于画布的一致的变换与效果值。
 */

export type KeyframeProperty = 'pos' | 'scale' | 'rotation' | 'blur' | 'opacity' | 'color';

export interface KeyframeRowLike {
  time: number;
  property: string;
  pos_x?: number | null;
  pos_y?: number | null;
  scale_x?: number | null;
  scale_y?: number | null;
  rotation?: number | null;
  rotation_x?: number | null;
  rotation_y?: number | null;
  blur?: number | null;
  opacity?: number | null;
  color?: string | null;
}

/** 块在时间轴上的区间与基础变换（无关键帧时的默认值） */
export interface BlockBaseTransform {
  start_time: number;
  end_time: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  rotation_x?: number;
  rotation_y?: number;
  blur?: number;
  opacity?: number;
  color?: string;
}

/** 插值后的变换（位置/平面旋转/3D旋转/缩放 → 一个 Transform 所用） */
export interface InterpolatedTransform {
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  rotation_x: number;
  rotation_y: number;
}

/** 插值后的效果（模糊/透明度/色彩） */
export interface InterpolatedEffects {
  blur: number;
  opacity: number;
  color: string;
}

/** 当前时间是否在块的时间区间内 */
function isTimeInBlock(t: number, block: BlockBaseTransform): boolean {
  return t >= block.start_time && t <= block.end_time;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 角度插值（-180～180 取最短路径） */
function lerpAngle(degA: number, degB: number, t: number): number {
  let d = degB - degA;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return degA + d * t;
}

/** 解析颜色为 r,g,b,a (0-1) */
function parseColor(s: string | null | undefined): { r: number; g: number; b: number; a: number } {
  if (!s || typeof s !== 'string') return { r: 1, g: 1, b: 1, a: 1 };
  const hex = s.replace(/^#/, '');
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b, a: 1 };
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}

/** 在有序关键帧列表中插值得到标量值 */
function interpolateScalarKeyframes(
  keyframes: KeyframeRowLike[],
  t: number,
  blockStart: number,
  blockEnd: number,
  baseValue: number,
  getValue: (kf: KeyframeRowLike) => number | null | undefined
): number {
  const list = keyframes.filter((kf) => getValue(kf) != null);
  if (list.length === 0) return baseValue;
  const sorted = [...list].sort((a, b) => a.time - b.time);
  const before = sorted.filter((kf) => kf.time <= t);
  const after = sorted.filter((kf) => kf.time > t);
  const prev = before.pop();
  const next = after[0];
  if (!prev) {
    const v = getValue(next!);
    return v != null ? v : baseValue;
  }
  const vPrev = getValue(prev);
  if (vPrev == null) return baseValue;
  if (!next) return vPrev;
  const vNext = getValue(next);
  if (vNext == null) return vPrev;
  const dt = next.time - prev.time;
  const frac = dt <= 0 ? 1 : (t - prev.time) / dt;
  return lerp(vPrev, vNext, frac);
}

/** 在有序关键帧列表中插值得到角度 */
function interpolateRotationKeyframes(
  keyframes: KeyframeRowLike[],
  t: number,
  baseValue: number,
  getValue: (kf: KeyframeRowLike) => number | null | undefined
): number {
  const list = keyframes.filter((kf) => getValue(kf) != null);
  if (list.length === 0) return baseValue;
  const sorted = [...list].sort((a, b) => a.time - b.time);
  const before = sorted.filter((kf) => kf.time <= t);
  const after = sorted.filter((kf) => kf.time > t);
  const prev = before.pop();
  const next = after[0];
  if (!prev) {
    const v = getValue(next!);
    return v != null ? v : baseValue;
  }
  const vPrev = getValue(prev);
  if (vPrev == null) return baseValue;
  if (!next) return vPrev;
  const vNext = getValue(next);
  if (vNext == null) return vPrev;
  const dt = next.time - prev.time;
  const frac = dt <= 0 ? 1 : (t - prev.time) / dt;
  return lerpAngle(vPrev, vNext, frac);
}

/** 色彩插值 */
function interpolateColorKeyframes(
  keyframes: KeyframeRowLike[],
  t: number,
  baseColor: string,
  getValue: (kf: KeyframeRowLike) => string | null | undefined
): string {
  const list = keyframes.filter((kf) => getValue(kf) != null && getValue(kf) !== '');
  if (list.length === 0) return baseColor;
  const sorted = [...list].sort((a, b) => a.time - b.time);
  const before = sorted.filter((kf) => kf.time <= t);
  const after = sorted.filter((kf) => kf.time > t);
  const prev = before.pop();
  const next = after[0];
  if (!prev) {
    const v = getValue(next!);
    return v != null ? v : baseColor;
  }
  const cPrev = parseColor(getValue(prev));
  if (!next) {
    return `rgba(${Math.round(cPrev.r * 255)},${Math.round(cPrev.g * 255)},${Math.round(cPrev.b * 255)},${cPrev.a})`;
  }
  const cNext = parseColor(getValue(next));
  const dt = next.time - prev.time;
  const frac = dt <= 0 ? 1 : (t - prev.time) / dt;
  const r = lerp(cPrev.r, cNext.r, frac);
  const g = lerp(cPrev.g, cNext.g, frac);
  const b = lerp(cPrev.b, cNext.b, frac);
  const a = lerp(cPrev.a, cNext.a, frac);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

/**
 * 根据块的基础变换与关键帧列表，计算在时间 t 处的插值变换（位置/平面旋转/3D旋转/缩放 → 一个 Transform）
 * 若 t 不在块区间内，返回块起点或终点的边界值。
 */
export function getInterpolatedTransform(
  block: BlockBaseTransform,
  keyframes: KeyframeRowLike[],
  t: number
): InterpolatedTransform {
  if (!isTimeInBlock(t, block)) {
    const clampT = Math.max(block.start_time, Math.min(block.end_time, t));
    return getInterpolatedTransform(block, keyframes, clampT);
  }
  const posKfs = keyframes.filter((kf) => (kf.property || 'pos') === 'pos');
  const scaleKfs = keyframes.filter((kf) => (kf.property || '') === 'scale');
  const rotKfs = keyframes.filter((kf) => (kf.property || '') === 'rotation');

  const pos_x = interpolateScalarKeyframes(posKfs, t, block.start_time, block.end_time, block.pos_x, (kf) => kf.pos_x ?? null);
  const pos_y = interpolateScalarKeyframes(posKfs, t, block.start_time, block.end_time, block.pos_y, (kf) => kf.pos_y ?? null);
  const scale_x = interpolateScalarKeyframes(scaleKfs, t, block.start_time, block.end_time, block.scale_x, (kf) => kf.scale_x ?? null);
  const scale_y = interpolateScalarKeyframes(scaleKfs, t, block.start_time, block.end_time, block.scale_y, (kf) => kf.scale_y ?? null);
  const rotation = interpolateRotationKeyframes(rotKfs, t, block.rotation, (kf) => kf.rotation ?? null);
  const rotation_x = interpolateRotationKeyframes(keyframes.filter((kf) => kf.property === 'rotation_x'), t, block.rotation_x ?? 0, (kf) => kf.rotation_x ?? null);
  const rotation_y = interpolateRotationKeyframes(keyframes.filter((kf) => kf.property === 'rotation_y'), t, block.rotation_y ?? 0, (kf) => kf.rotation_y ?? null);

  return { pos_x, pos_y, scale_x, scale_y, rotation, rotation_x, rotation_y };
}

/**
 * 根据块与关键帧计算时间 t 处的模糊/透明度/色彩
 */
export function getInterpolatedEffects(
  block: BlockBaseTransform,
  keyframes: KeyframeRowLike[],
  t: number
): InterpolatedEffects {
  if (!isTimeInBlock(t, block)) {
    return {
      blur: block.blur ?? 0,
      opacity: block.opacity ?? 1,
      color: block.color ?? 'transparent',
    };
  }
  const blurKfs = keyframes.filter((kf) => (kf.property || '') === 'blur');
  const opacityKfs = keyframes.filter((kf) => (kf.property || '') === 'opacity');
  const colorKfs = keyframes.filter((kf) => (kf.property || '') === 'color');

  const blur = interpolateScalarKeyframes(blurKfs, t, block.start_time, block.end_time, block.blur ?? 0, (kf) => kf.blur ?? null);
  const opacity = interpolateScalarKeyframes(opacityKfs, t, block.start_time, block.end_time, block.opacity ?? 1, (kf) => kf.opacity ?? null);
  const color = interpolateColorKeyframes(colorKfs, t, block.color ?? 'transparent', (kf) => kf.color ?? null);

  return { blur, opacity, color };
}

/**
 * 由插值后的变换生成 CSS transform 字符串（一个 Transform Matrix 的等价：translate + scale + rotate + rotateX + rotateY）
 * 使用 2D/3D 组合，便于画布应用。
 */
export function buildTransformCSS(
  t: InterpolatedTransform,
  designWidth: number,
  designHeight: number,
  originPx: 'center' | 'top-left'
): string {
  const x = t.pos_x * designWidth;
  const y = t.pos_y * designHeight;
  const parts: string[] = [];
  if (originPx === 'center') {
    parts.push(`translate(${x}px, ${y}px)`);
    parts.push(`translate(-50%, -50%)`);
    parts.push(`scale(${t.scale_x}, ${t.scale_y})`);
    parts.push(`rotate(${t.rotation}deg)`);
  } else {
    parts.push(`translate(${x}px, ${y}px)`);
    parts.push(`scale(${t.scale_x}, ${t.scale_y})`);
    parts.push(`rotate(${t.rotation}deg)`);
  }
  if (t.rotation_x !== 0 || t.rotation_y !== 0) {
    parts.push(`rotateX(${t.rotation_x}deg)`);
    parts.push(`rotateY(${t.rotation_y}deg)`);
  }
  return parts.join(' ');
}

/**
 * 由插值后的变换生成「锚点为中心」时的 left/top/width/height/transform（与现有画布渲染一致）
 * 不改变现有用 left/top/width/height + rotate 的布局方式，仅提供插值后的数值。
 */
export function buildTransformStyle(
  t: InterpolatedTransform,
  designWidth: number,
  designHeight: number
): { left: number; top: number; width: number; height: number; transform: string } {
  const width = t.scale_x * designWidth;
  const height = t.scale_y * designHeight;
  const left = t.pos_x * designWidth - width / 2;
  const top = t.pos_y * designHeight - height / 2;
  const rot = `rotate(${t.rotation}deg)`;
  const rot3d =
    t.rotation_x !== 0 || t.rotation_y !== 0
      ? ` rotateX(${t.rotation_x}deg) rotateY(${t.rotation_y}deg)`
      : '';
  return {
    left,
    top,
    width,
    height,
    transform: rot + rot3d,
  };
}
