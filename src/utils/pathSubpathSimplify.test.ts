import { describe, expect, it } from 'vitest';
import { simplifySubpathsByPercent } from '@/utils/pathSubpathSimplify';
import { pathDataFromModel, tryParsePathData } from '@/utils/svgPathEditModel';

describe('pathSubpathSimplify', () => {
  it('封闭路径简化后可解析、无 NaN，且再序列化一致', () => {
    const d = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const out = simplifySubpathsByPercent(d, [0], 40);
    expect(out).toBeTruthy();
    expect(out).not.toMatch(/NaN/i);
    const m = tryParsePathData(out!);
    expect(m?.subpaths.length).toBe(1);
    expect(m!.subpaths[0]!.verts.length).toBeGreaterThanOrEqual(3);
    const again = pathDataFromModel(m!);
    expect(again).not.toMatch(/NaN/i);
  });
});
