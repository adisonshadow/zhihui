/**
 * 预加载脚本：仅通过 contextBridge 暴露约定 API（见技术文档 7、开发计划 2.1）
 * 禁止暴露 Node/Electron 全量。
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  projects: {
    list: () => ipcRenderer.invoke('app:projects:list'),
    create: (payload: {
      id: string;
      name: string;
      landscape: number;
      project_dir: string;
      cover_path?: string | null;
    }) => ipcRenderer.invoke('app:projects:create', payload),
    delete: (id: string, deleteOnDisk: boolean) =>
      ipcRenderer.invoke('app:projects:delete', id, deleteOnDisk),
    import: (projectDir: string) => ipcRenderer.invoke('app:projects:import', projectDir),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('app:dialog:openDirectory'),
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('app:dialog:openFile', options),
  },
  fs: {
    pathExists: (p: string) => ipcRenderer.invoke('app:fs:pathExists', p),
  },
  shell: {
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('app:shell:showItemInFolder', fullPath),
    openPath: (path: string) => ipcRenderer.invoke('app:shell:openPath', path),
  },
  settings: {
    get: () => ipcRenderer.invoke('app:settings:get'),
    save: (data: unknown) => ipcRenderer.invoke('app:settings:save', data),
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
    moveBlockToMainTrack: (projectDir: string, sceneId: string, blockId: string, insertAt: number) =>
      ipcRenderer.invoke('app:project:moveBlockToMainTrack', projectDir, sceneId, blockId, insertAt),
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
    getAssetById: (projectDir: string, id: string) => ipcRenderer.invoke('app:project:getAssetById', projectDir, id),
    saveAssetFromFile: (projectDir: string, sourcePath: string, type?: string, options?: { description?: string | null; is_favorite?: number }) =>
      ipcRenderer.invoke('app:project:saveAssetFromFile', projectDir, sourcePath, type, options),
    updateAsset: (projectDir: string, id: string, data: unknown) =>
      ipcRenderer.invoke('app:project:updateAsset', projectDir, id, data),
    deleteAsset: (projectDir: string, id: string) =>
      ipcRenderer.invoke('app:project:deleteAsset', projectDir, id),
    getAssetDataUrl: (projectDir: string, relativePath: string) =>
      ipcRenderer.invoke('app:project:getAssetDataUrl', projectDir, relativePath),
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
};

contextBridge.exposeInMainWorld('yiman', api);

export type YimanAPI = typeof api;
