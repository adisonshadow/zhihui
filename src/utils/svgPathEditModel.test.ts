import { describe, expect, it } from 'vitest';
import {
  tryParsePathData,
  deleteVertex,
  canDeleteVertex,
  pathDataFromModel,
  insertVertexMidEdgeOnSubpath,
} from './svgPathEditModel';

describe('svgPathEditModel', () => {
  it('parses and serializes M L C Z closed path', () => {
    const d =
      'M 10 20 C 30 20 40 50 50 50 C 60 50 70 20 90 20 L 100 80 L 10 80 Z';
    const m = tryParsePathData(d);
    expect(m).not.toBeNull();
    const out = pathDataFromModel(m!);
    const m2 = tryParsePathData(out);
    expect(m2).not.toBeNull();
    expect(m2!.subpaths.length).toBe(m!.subpaths.length);
    expect(m2!.subpaths[0]!.verts.length).toBe(m!.subpaths[0]!.verts.length);
  });

  it('parses Potrace-style sample', () => {
    const d =
      'M 100 100 C 120 100 130 120 150 120 C 170 120 180 100 200 100 L 200 200 L 100 200 Z';
    const m = tryParsePathData(d);
    expect(m).not.toBeNull();
    expect(m!.subpaths[0]!.closed).toBe(true);
    expect(m!.subpaths[0]!.verts.length).toBeGreaterThanOrEqual(3);
  });

  it('deleteVertex removes inner point when closed and n>3', () => {
    const d = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const m = tryParsePathData(d);
    expect(m).not.toBeNull();
    const sp = m!.subpaths[0]!;
    expect(canDeleteVertex(sp, 1)).toBe(true);
    const next = deleteVertex(m!, 0, 1);
    expect(next).not.toBeNull();
    expect(next!.subpaths[0]!.verts.length).toBe(sp.verts.length - 1);
  });

  it('deleteVertex returns null for minimal triangle', () => {
    const d = 'M 0 0 L 100 0 L 50 100 Z';
    const m = tryParsePathData(d);
    expect(m).not.toBeNull();
    const sp = m!.subpaths[0]!;
    expect(sp.verts.length).toBe(3);
    expect(canDeleteVertex(sp, 0)).toBe(false);
    const next = deleteVertex(m!, 0, 0);
    expect(next).toBeNull();
  });

  it('returns null for unsupported command', () => {
    expect(tryParsePathData('M 0 0 Q 1 1 2 2')).toBeNull();
  });

  it('insertVertexMidEdgeOnSubpath adds vertex on line edge', () => {
    const d = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const m = tryParsePathData(d);
    expect(m).not.toBeNull();
    const next = insertVertexMidEdgeOnSubpath(m!, 0, 0);
    expect(next).not.toBeNull();
    expect(next!.subpaths[0]!.verts.length).toBe(5);
  });
});
