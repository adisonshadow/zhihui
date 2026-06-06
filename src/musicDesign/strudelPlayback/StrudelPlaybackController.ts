import { evaluate, hush } from '@strudel/web';
import { computePlaybackDurationSec } from '../utils/formatPlaybackTime';
import { prepareStrudelBody } from './prepareStrudelBody';
import { StrudelErrorCollector } from './strudelErrorCapture';
import { applyStrudelMasterVolume } from './strudelMasterVolume';
import { ensureStrudelEngine, getLastStrudelInitOptions, resetStrudelEngineCache } from '../strudelExport/ensureStrudelEngine';

export type StrudelPlaybackPhase = 'idle' | 'playing' | 'paused' | 'ended';

export interface StrudelPlaybackState {
  phase: StrudelPlaybackPhase;
  ready: boolean;
  initError: string | null;
  currentSec: number;
  durationSec: number;
  cycleCount: number;
  cps: number;
  /** evaluate 请求进行中 */
  busy: boolean;
  /** 主输出音量 0–1 */
  volume: number;
}

export interface StrudelPlayOptions {
  code: string;
  cps: number;
  cycleCount?: number;
  loop?: boolean;
}

type Listener = (state: StrudelPlaybackState) => void;

export const STRUDEL_PLAYBACK_INITIAL_STATE: StrudelPlaybackState = {
  phase: 'idle',
  ready: false,
  initError: null,
  currentSec: 0,
  durationSec: 0,
  cycleCount: 1,
  cps: 0.9,
  busy: false,
  volume: 1,
};

const INITIAL_STATE = STRUDEL_PLAYBACK_INITIAL_STATE;

export class StrudelPlaybackController {
  private state: StrudelPlaybackState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;
  private disposed = false;

  private rafId: number | null = null;
  private endTimerId: ReturnType<typeof setTimeout> | null = null;

  private sessionStartMs = 0;
  private pausedElapsedSec = 0;
  private lastCode = '';
  private lastCps = 0.9;
  private lastCycleCount = 1;
  private lastLoop = false;

  /** Strudel repl.evaluate 吞掉异常，仅回调 onEvalError */
  private pendingEvalError: Error | null = null;
  private errorCollector: StrudelErrorCollector | null = null;
  private sessionEndResolve: (() => void) | null = null;
  private volume = 1;

  constructor() {
    void this.bootstrap();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): StrudelPlaybackState {
    return this.state;
  }

  private emit(partial: Partial<StrudelPlaybackState>) {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }

  private async bootstrap() {
    try {
      this.initPromise = ensureStrudelEngine({
        onEvalError: (err: Error) => {
          this.pendingEvalError = err;
        },
      }).then(() => {
        if (!this.disposed) applyStrudelMasterVolume(this.volume);
      });
      await this.initPromise;
      if (!this.disposed) {
        this.emit({ ready: true, initError: null, volume: this.volume });
      }
    } catch (e) {
      if (!this.disposed) {
        this.emit({
          ready: false,
          initError: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  setVolume(next: number) {
    this.volume = Math.min(1, Math.max(0, next));
    applyStrudelMasterVolume(this.volume);
    this.emit({ volume: this.volume });
  }

  getVolume(): number {
    return this.volume;
  }

  /** 离线导出破坏 AudioContext 后重建引擎 */
  async reinitEngine(): Promise<void> {
    if (this.disposed) return;
    this.stop();
    const prevOptions = getLastStrudelInitOptions();
    resetStrudelEngineCache();
    this.initPromise = null;
    this.emit({ ready: false, initError: null });
    try {
      this.initPromise = ensureStrudelEngine(prevOptions).then(() => {
        if (!this.disposed) applyStrudelMasterVolume(this.volume);
      });
      await this.initPromise;
      if (!this.disposed) {
        this.emit({ ready: true, initError: null, volume: this.volume });
      }
    } catch (e) {
      if (!this.disposed) {
        this.emit({
          ready: false,
          initError: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  private clearTimers() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.endTimerId != null) {
      clearTimeout(this.endTimerId);
      this.endTimerId = null;
    }
  }

  private hushQuiet() {
    try {
      hush();
    } catch {
      /* ignore */
    }
  }

  private elapsedSec(): number {
    if (this.state.phase !== 'playing') return this.pausedElapsedSec;
    return this.pausedElapsedSec + (performance.now() - this.sessionStartMs) / 1000;
  }

  private tick = () => {
    if (this.disposed || this.state.phase !== 'playing') return;
    const elapsed = this.elapsedSec();
    const duration = this.state.durationSec;
    this.emit({ currentSec: Math.min(elapsed, duration) });
    if (elapsed >= duration) {
      this.finishPlayback();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private resolveSessionEnd() {
    this.sessionEndResolve?.();
    this.sessionEndResolve = null;
  }

  private beginErrorCapture() {
    this.pendingEvalError = null;
    this.errorCollector?.stop();
    this.errorCollector = new StrudelErrorCollector();
    this.errorCollector.start();
  }

  private endErrorCapture() {
    this.errorCollector?.stop();
    this.errorCollector = null;
    this.pendingEvalError = null;
  }

  private takeCapturedError(): Error | null {
    if (this.pendingEvalError) return this.pendingEvalError;
    return this.errorCollector?.firstError() ?? null;
  }

  private waitForPlaybackSession(maxMs: number): Promise<void> {
    return new Promise((resolve) => {
      const safety = setTimeout(() => {
        if (this.sessionEndResolve) {
          this.sessionEndResolve = null;
          resolve();
        }
      }, maxMs + 300);
      this.sessionEndResolve = () => {
        clearTimeout(safety);
        this.sessionEndResolve = null;
        resolve();
      };
    });
  }

  private finishPlayback() {
    this.clearTimers();
    this.hushQuiet();
    this.resolveSessionEnd();
    if (this.lastLoop && !this.disposed) {
      void this.play({
        code: this.lastCode,
        cps: this.lastCps,
        cycleCount: this.lastCycleCount,
        loop: true,
      });
      return;
    }
    this.emit({
      phase: 'ended',
      currentSec: this.state.durationSec,
      busy: false,
    });
  }

  private scheduleEndTimer(remainingSec: number) {
    if (this.endTimerId != null) clearTimeout(this.endTimerId);
    this.endTimerId = setTimeout(() => {
      this.endTimerId = null;
      if (this.state.phase === 'playing') this.finishPlayback();
    }, Math.max(0, remainingSec) * 1000);
  }

  private async evaluateCode(code: string, cps: number): Promise<void> {
    if (this.initPromise) await this.initPromise;
    const body = prepareStrudelBody(code, cps);
    if (!body) throw new Error('代码为空');
    await evaluate(body, true);
    const err = this.takeCapturedError();
    if (err) throw err;
  }

  async play(opts: StrudelPlayOptions): Promise<void> {
    if (this.disposed) return;
    const code = opts.code.trim();
    if (!code) return;

    const cps = opts.cps;
    const cycleCount = opts.cycleCount ?? 1;
    const loop = opts.loop ?? false;
    const durationSec = computePlaybackDurationSec(cycleCount, cps);

    this.lastCode = code;
    this.lastCps = cps;
    this.lastCycleCount = cycleCount;
    this.lastLoop = loop;

    this.clearTimers();
    this.hushQuiet();
    this.pausedElapsedSec = 0;
    this.sessionStartMs = performance.now();

    this.emit({
      phase: 'playing',
      busy: true,
      cps,
      cycleCount,
      durationSec,
      currentSec: 0,
    });

    this.beginErrorCapture();
    try {
      await this.evaluateCode(code, cps);
      if (this.disposed) return;
      this.emit({ busy: false });
      this.rafId = requestAnimationFrame(this.tick);
      this.scheduleEndTimer(durationSec);

      if (!loop) {
        await this.waitForPlaybackSession(durationSec * 1000);
        const runtimeErr = this.takeCapturedError();
        if (runtimeErr) throw runtimeErr;
      }
    } catch (e) {
      this.resolveSessionEnd();
      this.clearTimers();
      this.hushQuiet();
      const msg = e instanceof Error ? e.message : String(e);
      this.emit({ phase: 'idle', busy: false, currentSec: 0, initError: msg });
      throw e;
    } finally {
      this.endErrorCapture();
    }
  }

  pause() {
    if (this.state.phase !== 'playing') return;
    this.pausedElapsedSec = this.elapsedSec();
    this.clearTimers();
    this.hushQuiet();
    this.emit({
      phase: 'paused',
      currentSec: Math.min(this.pausedElapsedSec, this.state.durationSec),
      busy: false,
    });
  }

  async resume() {
    if (this.state.phase !== 'paused') return;
    const remaining = this.state.durationSec - this.pausedElapsedSec;
    if (remaining <= 0) {
      this.emit({ phase: 'ended', currentSec: this.state.durationSec });
      return;
    }

    this.sessionStartMs = performance.now();
    this.emit({ phase: 'playing', busy: true });

    this.beginErrorCapture();
    try {
      await this.evaluateCode(this.lastCode, this.lastCps);
      if (this.disposed) return;
      this.emit({ busy: false });
      this.rafId = requestAnimationFrame(this.tick);
      this.scheduleEndTimer(remaining);
      await this.waitForPlaybackSession(remaining * 1000);
      const runtimeErr = this.takeCapturedError();
      if (runtimeErr) throw runtimeErr;
    } catch (e) {
      this.resolveSessionEnd();
      this.clearTimers();
      this.hushQuiet();
      const msg = e instanceof Error ? e.message : String(e);
      this.emit({ phase: 'idle', busy: false, initError: msg });
      throw e;
    } finally {
      this.endErrorCapture();
    }
  }

  stop() {
    this.resolveSessionEnd();
    this.clearTimers();
    this.hushQuiet();
    this.pausedElapsedSec = 0;
    this.emit({
      phase: 'idle',
      currentSec: 0,
      durationSec: 0,
      busy: false,
    });
  }

  togglePlayPause(opts: StrudelPlayOptions) {
    if (this.state.phase === 'playing') {
      this.pause();
      return Promise.resolve();
    }
    if (this.state.phase === 'paused') {
      return this.resume();
    }
    return this.play(opts);
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    this.hushQuiet();
    this.listeners.clear();
  }
}
