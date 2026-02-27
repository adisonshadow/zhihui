/**
 * 骨骼蒙皮工具：网格定义、顶点权重生成、加权变换（见 docs/06 方案 C）
 */
import type { SkeletonPreset, SkeletonPresetKind } from '@/types/skeleton';
import type { VertexBoneWeight } from '@/types/skeleton';
import { getPresetByKind } from '@/types/skeleton';

/** 人物预设的蒙皮网格：每三角形由 3 顶点组成（12 顶点骨架，mid: 为两顶点中点） */
export const HUMAN_MESH_TRIANGLES: [string, string, string][] = [
  ['head_top', 'mid:head_top:jaw', 'shoulder_l'],
  ['head_top', 'mid:head_top:jaw', 'shoulder_r'],
  ['mid:head_top:jaw', 'jaw', 'shoulder_l'],
  ['mid:head_top:jaw', 'jaw', 'shoulder_r'],
  ['jaw', 'mid:jaw:collarbone', 'shoulder_l'],
  ['jaw', 'mid:jaw:collarbone', 'shoulder_r'],
  ['mid:jaw:collarbone', 'collarbone', 'shoulder_l'],
  ['mid:jaw:collarbone', 'collarbone', 'shoulder_r'],
  ['collarbone', 'mid:shoulder_l:elbow_l', 'shoulder_l'],
  ['collarbone', 'mid:shoulder_l:elbow_l', 'elbow_l'],
  ['mid:shoulder_l:elbow_l', 'elbow_l', 'wrist_l'],
  ['shoulder_l', 'elbow_l', 'wrist_l'],
  ['collarbone', 'mid:shoulder_r:elbow_r', 'shoulder_r'],
  ['collarbone', 'mid:shoulder_r:elbow_r', 'elbow_r'],
  ['mid:shoulder_r:elbow_r', 'elbow_r', 'wrist_r'],
  ['shoulder_r', 'elbow_r', 'wrist_r'],
  ['collarbone', 'navel', 'hip_l'],
  ['collarbone', 'navel', 'hip_r'],
  ['navel', 'mid:hip_l:hip_r', 'hip_l'],
  ['navel', 'mid:hip_l:hip_r', 'hip_r'],
  ['navel', 'mid:hip_l:knee_l', 'hip_l'],
  ['mid:hip_l:knee_l', 'hip_l', 'knee_l'],
  ['mid:hip_l:knee_l', 'knee_l', 'heel_l'],
  ['hip_l', 'knee_l', 'heel_l'],
  ['navel', 'mid:hip_r:knee_r', 'hip_r'],
  ['mid:hip_r:knee_r', 'hip_r', 'knee_r'],
  ['mid:hip_r:knee_r', 'knee_r', 'heel_r'],
  ['hip_r', 'knee_r', 'heel_r'],
];

/** 解析顶点 id：支持 "mid:A:B" 表示 A、B 两节点的中点 */
export function getMeshVertexPosition(
  vertexId: string,
  getPos: (nodeId: string) => [number, number],
  bindMap: Map<string, [number, number]> | null
): [number, number] {
  if (vertexId.startsWith('mid:')) {
    const parts = vertexId.slice(4).split(':');
    const a = parts[0];
    const b = parts[1];
    if (!a || !b) return [0.5, 0.5];
    const pa = bindMap ? (bindMap.get(a) ?? getPos(a)) : getPos(a);
    const pb = bindMap ? (bindMap.get(b) ?? getPos(b)) : getPos(b);
    return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  }
  return bindMap ? (bindMap.get(vertexId) ?? getPos(vertexId)) : getPos(vertexId);
}

/** 由 3 对点求仿射变换矩阵 */
export function getAffineFromTri(
  s0: [number, number],
  s1: [number, number],
  s2: [number, number],
  d0: [number, number],
  d1: [number, number],
  d2: [number, number]
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const [sx0, sy0] = s0;
  const [sx1, sy1] = s1;
  const [sx2, sy2] = s2;
  const [dx0, dy0] = d0;
  const [dx1, dy1] = d1;
  const [dx2, dy2] = d2;
  const det = sx0 * (sy1 - sy2) - sy0 * (sx1 - sx2) + (sx1 * sy2 - sx2 * sy1);
  if (Math.abs(det) < 1e-10) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const a = (dx0 * (sy1 - sy2) - dx1 * (sy0 - sy2) + dx2 * (sy0 - sy1)) / det;
  const b = (dy0 * (sy1 - sy2) - dy1 * (sy0 - sy2) + dy2 * (sy0 - sy1)) / det;
  const c = (dx0 * (sx2 - sx1) - dx1 * (sx2 - sx0) + dx2 * (sx1 - sx0)) / det;
  const d = (dy0 * (sx2 - sx1) - dy1 * (sx2 - sx0) + dy2 * (sx1 - sx0)) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - d * sy0;
  return { a, b, c, d, e, f };
}

function dist2(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/**
 * 根据绑定点位置自动生成每个顶点的骨骼权重。
 * 使用距离衰减：越近的骨骼权重越大，使关节处过渡更平滑。
 */
export function generateVertexWeights(
  nodes: { id: string; position: [number, number] }[],
  presetKind: SkeletonPresetKind
): { vertexId: string; weights: VertexBoneWeight[] }[] {
  if (presetKind !== 'human') return [];
  const preset = getPresetByKind(presetKind);
  const boneMap = new Map(nodes.map((n) => [n.id, n.position]));
  const getPos = (id: string) => boneMap.get(id) ?? preset.nodes.find((x) => x.id === id)?.defaultPosition ?? [0.5, 0.5];

  const vertexIds = new Set<string>();
  for (const [a, b, c] of HUMAN_MESH_TRIANGLES) {
    vertexIds.add(a);
    vertexIds.add(b);
    vertexIds.add(c);
  }

  const result: { vertexId: string; weights: VertexBoneWeight[] }[] = [];
  const eps = 0.02;
  const maxBones = 4;

  for (const vertexId of vertexIds) {
    const vPos = getMeshVertexPosition(vertexId, getPos, boneMap);
    const rawWeights: { boneId: string; w: number }[] = [];

    for (const node of preset.nodes) {
      const bPos = getPos(node.id);
      const d2 = dist2(vPos, bPos) + eps * eps;
      const invD2 = 1 / d2;
      rawWeights.push({ boneId: node.id, w: invD2 });
    }

    rawWeights.sort((a, b) => b.w - a.w);
    const top = rawWeights.slice(0, maxBones);
    const sum = top.reduce((s, x) => s + x.w, 0);
    if (sum < 1e-9) continue;
    const weights: VertexBoneWeight[] = top
      .map(({ boneId, w }) => ({ boneId, weight: w / sum }))
      .filter((x) => x.weight >= 0.01);

    if (weights.length > 0) {
      const normalize = weights.reduce((s, x) => s + x.weight, 0);
      for (const w of weights) w.weight /= normalize;
      result.push({ vertexId, weights });
    }
  }

  return result;
}
