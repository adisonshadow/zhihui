import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hushMock = vi.fn();
const evaluateMock = vi.fn().mockResolvedValue(undefined);
const initStrudelMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@strudel/web', () => ({
  hush: () => hushMock(),
  evaluate: (...args: unknown[]) => evaluateMock(...args),
  initStrudel: (...args: unknown[]) => initStrudelMock(...args),
}));

describe('StrudelPlaybackController', () => {
  async function waitUntilReady(ctrl: { getState: () => { ready: boolean } }) {
    for (let i = 0; i < 20; i += 1) {
      if (ctrl.getState().ready) return;
      await Promise.resolve();
    }
    expect(ctrl.getState().ready).toBe(true);
  }

  beforeEach(() => {
    hushMock.mockClear();
    evaluateMock.mockClear();
    initStrudelMock.mockClear();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dispose 在 ready 之前会阻止同一实例再变为 ready（StrictMode 须新建实例）', async () => {
    const { StrudelPlaybackController } = await import('./StrudelPlaybackController');
    const ctrl = new StrudelPlaybackController();
    ctrl.dispose();
    await vi.waitFor(() => {
      expect(initStrudelMock).toHaveBeenCalled();
    });
    expect(ctrl.getState().ready).toBe(false);
  });

  it('dispose 调用 hush', async () => {
    const { StrudelPlaybackController } = await import('./StrudelPlaybackController');
    const ctrl = new StrudelPlaybackController();
    await waitUntilReady(ctrl);

    const playPromise = ctrl.play({ code: 's("bd")', cps: 1, cycleCount: 1 });
    await Promise.resolve();
    expect(ctrl.getState().phase).toBe('playing');
    await vi.advanceTimersByTimeAsync(1000);
    await playPromise;
    expect(hushMock).toHaveBeenCalled();

    hushMock.mockClear();
    ctrl.dispose();
    expect(hushMock).toHaveBeenCalled();
  });

  it('播放到 cycleCount/cps 秒后自动 hush', async () => {
    const { StrudelPlaybackController } = await import('./StrudelPlaybackController');
    const ctrl = new StrudelPlaybackController();
    await waitUntilReady(ctrl);

    const playPromise = ctrl.play({ code: 's("bd")', cps: 1, cycleCount: 2 });
    await Promise.resolve();
    expect(ctrl.getState().phase).toBe('playing');
    expect(ctrl.getState().durationSec).toBe(2);

    hushMock.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    await playPromise;
    expect(ctrl.getState().phase).toBe('ended');
    expect(hushMock).toHaveBeenCalled();
  });
});
