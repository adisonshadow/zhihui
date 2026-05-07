import { describe, expect, it } from 'vitest';
import type { EditorPathObject } from '@/components/imageEditor/editorTypes';
import {
  applyPathVectorExtractionToDoc,
  buildExtractedPathObjects,
  pathVectorNeedsExtract,
} from '@/utils/pathVectorExtractSubpaths';

function pathObj(pathData: string, id = 'a'): EditorPathObject {
  return {
    type: 'path',
    id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    pathData,
    naturalW: 100,
    naturalH: 100,
    fill: '#fff',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
    blurRadius: 0,
  };
}

describe('pathVectorExtractSubpaths', () => {
  it('pathVectorNeedsExtract', () => {
    expect(pathVectorNeedsExtract([0], 3)).toBe(true);
    expect(pathVectorNeedsExtract([0, 1, 2], 3)).toBe(false);
    expect(pathVectorNeedsExtract([], 3)).toBe(false);
  });

  it('buildExtractedPathObjects splits compound path', () => {
    const d = 'M0 0 L10 0 L10 10 L0 10 Z M20 20 L30 20 L30 30 L20 30 Z';
    const o = pathObj(d);
    const ex = buildExtractedPathObjects(o, [1]);
    expect(ex).not.toBeNull();
    expect(ex!.extracted.pathData).toContain('20');
    expect(ex!.remainder!.pathData).toContain('0 0');
    expect(ex!.newActiveSubpathIndices).toEqual([0]);
    expect(ex!.extracted.id).not.toBe(o.id);
  });

  it('applyPathVectorExtractionToDoc 在原位插入运算结果图层并在其后接 remainder', () => {
    const a = pathObj('M0 0 L1 0 L1 1 L0 1 Z M2 2 L3 2 L3 3 L2 3 Z', 'src');
    const ex = buildExtractedPathObjects(a, [0])!;
    const doc = applyPathVectorExtractionToDoc([a], 'src', ex.extracted, ex.remainder!);
    expect(doc).toHaveLength(2);
    expect(doc[0]!.id).toBe(ex.extracted.id);
    expect(doc[1]!.id).toBe('src');
  });
});
