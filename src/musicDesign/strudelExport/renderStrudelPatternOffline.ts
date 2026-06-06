import { renderPatternAudio } from '@strudel/web';

type StrudelPattern = {
  queryArc: (
    begin: number,
    end: number,
    state?: { _cps?: number },
  ) => Array<{
    hasOnset: () => boolean;
    whole?: { begin: { valueOf: () => number } };
    duration: number;
    value: unknown;
    ensureObjectValue?: () => void;
  }>;
};

export interface RenderStrudelOfflineOptions {
  pattern: StrudelPattern;
  cps: number;
  begin?: number;
  end: number;
  sampleRate?: number;
  maxPolyphony?: number;
  /** 暂未接入离线 master gain；保留供后续扩展 */
  volume?: number;
}

/**
 * 使用 @strudel/web 内置 renderPatternAudio（与 initStrudel 同一 superdough 实例）。
 *
 * 不可从独立 `superdough` 包 new SuperdoughAudioController —— @strudel/web 是预打包单体，
 * 另引 superdough 会导致「cannot connect… different audio context」。
 */
export async function renderStrudelPatternOffline(
  opts: RenderStrudelOfflineOptions,
): Promise<AudioBuffer> {
  const begin = opts.begin ?? 0;
  const sampleRate = opts.sampleRate ?? 44100;
  let rendered: AudioBuffer | null = null;

  const NativeOffline = globalThis.OfflineAudioContext;
  const PatchedOffline = function (
    this: OfflineAudioContext,
    ...args: ConstructorParameters<typeof OfflineAudioContext>
  ) {
    const ctx = new NativeOffline(...args);
    const nativeStart = ctx.startRendering.bind(ctx);
    ctx.startRendering = () =>
      nativeStart().then((buf) => {
        rendered = buf;
        return buf;
      });
    return ctx;
  } as unknown as typeof OfflineAudioContext;
  PatchedOffline.prototype = NativeOffline.prototype;

  const prevOffline = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = PatchedOffline;

  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function blockStrudelExportDownload(this: HTMLAnchorElement) {
    if (this.download?.endsWith('.wav')) return;
    return nativeAnchorClick.call(this);
  };

  try {
    await renderPatternAudio(
      opts.pattern as Parameters<typeof renderPatternAudio>[0],
      opts.cps,
      begin,
      opts.end,
      sampleRate,
      opts.maxPolyphony ?? 128,
      false,
    );
  } finally {
    globalThis.OfflineAudioContext = prevOffline;
    HTMLAnchorElement.prototype.click = nativeAnchorClick;
  }

  if (!rendered) {
    throw new Error('Strudel 离线渲染未产生音频');
  }
  return rendered;
}
