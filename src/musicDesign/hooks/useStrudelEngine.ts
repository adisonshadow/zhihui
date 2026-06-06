import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluate, hush, initStrudel } from '@strudel/web';
import { prepareStrudelBody } from '../strudelPlayback/prepareStrudelBody';
import { prebakeStrudelPianoSamples } from '../strudelPlayback/loadStrudelLocalSamples';

/**
 * @deprecated 请使用 StrudelPlaybackProvider + useStrudelPlayback。
 * 保留供 LocalTtsPreview 等旧入口，不含 cycle 计时与 unmount hush。
 */
export function useStrudelEngine() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const initPromiseRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = initStrudel({
          prebake: async () => {
            try {
              await evaluate("samples('github:tidalcycles/dirt-samples')", false);
            } catch (e) {
              console.warn('[Strudel] dirt-samples 预加载失败，鼓组示例可能无声', e);
            }
            try {
              await prebakeStrudelPianoSamples((code, hush) => evaluate(code, hush ?? false));
            } catch (e) {
              console.warn('[Strudel] 本地 piano 采样预加载失败', e);
            }
          },
        });
        initPromiseRef.current = p;
        await p;
        if (!cancelled) {
          setReady(true);
          setInitError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setInitError(e instanceof Error ? e.message : String(e));
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playCode = useCallback(async (code: string, cps: number) => {
    if (initPromiseRef.current) await initPromiseRef.current;
    const body = prepareStrudelBody(code, cps);
    if (!body) return;
    await evaluate(body, true);
  }, []);

  const stop = useCallback(() => {
    try {
      hush();
    } catch {
      /* ignore */
    }
  }, []);

  return { ready, initError, playCode, stop };
}
