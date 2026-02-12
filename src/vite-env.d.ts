/// <reference types="vite/client" />

declare global {
  interface Window {
    yiman?: {
      projects: {
        list: () => Promise<Array<{ id: string; name: string; landscape: number; project_dir: string; cover_path: string | null; created_at: string; updated_at: string }>>;
        create: (p: { id: string; name: string; landscape: number; project_dir: string; cover_path?: string | null }) => Promise<{ ok: boolean; error?: string }>;
        delete: (id: string, deleteOnDisk: boolean) => Promise<{ ok: boolean; error?: string }>;
        import: (projectDir: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
      };
      dialog: {
        openDirectory: () => Promise<string | null>;
        openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | undefined>;
      };
      shell: {
        showItemInFolder: (fullPath: string) => Promise<string>;
        openPath: (path: string) => Promise<string>;
      };
      fs: { pathExists: (p: string) => Promise<boolean> };
      settings: {
        get: () => Promise<import('@/types/settings').AISettings>;
        save: (data: import('@/types/settings').AISettings) => Promise<{ ok: boolean; error?: string }>;
      };
      project: {
        getMeta: (projectDir: string) => Promise<unknown>;
        updateMeta: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        getEpisodes: (projectDir: string) => Promise<unknown[]>;
        createEpisode: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        updateEpisode: (projectDir: string, id: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        deleteEpisode: (projectDir: string, id: string) => Promise<{ ok: boolean; error?: string }>;
        getCharacters: (projectDir: string) => Promise<unknown[]>;
        createCharacter: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        updateCharacter: (projectDir: string, id: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        deleteCharacter: (projectDir: string, id: string) => Promise<{ ok: boolean; error?: string }>;
        getAssets: (projectDir: string, type?: string) => Promise<{ id: string; path: string; type: string }[]>;
        getAssetDataUrl: (projectDir: string, relativePath: string) => Promise<string | null>;
        getSpriteBackgroundColor: (projectDir: string, relativePath: string) => Promise<{ r: number; g: number; b: number; a: number } | null>;
        getSpriteFrames: (
          projectDir: string,
          relativePath: string,
          background: { r: number; g: number; b: number; a: number } | null,
          options?: { backgroundThreshold?: number; minGapPixels?: number }
        ) => Promise<{ raw: { x: number; y: number; width: number; height: number }[]; normalized: { x: number; y: number; width: number; height: number }[] }>;
        processSpriteWithOnnx: (
          projectDir: string,
          relativePath: string,
          options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2'; u2netpAlphaMatting?: boolean; debugDir?: string }
        ) => Promise<{ ok: boolean; path?: string; frames?: { x: number; y: number; width: number; height: number }[]; cover_path?: string; error?: string }>;
        saveAssetFromFile: (projectDir: string, sourcePath: string, type?: string, options?: unknown) => Promise<{ ok: boolean; path?: string; error?: string }>;
        getAiConfig: (projectDir: string) => Promise<unknown>;
        saveAiConfig: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}

export {};
