import { describe, it, expect } from 'vitest';
import {
  traceImageDataToSvgPathData,
  closedPolylineToSvgPathWithCorners,
} from './potraceCore';

function makeImageData(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
}

/** 白底中心红实心圆（与编辑器 Potrace 场景一致：暗色=前景） */
function redCircleOnWhite(size: number, cx: number, cy: number, r: number): ImageData {
  const r2 = r * r;
  return makeImageData(size, size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r2) {
      return [255, 0, 0, 255];
    }
    return [255, 255, 255, 255];
  });
}

function pathNumericBounds(pathData: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const nums = pathData.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

describe('potraceCore traceImageDataToSvgPathData', () => {
  it('白底实心红圆应得到闭合路径且包围盒大致围绕圆心（回归 marching squares case 11/12）', () => {
    const size = 256;
    const cx = 128;
    const cy = 128;
    const r = 70;
    const imageData = redCircleOnWhite(size, cx, cy, r);
    const pathData = traceImageDataToSvgPathData(imageData, {
      threshold: 128,
      turdSize: 8,
      simplifyEpsilon: 1.2,
      maxTraceSide: 512,
      curveTension: 0.5,
      adaptiveSimplify: false,
    });

    expect(pathData.trim().length).toBeGreaterThan(32);
    expect(pathData).toMatch(/Z/);

    const { minX, maxX, minY, maxY } = pathNumericBounds(pathData);
    const margin = 56;
    expect(minX).toBeGreaterThanOrEqual(cx - r - margin);
    expect(maxX).toBeLessThanOrEqual(cx + r + margin);
    expect(minY).toBeGreaterThanOrEqual(cy - r - margin);
    expect(maxY).toBeLessThanOrEqual(cy + r + margin);

    expect(maxX - minX).toBeGreaterThan(r * 1.15);
    expect(maxY - minY).toBeGreaterThan(r * 1.15);

    const bx = (minX + maxX) / 2;
    const by = (minY + maxY) / 2;
    expect(Math.abs(bx - cx)).toBeLessThan(r * 0.4);
    expect(Math.abs(by - cy)).toBeLessThan(r * 0.4);
  });
});

describe('potraceCore corner path', () => {
  it('矩形在角点模式下相邻角点间为直线 L；阈值为 0 时无 L（整圈 C）', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const withCorners = closedPolylineToSvgPathWithCorners(square, 0.5, 38);
    expect(withCorners).toMatch(/\bL\b/);
    const smooth = closedPolylineToSvgPathWithCorners(square, 0.5, 0);
    expect(smooth).not.toMatch(/\bL\b/);
    expect(smooth).toMatch(/C /);
  });
});
