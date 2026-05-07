/**
 * 将 compound path 中部分轮廓拆成独立 EditorPathObject（工具函数）。
 * 图片编辑器矢量模式已按 docs/14 改为**不拆图层**，填色/布尔均在同一矢量图层内写回；本模块保留供测试或其它调用方使用。
 */
import type { EditorObject, EditorPathObject, PathSubpathStyleOverride } from '@/components/imageEditor/editorTypes';
import { createId } from '@/components/imageEditor/editorTypes';
import {
  pathDataFromModel,
  tryParsePathData,
  type PathSubpath,
} from '@/utils/svgPathEditModel';

export function pathVectorNeedsExtract(subpathIndices: readonly number[], totalSubpaths: number): boolean {
  const uniq = new Set(subpathIndices);
  if (uniq.size === 0) return false;
  return uniq.size < totalSubpaths;
}

function cloneSubpath(sp: PathSubpath): PathSubpath {
  return {
    closed: sp.closed,
    verts: sp.verts.map((v) => ({
      ...v,
      handleIn: v.handleIn ? { ...v.handleIn } : undefined,
      handleOut: v.handleOut ? { ...v.handleOut } : undefined,
    })),
  };
}

/**
 * @param sortedUniqueIndices 升序、去重、有效的子路径下标
 */
export function buildExtractedPathObjects(
  source: EditorPathObject,
  sortedUniqueIndices: readonly number[]
): {
  extracted: EditorPathObject;
  remainder: EditorPathObject | null;
  newActiveSubpathIndices: number[];
} | null {
  const model = tryParsePathData(source.pathData);
  if (!model) return null;
  const total = model.subpaths.length;
  const sorted = sortedUniqueIndices
    .filter((i) => i >= 0 && i < total)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === total) return null;

  const pick = new Set(sorted);
  const extractedSubpaths = sorted.map((i) => cloneSubpath(model.subpaths[i]!));
  const remainderSubpaths: PathSubpath[] = [];
  for (let i = 0; i < total; i++) {
    if (!pick.has(i)) remainderSubpaths.push(cloneSubpath(model.subpaths[i]!));
  }

  const extractedData = pathDataFromModel({ subpaths: extractedSubpaths });
  const remainderData =
    remainderSubpaths.length > 0 ? pathDataFromModel({ subpaths: remainderSubpaths }) : null;

  let extractedStyles: PathSubpathStyleOverride[] | undefined;
  let remainderStyles: PathSubpathStyleOverride[] | undefined;
  if (source.pathSubpathStyles && source.pathSubpathStyles.length === total) {
    extractedStyles = sorted.map((i) => ({ ...source.pathSubpathStyles![i]! }));
    remainderStyles = [];
    for (let i = 0; i < total; i++) {
      if (!pick.has(i)) remainderStyles.push({ ...source.pathSubpathStyles![i]! });
    }
    if (remainderStyles.length !== remainderSubpaths.length) remainderStyles = undefined;
    if (extractedStyles.length !== extractedSubpaths.length) extractedStyles = undefined;
  }

  const extracted: EditorPathObject = {
    ...source,
    id: createId(),
    pathData: extractedData,
    pathSubpathStyles: extractedStyles,
  };

  const remainder: EditorPathObject | null = remainderData
    ? {
        ...source,
        pathData: remainderData,
        pathSubpathStyles: remainderStyles,
      }
    : null;

  const newActiveSubpathIndices = extractedSubpaths.map((_, j) => j);
  return { extracted, remainder, newActiveSubpathIndices };
}

/**
 * 将文档中 sourceId 图层替换为 extracted（运算结果），并在其后插入 remainder（剩余路径）
 *
 * 关键：extracted 是用户操作的目标（如布尔运算结果），应保持原位置；
 * remainder 是未被选中的其他子路径，应放在 extracted 之后。
 *
 * 例如：原始 [A_outer, A_inner, B, C]，选中 A_outer + A_inner 做打孔
 * - extracted = [A_punched]（运算结果）
 * - remainder = [B, C]（未选中的路径）
 * - 结果应为 [A_punched, B, C]，而非 [B, C, A_punched]
 */
export function applyPathVectorExtractionToDoc(
  prev: EditorObject[],
  sourceId: string,
  extracted: EditorPathObject,
  remainder: EditorPathObject | null
): EditorObject[] {
  const i = prev.findIndex((o) => o.id === sourceId);
  if (i < 0) return prev;
  const next = [...prev];
  next[i] = extracted;
  if (remainder) {
    next.splice(i + 1, 0, remainder);
  }
  return next;
}
