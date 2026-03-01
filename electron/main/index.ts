/**
 * 芝绘 - Electron 主进程入口
 * 见技术文档 7、开发计划 2.1
 * AI 模型服务（MVANet、BiRefNet）以独立 HTTP 子进程运行，隔离内存压力
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
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
  insertBlockAtAudioTrack,
  moveBlockToMainTrack,
  reorderMainTrack,
  resizeTimelineBlockWithCascade,
  getCharacters,
  getOrCreateStandaloneSpritesCharacter,
  getOrCreateStandaloneComponentsCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getAiConfig,
  saveAiConfig,
  getAssets,
  getAssetById,
  saveAssetFromFile,
  saveAssetFromBase64,
  updateAsset,
  deleteAsset,
  getAssetDataUrl,
  getExportsPath,
  getAssetsPath,
} from './projectDb';
import { getPackages } from './projectPackages';
import { exportSceneVideo } from './exportService';
import { extractVideoFrame, getVideoMetadata } from './videoCoverService';
import { processTransparentVideo, type ChromaKeyColor } from './transparentVideoService';
import { getSpriteBackgroundColor, getSpriteFrames, extractSpriteCoverToTemp } from './spriteService';
import { processSpriteWithOnnx, matteImageForContour, matteImageAndSave } from './spriteOnnxService';
import { exportSpriteSheetToZip, importSpriteSheetFromZip } from './spriteSheetExportService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// AI 模型服务独立进程模式：仅启动 HTTP API，不启动主窗口（回退路径，Node 版优先）
const isAiModelServer = process.argv.includes('--ai-model-server');
if (isAiModelServer) {
  const { startServer } = await import('../ai-model-service/server.js');
  await startServer();
  // 服务保持运行，不退出
} else {
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
    // 开发时自动打开 DevTools，便于查看白屏原因（控制台错误、网络等）
    if (isDev) mainWindow?.webContents.openDevTools();
  });

  // 开发时使用 Vite 提供的 dev server URL（见 vite-plugin-electron）
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    if (isDev && !devUrl) {
      console.error('[Electron] VITE_DEV_SERVER_URL 未设置，无法加载开发页面');
    }
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[Electron] 页面加载失败:', { code, desc, url });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let aiModelServerProcess: ReturnType<typeof spawn> | null = null;
const AIMODEL_PORT = 19815;

app.whenReady().then(async () => {
  await initAppDb();
  // 启动 AI 模型服务子进程（纯 Node 优先，无 Electron/Dock 图标；否则回退到 Electron 子进程）
  const serverScript = path.join(__dirname, '../ai-server/index.js');
  const useNodeServer = fs.existsSync(serverScript);
  const spawnCwd = path.join(__dirname, '../../'); // 项目根，便于 node 解析 node_modules
  aiModelServerProcess = useNodeServer
    ? spawn('node', [serverScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, AIMODEL_PORT: String(AIMODEL_PORT) },
        cwd: spawnCwd,
      })
    : spawn(process.execPath, [path.join(__dirname, 'index.js'), '--ai-model-server'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, AIMODEL_PORT: String(AIMODEL_PORT) },
      });
  aiModelServerProcess.stdout?.on('data', (c) => {
    const s = c.toString().trim();
    if (s.startsWith('{')) {
      try {
        const j = JSON.parse(s);
        if (j.ready) console.log('[AI Model Service] 就绪，端口', j.port);
      } catch {
        /* ignore */
      }
    }
  });
  // 等待服务就绪（最多 10 秒）
  const { pingMattingService } = await import('../ai-model-service/client.js');
  for (let i = 0; i < 50; i++) {
    if (await pingMattingService()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  aiModelServerProcess.on('error', (e) => console.error('[AI Model Service] 启动失败:', e));
  aiModelServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) console.warn('[AI Model Service] 子进程退出:', code);
    aiModelServerProcess = null;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (aiModelServerProcess) {
    aiModelServerProcess.kill();
    aiModelServerProcess = null;
  }
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
ipcMain.handle('app:dialog:saveFile', async (_, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showSaveDialog(win!, {
    defaultPath: options?.defaultPath,
    filters: options?.filters ?? [{ name: 'ZIP 包', extensions: ['zip'] }],
  });
  return r.canceled ? null : r.filePath ?? null;
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
ipcMain.handle('app:project:insertBlockAtAudioTrack', (_, projectDir: string, sceneId: string, data: unknown) =>
  insertBlockAtAudioTrack(projectDir, sceneId, data as Parameters<typeof insertBlockAtAudioTrack>[2])
);
ipcMain.handle('app:project:moveBlockToMainTrack', (_, projectDir: string, sceneId: string, blockId: string, insertAt: number) =>
  moveBlockToMainTrack(projectDir, sceneId, blockId, insertAt)
);
ipcMain.handle('app:project:reorderMainTrack', (_, projectDir: string, sceneId: string, blockIds: string[]) =>
  reorderMainTrack(projectDir, sceneId, blockIds)
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
ipcMain.handle('app:project:getOrCreateStandaloneSpritesCharacter', (_, projectDir: string) =>
  getOrCreateStandaloneSpritesCharacter(projectDir)
);
ipcMain.handle('app:project:getOrCreateStandaloneComponentsCharacter', (_, projectDir: string) =>
  getOrCreateStandaloneComponentsCharacter(projectDir)
);
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
ipcMain.handle(
  'app:project:saveAssetFromFile',
  async (
    _,
    projectDir: string,
    sourcePath: string,
    type?: string,
    options?: { description?: string | null; is_favorite?: number }
  ) => {
    const res = saveAssetFromFile(projectDir, sourcePath, type ?? 'character', options);
    if (!res.ok || !res.id || !res.path) return res;
    const t = type ?? 'character';
    if (t !== 'video' && t !== 'transparent_video') return res;
    const ext = path.extname(sourcePath).toLowerCase();
    if (!['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) return res;
    const savedFullPath = path.join(projectDir, res.path);
    try {
      const meta = await getVideoMetadata(savedFullPath);
      if (meta.ok && (meta.duration != null || meta.width != null || meta.height != null)) {
        updateAsset(projectDir, res.id, {
          duration: meta.duration ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
        });
      }
    } catch {
      /* 元数据提取失败不影响主流程 */
    }
    try {
      const tmpCover = path.join(os.tmpdir(), `yiman_video_cover_${Date.now()}.png`);
      const frameRes = await extractVideoFrame(sourcePath, tmpCover, 0.5);
      if (!frameRes.ok || !frameRes.path) return res;
      try {
        const assetsDir = getAssetsPath(projectDir);
        const coverFileName = `${res.id}_cover.png`;
        const coverFullPath = path.join(assetsDir, coverFileName);
        fs.copyFileSync(frameRes.path, coverFullPath);
        const coverRelative = `assets/${coverFileName}`;
        updateAsset(projectDir, res.id, { cover_path: coverRelative });
      } finally {
        try {
          fs.unlinkSync(tmpCover);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* 封面提取失败不影响主流程 */
    }
    return res;
  }
);
ipcMain.handle('app:project:saveAssetFromBase64', (_, projectDir: string, base64Data: string, ext?: string, type?: string, options?: { replaceAssetId?: string }) =>
  saveAssetFromBase64(projectDir, base64Data, ext ?? '.png', type ?? 'character', options)
);
ipcMain.handle('app:project:updateAsset', (_, projectDir: string, id: string, data: unknown) =>
  updateAsset(projectDir, id, data as Parameters<typeof updateAsset>[2])
);
ipcMain.handle('app:project:deleteAsset', (_, projectDir: string, id: string) => deleteAsset(projectDir, id));
ipcMain.handle('app:project:getAssetDataUrl', (_, projectDir: string, relativePath: string) =>
  getAssetDataUrl(projectDir, relativePath)
);
ipcMain.handle(
  'app:project:saveTransparentVideoAsset',
  async (
    _,
    projectDir: string,
    sourcePath: string,
    color: ChromaKeyColor,
    options?: { description?: string | null; is_favorite?: number; tags?: string | null }
  ) => {
    const proc = await processTransparentVideo(sourcePath, color);
    if (!proc.ok || !proc.path) return { ok: false, error: proc.error ?? '抠图处理失败' };
    const tempPath = proc.path;
    try {
      const res = saveAssetFromFile(projectDir, tempPath, 'transparent_video', options);
      if (!res.ok || !res.id || !res.path) return res;
      try {
        const savedFullPath = path.join(projectDir, res.path);
        const meta = await getVideoMetadata(savedFullPath);
        if (meta.ok && (meta.duration != null || meta.width != null || meta.height != null)) {
          updateAsset(projectDir, res.id, {
            duration: meta.duration ?? null,
            width: meta.width ?? null,
            height: meta.height ?? null,
          });
        }
      } catch {
        /* 元数据提取失败不影响主流程 */
      }
      try {
        const tmpCover = path.join(os.tmpdir(), `yiman_video_cover_${Date.now()}.png`);
        const frameRes = await extractVideoFrame(tempPath, tmpCover, 0.5);
        if (frameRes.ok && frameRes.path) {
          try {
            const assetsDir = getAssetsPath(projectDir);
            const coverFileName = `${res.id}_cover.png`;
            const coverFullPath = path.join(assetsDir, coverFileName);
            fs.copyFileSync(frameRes.path, coverFullPath);
            const coverRelative = `assets/${coverFileName}`;
            updateAsset(projectDir, res.id, { cover_path: coverRelative });
          } finally {
            try {
              fs.unlinkSync(tmpCover);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* 封面提取失败不影响主流程 */
      }
      return res;
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }
  }
);
ipcMain.handle('app:project:getPackages', (_, projectDir: string) => getPackages(projectDir));
ipcMain.handle('app:project:getExportsPath', (_, projectDir: string) => getExportsPath(projectDir));
ipcMain.handle('app:project:getSpriteBackgroundColor', (_, projectDir: string, relativePath: string) =>
  getSpriteBackgroundColor(projectDir, relativePath)
);
ipcMain.handle(
  'app:project:getSpriteFrames',
  (
    _,
    projectDir: string,
    relativePath: string,
    background: { r: number; g: number; b: number; a: number } | null,
    options?: { backgroundThreshold?: number; minGapPixels?: number; useTransparentBackground?: boolean }
  ) => getSpriteFrames(projectDir, relativePath, background, options)
);

ipcMain.handle(
  'app:project:extractSpriteCover',
  async (
    _,
    projectDir: string,
    relativePath: string,
    frame: { x: number; y: number; width: number; height: number }
  ) => {
    const res = await extractSpriteCoverToTemp(projectDir, relativePath, frame);
    if (!res.ok || !res.tempPath) return res;
    try {
      const saveRes = saveAssetFromFile(projectDir, res.tempPath, 'character');
      try {
        fs.unlinkSync(res.tempPath);
      } catch {
        /* ignore */
      }
      return saveRes;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
);

ipcMain.handle('app:project:matteImageForContour', async (_, projectDir: string, relativePath: string) => {
  return matteImageForContour(projectDir, relativePath);
});

ipcMain.handle('app:project:matteImageAndSave', async (_, projectDir: string, relativePath: string, options?: { mattingModel?: string; downsampleRatio?: number; replaceAssetId?: string }) => {
  return matteImageAndSave(projectDir, relativePath, options);
});

ipcMain.handle(
  'app:project:processSpriteWithOnnx',
  async (
    _,
    projectDir: string,
    relativePath: string,
    options?: { frameCount?: number; cellSize?: number; spacing?: number; downsampleRatio?: number; forceRvm?: boolean; mattingModel?: string; u2netpAlphaMatting?: boolean }
  ) => {
    const res = await processSpriteWithOnnx(projectDir, relativePath, options);
    if (!res.ok || !res.path || !res.frames) return res;
    try {
      const saveRes = saveAssetFromFile(projectDir, res.path, 'character');
      try {
        fs.unlinkSync(res.path);
      } catch {
        /* ignore temp cleanup */
      }
      if (!saveRes.ok || !saveRes.path) {
        return { ok: false, error: saveRes.error ?? '保存失败' };
      }
      let cover_path: string | undefined;
      if (res.coverPath) {
        try {
          const coverRes = saveAssetFromFile(projectDir, res.coverPath, 'character');
          try {
            fs.unlinkSync(res.coverPath);
          } catch {
            /* ignore */
          }
          if (coverRes.ok && coverRes.path) cover_path = coverRes.path;
        } catch {
          /* 封面保存失败不影响主流程 */
        }
      }
      return { ok: true, path: saveRes.path, frames: res.frames, cover_path };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
);

ipcMain.handle(
  'app:project:exportSpriteSheet',
  async (
    _,
    projectDir: string,
    item: { id: string; name?: string; image_path: string; cover_path?: string; frame_count?: number; frames?: unknown[]; chroma_key?: string; background_color?: unknown; matting_model?: string; playback_fps?: number }
  ) => {
    const savePath = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || mainWindow!, {
      defaultPath: `${item.name || '精灵动作'}.zip`,
      filters: [{ name: 'ZIP 包', extensions: ['zip'] }],
    });
    if (!savePath.filePath) return { ok: false, error: '已取消' };
    return exportSpriteSheetToZip(projectDir, item, savePath.filePath);
  }
);

ipcMain.handle('app:project:importSpriteSheet', async (_, projectDir: string, zipPath: string) => {
  return importSpriteSheetFromZip(projectDir, zipPath);
});

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
}
