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
        saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
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
        getOrCreateStandaloneSpritesCharacter: (projectDir: string) => Promise<{ id: string; sprite_sheets?: string | null }>;
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
          options?: { backgroundThreshold?: number; minGapPixels?: number; useTransparentBackground?: boolean }
        ) => Promise<{ raw: { x: number; y: number; width: number; height: number }[]; normalized: { x: number; y: number; width: number; height: number }[] }>;
        extractSpriteCover: (
          projectDir: string,
          relativePath: string,
          frame: { x: number; y: number; width: number; height: number }
        ) => Promise<{ ok: boolean; path?: string; error?: string }>;
        matteImageForContour: (projectDir: string, relativePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
        matteImageAndSave: (
          projectDir: string,
          relativePath: string,
          options?: { mattingModel?: string; downsampleRatio?: number }
        ) => Promise<{ ok: boolean; path?: string; error?: string }>;
        processSpriteWithOnnx: (
          projectDir: string,
          relativePath: string,
          options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: string; u2netpAlphaMatting?: boolean; debugDir?: string }
        ) => Promise<{ ok: boolean; path?: string; frames?: { x: number; y: number; width: number; height: number }[]; cover_path?: string; error?: string }>;
        exportSpriteSheet: (projectDir: string, item: unknown) => Promise<{ ok: boolean; error?: string }>;
        importSpriteSheet: (projectDir: string, zipPath: string) => Promise<{ ok: boolean; item?: unknown; error?: string }>;
        saveAssetFromFile: (projectDir: string, sourcePath: string, type?: string, options?: unknown) => Promise<{ ok: boolean; path?: string; error?: string }>;
        saveAssetFromBase64: (projectDir: string, base64Data: string, ext?: string, type?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
        getAiConfig: (projectDir: string) => Promise<unknown>;
        saveAiConfig: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}

export {};
