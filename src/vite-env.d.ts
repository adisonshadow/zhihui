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
      net: {
        fetchVolcTosImageAsDataUrl: (
          url: string
        ) => Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>;
      };
      fs: {
        pathExists: (p: string) => Promise<boolean>;
        /** 若路径已存在则返回 `base (1).ext` 形式的不冲突完整路径 */
        getSafeFilePath: (fullCandidatePath: string) => Promise<string>;
        writeBase64File: (fullPath: string, base64: string) => Promise<{ ok: boolean; error?: string }>;
        readFileAsDataUrl: (fullPath: string) => Promise<string | null>;
      };
      settings: {
        get: () => Promise<import('@/types/settings').AISettings>;
        save: (data: import('@/types/settings').AISettings) => Promise<{ ok: boolean; error?: string }>;
      };
      system: {
        getFonts: () => Promise<string[]>;
        getFontFaces: () => Promise<
          Array<{
            familyName: string;
            postScriptName: string;
            weight: string;
            style: string;
            styleLabel?: string;
            englishFamilyGuess?: string;
          }>
        >;
      };
      plugins?: {
        lamaCleanerEnsure: () => Promise<
          | { ok: true; baseUrl: string }
          | { ok: false; needInstall: true }
          | { ok: false; needInstall?: false; error: string }
        >;
        lamaCleanerOpenInstallTerminal: () => Promise<{ ok: boolean; error?: string }>;
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
        getOrCreateStandaloneComponentsCharacter: (projectDir: string) => Promise<{ id: string; component_groups?: string | null }>;
        createCharacter: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        updateCharacter: (projectDir: string, id: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
        deleteCharacter: (projectDir: string, id: string) => Promise<{ ok: boolean; error?: string }>;
        getAssets: (projectDir: string, type?: string) => Promise<{ id: string; path: string; type: string }[]>;
        getAssetById: (projectDir: string, id: string) => Promise<{ id: string; path: string; type: string; description?: string | null; tags?: string | null; original_path?: string | null; duration?: number | null } | null>;
        updateAsset: (projectDir: string, id: string, data: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
        deleteAsset: (projectDir: string, id: string) => Promise<{ ok: boolean; error?: string }>;
        reprocessTransparentVideo: (
          projectDir: string,
          assetId: string,
          color: 'auto' | 'black' | 'green' | 'purple',
          options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
        ) => Promise<{ ok: boolean; error?: string }>;
        processSingleFrameColorkey: (
          projectDir: string,
          videoPath: string,
          frameTime: number,
          color: 'auto' | 'black' | 'green' | 'purple',
          options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
        ) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
        getAssetsByUiCategory: (
          projectDir: string,
          uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound'
        ) => Promise<{ id: string; path: string; type: string }[]>;
        getBundledAssetIds: (projectDir: string) => Promise<string[]>;
        getAssetBundlesByUiCategory: (
          projectDir: string,
          uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound'
        ) => Promise<
          Array<{
            id: string;
            title: string;
            cover_path: string | null;
            tags: string | null;
            is_favorite: number;
            created_at: string;
            updated_at: string;
            member_count: number;
            first_member_fallback?: string | null;
          }>
        >;
        getAssetBundleById: (projectDir: string, bundleId: string) => Promise<{
          id: string;
          title: string;
          cover_path: string | null;
          tags: string | null;
          is_favorite: number;
          created_at: string;
          updated_at: string;
        } | null>;
        getAssetBundleMembersOrdered: (projectDir: string, bundleId: string) => Promise<
          Array<{ id: string; path: string; type: string; description?: string | null; cover_path?: string | null; tags?: string | null }>
        >;
        getAssetBundleForAsset: (
          projectDir: string,
          assetId: string
        ) => Promise<{
          bundle: { id: string; title: string; cover_path: string | null; tags: string | null; is_favorite: number; created_at: string; updated_at: string };
          members: Array<{ id: string; path: string; type: string; description?: string | null; tags?: string | null; cover_path?: string | null }>;
        } | null>;
        createAssetBundle: (
          projectDir: string,
          data: { title?: string; tags?: string | null; is_favorite?: number; memberAssetIds: string[]; cover_path?: string | null }
        ) => Promise<{ ok: boolean; bundleId?: string; error?: string }>;
        updateAssetBundle: (
          projectDir: string,
          bundleId: string,
          data: { title?: string; tags?: string | null; is_favorite?: number; cover_path?: string | null }
        ) => Promise<{ ok: boolean; error?: string }>;
        deleteAssetBundle: (projectDir: string, bundleId: string) => Promise<{ ok: boolean; error?: string }>;
        addAssetBundleMember: (projectDir: string, bundleId: string, assetId: string) => Promise<{ ok: boolean; error?: string }>;
        removeAssetBundleMember: (projectDir: string, bundleId: string, assetId: string) => Promise<{ ok: boolean; error?: string }>;
        reorderAssetBundleMembers: (projectDir: string, bundleId: string, orderedAssetIds: string[]) => Promise<{ ok: boolean; error?: string }>;
        addSimilarAssetToBundle: (
          projectDir: string,
          existingAssetId: string,
          newAssetId: string
        ) => Promise<{ ok: boolean; bundleId?: string; error?: string }>;
        getAssetDataUrl: (projectDir: string, relativePath: string) => Promise<string | null>;
        getTextGadgetPresets: () => Promise<Array<{ id: string; name: string; description?: string; config: { id: string; name: string; fields: Array<{ key: string; label: string; type: string; defaults: { content: string; fontSize: number; color: string; fontFamily: string } }> } }>>;
        getTextGadgetConfig: (presetId: string) => Promise<{ id: string; name: string; fields: Array<{ key: string; label: string; type: string; defaults: { content: string; fontSize: number; color: string; fontFamily: string } }> } | null>;
        getParticlesGadgetPresets: () => Promise<Array<{ id: string; name: string; description?: string; config: { id: string; name: string; fields: Array<{ key: string; label: string; type: string; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number; defaults: Record<string, string | number> }> } }>>;
        getParticlesGadgetConfig: (presetId: string) => Promise<{ id: string; name: string; fields: Array<{ key: string; label: string; type: string; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number; defaults: Record<string, string | number> }> } | null>;
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
        matteImageForContour: (
          projectDir: string,
          relativePath: string,
          options?: { mattingModel?: string; downsampleRatio?: number }
        ) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
        matteImageAndSave: (
          projectDir: string,
          relativePath: string,
          options?: { mattingModel?: string; downsampleRatio?: number; replaceAssetId?: string }
        ) => Promise<{ ok: boolean; path?: string; error?: string }>;
        matteImageFromDataUrl: (
          dataUrl: string,
          options?: { mattingModel?: string; downsampleRatio?: number }
        ) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
        processSpriteWithOnnx: (
          projectDir: string,
          relativePath: string,
          options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: string; u2netpAlphaMatting?: boolean; debugDir?: string }
        ) => Promise<{ ok: boolean; path?: string; frames?: { x: number; y: number; width: number; height: number }[]; cover_path?: string; error?: string }>;
        exportSpriteSheet: (projectDir: string, item: unknown) => Promise<{ ok: boolean; error?: string }>;
        importSpriteSheet: (projectDir: string, zipPath: string) => Promise<{ ok: boolean; item?: unknown; error?: string }>;
        videoToSpriteExtract: (
          projectDir: string,
          videoRelativePath: string,
          options: { mode: 'scene' | 'uniform'; sceneThreshold?: number; totalFrames?: number }
        ) => Promise<{ ok: boolean; frameCount?: number; dataUrls?: string[]; error?: string }>;
        videoToSpriteSave: (
          projectDir: string,
          videoRelativePath: string
        ) => Promise<{ ok: boolean; path?: string; frameCount?: number; frames?: { x: number; y: number; width: number; height: number }[]; cover_path?: string; error?: string }>;
        saveAssetFromFile: (projectDir: string, sourcePath: string, type?: string, options?: unknown) => Promise<{ ok: boolean; id?: string; path?: string; error?: string }>;
        saveTransparentVideoAsset: (
          projectDir: string,
          sourcePath: string,
          color: 'auto' | 'black' | 'green' | 'purple',
          options?: { description?: string | null; is_favorite?: number; tags?: string | null; tolerance?: number; contiguous?: boolean }
        ) => Promise<{ ok: boolean; id?: string; path?: string; error?: string }>;
        saveAssetFromBase64: (projectDir: string, base64Data: string, ext?: string, type?: string, options?: { replaceAssetId?: string }) => Promise<{ ok: boolean; path?: string; id?: string; error?: string }>;
        getAiConfig: (projectDir: string) => Promise<unknown>;
        saveAiConfig: (projectDir: string, data: unknown) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}

export {};
