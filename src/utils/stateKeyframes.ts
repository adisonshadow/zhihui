/**
 * 状态关键帧工具：解析与按时间查找
 */
export interface StateKeyframe {
  time: number;
  selectedTagsByGroupId?: Record<string, string>;
  selectedTagsBySpriteItemId?: Record<string, Record<string, string>>;
}

const KF_TOLERANCE = 0.02;

export function parseStateKeyframes(raw: string | null | undefined): StateKeyframe[] {
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as StateKeyframe[];
    return Array.isArray(arr) ? arr.filter((k) => typeof k.time === 'number').sort((a, b) => a.time - b.time) : [];
  } catch {
    return [];
  }
}

/** 根据 currentTime 找到当前生效的状态关键帧（最后一个 time <= currentTime 的，若无则取第一个） */
export function getEffectiveKeyframe(
  keyframes: StateKeyframe[],
  currentTime: number
): StateKeyframe | null {
  const before = keyframes.filter((k) => k.time <= currentTime + KF_TOLERANCE);
  if (before.length > 0) return before[before.length - 1]!;
  return keyframes[0] ?? null;
}
