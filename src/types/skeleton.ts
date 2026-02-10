/**
 * 人物骨骼预设与绑定数据类型（见 docs/06-人物骨骼贴图功能设计.md）
 */

export type SkeletonPresetKind = 'human' | 'animal' | 'bird';

export interface SkeletonNodeDef {
  id: string;
  label: string;
  /** 默认位置，归一化 0–1（x, y）相对贴图宽高 */
  defaultPosition: [number, number];
}

export interface SkeletonPreset {
  kind: SkeletonPresetKind;
  label: string;
  nodes: SkeletonNodeDef[];
  /** 连线 fromNodeId -> toNodeId */
  edges: { from: string; to: string }[];
}

/** 单个骨骼节点在绑定后的位置（归一化 0–1） */
export interface SkeletonNodePosition {
  id: string;
  position: [number, number];
}

/** 某角度的骨骼绑定数据 */
export interface SkeletonBinding {
  presetKind: SkeletonPresetKind;
  /** 各节点在贴图上的位置，未绑定的用预设默认 */
  nodes: SkeletonNodePosition[];
}

/** 人物角度：id、名称、该角度贴图、骨骼绑定 */
export interface CharacterAngle {
  id: string;
  name: string;
  image_path?: string | null;
  skeleton?: SkeletonBinding | null;
}

/** 预设：人物（T-pose 参考） */
const HUMAN_PRESET: SkeletonPreset = {
  kind: 'human',
  label: '人物',
  nodes: [
    { id: 'head', label: '头顶', defaultPosition: [0.5, 0.08] },
    { id: 'neck', label: '颈', defaultPosition: [0.5, 0.18] },
    { id: 'spine', label: '躯干', defaultPosition: [0.5, 0.35] },
    { id: 'shoulder_l', label: '左肩', defaultPosition: [0.28, 0.2] },
    { id: 'elbow_l', label: '左肘', defaultPosition: [0.15, 0.38] },
    { id: 'wrist_l', label: '左手', defaultPosition: [0.08, 0.52] },
    { id: 'shoulder_r', label: '右肩', defaultPosition: [0.72, 0.2] },
    { id: 'elbow_r', label: '右肘', defaultPosition: [0.85, 0.38] },
    { id: 'wrist_r', label: '右手', defaultPosition: [0.92, 0.52] },
    { id: 'hip', label: '髋', defaultPosition: [0.5, 0.52] },
    { id: 'hip_l', label: '左髋', defaultPosition: [0.4, 0.52] },
    { id: 'knee_l', label: '左膝', defaultPosition: [0.38, 0.72] },
    { id: 'ankle_l', label: '左脚', defaultPosition: [0.38, 0.92] },
    { id: 'hip_r', label: '右髋', defaultPosition: [0.6, 0.52] },
    { id: 'knee_r', label: '右膝', defaultPosition: [0.62, 0.72] },
    { id: 'ankle_r', label: '右脚', defaultPosition: [0.62, 0.92] },
  ],
  edges: [
    { from: 'head', to: 'neck' },
    { from: 'neck', to: 'spine' },
    { from: 'neck', to: 'shoulder_l' },
    { from: 'neck', to: 'shoulder_r' },
    { from: 'shoulder_l', to: 'elbow_l' },
    { from: 'elbow_l', to: 'wrist_l' },
    { from: 'shoulder_r', to: 'elbow_r' },
    { from: 'elbow_r', to: 'wrist_r' },
    { from: 'spine', to: 'hip' },
    { from: 'hip', to: 'hip_l' },
    { from: 'hip', to: 'hip_r' },
    { from: 'hip_l', to: 'knee_l' },
    { from: 'knee_l', to: 'ankle_l' },
    { from: 'hip_r', to: 'knee_r' },
    { from: 'knee_r', to: 'ankle_r' },
  ],
};

/** 预设：动物（四足简化） */
const ANIMAL_PRESET: SkeletonPreset = {
  kind: 'animal',
  label: '动物',
  nodes: [
    { id: 'head', label: '头', defaultPosition: [0.5, 0.2] },
    { id: 'neck', label: '颈', defaultPosition: [0.5, 0.35] },
    { id: 'spine', label: '躯干', defaultPosition: [0.5, 0.55] },
    { id: 'shoulder_l', label: '左前腿根', defaultPosition: [0.35, 0.4] },
    { id: 'elbow_l', label: '左前膝', defaultPosition: [0.3, 0.6] },
    { id: 'wrist_l', label: '左前爪', defaultPosition: [0.28, 0.85] },
    { id: 'shoulder_r', label: '右前腿根', defaultPosition: [0.65, 0.4] },
    { id: 'elbow_r', label: '右前膝', defaultPosition: [0.7, 0.6] },
    { id: 'wrist_r', label: '右前爪', defaultPosition: [0.72, 0.85] },
    { id: 'hip', label: '髋', defaultPosition: [0.5, 0.6] },
    { id: 'hip_l', label: '左后腿根', defaultPosition: [0.38, 0.62] },
    { id: 'knee_l', label: '左后膝', defaultPosition: [0.35, 0.82] },
    { id: 'ankle_l', label: '左后爪', defaultPosition: [0.35, 0.95] },
    { id: 'hip_r', label: '右后腿根', defaultPosition: [0.62, 0.62] },
    { id: 'knee_r', label: '右后膝', defaultPosition: [0.65, 0.82] },
    { id: 'ankle_r', label: '右后爪', defaultPosition: [0.65, 0.95] },
  ],
  edges: [
    { from: 'head', to: 'neck' },
    { from: 'neck', to: 'spine' },
    { from: 'spine', to: 'shoulder_l' },
    { from: 'spine', to: 'shoulder_r' },
    { from: 'shoulder_l', to: 'elbow_l' },
    { from: 'elbow_l', to: 'wrist_l' },
    { from: 'shoulder_r', to: 'elbow_r' },
    { from: 'elbow_r', to: 'wrist_r' },
    { from: 'spine', to: 'hip' },
    { from: 'hip', to: 'hip_l' },
    { from: 'hip', to: 'hip_r' },
    { from: 'hip_l', to: 'knee_l' },
    { from: 'knee_l', to: 'ankle_l' },
    { from: 'hip_r', to: 'knee_r' },
    { from: 'knee_r', to: 'ankle_r' },
  ],
};

/** 预设：鸟（简化） */
const BIRD_PRESET: SkeletonPreset = {
  kind: 'bird',
  label: '鸟',
  nodes: [
    { id: 'head', label: '头', defaultPosition: [0.5, 0.15] },
    { id: 'neck', label: '颈', defaultPosition: [0.5, 0.3] },
    { id: 'spine', label: '躯干', defaultPosition: [0.5, 0.55] },
    { id: 'shoulder_l', label: '左翅根', defaultPosition: [0.25, 0.35] },
    { id: 'elbow_l', label: '左翅中', defaultPosition: [0.08, 0.4] },
    { id: 'wrist_l', label: '左翅尖', defaultPosition: [0.02, 0.5] },
    { id: 'shoulder_r', label: '右翅根', defaultPosition: [0.75, 0.35] },
    { id: 'elbow_r', label: '右翅中', defaultPosition: [0.92, 0.4] },
    { id: 'wrist_r', label: '右翅尖', defaultPosition: [0.98, 0.5] },
    { id: 'hip', label: '髋', defaultPosition: [0.5, 0.6] },
    { id: 'hip_l', label: '左腿根', defaultPosition: [0.45, 0.65] },
    { id: 'knee_l', label: '左膝', defaultPosition: [0.44, 0.82] },
    { id: 'ankle_l', label: '左爪', defaultPosition: [0.44, 0.95] },
    { id: 'hip_r', label: '右腿根', defaultPosition: [0.55, 0.65] },
    { id: 'knee_r', label: '右膝', defaultPosition: [0.56, 0.82] },
    { id: 'ankle_r', label: '右爪', defaultPosition: [0.56, 0.95] },
  ],
  edges: [
    { from: 'head', to: 'neck' },
    { from: 'neck', to: 'spine' },
    { from: 'spine', to: 'shoulder_l' },
    { from: 'spine', to: 'shoulder_r' },
    { from: 'shoulder_l', to: 'elbow_l' },
    { from: 'elbow_l', to: 'wrist_l' },
    { from: 'shoulder_r', to: 'elbow_r' },
    { from: 'elbow_r', to: 'wrist_r' },
    { from: 'spine', to: 'hip' },
    { from: 'hip', to: 'hip_l' },
    { from: 'hip', to: 'hip_r' },
    { from: 'hip_l', to: 'knee_l' },
    { from: 'knee_l', to: 'ankle_l' },
    { from: 'hip_r', to: 'knee_r' },
    { from: 'knee_r', to: 'ankle_r' },
  ],
};

export const SKELETON_PRESETS: SkeletonPreset[] = [HUMAN_PRESET, ANIMAL_PRESET, BIRD_PRESET];

export function getPresetByKind(kind: SkeletonPresetKind): SkeletonPreset {
  const p = SKELETON_PRESETS.find((x) => x.kind === kind);
  return p ?? HUMAN_PRESET;
}

export function parseCharacterAngles(anglesJson: string | null): CharacterAngle[] {
  if (!anglesJson || anglesJson.trim() === '') return [{ id: 'angle_1', name: '正面' }];
  try {
    const arr = JSON.parse(anglesJson) as CharacterAngle[];
    return Array.isArray(arr) && arr.length > 0 ? arr : [{ id: 'angle_1', name: '正面' }];
  } catch {
    return [{ id: 'angle_1', name: '正面' }];
  }
}

export function serializeCharacterAngles(angles: CharacterAngle[]): string {
  return JSON.stringify(angles);
}
