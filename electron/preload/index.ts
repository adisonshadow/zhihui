/**
 * 预加载脚本：仅通过 contextBridge 暴露约定 API（见技术文档 7、开发计划 2.1）
 * 禁止暴露 Node/Electron 全量。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  projects: {
    list: () => ipcRenderer.invoke('app:projects:list'),
    create: (payload: {
      id: string;
      name: string;
      landscape: number;
      project_dir: string;
      cover_path?: string | null;
      /** 为 false 时不写入应用「漫剧项目」列表（仅初始化本地目录与 project.db） */
      registerInAppList?: boolean;
    }) => ipcRenderer.invoke('app:projects:create', payload),
    delete: (id: string, deleteOnDisk: boolean) =>
      ipcRenderer.invoke('app:projects:delete', id, deleteOnDisk),
    import: (projectDir: string) => ipcRenderer.invoke('app:projects:import', projectDir),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('app:dialog:openDirectory'),
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('app:dialog:openFile', options),
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('app:dialog:saveFile', options),
  },
  fs: {
    pathExists: (p: string) => ipcRenderer.invoke('app:fs:pathExists', p),
    pathDirname: (p: string) => ipcRenderer.invoke('app:fs:pathDirname', p) as Promise<string>,
    pathJoin: (...parts: string[]) => ipcRenderer.invoke('app:fs:pathJoin', parts) as Promise<string>,
    getUnusedSaveDefaultPath: (dir: string, fileName: string) =>
      ipcRenderer.invoke('app:fs:getUnusedSaveDefaultPath', dir, fileName) as Promise<string | null>,
    getSafeFilePath: (fullCandidatePath: string) =>
      ipcRenderer.invoke('app:fs:getSafeFilePath', fullCandidatePath) as Promise<string>,
    writeBase64File: (fullPath: string, base64: string) =>
      ipcRenderer.invoke('app:fs:writeBase64File', fullPath, base64) as Promise<{ ok: boolean; error?: string }>,
    readFileAsDataUrl: (fullPath: string) =>
      ipcRenderer.invoke('app:fs:readFileAsDataUrl', fullPath) as Promise<string | null>,
    readImageFileForEditor: (fullPath: string) =>
      ipcRenderer.invoke('app:fs:readImageFileForEditor', fullPath) as Promise<
        | { ok: true; kind: 'raster'; dataUrl: string }
        | { ok: true; kind: 'svg'; svgText: string }
        | { ok: false; error: string }
      >,
    /** 返回 public/medias（或等价打包目录）下所有视频文件名称 */
    listMedias: () => ipcRenderer.invoke('app:fs:listMedias') as Promise<string[]>,
    /** 拖入本地文件时取绝对路径（Electron），供 PDF/EPS/ODG 栅格化或 SVG 读原文 */
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  shell: {
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('app:shell:showItemInFolder', fullPath),
    openPath: (path: string) => ipcRenderer.invoke('app:shell:openPath', path),
    /** 使用系统默认浏览器打开 URL（Electron） */
    openExternal: (url: string) =>
      ipcRenderer.invoke('app:shell:openExternal', url) as Promise<{ ok: boolean; error?: string }>,
  },
  /** 主进程代拉取（绕过 TOS 等对渲染进程无 CORS 的链接） */
  net: {
    fetchVolcTosImageAsDataUrl: (url: string) =>
      ipcRenderer.invoke('app:net:fetchVolcTosImageAsDataUrl', url) as Promise<
        { ok: true; dataUrl: string } | { ok: false; error: string }
      >,
  },
  settings: {
    get: () => ipcRenderer.invoke('app:settings:get'),
    save: (data: unknown) => ipcRenderer.invoke('app:settings:save', data),
  },
  system: {
    getFonts: () => ipcRenderer.invoke('app:system:getFonts') as Promise<string[]>,
    getFontFaces: () =>
      ipcRenderer.invoke('app:system:getFontFaces') as Promise<
        Array<{ familyName: string; postScriptName: string; weight: string; style: string }>
      >,
  },
  plugins: {
    lamaCleanerEnsure: () =>
      ipcRenderer.invoke('app:plugins:lama:ensure') as Promise<
        | { ok: true; baseUrl: string }
        | { ok: false; needInstall: true }
        | { ok: false; needInstall?: false; error: string }
      >,
    lamaCleanerOpenInstallTerminal: () =>
      ipcRenderer.invoke('app:plugins:lama:openInstallTerminal') as Promise<{ ok: boolean; error?: string }>,
  },
  project: {
    getMeta: (projectDir: string) => ipcRenderer.invoke('app:project:getMeta', projectDir),
    updateMeta: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateMeta', projectDir, data),
    getEpisodes: (projectDir: string) => ipcRenderer.invoke('app:project:getEpisodes', projectDir),
    createEpisode: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createEpisode', projectDir, data),
    updateEpisode: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateEpisode', projectDir, id, data),
    deleteEpisode: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteEpisode', projectDir, id),
    getScenes: (projectDir: string, episodeId?: string) =>
      ipcRenderer.invoke('app:project:getScenes', projectDir, episodeId),
    createScene: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createScene', projectDir, data),
    getLayers: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getLayers', projectDir, sceneId),
    createLayer: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createLayer', projectDir, data),
    updateLayer: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateLayer', projectDir, id, data),
    deleteLayer: (projectDir: string, layerId: string) =>
      ipcRenderer.invoke('app:project:deleteLayer', projectDir, layerId),
    getCameraLayer: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getCameraLayer', projectDir, sceneId),
    getCameraBlock: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getCameraBlock', projectDir, sceneId),
    getSceneContentDuration: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getSceneContentDuration', projectDir, sceneId),
    ensureCameraLayerAndBlock: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:ensureCameraLayerAndBlock', projectDir, sceneId),
    getSubtitleLayer: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getSubtitleLayer', projectDir, sceneId),
    getSubtitleBlock: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getSubtitleBlock', projectDir, sceneId),
    ensureSubtitleLayerAndBlock: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:ensureSubtitleLayerAndBlock', projectDir, sceneId),
    getScene: (projectDir: string, sceneId: string) =>
      ipcRenderer.invoke('app:project:getScene', projectDir, sceneId),
    updateScene: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateScene', projectDir, id, data),
    getTimelineBlocks: (projectDir: string, layerId: string) =>
      ipcRenderer.invoke('app:project:getTimelineBlocks', projectDir, layerId),
    getTimelineBlockById: (projectDir: string, blockId: string) =>
      ipcRenderer.invoke('app:project:getTimelineBlockById', projectDir, blockId),
    createTimelineBlock: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createTimelineBlock', projectDir, data),
    updateTimelineBlock: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateTimelineBlock', projectDir, id, data),
    deleteTimelineBlock: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteTimelineBlock', projectDir, id),
    insertBlockAtMainTrack: (projectDir: string, sceneId: string, data: unknown) =>
      ipcRenderer.invoke('app:project:insertBlockAtMainTrack', projectDir, sceneId, data),
    insertBlockAtAudioTrack: (projectDir: string, sceneId: string, data: unknown) =>
      ipcRenderer.invoke('app:project:insertBlockAtAudioTrack', projectDir, sceneId, data),
    moveBlockToMainTrack: (projectDir: string, sceneId: string, blockId: string, insertAt: number) =>
      ipcRenderer.invoke('app:project:moveBlockToMainTrack', projectDir, sceneId, blockId, insertAt),
    reorderMainTrack: (projectDir: string, sceneId: string, blockIds: string[]) =>
      ipcRenderer.invoke('app:project:reorderMainTrack', projectDir, sceneId, blockIds),
    resizeTimelineBlockWithCascade: (projectDir: string, blockId: string, newEndTime: number) =>
      ipcRenderer.invoke('app:project:resizeTimelineBlockWithCascade', projectDir, blockId, newEndTime),
    getKeyframes: (projectDir: string, blockId?: string) =>
      ipcRenderer.invoke('app:project:getKeyframes', projectDir, blockId),
    createKeyframe: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createKeyframe', projectDir, data),
    updateKeyframe: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateKeyframe', projectDir, id, data),
    deleteKeyframe: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteKeyframe', projectDir, id),
    getCharacters: (projectDir: string) => ipcRenderer.invoke('app:project:getCharacters', projectDir),
    getOrCreateStandaloneSpritesCharacter: (projectDir: string) =>
      ipcRenderer.invoke('app:project:getOrCreateStandaloneSpritesCharacter', projectDir),
    getOrCreateStandaloneComponentsCharacter: (projectDir: string) =>
      ipcRenderer.invoke('app:project:getOrCreateStandaloneComponentsCharacter', projectDir),
    createCharacter: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:createCharacter', projectDir, data),
    updateCharacter: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateCharacter', projectDir, id, data),
    deleteCharacter: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteCharacter', projectDir, id),
    getAiConfig: (projectDir: string) => ipcRenderer.invoke('app:project:getAiConfig', projectDir),
    saveAiConfig: (projectDir: string, data: unknown) =>
      ipcRenderer.invoke('app:project:saveAiConfig', projectDir, data),
    getAssets: (projectDir: string, type?: string) => ipcRenderer.invoke('app:project:getAssets', projectDir, type),
    getAssetsByUiCategory: (
      projectDir: string,
      uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound'
    ) => ipcRenderer.invoke('app:project:getAssetsByUiCategory', projectDir, uiCategory),
    getBundledAssetIds: (projectDir: string) => ipcRenderer.invoke('app:project:getBundledAssetIds', projectDir),
    getAssetBundlesByUiCategory: (
      projectDir: string,
      uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound'
    ) => ipcRenderer.invoke('app:project:getAssetBundlesByUiCategory', projectDir, uiCategory),
    getAssetBundleById: (projectDir: string, bundleId: string) =>
      ipcRenderer.invoke('app:project:getAssetBundleById', projectDir, bundleId),
    getAssetBundleMembersOrdered: (projectDir: string, bundleId: string) =>
      ipcRenderer.invoke('app:project:getAssetBundleMembersOrdered', projectDir, bundleId),
    getAssetBundleForAsset: (projectDir: string, assetId: string) =>
      ipcRenderer.invoke('app:project:getAssetBundleForAsset', projectDir, assetId),
    createAssetBundle: (projectDir: string, data: { title?: string; tags?: string | null; is_favorite?: number; memberAssetIds: string[]; cover_path?: string | null }) =>
      ipcRenderer.invoke('app:project:createAssetBundle', projectDir, data),
    updateAssetBundle: (
      projectDir: string,
      bundleId: string,
      data: { title?: string; tags?: string | null; is_favorite?: number; cover_path?: string | null }
    ) => ipcRenderer.invoke('app:project:updateAssetBundle', projectDir, bundleId, data),
    deleteAssetBundle: (projectDir: string, bundleId: string) =>
      ipcRenderer.invoke('app:project:deleteAssetBundle', projectDir, bundleId),
    addAssetBundleMember: (projectDir: string, bundleId: string, assetId: string) =>
      ipcRenderer.invoke('app:project:addAssetBundleMember', projectDir, bundleId, assetId),
    removeAssetBundleMember: (projectDir: string, bundleId: string, assetId: string) =>
      ipcRenderer.invoke('app:project:removeAssetBundleMember', projectDir, bundleId, assetId),
    reorderAssetBundleMembers: (projectDir: string, bundleId: string, orderedAssetIds: string[]) =>
      ipcRenderer.invoke('app:project:reorderAssetBundleMembers', projectDir, bundleId, orderedAssetIds),
    addSimilarAssetToBundle: (projectDir: string, existingAssetId: string, newAssetId: string) =>
      ipcRenderer.invoke('app:project:addSimilarAssetToBundle', projectDir, existingAssetId, newAssetId),
    getAssetById: (projectDir: string, id: string) => ipcRenderer.invoke('app:project:getAssetById', projectDir, id),
    extractVideoFrameToDataUrl: (
      projectDir: string,
      relativePath: string,
      timeSeconds: number,
      preserveAlpha?: boolean
    ) => ipcRenderer.invoke('app:project:extractVideoFrameToDataUrl', projectDir, relativePath, timeSeconds, preserveAlpha),
    getVideoMetadata: (projectDir: string, relativePath: string) =>
      ipcRenderer.invoke('app:project:getVideoMetadata', projectDir, relativePath),
    saveAssetFromFile: (projectDir: string, sourcePath: string, type?: string, options?: { description?: string | null; is_favorite?: number; tags?: string | null }) =>
      ipcRenderer.invoke('app:project:saveAssetFromFile', projectDir, sourcePath, type, options),
    saveTransparentVideoAsset: (
      projectDir: string,
      sourcePath: string,
      color: 'auto' | 'black' | 'green' | 'purple',
      options?: { description?: string | null; is_favorite?: number; tags?: string | null; tolerance?: number; contiguous?: boolean }
    ) => ipcRenderer.invoke('app:project:saveTransparentVideoAsset', projectDir, sourcePath, color, options),
    reprocessTransparentVideo: (
      projectDir: string,
      assetId: string,
      color: 'auto' | 'black' | 'green' | 'purple',
      options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
    ) => ipcRenderer.invoke('app:project:reprocessTransparentVideo', projectDir, assetId, color, options),
    processSingleFrameColorkey: (
      projectDir: string,
      videoPath: string,
      frameTime: number,
      color: 'auto' | 'black' | 'green' | 'purple',
      options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
    ) => ipcRenderer.invoke('app:project:processSingleFrameColorkey', projectDir, videoPath, frameTime, color, options),
    saveAssetFromBase64: (projectDir: string, base64Data: string, ext?: string, type?: string, options?: { replaceAssetId?: string }) =>
      ipcRenderer.invoke('app:project:saveAssetFromBase64', projectDir, base64Data, ext, type, options),
    updateAsset: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateAsset', projectDir, id, data),
    deleteAsset: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteAsset', projectDir, id),
    getAssetDataUrl: (projectDir: string, relativePath: string) =>
      ipcRenderer.invoke('app:project:getAssetDataUrl', projectDir, relativePath),
    getTextGadgetPresets: () => ipcRenderer.invoke('app:project:getTextGadgetPresets'),
    getTextGadgetConfig: (presetId: string) => ipcRenderer.invoke('app:project:getTextGadgetConfig', presetId),
    getParticlesGadgetPresets: () => ipcRenderer.invoke('app:project:getParticlesGadgetPresets'),
    getParticlesGadgetConfig: (presetId: string) => ipcRenderer.invoke('app:project:getParticlesGadgetConfig', presetId),
    getSpriteBackgroundColor: (projectDir: string, relativePath: string) =>
      ipcRenderer.invoke('app:project:getSpriteBackgroundColor', projectDir, relativePath),
    getSpriteFrames: (
      projectDir: string,
      relativePath: string,
      background: { r: number; g: number; b: number; a: number } | null,
      options?: { backgroundThreshold?: number; minGapPixels?: number; useTransparentBackground?: boolean }
    ) => ipcRenderer.invoke('app:project:getSpriteFrames', projectDir, relativePath, background, options),
    extractSpriteCover: (
      projectDir: string,
      relativePath: string,
      frame: { x: number; y: number; width: number; height: number }
    ) => ipcRenderer.invoke('app:project:extractSpriteCover', projectDir, relativePath, frame),
    matteImageForContour: (
      projectDir: string,
      relativePath: string,
      options?: { mattingModel?: string; downsampleRatio?: number }
    ) => ipcRenderer.invoke('app:project:matteImageForContour', projectDir, relativePath, options),
    matteImageAndSave: (
      projectDir: string,
      relativePath: string,
      options?: { mattingModel?: string; downsampleRatio?: number; replaceAssetId?: string }
    ) => ipcRenderer.invoke('app:project:matteImageAndSave', projectDir, relativePath, options),
    matteImageFromDataUrl: (dataUrl: string, options?: { mattingModel?: string; downsampleRatio?: number }) =>
      ipcRenderer.invoke('app:project:matteImageFromDataUrl', dataUrl, options) as Promise<{
        ok: boolean;
        dataUrl?: string;
        error?: string;
      }>,
    processSpriteWithOnnx: (
      projectDir: string,
      relativePath: string,
      options?: { frameCount?: number; cellSize?: number; spacing?: number }
    ) =>
      ipcRenderer.invoke('app:project:processSpriteWithOnnx', projectDir, relativePath, options),
    exportSpriteSheet: (projectDir: string, item: unknown) =>
      ipcRenderer.invoke('app:project:exportSpriteSheet', projectDir, item),
    importSpriteSheet: (projectDir: string, zipPath: string) =>
      ipcRenderer.invoke('app:project:importSpriteSheet', projectDir, zipPath),
    videoToSpriteExtract: (projectDir: string, videoRelativePath: string, options: { mode: 'scene' | 'uniform'; sceneThreshold?: number; totalFrames?: number }) =>
      ipcRenderer.invoke('app:project:videoToSpriteExtract', projectDir, videoRelativePath, options),
    videoToSpriteSave: (projectDir: string, videoRelativePath: string) =>
      ipcRenderer.invoke('app:project:videoToSpriteSave', projectDir, videoRelativePath),
    getPackages: (projectDir: string) => ipcRenderer.invoke('app:project:getPackages', projectDir),
    getExportsPath: (projectDir: string) => ipcRenderer.invoke('app:project:getExportsPath', projectDir),
    /** 导出视频（见开发计划 2.13）；onProgress 可选，用于进度回调 */
    exportVideo: (
      projectDir: string,
      sceneId: string,
      options: { width: number; height: number; fps: number; outputDir?: string },
      onProgress?: (p: { phase: string; percent: number; message?: string }) => void
    ) => {
      if (onProgress) {
        const handler = (_: unknown, p: { phase: string; percent: number; message?: string }) => onProgress(p);
        ipcRenderer.on('app:project:exportVideo:progress', handler);
        return ipcRenderer
          .invoke('app:project:exportVideo', projectDir, sceneId, options)
          .finally(() => ipcRenderer.removeListener('app:project:exportVideo:progress', handler));
      }
      return ipcRenderer.invoke('app:project:exportVideo', projectDir, sceneId, options);
    },
  },
  /** 小说编剧 */
  novel: {
    list: () => ipcRenderer.invoke('app:novel:list') as Promise<Array<{
      id: string; title: string; genres: string[];
      coverDataUrl?: string | null; electronProjectId?: string | null;
      updatedAt: string; createdAt: string;
    }>>,
    upsert: (item: {
      id: string; title: string; genres: string[]; coverDataUrl?: string | null;
      electronProjectId?: string | null; createdAt?: string; updatedAt?: string;
    }) => ipcRenderer.invoke('app:novel:upsert', item),
    delete: (id: string) => ipcRenderer.invoke('app:novel:delete', id) as Promise<{ ok: boolean }>,

    getEpisodes: (novelId: string) => ipcRenderer.invoke('app:novel:getEpisodes', novelId) as Promise<Array<{
      id: string; novelId: string; title: string; episode?: number | null;
      contentMarkdown: string; order: number; updatedAt: string;
    }>>,
    getWorkspaceMeta: (novelId: string) => ipcRenderer.invoke('app:novel:getWorkspaceMeta', novelId) as Promise<{
      novelId: string; title: string; activeEpisodeId: string;
      remountVersions: Record<string, number>; updatedAt: string;
    } | null>,
    upsertEpisode: (ep: {
      id: string; novelId: string; title: string; episode?: number | null;
      contentMarkdown?: string; order: number; updatedAt: string;
    }) => ipcRenderer.invoke('app:novel:upsertEpisode', ep),
    deleteEpisode: (novelId: string, episodeId: string) =>
      ipcRenderer.invoke('app:novel:deleteEpisode', novelId, episodeId),
    saveWorkspaceMeta: (meta: {
      novelId: string; title?: string; activeEpisodeId: string;
      remountVersions: Record<string, number>; updatedAt: string;
    }) => ipcRenderer.invoke('app:novel:saveWorkspaceMeta', meta),
    replaceAllEpisodes: (novelId: string, episodes: Array<{
      id: string; novelId: string; title: string; episode?: number | null;
      contentMarkdown: string; order: number; updatedAt: string;
    }>) => ipcRenderer.invoke('app:novel:replaceAllEpisodes', novelId, episodes),

    // 故事雏形收藏
    favorites: {
      list: () => ipcRenderer.invoke('app:novel:favorites:list') as Promise<Array<{
        id: string; seedUuid?: string | null; title: string; content: string;
        sourceConversationKey?: string | null; createdAt: string;
      }>>,
      insert: (item: {
        id: string; seedUuid?: string | null; title: string; content: string;
        sourceConversationKey?: string | null; createdAt: string;
      }) => ipcRenderer.invoke('app:novel:favorites:insert', item),
      delete: (id: string) => ipcRenderer.invoke('app:novel:favorites:delete', id) as Promise<{ ok: boolean }>,
      deleteBySeedUuid: (seedUuid: string) => ipcRenderer.invoke('app:novel:favorites:deleteBySeedUuid', seedUuid) as Promise<{ ok: boolean }>,
      getBySeedUuid: (seedUuid: string) => ipcRenderer.invoke('app:novel:favorites:getBySeedUuid', seedUuid) as Promise<{
        id: string; seedUuid?: string | null; title: string; content: string;
        sourceConversationKey?: string | null; createdAt: string;
      } | null>,
      replaceAll: (items: Array<{
        id: string; seedUuid?: string | null; title: string; content: string;
        sourceConversationKey?: string | null; createdAt: string;
      }>) => ipcRenderer.invoke('app:novel:favorites:replaceAll', items),
    },

    // 大纲收藏
    outlineFavorites: {
      list: () => ipcRenderer.invoke('app:novel:outlineFavorites:list') as Promise<Array<{
        id: string; outlineUuid?: string | null; title: string; prose: string;
        panel: { storyName?: string; source: string; summary: string };
        fullContent?: string; favoriteAppendix?: string;
        sourceConversationKey?: string | null; createdAt: string;
      }>>,
      insert: (item: {
        id: string; outlineUuid?: string | null; title: string; prose: string;
        panelStoryName?: string | null; panelSource?: string; panelSummary?: string;
        fullContent?: string | null; favoriteAppendix?: string | null;
        sourceConversationKey?: string | null; createdAt: string;
      }) => ipcRenderer.invoke('app:novel:outlineFavorites:insert', item),
      delete: (id: string) => ipcRenderer.invoke('app:novel:outlineFavorites:delete', id) as Promise<{ ok: boolean }>,
      deleteByOutlineUuid: (outlineUuid: string) => ipcRenderer.invoke('app:novel:outlineFavorites:deleteByOutlineUuid', outlineUuid) as Promise<{ ok: boolean }>,
      getByOutlineUuid: (outlineUuid: string) => ipcRenderer.invoke('app:novel:outlineFavorites:getByOutlineUuid', outlineUuid) as Promise<{
        id: string; outlineUuid?: string | null; title: string; prose: string;
        panel: { storyName?: string; source: string; summary: string };
        fullContent?: string; favoriteAppendix?: string;
        sourceConversationKey?: string | null; createdAt: string;
      } | null>,
    },
  },
  /** 本地 TTS */
  localTts: {
    /** 获取已注册的本地 TTS 模型列表 */
    listModels: () =>
      ipcRenderer.invoke('app:tts:local:models') as Promise<{
        models?: Array<{ id: string; name: string }>;
      }>,
    /** 健康检查（可选指定 modelId，默认当前设置里的 modelKey） */
    healthCheck: (modelId?: string) =>
      ipcRenderer.invoke('app:tts:local:health', modelId) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    /** 执行 TTS 合成，返回 audio base64 */
    run: (payload: { modelId: string; text: string; options?: Record<string, unknown> }) =>
      ipcRenderer.invoke('app:tts:local:run', payload) as Promise<
        | { ok: true; audioBase64: string; format: string }
        | { ok: false; message: string }
      >,
  },
};

contextBridge.exposeInMainWorld('yiman', api);

export type YimanAPI = typeof api;
