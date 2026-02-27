/**
 * 基于图像轮廓的完整网格生成（见 docs/06 3.6）
 * 输入：PNG 人物图（透明通道）、骨骼绑定位置
 * 输出：沿轮廓 + 骨骼的三角网格及顶点权重
 */
import Delaunator from 'delaunator';
import type { ContourMesh, ContourMeshVertex, VertexBoneWeight } from '@/types/skeleton';
import type { SkeletonPresetKind, SkeletonPreset } from '@/types/skeleton';
import { getPresetByKind } from '@/types/skeleton';
import type { HumanAngleType } from '@/types/skeletonMotions';
import { getRestPose } from '@/types/skeletonMotions';

const ALPHA_THRESHOLD = 128;
/** 三角形过滤用较低阈值，避免抗锯齿边缘（手臂、衣袍等）的三角形被误剔除导致运动时缺块 */
const TRIANGLE_INSIDE_THRESHOLD = 48;
const MAX_CONTOUR_POINTS = 180;
const EPS = 0.02;
const MAX_BONES = 4;

function dist2(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/** Douglas-Peucker 简化轮廓点 */
function simplifyContour(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const [p0, p1] = [points[0], points[points.length - 1]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dist = pointToSegmentDist(p, p0, p1);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist < tolerance) return [p0, p1];
  const left = simplifyContour(points.slice(0, maxIdx + 1), tolerance);
  const right = simplifyContour(points.slice(maxIdx), tolerance);
  return [...left.slice(0, -1), ...right];
}

function pointToSegmentDist(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby + 1e-10)));
  const projx = ax + t * abx;
  const projy = ay + t * aby;
  return Math.sqrt((px - projx) ** 2 + (py - projy) ** 2);
}

/** 从 ImageData 提取轮廓边界点（归一化 0-1），按质心角度排序后简化 */
function extractContour(data: ImageData): [number, number][] {
  const { width, height } = data;
  const contour: [number, number][] = [];
  let sumX = 0, sumY = 0, count = 0;

  const isInside = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return data.data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInside(x, y)) continue;
      sumX += x;
      sumY += y;
      count++;
      const hasTransparent =
        !isInside(x - 1, y) || !isInside(x + 1, y) || !isInside(x, y - 1) || !isInside(x, y + 1);
      if (hasTransparent) {
        contour.push([x / width, y / height]);
      }
    }
  }

  if (contour.length < 3) return contour;
  const cx = count > 0 ? sumX / count / width : 0.5;
  const cy = count > 0 ? sumY / count / height : 0.5;
  contour.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const step = Math.max(1, Math.floor(contour.length / MAX_CONTOUR_POINTS));
  const sampled = contour.filter((_, i) => i % step === 0);
  const tolerance = 0.0015;
  return simplifyContour(sampled.length >= 3 ? sampled : contour, tolerance);
}

/** 判断点是否在人物内（轮廓提取用，阈值较高） */
function isInsideCharacter(data: ImageData, nx: number, ny: number): boolean {
  const { width, height } = data;
  const x = Math.floor(nx * width);
  const y = Math.floor(ny * height);
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return data.data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD;
}

/** 判断点是否在人物内（三角形过滤用，阈值较低以保留抗锯齿边缘） */
function isInsideForTriangle(data: ImageData, nx: number, ny: number): boolean {
  const { width, height } = data;
  const x = Math.floor(nx * width);
  const y = Math.floor(ny * height);
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return data.data[(y * width + x) * 4 + 3] >= TRIANGLE_INSIDE_THRESHOLD;
}

/** 根据顶点位置与骨骼位置，返回该顶点所属解剖区域的候选骨骼 id 列表。避免脖子/肩跑到脸上、小腿/脚互相串区 */
function getEligibleBonesHuman(
  pos: [number, number],
  boneMap: Map<string, [number, number]>
): string[] {
  const [vx, vy] = pos;
  const cx = 0.5;
  const get = (id: string) => boneMap.get(id);
  const ht = get('head_top')?.[1] ?? 0.05;
  const jw = get('jaw')?.[1] ?? 0.12;
  const cb = get('collarbone')?.[1] ?? 0.2;
  const nv = get('navel')?.[1] ?? 0.38;
  const sl = get('shoulder_l')?.[0] ?? 0.26;
  const sr = get('shoulder_r')?.[0] ?? 0.74;
  const el = get('elbow_l')?.[1] ?? 0.35;
  const er = get('elbow_r')?.[1] ?? 0.35;
  const hl = get('heel_l')?.[1] ?? 0.88;
  const hr = get('heel_r')?.[1] ?? 0.88;
  const tl = get('toe_l')?.[1] ?? 0.96;
  const tr = get('toe_r')?.[1] ?? 0.96;
  const kl = get('knee_l')?.[1] ?? 0.68;
  const kr = get('knee_r')?.[1] ?? 0.68;
  const hpl = get('hip_l')?.[1] ?? 0.48;
  const hpr = get('hip_r')?.[1] ?? 0.48;

  const mid = (a: number, b: number) => (a + b) / 2;
  const centerTight = Math.abs(vx - cx) < 0.18;
  const centerLoose = Math.abs(vx - cx) < 0.25;

  if (vy < jw) return ['head_top'];
  if (vy < mid(jw, cb) && centerTight) return ['jaw', 'collarbone'];
  if (vy < mid(cb, nv) && vx < sl - 0.06) return ['collarbone', 'shoulder_l', 'elbow_l', 'wrist_l', 'fingertip_l'];
  if (vy < mid(cb, nv) && vx > sr + 0.06) return ['collarbone', 'shoulder_r', 'elbow_r', 'wrist_r', 'fingertip_r'];
  if (vy < mid(cb, nv)) return ['collarbone', 'navel'];
  if (vy < nv + 0.08 && centerLoose) return ['collarbone', 'navel', 'hip_l', 'hip_r'];
  if (vy >= nv + 0.08 && vx < cx - 0.03) {
    if (vy < mid(hpl, kl)) return ['navel', 'hip_l', 'knee_l'];
    if (vy < mid(kl, hl)) return ['hip_l', 'knee_l', 'heel_l'];
    if (vy < mid(hl, tl)) return ['knee_l', 'heel_l'];
    return ['heel_l', 'toe_l'];
  }
  if (vy >= nv + 0.08 && vx > cx + 0.03) {
    if (vy < mid(hpr, kr)) return ['navel', 'hip_r', 'knee_r'];
    if (vy < mid(kr, hr)) return ['hip_r', 'knee_r', 'heel_r'];
    if (vy < mid(hr, tr)) return ['knee_r', 'heel_r'];
    return ['heel_r', 'toe_r'];
  }
  return ['navel', 'hip_l', 'hip_r'];
}

/** 为顶点计算骨骼权重。人物预设使用分段式权重，避免跨解剖区域分配 */
function computeWeights(
  pos: [number, number],
  boneNodes: { id: string; position: [number, number] }[],
  presetKind?: SkeletonPresetKind
): VertexBoneWeight[] {
  const boneMap = new Map(boneNodes.map((n) => [n.id, n.position]));

  let candidateIds: string[];
  if (presetKind === 'human') {
    candidateIds = getEligibleBonesHuman(pos, boneMap).filter((id) => boneMap.has(id));
    if (candidateIds.length === 0) candidateIds = boneNodes.map((n) => n.id);
  } else {
    candidateIds = boneNodes.map((n) => n.id);
  }

  const rawWeights: { boneId: string; w: number }[] = [];
  for (const id of candidateIds) {
    const position = boneMap.get(id)!;
    const d2 = dist2(pos, position) + EPS * EPS;
    rawWeights.push({ boneId: id, w: 1 / d2 });
  }
  rawWeights.sort((a, b) => b.w - a.w);
  const top = rawWeights.slice(0, MAX_BONES);
  const sum = top.reduce((s, x) => s + x.w, 0);
  if (sum < 1e-9) return [];
  const weights = top
    .map(({ boneId, w }) => ({ boneId, weight: w / sum }))
    .filter((x) => x.weight >= 0.01);
  const norm = weights.reduce((s, x) => s + x.weight, 0);
  return weights.map((w) => ({ ...w, weight: w.weight / norm }));
}

export interface GenerateContourMeshInput {
  imageData: ImageData;
  nodes: { id: string; position: [number, number] }[];
  presetKind: SkeletonPresetKind;
}

export type GenerateContourMeshResult = { ok: true; mesh: ContourMesh } | { ok: false; reason: string };

/** 人物预设中位于肢体末端的骨骼 id，不参与 Delaunay 三角化（常处于轮廓外导致三角形被大量过滤），仍参与权重计算 */
const HUMAN_EXTREMITY_BONE_IDS = new Set(['fingertip_l', 'fingertip_r', 'toe_l', 'toe_r']);

/**
 * 基于人物图 alpha 通道与骨骼节点生成轮廓网格
 */
export function generateContourMesh(input: GenerateContourMeshInput): GenerateContourMeshResult {
  const { imageData, nodes, presetKind } = input;
  const preset = getPresetByKind(presetKind);
  const boneIds = new Set(preset.nodes.map((n) => n.id));
  const boneNodes = nodes.filter((n) => boneIds.has(n.id));
  if (boneNodes.length === 0) return { ok: false, reason: '请先完成骨骼绑定（拖拽节点对齐人物）' };

  const contourPoints = extractContour(imageData);
  if (contourPoints.length < 3)
    return {
      ok: false,
      reason: `未检测到有效轮廓（仅 ${contourPoints.length} 个轮廓点）。请确保人物图为 PNG/WebP 格式且背景为透明，或勾选「先用 RVM 抠图」`,
    };

  const points: [number, number][] = [...contourPoints];
  const vertexIds: string[] = contourPoints.map((_, i) => `c${i}`);
  // 排除肢体末端骨骼参与三角化，避免其常处于轮廓外导致大量三角形被过滤
  const bonesForTriangulation =
    presetKind === 'human'
      ? boneNodes.filter((n) => !HUMAN_EXTREMITY_BONE_IDS.has(n.id))
      : boneNodes;
  bonesForTriangulation.forEach((n) => {
    points.push(n.position);
    vertexIds.push(`s_${n.id}`);
  });

  const flat = points.flat();
  const delaunay = new Delaunator(flat);
  const triangles: [string, string, string][] = [];

  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const i0 = delaunay.triangles[i];
    const i1 = delaunay.triangles[i + 1];
    const i2 = delaunay.triangles[i + 2];
    const p0 = [flat[i0 * 2], flat[i0 * 2 + 1]] as [number, number];
    const p1 = [flat[i1 * 2], flat[i1 * 2 + 1]] as [number, number];
    const p2 = [flat[i2 * 2], flat[i2 * 2 + 1]] as [number, number];
    const cx = (p0[0] + p1[0] + p2[0]) / 3;
    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const allInside =
      isInsideForTriangle(imageData, p0[0], p0[1]) &&
      isInsideForTriangle(imageData, p1[0], p1[1]) &&
      isInsideForTriangle(imageData, p2[0], p2[1]);
    if (allInside && isInsideForTriangle(imageData, cx, cy)) {
      triangles.push([vertexIds[i0], vertexIds[i1], vertexIds[i2]]);
    }
  }

  if (triangles.length === 0)
    return {
      ok: false,
      reason: '轮廓区域与骨骼不匹配，未生成有效网格。请尝试勾选「先用 RVM 抠图」或调整骨骼位置后再试',
    };

  const vertexMap = new Map<string, [number, number]>();
  points.forEach((p, i) => vertexMap.set(vertexIds[i], p));

  const vertices: ContourMeshVertex[] = Array.from(vertexMap.entries()).map(([id, pos]) => ({
    id,
    position: [...pos],
    weights: computeWeights(pos, boneNodes, presetKind),
  }));

  return { ok: true, mesh: { vertices, triangles } };
}

/**
 * 根据当前骨骼节点位置，重新计算轮廓网格各顶点的骨骼权重。
 * 适用于骨骼移动后需更新权重以改善蒙皮效果。
 */
export function recomputeContourMeshWeights(
  mesh: ContourMesh,
  boneNodes: { id: string; position: [number, number] }[],
  presetKind?: SkeletonPresetKind
): ContourMesh {
  const vertices: ContourMeshVertex[] = mesh.vertices.map((v) => ({
    ...v,
    weights: computeWeights(v.position, boneNodes, presetKind),
  }));
  return { vertices, triangles: mesh.triangles };
}

/** 点是否在多边形内（射线法） */
function isPointInPolygon(p: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = p;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 将点朝质心移动直至在多边形内，最多迭代 20 次 */
function clampToPolygon(
  p: [number, number],
  polygon: [number, number][],
  centroid: [number, number]
): [number, number] {
  if (isPointInPolygon(p, polygon)) return p;
  let [x, y] = p;
  const [cx, cy] = centroid;
  for (let i = 0; i < 20; i++) {
    x = x * 0.7 + cx * 0.3;
    y = y * 0.7 + cy * 0.3;
    if (isPointInPolygon([x, y], polygon)) return [x, y];
  }
  return [x, y];
}

/**
 * 根据轮廓网格与预设，自动推算骨骼节点位置（置于轮廓内）
 * 人物预设（12 顶点）：按人体区域与轮廓 extremities 放置 head_top/jaw/collarbone/navel、fingertip/toe 末端等
 * @param angleType 视角类型，用于获取该角度的默认骨骼位置
 */
export function suggestBonePositionsFromContour(
  contourMesh: ContourMesh,
  preset: SkeletonPreset,
  angleType?: HumanAngleType
): { id: string; position: [number, number] }[] {
  const contourVerts = contourMesh.vertices.filter((v) => v.id.startsWith('c'));
  const restPose = angleType ? getRestPose(angleType) : null;
  if (contourVerts.length < 3) {
    return preset.nodes.map((n) => ({
      id: n.id,
      position: [...(restPose?.[n.id] ?? n.defaultPosition)] as [number, number],
    }));
  }

  const polygon = contourVerts.map((v) => v.position);
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  const centroid: [number, number] = [cx, cy];

  const minX = Math.min(...polygon.map((p) => p[0]));
  const maxX = Math.max(...polygon.map((p) => p[0]));
  const minY = Math.min(...polygon.map((p) => p[1]));
  const maxY = Math.max(...polygon.map((p) => p[1]));
  const rangeX = Math.max(0.01, maxX - minX);
  const rangeY = Math.max(0.01, maxY - minY);
  const pad = 0.02;

  const clamp = (p: [number, number]) => {
    const q = clampToPolygon(p, polygon, centroid);
    return [Math.max(0, Math.min(1, q[0])), Math.max(0, Math.min(1, q[1]))] as [number, number];
  };

  const linearMap = (n: { id: string; defaultPosition: [number, number] }) => {
    const [dx, dy] = (restPose?.[n.id] ?? n.defaultPosition) as [number, number];
    return clamp([minX + pad + dx * rangeX, minY + pad + dy * rangeY]);
  };

  if (preset.kind !== 'human') {
    return preset.nodes.map((n) => ({ id: n.id, position: linearMap(n) }));
  }

  // 人物预设：按人体区域与 extremities 适配新骨架
  const sortedByY = [...polygon].sort((a, b) => a[1] - b[1]);
  const p05Y = sortedByY[Math.floor(0.05 * sortedByY.length)]?.[1] ?? minY;
  const p15Y = sortedByY[Math.floor(0.15 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.15;
  const p25Y = sortedByY[Math.floor(0.25 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.25;
  const p38Y = sortedByY[Math.floor(0.38 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.38;
  const p48Y = sortedByY[Math.floor(0.48 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.48;
  const p65Y = sortedByY[Math.floor(0.65 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.65;
  const p85Y = sortedByY[Math.floor(0.85 * sortedByY.length)]?.[1] ?? minY + rangeY * 0.85;
  const p95Y = sortedByY[Math.floor(0.95 * sortedByY.length)]?.[1] ?? maxY;

  // 手臂区域 Y：15%～65%；腿区域 Y：65%～100%
  const armRegion = polygon.filter((p) => p[1] >= p15Y && p[1] <= p65Y);
  const legRegion = polygon.filter((p) => p[1] >= p65Y);
  const leftArmPoints = armRegion.filter((p) => p[0] < cx);
  const rightArmPoints = armRegion.filter((p) => p[0] >= cx);
  const leftLegPoints = legRegion.filter((p) => p[0] < cx);
  const rightLegPoints = legRegion.filter((p) => p[0] >= cx);

  const leftmostArm = leftArmPoints.length
    ? leftArmPoints.reduce((a, b) => (a[0] < b[0] ? a : b))
    : [minX, (p15Y + p65Y) / 2];
  const rightmostArm = rightArmPoints.length
    ? rightArmPoints.reduce((a, b) => (a[0] > b[0] ? a : b))
    : [maxX, (p15Y + p65Y) / 2];
  const bottomLeft = leftLegPoints.length
    ? leftLegPoints.reduce((a, b) => (a[1] > b[1] ? a : b))
    : [minX + rangeX * 0.35, maxY];
  const bottomRight = rightLegPoints.length
    ? rightLegPoints.reduce((a, b) => (a[1] > b[1] ? a : b))
    : [maxX - rangeX * 0.35, maxY];

  // 左臂链：shoulder（近躯干）-> elbow -> wrist -> hand（轮廓极左），按到躯干距离插值
  const handLX = leftmostArm[0];
  const torsoLeftX = armRegion.filter((p) => p[0] < cx).length
    ? Math.max(...armRegion.filter((p) => p[0] < cx && p[1] >= p15Y && p[1] <= p38Y).map((p) => p[0]), cx - rangeX * 0.2)
    : cx - rangeX * 0.24;
  const shoulderLX = Math.max(handLX, torsoLeftX - rangeX * 0.02);
  const wristLX = handLX + (shoulderLX - handLX) * 0.25;
  const elbowLX = handLX + (shoulderLX - handLX) * 0.55;
  const armMidY = (p15Y + p65Y) / 2;

  const handRX = rightmostArm[0];
  const torsoRightX = armRegion.filter((p) => p[0] >= cx).length
    ? Math.min(...armRegion.filter((p) => p[0] >= cx && p[1] >= p15Y && p[1] <= p38Y).map((p) => p[0]), cx + rangeX * 0.2)
    : cx + rangeX * 0.24;
  const shoulderRX = Math.min(handRX, torsoRightX + rangeX * 0.02);
  const wristRX = handRX + (shoulderRX - handRX) * 0.25;
  const elbowRX = handRX + (shoulderRX - handRX) * 0.55;

  const kneeLY = (p48Y + p95Y) / 2;
  const ankleLY = (p85Y + p95Y) / 2;
  const kneeRY = kneeLY;
  const ankleRY = ankleLY;

  const result: { id: string; position: [number, number] }[] = [];
  const def = (id: string, pos: [number, number]) => result.push({ id, position: clamp(pos) });

  def('head_top', [cx, (minY + p05Y) / 2]);
  def('jaw', [cx, (p05Y + p15Y) / 2]);
  def('collarbone', [cx, (p15Y + p25Y) / 2]);
  def('navel', [cx, (p25Y + p38Y) / 2]);
  def('shoulder_l', [leftArmPoints.length ? shoulderLX : minX + rangeX * 0.28, p15Y]);
  def('elbow_l', [elbowLX, armMidY]);
  def('wrist_l', [wristLX, armMidY]);
  def('fingertip_l', [handLX, armMidY]);
  def('shoulder_r', [rightArmPoints.length ? shoulderRX : maxX - rangeX * 0.28, p15Y]);
  def('elbow_r', [elbowRX, armMidY]);
  def('wrist_r', [wristRX, armMidY]);
  def('fingertip_r', [handRX, armMidY]);
  def('hip_l', [leftLegPoints.length ? Math.min(...leftLegPoints.map((p) => p[0])) + rangeX * 0.08 : cx - rangeX * 0.12, p48Y]);
  def('knee_l', [bottomLeft[0] + (cx - bottomLeft[0]) * 0.5, kneeLY]);
  def('heel_l', [bottomLeft[0] + (cx - bottomLeft[0]) * 0.2, ankleLY]);
  def('toe_l', [bottomLeft[0], bottomLeft[1]]);
  def('hip_r', [rightLegPoints.length ? Math.max(...rightLegPoints.map((p) => p[0])) - rangeX * 0.08 : cx + rangeX * 0.12, p48Y]);
  def('knee_r', [bottomRight[0] + (cx - bottomRight[0]) * 0.5, kneeRY]);
  def('heel_r', [bottomRight[0] + (cx - bottomRight[0]) * 0.2, ankleRY]);
  def('toe_r', [bottomRight[0], bottomRight[1]]);

  return result;
}
