const STORAGE_KEY = 'yiman:music-design:workspace';

export interface MusicWorkspaceState {
  code: string;
  cps: number;
  volume?: number;
  updatedAt: string;
}

const DEFAULT_CPS = 0.9;
const DEFAULT_VOLUME = 1;

export function loadMusicWorkspace(): MusicWorkspaceState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<MusicWorkspaceState>;
    if (typeof o.code !== 'string') return null;
    const cps = typeof o.cps === 'number' && Number.isFinite(o.cps) ? Math.min(4, Math.max(0.25, o.cps)) : DEFAULT_CPS;
    const volume =
      typeof o.volume === 'number' && Number.isFinite(o.volume) ?
        Math.min(1, Math.max(0, o.volume))
      : DEFAULT_VOLUME;
    return {
      code: o.code,
      cps,
      volume,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveMusicWorkspace(state: Pick<MusicWorkspaceState, 'code' | 'cps' | 'volume'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: MusicWorkspaceState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export { DEFAULT_CPS, DEFAULT_VOLUME };
