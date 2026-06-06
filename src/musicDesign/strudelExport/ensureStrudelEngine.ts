import { evaluate, initStrudel } from '@strudel/web';
import { prebakeStrudelPianoSamples } from '@/musicDesign/strudelPlayback/loadStrudelLocalSamples';

export type StrudelEngineInitOptions = {
  onEvalError?: (err: Error) => void;
  prebake?: () => void | Promise<void>;
  miniAllStrings?: boolean;
};

let initPromise: Promise<void> | null = null;
let lastInitOptions: StrudelEngineInitOptions | undefined;

async function runPrebake() {
  try {
    await evaluate("samples('github:tidalcycles/dirt-samples')", false);
  } catch (e) {
    console.warn('[Strudel] dirt-samples 预加载失败', e);
  }
  try {
    await prebakeStrudelPianoSamples((code, hush) => evaluate(code, hush ?? false));
  } catch (e) {
    console.warn('[Strudel] 本地 piano 采样预加载失败', e);
  }
}

/** 导出 / 离线渲染前在**当前** AudioContext 上注册采样（须在 setAudioContext 之后调用） */
export async function runStrudelSamplePrebake(): Promise<void> {
  await runPrebake();
}

/** 与 StrudelPlaybackController 一致的预烘焙；多次调用共享同一 Promise */
export function ensureStrudelEngine(options?: StrudelEngineInitOptions): Promise<void> {
  if (initPromise) return initPromise;
  lastInitOptions = options;
  initPromise = (async () => {
    const { prebake, ...replOptions } = options ?? {};
    await initStrudel({
      ...replOptions,
      prebake: async () => {
        await runPrebake();
        await prebake?.();
      },
    });
  })();
  return initPromise;
}

/** 读取最近一次 init 选项（reinit 时复用 onEvalError 等） */
export function getLastStrudelInitOptions(): StrudelEngineInitOptions | undefined {
  return lastInitOptions;
}

/** 离线导出破坏 AudioContext 后，允许重新初始化 */
export function resetStrudelEngineCache(): void {
  initPromise = null;
}
