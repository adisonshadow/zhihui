/**
 * 人物预设骨骼动画：正面/侧面 走路、跳跃（见 docs/06-人物骨骼贴图功能设计.md）
 * 关键帧为归一化坐标 [0,1]，与 HUMAN_PRESET 节点 id 一致
 */

export type HumanAngleType = 'front' | 'side';
export type HumanMotionType = 'walk' | 'jump';

export interface SkeletonKeyframe {
  time: number;
  /** nodeId -> 归一化 [x, y] */
  pose: Record<string, [number, number]>;
}

const HUMAN_NODE_IDS = [
  'head', 'neck', 'spine',
  'shoulder_l', 'elbow_l', 'wrist_l', 'shoulder_r', 'elbow_r', 'wrist_r',
  'hip', 'hip_l', 'knee_l', 'ankle_l', 'hip_r', 'knee_r', 'ankle_r',
] as const;

/** 人物 T 姿态（正面，与 HUMAN_PRESET 默认一致） */
const REST_POSE_FRONT: Record<string, [number, number]> = {
  head: [0.5, 0.08], neck: [0.5, 0.18], spine: [0.5, 0.35],
  shoulder_l: [0.28, 0.2], elbow_l: [0.15, 0.38], wrist_l: [0.08, 0.52],
  shoulder_r: [0.72, 0.2], elbow_r: [0.85, 0.38], wrist_r: [0.92, 0.52],
  hip: [0.5, 0.52], hip_l: [0.4, 0.52], knee_l: [0.38, 0.72], ankle_l: [0.38, 0.92],
  hip_r: [0.6, 0.52], knee_r: [0.62, 0.72], ankle_r: [0.62, 0.92],
};

/** 人物 T 姿态（侧面视角：整体偏右，左右为前后） */
const REST_POSE_SIDE: Record<string, [number, number]> = {
  head: [0.55, 0.08], neck: [0.54, 0.18], spine: [0.52, 0.35],
  shoulder_l: [0.48, 0.2], elbow_l: [0.42, 0.38], wrist_l: [0.38, 0.52],
  shoulder_r: [0.56, 0.2], elbow_r: [0.62, 0.38], wrist_r: [0.66, 0.52],
  hip: [0.52, 0.52], hip_l: [0.46, 0.52], knee_l: [0.44, 0.72], ankle_l: [0.44, 0.92],
  hip_r: [0.58, 0.52], knee_r: [0.6, 0.72], ankle_r: [0.6, 0.92],
};

function copyPose(p: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const k of Object.keys(p)) out[k] = [p[k][0], p[k][1]];
  return out;
}

/** 正面-走路：一周期约 1s，左右腿交替、手臂自然摆动 */
function buildFrontWalk(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        hip_l: [0.38, 0.52], knee_l: [0.36, 0.68], ankle_l: [0.36, 0.9],
        hip_r: [0.62, 0.54], knee_r: [0.64, 0.74], ankle_r: [0.66, 0.92],
        shoulder_l: [0.26, 0.22], elbow_l: [0.12, 0.4], wrist_l: [0.06, 0.54],
        shoulder_r: [0.74, 0.18], elbow_r: [0.88, 0.36], wrist_r: [0.94, 0.5],
      },
    },
    { time: 0.5, pose: copyPose(rest) },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        hip_l: [0.42, 0.54], knee_l: [0.44, 0.74], ankle_l: [0.46, 0.92],
        hip_r: [0.58, 0.52], knee_r: [0.6, 0.68], ankle_r: [0.58, 0.9],
        shoulder_l: [0.3, 0.18], elbow_l: [0.18, 0.36], wrist_l: [0.1, 0.5],
        shoulder_r: [0.7, 0.22], elbow_r: [0.82, 0.4], wrist_r: [0.9, 0.54],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 侧面-走路：一周期约 1s，前后腿、手臂前后摆 */
function buildSideWalk(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        hip_l: [0.44, 0.52], knee_l: [0.42, 0.7], ankle_l: [0.4, 0.9],
        hip_r: [0.6, 0.54], knee_r: [0.62, 0.74], ankle_r: [0.64, 0.92],
        shoulder_l: [0.46, 0.2], elbow_l: [0.4, 0.36], wrist_l: [0.36, 0.5],
        shoulder_r: [0.58, 0.22], elbow_r: [0.64, 0.4], wrist_r: [0.68, 0.54],
      },
    },
    { time: 0.5, pose: copyPose(rest) },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        hip_l: [0.48, 0.54], knee_l: [0.5, 0.74], ankle_l: [0.48, 0.92],
        hip_r: [0.56, 0.52], knee_r: [0.58, 0.7], ankle_r: [0.56, 0.9],
        shoulder_l: [0.5, 0.22], elbow_l: [0.44, 0.4], wrist_l: [0.4, 0.54],
        shoulder_r: [0.54, 0.2], elbow_r: [0.6, 0.36], wrist_r: [0.64, 0.5],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 正面-跳跃：下蹲 -> 起跳 -> 空中 -> 落地 */
function buildFrontJump(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.1,
      pose: {
        ...copyPose(rest),
        head: [0.5, 0.1], neck: [0.5, 0.2], spine: [0.5, 0.38],
        knee_l: [0.4, 0.68], ankle_l: [0.4, 0.88], knee_r: [0.6, 0.68], ankle_r: [0.6, 0.88],
        shoulder_l: [0.26, 0.22], elbow_l: [0.14, 0.4], shoulder_r: [0.74, 0.22], elbow_r: [0.86, 0.4],
      },
    },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        head: [0.5, 0.04], neck: [0.5, 0.12], spine: [0.5, 0.28],
        hip: [0.5, 0.44], hip_l: [0.38, 0.46], knee_l: [0.36, 0.6], ankle_l: [0.38, 0.78],
        hip_r: [0.62, 0.46], knee_r: [0.64, 0.6], ankle_r: [0.62, 0.78],
        shoulder_l: [0.22, 0.14], elbow_l: [0.1, 0.28], wrist_l: [0.06, 0.4],
        shoulder_r: [0.78, 0.14], elbow_r: [0.9, 0.28], wrist_r: [0.94, 0.4],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head: [0.5, 0.02], neck: [0.5, 0.1], spine: [0.5, 0.25],
        hip: [0.5, 0.4], hip_l: [0.36, 0.42], knee_l: [0.34, 0.52], ankle_l: [0.36, 0.68],
        hip_r: [0.64, 0.42], knee_r: [0.66, 0.52], ankle_r: [0.64, 0.68],
        shoulder_l: [0.2, 0.08], elbow_l: [0.08, 0.2], wrist_l: [0.04, 0.32],
        shoulder_r: [0.8, 0.08], elbow_r: [0.92, 0.2], wrist_r: [0.96, 0.32],
      },
    },
    {
      time: 0.55,
      pose: {
        ...copyPose(rest),
        head: [0.5, 0.06], neck: [0.5, 0.14], spine: [0.5, 0.32],
        hip: [0.5, 0.48], hip_l: [0.4, 0.5], knee_l: [0.38, 0.66], ankle_l: [0.38, 0.86],
        hip_r: [0.6, 0.5], knee_r: [0.62, 0.66], ankle_r: [0.62, 0.86],
      },
    },
    { time: 0.65, pose: copyPose(rest) },
  ];
}

/** 侧面-跳跃 */
function buildSideJump(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.1,
      pose: {
        ...copyPose(rest),
        head: [0.54, 0.1], neck: [0.53, 0.2], spine: [0.52, 0.38],
        knee_l: [0.44, 0.68], ankle_l: [0.44, 0.88], knee_r: [0.6, 0.68], ankle_r: [0.62, 0.88],
      },
    },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        head: [0.56, 0.04], neck: [0.55, 0.12], spine: [0.54, 0.28],
        hip: [0.52, 0.44], hip_l: [0.46, 0.46], knee_l: [0.44, 0.6], ankle_l: [0.44, 0.78],
        hip_r: [0.58, 0.46], knee_r: [0.6, 0.6], ankle_r: [0.6, 0.78],
        shoulder_l: [0.46, 0.14], elbow_l: [0.4, 0.28], shoulder_r: [0.6, 0.14], elbow_r: [0.66, 0.28],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head: [0.57, 0.02], neck: [0.56, 0.1], spine: [0.54, 0.25],
        hip: [0.53, 0.4], hip_l: [0.46, 0.42], knee_l: [0.44, 0.52], ankle_l: [0.44, 0.68],
        hip_r: [0.6, 0.42], knee_r: [0.62, 0.52], ankle_r: [0.62, 0.68],
        shoulder_l: [0.44, 0.08], elbow_l: [0.38, 0.2], shoulder_r: [0.62, 0.08], elbow_r: [0.68, 0.2],
      },
    },
    {
      time: 0.55,
      pose: {
        ...copyPose(rest),
        head: [0.55, 0.06], neck: [0.54, 0.14], spine: [0.52, 0.32],
        hip: [0.52, 0.48], hip_l: [0.46, 0.5], knee_l: [0.44, 0.66], ankle_l: [0.44, 0.86],
        hip_r: [0.58, 0.5], knee_r: [0.6, 0.66], ankle_r: [0.6, 0.86],
      },
    },
    { time: 0.65, pose: copyPose(rest) },
  ];
}

let cache: Partial<Record<`${HumanAngleType}_${HumanMotionType}`, SkeletonKeyframe[]>> = {};

export function getHumanMotionKeyframes(angleType: HumanAngleType, motion: HumanMotionType): SkeletonKeyframe[] {
  const key: `${HumanAngleType}_${HumanMotionType}` = `${angleType}_${motion}`;
  if (!cache[key]) {
    if (angleType === 'front' && motion === 'walk') cache[key] = buildFrontWalk();
    else if (angleType === 'side' && motion === 'walk') cache[key] = buildSideWalk();
    else if (angleType === 'front' && motion === 'jump') cache[key] = buildFrontJump();
    else if (angleType === 'side' && motion === 'jump') cache[key] = buildSideJump();
  }
  return cache[key]!;
}

export function getHumanMotionDuration(angleType: HumanAngleType, motion: HumanMotionType): number {
  const kfs = getHumanMotionKeyframes(angleType, motion);
  return kfs.length > 0 ? kfs[kfs.length - 1].time : 1;
}

/** 根据角度名称判断是正面还是侧面（正面 / 侧面 走路、跳跃动画不同） */
export function getHumanAngleType(angleName: string): HumanAngleType {
  const name = (angleName || '').trim();
  if (name.includes('侧')) return 'side';
  return 'front';
}

/** 线性插值得到 t 时刻的 pose，t 循环使用（取 duration 模） */
export function sampleHumanMotion(
  angleType: HumanAngleType,
  motion: HumanMotionType,
  t: number
): Record<string, [number, number]> {
  const kfs = getHumanMotionKeyframes(angleType, motion);
  if (kfs.length === 0) return {};
  const duration = kfs[kfs.length - 1].time;
  const loopT = duration > 0 ? t % duration : 0;
  let i = 0;
  while (i + 1 < kfs.length && kfs[i + 1].time <= loopT) i++;
  if (i + 1 >= kfs.length) return copyPose(kfs[i].pose);
  const a = kfs[i];
  const b = kfs[i + 1];
  const rest = restPoseForAngle(angleType);
  const u = (loopT - a.time) / (b.time - a.time);
  const pose: Record<string, [number, number]> = {};
  for (const id of HUMAN_NODE_IDS) {
    const pa = a.pose[id] ?? rest[id];
    const pb = b.pose[id] ?? rest[id];
    if (pa && pb) {
      pose[id] = [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u];
    } else if (rest[id]) {
      pose[id] = [...rest[id]];
    }
  }
  return pose;
}

function restPoseForAngle(angleType: HumanAngleType): Record<string, [number, number]> {
  return angleType === 'front' ? REST_POSE_FRONT : REST_POSE_SIDE;
}

/** 导出：获取预设 T 姿态（用于在用户绑定空间内叠加动作增量） */
export function getRestPose(angleType: HumanAngleType): Record<string, [number, number]> {
  return copyPose(restPoseForAngle(angleType));
}
