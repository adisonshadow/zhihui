/**
 * 本地 samples/ 目录（@strudel/sampler）预加载。
 * 开发：vite-plugins/strudelSamplerDev；打包：electron/main/strudelSampleServer。
 */
export const STRUDEL_LOCAL_SAMPLES_PORT = 5432;

export function strudelLocalSamplesBaseUrl(): string {
  const port =
    typeof import.meta.env.VITE_STRUDEL_SAMPLES_PORT === 'string' &&
    import.meta.env.VITE_STRUDEL_SAMPLES_PORT.trim() ?
      import.meta.env.VITE_STRUDEL_SAMPLES_PORT.trim()
    : String(STRUDEL_LOCAL_SAMPLES_PORT);
  return `http://127.0.0.1:${port}`;
}

export type StrudelEvaluateFn = (code: string, shouldHush?: boolean) => Promise<unknown>;

/** 预加载 samples/ 下全部 bank（含 piano） */
export async function prebakeStrudelLocalSamples(evaluate: StrudelEvaluateFn): Promise<void> {
  const base = strudelLocalSamplesBaseUrl();
  await evaluate(`samples('${base}')`, false);
}

/** 仅预加载 piano bank（仍走同一 manifest 服务） */
export async function prebakeStrudelPianoSamples(evaluate: StrudelEvaluateFn): Promise<void> {
  await prebakeStrudelLocalSamples(evaluate);
}
