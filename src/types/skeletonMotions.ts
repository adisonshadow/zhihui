/**
 * 人物预设骨骼动画：正面/侧面 走路、跳跃（见 docs/06-人物骨骼贴图功能设计.md）
 * 关键帧为归一化坐标 [0,1]，与 HUMAN_PRESET 节点 id 一致
 */

export type HumanAngleType = 'front' | 'front45' | 'side' | 'back';
export type HumanMotionType = 'walk' | 'jump' | 'mj_dance' | 'wave' | 'run';

export interface SkeletonKeyframe {
  time: number;
  /** nodeId -> 归一化 [x, y] */
  pose: Record<string, [number, number]>;
}

const HUMAN_NODE_IDS = [
  'head_top', 'jaw', 'collarbone', 'navel',
  'shoulder_l', 'elbow_l', 'wrist_l', 'fingertip_l', 'shoulder_r', 'elbow_r', 'wrist_r', 'fingertip_r',
  'hip_l', 'knee_l', 'heel_l', 'toe_l', 'hip_r', 'knee_r', 'heel_r', 'toe_r',
] as const;

/** 人物 T 姿态（正面，12 顶点：头顶-下颌-锁骨-肚脐 / 肩胛-肘-腕-指尖 / 髋-膝-脚跟-脚尖） */
const REST_POSE_FRONT: Record<string, [number, number]> = {
  head_top: [0.5, 0.05], jaw: [0.5, 0.12], collarbone: [0.5, 0.2], navel: [0.5, 0.38],
  shoulder_l: [0.26, 0.18], elbow_l: [0.12, 0.35], wrist_l: [0.05, 0.5], fingertip_l: [0.02, 0.52],
  shoulder_r: [0.74, 0.18], elbow_r: [0.88, 0.35], wrist_r: [0.95, 0.5], fingertip_r: [0.98, 0.52],
  hip_l: [0.38, 0.48], knee_l: [0.34, 0.68], heel_l: [0.34, 0.88], toe_l: [0.34, 0.96],
  hip_r: [0.62, 0.48], knee_r: [0.66, 0.68], heel_r: [0.66, 0.88], toe_r: [0.66, 0.96],
};

/** 人物 T 姿态（45度视角） */
const REST_POSE_FRONT45: Record<string, [number, number]> = {
  head_top: [0.52, 0.06], jaw: [0.52, 0.16], collarbone: [0.51, 0.26], navel: [0.51, 0.4],
  shoulder_l: [0.38, 0.2], elbow_l: [0.28, 0.38], wrist_l: [0.22, 0.52], fingertip_l: [0.2, 0.54],
  shoulder_r: [0.64, 0.2], elbow_r: [0.74, 0.38], wrist_r: [0.78, 0.52], fingertip_r: [0.8, 0.54],
  hip_l: [0.43, 0.52], knee_l: [0.41, 0.72], heel_l: [0.4, 0.9], toe_l: [0.4, 0.96],
  hip_r: [0.59, 0.52], knee_r: [0.61, 0.72], heel_r: [0.62, 0.9], toe_r: [0.62, 0.96],
};

/** 人物 T 姿态（侧面视角） */
const REST_POSE_SIDE: Record<string, [number, number]> = {
  head_top: [0.55, 0.06], jaw: [0.54, 0.16], collarbone: [0.52, 0.26], navel: [0.52, 0.4],
  shoulder_l: [0.48, 0.2], elbow_l: [0.42, 0.38], wrist_l: [0.38, 0.52], fingertip_l: [0.36, 0.54],
  shoulder_r: [0.56, 0.2], elbow_r: [0.62, 0.38], wrist_r: [0.66, 0.52], fingertip_r: [0.68, 0.54],
  hip_l: [0.46, 0.52], knee_l: [0.44, 0.72], heel_l: [0.44, 0.9], toe_l: [0.44, 0.96],
  hip_r: [0.58, 0.52], knee_r: [0.6, 0.72], heel_r: [0.6, 0.9], toe_r: [0.6, 0.96],
};

/** 人物 T 姿态（背面） */
const REST_POSE_BACK: Record<string, [number, number]> = {
  head_top: [0.5, 0.06], jaw: [0.5, 0.16], collarbone: [0.5, 0.26], navel: [0.5, 0.4],
  shoulder_l: [0.72, 0.2], elbow_l: [0.85, 0.38], wrist_l: [0.92, 0.52], fingertip_l: [0.95, 0.54],
  shoulder_r: [0.28, 0.2], elbow_r: [0.15, 0.38], wrist_r: [0.08, 0.52], fingertip_r: [0.05, 0.54],
  hip_l: [0.6, 0.52], knee_l: [0.62, 0.72], heel_l: [0.62, 0.9], toe_l: [0.62, 0.96],
  hip_r: [0.4, 0.52], knee_r: [0.38, 0.72], heel_r: [0.38, 0.9], toe_r: [0.38, 0.96],
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
        navel: [0.5, 0.4], hip_l: [0.38, 0.52], knee_l: [0.36, 0.68], heel_l: [0.36, 0.88], toe_l: [0.36, 0.96],
        hip_r: [0.62, 0.54], knee_r: [0.64, 0.74], heel_r: [0.66, 0.88], toe_r: [0.66, 0.96],
        shoulder_l: [0.26, 0.22], elbow_l: [0.12, 0.4], wrist_l: [0.06, 0.54], fingertip_l: [0.04, 0.56],
        shoulder_r: [0.74, 0.18], elbow_r: [0.88, 0.36], wrist_r: [0.94, 0.5], fingertip_r: [0.96, 0.52],
      },
    },
    { time: 0.5, pose: copyPose(rest) },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        navel: [0.5, 0.4], hip_l: [0.42, 0.54], knee_l: [0.44, 0.74], heel_l: [0.46, 0.88], toe_l: [0.46, 0.96],
        hip_r: [0.58, 0.52], knee_r: [0.6, 0.68], heel_r: [0.58, 0.88], toe_r: [0.58, 0.96],
        shoulder_l: [0.3, 0.18], elbow_l: [0.18, 0.36], wrist_l: [0.1, 0.5], fingertip_l: [0.08, 0.52],
        shoulder_r: [0.7, 0.22], elbow_r: [0.82, 0.4], wrist_r: [0.9, 0.54], fingertip_r: [0.92, 0.56],
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
        navel: [0.52, 0.42], hip_l: [0.44, 0.52], knee_l: [0.42, 0.7], heel_l: [0.4, 0.88], toe_l: [0.4, 0.96],
        hip_r: [0.6, 0.54], knee_r: [0.62, 0.74], heel_r: [0.64, 0.88], toe_r: [0.64, 0.96],
        shoulder_l: [0.46, 0.2], elbow_l: [0.4, 0.36], wrist_l: [0.36, 0.5], fingertip_l: [0.34, 0.52],
        shoulder_r: [0.58, 0.22], elbow_r: [0.64, 0.4], wrist_r: [0.68, 0.54], fingertip_r: [0.7, 0.56],
      },
    },
    { time: 0.5, pose: copyPose(rest) },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        navel: [0.52, 0.42], hip_l: [0.48, 0.54], knee_l: [0.5, 0.74], heel_l: [0.48, 0.88], toe_l: [0.48, 0.96],
        hip_r: [0.56, 0.52], knee_r: [0.58, 0.7], heel_r: [0.56, 0.88], toe_r: [0.56, 0.96],
        shoulder_l: [0.5, 0.22], elbow_l: [0.44, 0.4], wrist_l: [0.4, 0.54], fingertip_l: [0.38, 0.56],
        shoulder_r: [0.54, 0.2], elbow_r: [0.6, 0.36], wrist_r: [0.64, 0.5], fingertip_r: [0.66, 0.52],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 正面-跳跃：下蹲 -> 起跳 -> 空中 -> 落地，头部尽量保持稳定减少变形 */
function buildFrontJump(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.1,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.085], jaw: [0.5, 0.19], collarbone: [0.5, 0.3], navel: [0.5, 0.42],
        knee_l: [0.4, 0.68], heel_l: [0.4, 0.86], toe_l: [0.4, 0.94], knee_r: [0.6, 0.68], heel_r: [0.6, 0.86], toe_r: [0.6, 0.94],
        shoulder_l: [0.26, 0.22], elbow_l: [0.14, 0.4], shoulder_r: [0.74, 0.22], elbow_r: [0.86, 0.4],
      },
    },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.08], jaw: [0.5, 0.16], collarbone: [0.5, 0.24], navel: [0.5, 0.36],
        navel: [0.5, 0.44], hip_l: [0.38, 0.46], knee_l: [0.36, 0.6], heel_l: [0.38, 0.76], toe_l: [0.38, 0.84],
        hip_r: [0.62, 0.46], knee_r: [0.64, 0.6], heel_r: [0.62, 0.76], toe_r: [0.62, 0.84],
        shoulder_l: [0.24, 0.16], elbow_l: [0.12, 0.3], wrist_l: [0.08, 0.42], fingertip_l: [0.06, 0.44],
        shoulder_r: [0.76, 0.16], elbow_r: [0.88, 0.3], wrist_r: [0.92, 0.42], fingertip_r: [0.94, 0.44],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.078], jaw: [0.5, 0.14], collarbone: [0.5, 0.22], navel: [0.5, 0.32],
        navel: [0.5, 0.4], hip_l: [0.36, 0.42], knee_l: [0.34, 0.52], heel_l: [0.36, 0.66], toe_l: [0.36, 0.74],
        hip_r: [0.64, 0.42], knee_r: [0.66, 0.52], heel_r: [0.64, 0.66], toe_r: [0.64, 0.74],
        shoulder_l: [0.24, 0.14], elbow_l: [0.1, 0.24], wrist_l: [0.06, 0.34], fingertip_l: [0.04, 0.36],
        shoulder_r: [0.76, 0.14], elbow_r: [0.9, 0.24], wrist_r: [0.94, 0.34], fingertip_r: [0.96, 0.36],
      },
    },
    {
      time: 0.55,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.082], jaw: [0.5, 0.15], collarbone: [0.5, 0.26], navel: [0.5, 0.38],
        navel: [0.5, 0.48], hip_l: [0.4, 0.5], knee_l: [0.38, 0.66], heel_l: [0.38, 0.84], toe_l: [0.38, 0.92],
        hip_r: [0.6, 0.5], knee_r: [0.62, 0.66], heel_r: [0.62, 0.84], toe_r: [0.62, 0.92],
      },
    },
    { time: 0.65, pose: copyPose(rest) },
  ];
}

/** 侧面-跳跃，头部尽量保持稳定 */
function buildSideJump(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.1,
      pose: {
        ...copyPose(rest),
        head_top: [0.545, 0.085], jaw: [0.535, 0.19], collarbone: [0.52, 0.32], navel: [0.52, 0.44],
        knee_l: [0.44, 0.68], heel_l: [0.44, 0.86], toe_l: [0.44, 0.94], knee_r: [0.6, 0.68], heel_r: [0.62, 0.86], toe_r: [0.62, 0.94],
        shoulder_l: [0.46, 0.18], elbow_l: [0.4, 0.28], wrist_l: [0.36, 0.38], fingertip_l: [0.34, 0.4],
        shoulder_r: [0.6, 0.14], elbow_r: [0.66, 0.28], wrist_r: [0.7, 0.42], fingertip_r: [0.72, 0.44],
      },
    },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        head_top: [0.555, 0.08], jaw: [0.545, 0.15], collarbone: [0.54, 0.24], navel: [0.54, 0.36],
        navel: [0.52, 0.44], hip_l: [0.46, 0.46], knee_l: [0.44, 0.6], heel_l: [0.44, 0.76], toe_l: [0.44, 0.84],
        hip_r: [0.58, 0.46], knee_r: [0.6, 0.6], heel_r: [0.6, 0.76], toe_r: [0.6, 0.84],
        shoulder_l: [0.46, 0.14], elbow_l: [0.4, 0.28], wrist_l: [0.36, 0.42], fingertip_l: [0.34, 0.44],
        shoulder_r: [0.6, 0.14], elbow_r: [0.66, 0.28], wrist_r: [0.7, 0.42], fingertip_r: [0.72, 0.44],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head_top: [0.56, 0.078], jaw: [0.55, 0.14], collarbone: [0.54, 0.22], navel: [0.54, 0.32],
        navel: [0.53, 0.4], hip_l: [0.46, 0.42], knee_l: [0.44, 0.52], heel_l: [0.44, 0.66], toe_l: [0.44, 0.74],
        hip_r: [0.6, 0.42], knee_r: [0.62, 0.52], heel_r: [0.62, 0.66], toe_r: [0.62, 0.74],
        shoulder_l: [0.45, 0.1], elbow_l: [0.39, 0.22], wrist_l: [0.35, 0.34], fingertip_l: [0.33, 0.36],
        shoulder_r: [0.61, 0.1], elbow_r: [0.67, 0.22], wrist_r: [0.71, 0.34], fingertip_r: [0.73, 0.36],
      },
    },
    {
      time: 0.55,
      pose: {
        ...copyPose(rest),
        head_top: [0.552, 0.082], jaw: [0.542, 0.14], collarbone: [0.52, 0.28], navel: [0.52, 0.38],
        navel: [0.52, 0.48], hip_l: [0.46, 0.5], knee_l: [0.44, 0.66], heel_l: [0.44, 0.84], toe_l: [0.44, 0.92],
        hip_r: [0.58, 0.5], knee_r: [0.6, 0.66], heel_r: [0.6, 0.84], toe_r: [0.6, 0.92],
      },
    },
    { time: 0.65, pose: copyPose(rest) },
  ];
}

/** 正面-迈克尔杰克逊风格舞蹈：经典单手抚帽、踮脚、踢腿等姿态循环 */
function buildFrontMjDance(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.08], collarbone: [0.5, 0.3], navel: [0.5, 0.42],
        shoulder_r: [0.74, 0.16], elbow_r: [0.84, 0.1], wrist_r: [0.88, 0.06], fingertip_r: [0.9, 0.04],
        shoulder_l: [0.28, 0.22], elbow_l: [0.2, 0.32], wrist_l: [0.14, 0.42], fingertip_l: [0.12, 0.44],
        navel: [0.5, 0.5], hip_l: [0.42, 0.48], knee_l: [0.4, 0.64], heel_l: [0.4, 0.8], toe_l: [0.4, 0.88],
        hip_r: [0.58, 0.54], knee_r: [0.62, 0.78], heel_r: [0.64, 0.92], toe_r: [0.64, 0.98],
      },
    },
    {
      time: 0.8,
      pose: {
        ...copyPose(rest),
        head_top: [0.5, 0.08], collarbone: [0.5, 0.28], navel: [0.5, 0.4],
        shoulder_l: [0.26, 0.16], elbow_l: [0.16, 0.1], wrist_l: [0.12, 0.06], fingertip_l: [0.1, 0.04],
        shoulder_r: [0.72, 0.22], elbow_r: [0.8, 0.32], wrist_r: [0.86, 0.42], fingertip_r: [0.84, 0.44],
        navel: [0.5, 0.5], hip_r: [0.42, 0.48], knee_r: [0.4, 0.64], heel_r: [0.4, 0.8], toe_r: [0.4, 0.88],
        hip_l: [0.58, 0.54], knee_l: [0.62, 0.78], heel_l: [0.64, 0.92], toe_l: [0.64, 0.98],
      },
    },
    { time: 1.2, pose: copyPose(rest) },
  ];
}

/** 侧面-MJ 舞蹈 */
function buildSideMjDance(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        navel: [0.52, 0.42], shoulder_r: [0.58, 0.14], elbow_r: [0.64, 0.08], wrist_r: [0.68, 0.04], fingertip_r: [0.7, 0.02],
        shoulder_l: [0.46, 0.22], elbow_l: [0.42, 0.3], wrist_l: [0.38, 0.38], fingertip_l: [0.36, 0.4],
        hip_r: [0.6, 0.52], knee_r: [0.62, 0.72], heel_r: [0.64, 0.88], toe_r: [0.64, 0.96],
      },
    },
    {
      time: 0.8,
      pose: {
        ...copyPose(rest),
        navel: [0.52, 0.42], shoulder_l: [0.48, 0.14], elbow_l: [0.44, 0.08], wrist_l: [0.4, 0.04], fingertip_l: [0.38, 0.02],
        shoulder_r: [0.56, 0.22], elbow_r: [0.6, 0.3], wrist_r: [0.64, 0.38], fingertip_r: [0.66, 0.4],
        hip_l: [0.44, 0.52], knee_l: [0.42, 0.72], heel_l: [0.4, 0.88], toe_l: [0.4, 0.96],
      },
    },
    { time: 1.2, pose: copyPose(rest) },
  ];
}

/** 正面-挥手打招呼：右手举起左右摆动 */
function buildFrontWave(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.74, 0.14], elbow_r: [0.82, 0.06], wrist_r: [0.88, 0.02], fingertip_r: [0.9, 0],
      },
    },
    {
      time: 0.5,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.76, 0.14], elbow_r: [0.86, 0.08], wrist_r: [0.92, 0.06], fingertip_r: [0.94, 0.04],
      },
    },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.74, 0.14], elbow_r: [0.82, 0.06], wrist_r: [0.88, 0.02], fingertip_r: [0.9, 0],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 侧面-挥手 */
function buildSideWave(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.25,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.58, 0.12], elbow_r: [0.64, 0.04], wrist_r: [0.68, 0.01], fingertip_r: [0.7, 0],
      },
    },
    {
      time: 0.5,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.6, 0.12], elbow_r: [0.66, 0.06], wrist_r: [0.72, 0.02], fingertip_r: [0.74, 0],
      },
    },
    {
      time: 0.75,
      pose: {
        ...copyPose(rest),
        shoulder_r: [0.58, 0.12], elbow_r: [0.64, 0.04], wrist_r: [0.68, 0.01], fingertip_r: [0.7, 0],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 正面-向前奔跑：身体前倾，手臂大幅度前后摆，步幅更大 */
function buildFrontRun(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_FRONT);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.2,
      pose: {
        ...copyPose(rest),
        head_top: [0.52, 0.1], jaw: [0.52, 0.2], collarbone: [0.52, 0.3], navel: [0.52, 0.42],
        hip_l: [0.36, 0.54], knee_l: [0.32, 0.7], heel_l: [0.3, 0.9], toe_l: [0.3, 0.96],
        hip_r: [0.64, 0.5], knee_r: [0.66, 0.66], heel_r: [0.68, 0.84], toe_r: [0.68, 0.92],
        shoulder_l: [0.24, 0.24], elbow_l: [0.08, 0.42], wrist_l: [0.02, 0.54], fingertip_l: [0, 0.56],
        shoulder_r: [0.76, 0.16], elbow_r: [0.9, 0.3], wrist_r: [0.96, 0.42], fingertip_r: [0.98, 0.44],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head_top: [0.52, 0.1], jaw: [0.52, 0.2], collarbone: [0.52, 0.3], navel: [0.52, 0.42],
        hip_l: [0.44, 0.52], knee_l: [0.46, 0.66], heel_l: [0.48, 0.82], toe_l: [0.48, 0.9],
        hip_r: [0.56, 0.54], knee_r: [0.58, 0.72], heel_r: [0.56, 0.9], toe_r: [0.56, 0.96],
        shoulder_l: [0.28, 0.16], elbow_l: [0.14, 0.28], wrist_l: [0.08, 0.38], fingertip_l: [0.06, 0.4],
        shoulder_r: [0.72, 0.24], elbow_r: [0.86, 0.42], wrist_r: [0.92, 0.54], fingertip_r: [0.94, 0.56],
      },
    },
    {
      time: 0.6,
      pose: {
        ...copyPose(rest),
        head_top: [0.52, 0.1], jaw: [0.52, 0.2], collarbone: [0.52, 0.3], navel: [0.52, 0.42],
        hip_l: [0.62, 0.5], knee_l: [0.64, 0.66], heel_l: [0.66, 0.84], toe_l: [0.66, 0.92],
        hip_r: [0.36, 0.54], knee_r: [0.32, 0.7], heel_r: [0.3, 0.9], toe_r: [0.3, 0.96],
        shoulder_l: [0.76, 0.16], elbow_l: [0.9, 0.3], wrist_l: [0.96, 0.42], fingertip_l: [0.98, 0.44],
        shoulder_r: [0.24, 0.24], elbow_r: [0.08, 0.42], wrist_r: [0.02, 0.54], fingertip_r: [0, 0.56],
      },
    },
    {
      time: 0.8,
      pose: {
        ...copyPose(rest),
        head_top: [0.52, 0.1], jaw: [0.52, 0.2], collarbone: [0.52, 0.3], navel: [0.52, 0.42],
        hip_l: [0.56, 0.54], knee_l: [0.58, 0.72], heel_l: [0.56, 0.9], toe_l: [0.56, 0.96],
        hip_r: [0.44, 0.52], knee_r: [0.46, 0.66], heel_r: [0.48, 0.82], toe_r: [0.48, 0.9],
        shoulder_l: [0.72, 0.24], elbow_l: [0.86, 0.42], wrist_l: [0.92, 0.54], fingertip_l: [0.94, 0.56],
        shoulder_r: [0.28, 0.16], elbow_r: [0.14, 0.28], wrist_r: [0.08, 0.38], fingertip_r: [0.06, 0.4],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

/** 侧面-奔跑 */
function buildSideRun(): SkeletonKeyframe[] {
  const rest = copyPose(REST_POSE_SIDE);
  return [
    { time: 0, pose: copyPose(rest) },
    {
      time: 0.2,
      pose: {
        ...copyPose(rest),
        head_top: [0.56, 0.09], jaw: [0.55, 0.19], collarbone: [0.54, 0.3], navel: [0.54, 0.4],
        hip_l: [0.44, 0.54], knee_l: [0.42, 0.7], heel_l: [0.4, 0.88], toe_l: [0.4, 0.96],
        hip_r: [0.6, 0.5], knee_r: [0.62, 0.66], heel_r: [0.64, 0.82], toe_r: [0.64, 0.9],
        shoulder_l: [0.44, 0.22], elbow_l: [0.38, 0.4], wrist_l: [0.34, 0.52], fingertip_l: [0.32, 0.54],
        shoulder_r: [0.6, 0.18], elbow_r: [0.66, 0.32], wrist_r: [0.7, 0.46], fingertip_r: [0.72, 0.48],
      },
    },
    {
      time: 0.4,
      pose: {
        ...copyPose(rest),
        head_top: [0.56, 0.09], jaw: [0.55, 0.19], collarbone: [0.54, 0.3], navel: [0.54, 0.4],
        hip_l: [0.48, 0.52], knee_l: [0.46, 0.66], heel_l: [0.44, 0.8], toe_l: [0.44, 0.88],
        hip_r: [0.58, 0.54], knee_r: [0.6, 0.72], heel_r: [0.58, 0.88], toe_r: [0.58, 0.96],
        shoulder_l: [0.48, 0.18], elbow_l: [0.42, 0.3], wrist_l: [0.38, 0.42], fingertip_l: [0.36, 0.44],
        shoulder_r: [0.58, 0.22], elbow_r: [0.64, 0.4], wrist_r: [0.68, 0.52], fingertip_r: [0.7, 0.54],
      },
    },
    {
      time: 0.6,
      pose: {
        ...copyPose(rest),
        head_top: [0.56, 0.09], jaw: [0.55, 0.19], collarbone: [0.54, 0.3], navel: [0.54, 0.4],
        hip_l: [0.6, 0.5], knee_l: [0.62, 0.66], heel_l: [0.64, 0.82], toe_l: [0.64, 0.9],
        hip_r: [0.44, 0.54], knee_r: [0.42, 0.7], heel_r: [0.4, 0.88], toe_r: [0.4, 0.96],
        shoulder_l: [0.6, 0.18], elbow_l: [0.66, 0.32], wrist_l: [0.7, 0.46], fingertip_l: [0.72, 0.48],
        shoulder_r: [0.44, 0.22], elbow_r: [0.38, 0.4], wrist_r: [0.34, 0.52], fingertip_r: [0.32, 0.54],
      },
    },
    {
      time: 0.8,
      pose: {
        ...copyPose(rest),
        head_top: [0.56, 0.09], jaw: [0.55, 0.19], collarbone: [0.54, 0.3], navel: [0.54, 0.4],
        hip_l: [0.58, 0.54], knee_l: [0.6, 0.72], heel_l: [0.58, 0.88], toe_l: [0.58, 0.96],
        hip_r: [0.48, 0.52], knee_r: [0.46, 0.66], heel_r: [0.44, 0.8], toe_r: [0.44, 0.88],
        shoulder_l: [0.58, 0.22], elbow_l: [0.64, 0.4], wrist_l: [0.68, 0.52], fingertip_l: [0.7, 0.54],
        shoulder_r: [0.48, 0.18], elbow_r: [0.42, 0.3], wrist_r: [0.38, 0.42], fingertip_r: [0.36, 0.44],
      },
    },
    { time: 1, pose: copyPose(rest) },
  ];
}

let cache: Partial<Record<`${HumanAngleType}_${HumanMotionType}`, SkeletonKeyframe[]>> = {};

/** 解析角度类型：front45/back 用 front 的动画，side 用 side 的 */
function motionAngleType(angleType: HumanAngleType): 'front' | 'side' {
  return angleType === 'side' ? 'side' : 'front';
}

export function getHumanMotionKeyframes(angleType: HumanAngleType, motion: HumanMotionType): SkeletonKeyframe[] {
  const key: string = `${angleType}_${motion}`;
  if (!cache[key]) {
    const mt = motionAngleType(angleType);
    if (motion === 'walk') cache[key] = mt === 'side' ? buildSideWalk() : buildFrontWalk();
    else if (motion === 'jump') cache[key] = mt === 'side' ? buildSideJump() : buildFrontJump();
    else if (motion === 'mj_dance') cache[key] = mt === 'side' ? buildSideMjDance() : buildFrontMjDance();
    else if (motion === 'wave') cache[key] = mt === 'side' ? buildSideWave() : buildFrontWave();
    else if (motion === 'run') cache[key] = mt === 'side' ? buildSideRun() : buildFrontRun();
    else cache[key] = [];
  }
  return cache[key]!;
}

export function getHumanMotionDuration(angleType: HumanAngleType, motion: HumanMotionType): number {
  const kfs = getHumanMotionKeyframes(angleType, motion);
  return kfs.length > 0 ? kfs[kfs.length - 1].time : 1;
}

/** 根据角度名称推断角度类型（兼容旧数据） */
export function getHumanAngleTypeFromName(angleName: string): HumanAngleType {
  const name = (angleName || '').trim().toLowerCase();
  if (name.includes('侧')) return 'side';
  if (name.includes('45') || name.includes('度')) return 'front45';
  if (name.includes('背')) return 'back';
  return 'front';
}

/** 获取角度类型：优先用绑定的 angleView，否则从名称推断 */
export function getHumanAngleType(
  angleViewOrName?: string,
  angleName?: string
): HumanAngleType {
  if (angleName !== undefined) {
    if (angleViewOrName && ['front', 'front45', 'side', 'back'].includes(angleViewOrName)) {
      return angleViewOrName as HumanAngleType;
    }
    return getHumanAngleTypeFromName(angleName);
  }
  return getHumanAngleTypeFromName(angleViewOrName ?? '');
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
  if (angleType === 'front') return REST_POSE_FRONT;
  if (angleType === 'front45') return REST_POSE_FRONT45;
  if (angleType === 'back') return REST_POSE_BACK;
  return REST_POSE_SIDE;
}

/** 导出：获取预设 T 姿态（用于在用户绑定空间内叠加动作增量） */
export function getRestPose(angleType: HumanAngleType): Record<string, [number, number]> {
  return copyPose(restPoseForAngle(angleType));
}

/** 各角度可用的动作：奔跑仅适合侧面 */
export function getAvailableMotions(angleType: HumanAngleType): HumanMotionType[] {
  const base: HumanMotionType[] = ['walk', 'jump', 'wave', 'mj_dance'];
  if (angleType === 'side') return [...base, 'run'];
  return base;
}
