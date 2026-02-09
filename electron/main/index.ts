/**
 * 芝绘 - Electron 主进程入口
 * 见技术文档 7、开发计划 2.1
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initAppDb, getProjects, createProject, deleteProject, importProject } from './db';
import { loadAISettings, saveAISettings, type AISettings } from './settings';
import {
  initProjectDb,
  getProjectMeta,
  updateProjectMeta,
  getEpisodes,
  createEpisode,
  updateEpisode,
  deleteEpisode,
  getScenes,
  createScene,
  getLayers,
  createLayer,
  updateLayer,
  deleteLayer,
  getScene,
  updateScene,
  getTimelineBlocks,
  getTimelineBlockById,
  getKeyframes,
  createKeyframe,
  updateKeyframe,
  deleteKeyframe,
  createTimelineBlock,
  updateTimelineBlock,
  deleteTimelineBlock,
  insertBlockAtMainTrack,
  moveBlockToMainTrack,
  resizeTimelineBlockWithCascade,
  getCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getAiConfig,
  saveAiConfig,
  getAssets,
  getAssetById,
  saveAssetFromFile,
  updateAsset,
  deleteAsset,
  getAssetDataUrl,
  getExportsPath,
} from './projectDb';
import { getPackages } from './projectPackages';
import { exportSceneVideo } from './exportService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 开发环境关闭硬件加速，避免 GPU 进程崩溃导致 MachPortRendezvous 等错误
if (process.env.NODE_ENV !== 'production') {
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  // preload 构建为 CommonJS，避免 ESM 下 require 未定义
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 开发时使用 Vite 提供的 dev server URL（见 vite-plugin-electron）
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initAppDb();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC：项目列表（见功能文档 2、技术文档 3.1）
ipcMain.handle('app:projects:list', async () => getProjects());
ipcMain.handle('app:projects:create', async (_, payload) => {
  // 新建项目：创建目录 + 初始化项目库 + 写入应用级列表（见开发计划 2.4）
  try {
    fs.mkdirSync(payload.project_dir, { recursive: true });
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)) };
  }
  const initRes = initProjectDb(payload.project_dir, {
    name: payload.name,
    landscape: payload.landscape ?? 1,
    cover_path: payload.cover_path ?? null,
  });
  if (!initRes.ok) return initRes;
  return createProject(payload);
});
ipcMain.handle('app:projects:delete', async (_, id: string, deleteOnDisk: boolean) =>
  deleteProject(id, deleteOnDisk)
);
// 导入项目：选择已有 project_dir，解析 project.db 的 meta 后加入列表（见功能文档 2）
ipcMain.handle('app:projects:import', async (_, projectDir: string) => {
  if (!projectDir?.trim()) return { ok: false, error: '请选择项目目录' };
  try {
    const meta = getProjectMeta(projectDir.trim());
    if (!meta) return { ok: false, error: '无法解析 project.db，导入失败' };
    return importProject(projectDir.trim(), {
      name: meta.name,
      landscape: meta.landscape,
      cover_path: meta.cover_path,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `无法解析 project.db，导入失败：${msg}` };
  }
});

// 选择目录、路径是否存在（见功能文档 2.3 无效路径）
ipcMain.handle('app:dialog:openDirectory', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0] ?? null;
});
// 选择图片文件（见开发计划 2.6 本地上传）
ipcMain.handle('app:dialog:openFile', async (_, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const filters = options?.filters ?? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }];
  const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0] ?? null;
});
ipcMain.handle('app:fs:pathExists', (_, p: string) => fs.existsSync(p));
ipcMain.handle('app:shell:showItemInFolder', (_, fullPath: string) => shell.showItemInFolder(fullPath));
ipcMain.handle('app:shell:openPath', (_: unknown, path: string) => shell.openPath(path));

// AI 供应商配置（见功能文档 3.1、开发计划 2.3）
ipcMain.handle('app:settings:get', () => loadAISettings());
ipcMain.handle('app:settings:save', (_, data: AISettings) => saveAISettings(data));

// 项目级数据（见技术文档 3.2、开发计划 2.4）
ipcMain.handle('app:project:getMeta', (_, projectDir: string) => getProjectMeta(projectDir));
ipcMain.handle('app:project:updateMeta', (_, projectDir: string, data: unknown) =>
  updateProjectMeta(projectDir, data as { name?: string; landscape?: number; cover_path?: string | null })
);
ipcMain.handle('app:project:getEpisodes', (_, projectDir: string) => getEpisodes(projectDir));
ipcMain.handle('app:project:createEpisode', (_, projectDir: string, data: unknown) => createEpisode(projectDir, data as Parameters<typeof createEpisode>[1]));
ipcMain.handle('app:project:updateEpisode', (_, projectDir: string, id: string, data: unknown) =>
  updateEpisode(projectDir, id, data as Parameters<typeof updateEpisode>[2])
);
ipcMain.handle('app:project:deleteEpisode', (_, projectDir: string, id: string) => deleteEpisode(projectDir, id));
ipcMain.handle('app:project:getScenes', (_, projectDir: string, episodeId?: string) => getScenes(projectDir, episodeId));
ipcMain.handle('app:project:createScene', (_, projectDir: string, data: unknown) => createScene(projectDir, data as Parameters<typeof createScene>[1]));
ipcMain.handle('app:project:getLayers', (_, projectDir: string, sceneId: string) => getLayers(projectDir, sceneId));
ipcMain.handle('app:project:createLayer', (_, projectDir: string, data: unknown) => createLayer(projectDir, data as Parameters<typeof createLayer>[1]));
ipcMain.handle('app:project:updateLayer', (_, projectDir: string, id: string, data: unknown) => updateLayer(projectDir, id, data as Parameters<typeof updateLayer>[2]));
ipcMain.handle('app:project:deleteLayer', (_, projectDir: string, layerId: string) => deleteLayer(projectDir, layerId));
ipcMain.handle('app:project:getScene', (_, projectDir: string, sceneId: string) => getScene(projectDir, sceneId));
ipcMain.handle('app:project:updateScene', (_, projectDir: string, id: string, data: unknown) => updateScene(projectDir, id, data as Parameters<typeof updateScene>[2]));
ipcMain.handle('app:project:getTimelineBlocks', (_, projectDir: string, layerId: string) => getTimelineBlocks(projectDir, layerId));
ipcMain.handle('app:project:getTimelineBlockById', (_, projectDir: string, blockId: string) => getTimelineBlockById(projectDir, blockId));
ipcMain.handle('app:project:createTimelineBlock', (_, projectDir: string, data: unknown) => createTimelineBlock(projectDir, data as Parameters<typeof createTimelineBlock>[1]));
ipcMain.handle('app:project:updateTimelineBlock', (_, projectDir: string, id: string, data: unknown) => updateTimelineBlock(projectDir, id, data as Parameters<typeof updateTimelineBlock>[2]));
ipcMain.handle('app:project:deleteTimelineBlock', (_, projectDir: string, id: string) => deleteTimelineBlock(projectDir, id));
ipcMain.handle('app:project:insertBlockAtMainTrack', (_, projectDir: string, sceneId: string, data: unknown) =>
  insertBlockAtMainTrack(projectDir, sceneId, data as Parameters<typeof insertBlockAtMainTrack>[2])
);
ipcMain.handle('app:project:moveBlockToMainTrack', (_, projectDir: string, sceneId: string, blockId: string, insertAt: number) =>
  moveBlockToMainTrack(projectDir, sceneId, blockId, insertAt)
);
ipcMain.handle('app:project:resizeTimelineBlockWithCascade', (_, projectDir: string, blockId: string, newEndTime: number) =>
  resizeTimelineBlockWithCascade(projectDir, blockId, newEndTime)
);
ipcMain.handle('app:project:getKeyframes', (_, projectDir: string, blockId?: string) => getKeyframes(projectDir, blockId));
ipcMain.handle('app:project:createKeyframe', (_, projectDir: string, data: unknown) => createKeyframe(projectDir, data as Parameters<typeof createKeyframe>[1]));
ipcMain.handle('app:project:updateKeyframe', (_, projectDir: string, id: string, data: unknown) =>
  updateKeyframe(projectDir, id, data as Parameters<typeof updateKeyframe>[2])
);
ipcMain.handle('app:project:deleteKeyframe', (_, projectDir: string, id: string) => deleteKeyframe(projectDir, id));
ipcMain.handle('app:project:getCharacters', (_, projectDir: string) => getCharacters(projectDir));
ipcMain.handle('app:project:createCharacter', (_, projectDir: string, data: unknown) => createCharacter(projectDir, data as Parameters<typeof createCharacter>[1]));
ipcMain.handle('app:project:updateCharacter', (_, projectDir: string, id: string, data: unknown) =>
  updateCharacter(projectDir, id, data as Parameters<typeof updateCharacter>[2])
);
ipcMain.handle('app:project:deleteCharacter', (_, projectDir: string, id: string) => deleteCharacter(projectDir, id));
ipcMain.handle('app:project:getAiConfig', (_, projectDir: string) => getAiConfig(projectDir));
ipcMain.handle('app:project:saveAiConfig', (_, projectDir: string, data: unknown) =>
  saveAiConfig(projectDir, data as Parameters<typeof saveAiConfig>[1])
);
ipcMain.handle('app:project:getAssets', (_, projectDir: string, type?: string) => getAssets(projectDir, type));
ipcMain.handle('app:project:getAssetById', (_, projectDir: string, id: string) => getAssetById(projectDir, id));
ipcMain.handle('app:project:saveAssetFromFile', (_, projectDir: string, sourcePath: string, type?: string, options?: { description?: string | null; is_favorite?: number }) =>
  saveAssetFromFile(projectDir, sourcePath, type ?? 'character', options)
);
ipcMain.handle('app:project:updateAsset', (_, projectDir: string, id: string, data: unknown) =>
  updateAsset(projectDir, id, data as Parameters<typeof updateAsset>[2])
);
ipcMain.handle('app:project:deleteAsset', (_, projectDir: string, id: string) => deleteAsset(projectDir, id));
ipcMain.handle('app:project:getAssetDataUrl', (_, projectDir: string, relativePath: string) =>
  getAssetDataUrl(projectDir, relativePath)
);
ipcMain.handle('app:project:getPackages', (_, projectDir: string) => getPackages(projectDir));
ipcMain.handle('app:project:getExportsPath', (_, projectDir: string) => getExportsPath(projectDir));

// 视频导出（见开发计划 2.13）；进度通过 event.sender 推送
ipcMain.handle(
  'app:project:exportVideo',
  async (
    event,
    projectDir: string,
    sceneId: string,
    options: { width: number; height: number; fps: number; outputDir?: string }
  ) => {
    const onProgress = (p: { phase: string; percent: number; message?: string }) => {
      event.sender.send('app:project:exportVideo:progress', p);
    };
    return exportSceneVideo(projectDir, sceneId, options, onProgress);
  }
);
