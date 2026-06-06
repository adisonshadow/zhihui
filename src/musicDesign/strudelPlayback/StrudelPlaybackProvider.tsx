import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  STRUDEL_PLAYBACK_INITIAL_STATE,
  StrudelPlaybackController,
  type StrudelPlaybackState,
  type StrudelPlayOptions,
} from './StrudelPlaybackController';

export interface StrudelPlaybackContextValue {
  state: StrudelPlaybackState;
  play: (opts: StrudelPlayOptions) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  togglePlayPause: (opts: StrudelPlayOptions) => Promise<void>;
  setVolume: (volume: number) => void;
  reinitEngine: () => Promise<void>;
}

const StrudelPlaybackContext = createContext<StrudelPlaybackContextValue | null>(null);

export interface StrudelPlaybackProviderProps {
  scopeId: string;
  children: ReactNode;
}

const noopAsync = async () => {};

/**
 * 页面级 Strudel 播放作用域：卸载时 dispose → hush，避免离开页面仍发声。
 *
 * 控制器须在 useEffect 中创建：React StrictMode 会保留 useMemo 缓存，
 * 若在模拟卸载时 dispose，复用的实例将永远无法 ready。
 */
export function StrudelPlaybackProvider({ scopeId, children }: StrudelPlaybackProviderProps) {
  const [controller, setController] = useState<StrudelPlaybackController | null>(null);
  const [state, setState] = useState<StrudelPlaybackState>(STRUDEL_PLAYBACK_INITIAL_STATE);

  useEffect(() => {
    const ctrl = new StrudelPlaybackController();
    setController(ctrl);
    const unsub = ctrl.subscribe(setState);
    return () => {
      unsub();
      ctrl.dispose();
      setController(null);
      setState(STRUDEL_PLAYBACK_INITIAL_STATE);
    };
  }, [scopeId]);

  const value = useMemo<StrudelPlaybackContextValue>(() => {
    if (!controller) {
      return {
        state,
        play: noopAsync,
        pause: () => {},
        resume: noopAsync,
        stop: () => {},
        togglePlayPause: noopAsync,
        setVolume: () => {},
        reinitEngine: noopAsync,
      };
    }
    return {
      state,
      play: (opts) => controller.play(opts),
      pause: () => controller.pause(),
      resume: () => controller.resume(),
      stop: () => controller.stop(),
      togglePlayPause: (opts) => controller.togglePlayPause(opts),
      setVolume: (v) => controller.setVolume(v),
      reinitEngine: () => controller.reinitEngine(),
    };
  }, [controller, state]);

  return (
    <StrudelPlaybackContext.Provider value={value}>{children}</StrudelPlaybackContext.Provider>
  );
}

/** 无 UI 亦可调用 play/stop（「看不见对象」） */
export function useStrudelPlayback(): StrudelPlaybackContextValue {
  const ctx = useContext(StrudelPlaybackContext);
  if (!ctx) {
    throw new Error('useStrudelPlayback 须在 StrudelPlaybackProvider 内使用');
  }
  return ctx;
}

/** 仅挂载 Provider 逻辑、不渲染 UI 时可省略 */
export function StrudelPlaybackHost() {
  return null;
}
