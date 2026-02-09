/**
 * 占位测试（见开发计划 2.15）；组件测试需安装 @testing-library/react 与 jsdom
 */
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('通过', () => {
    expect(1 + 1).toBe(2);
  });
});
