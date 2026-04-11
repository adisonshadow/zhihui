/**
 * 芝绘 - Electron 主进程入口
 * 见技术文档 7、开发计划 2.1
 * AI 模型服务（MVANet、BiRefNet）以独立 HTTP 子进程运行，隔离内存压力
 */
import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
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
  getCameraLayer,
  getCameraBlock,
  getSceneContentDuration,
  ensureCameraLayerAndBlock,
  getSubtitleLayer,
  getSubtitleBlock,
  ensureSubtitleLayerAndBlock,
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
  getAssetsByUiCategory,
  getAssetById,
  saveAssetFromFile,
  saveAssetFromBase64,
  updateAsset,
  deleteAsset,
  getAssetDataUrl,
  getExportsPath,
  getAssetsPath,
  getBundledAssetIds,
  getAssetBundlesByUiCategory,
  getAssetBundleById,
  getAssetBundleMembersOrdered,
  getAssetBundleForAsset,
  createAssetBundle,
  updateAssetBundle,
  deleteAssetBundle,
  addAssetBundleMember,
  removeAssetBundleMember,
  reorderAssetBundleMembers,
  addSimilarAssetToBundle,
} from './projectDb';
import { getPackages } from './projectPackages';
import { exportSceneVideo } from './exportService';
import { extractVideoFrame, getVideoMetadata } from './videoCoverService';
import { processTransparentVideo, processSingleFrameColorkey, type ChromaKeyColor } from './transparentVideoService';
import { getSpriteBackgroundColor, getSpriteFrames, extractSpriteCoverToTemp } from './spriteService';
import { processSpriteWithOnnx, matteImageForContour, matteImageAndSave } from './spriteOnnxService';
import { exportSpriteSheetToZip, importSpriteSheetFromZip } from './spriteSheetExportService';
import { getTextGadgetPresets, getTextGadgetConfig } from './textGadgetService';
import { getParticlesGadgetPresets, getParticlesGadgetConfig } from './particlesGadgetService';
import { getSystemFonts, getSystemFontFaces } from './fontService';
import { extractKeyFrames, extractFramesUniform, keyFramesToDataUrls, generateSpriteSheet, cleanupDir } from './videoToSpriteService';
import { ensureLamaCleanerRunning, openLamaCleanerInstallTerminal } from './lamaCleanerHost';
import { fetchVolcTosImageAsDataUrl } from './volcTosImageFetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 图片编辑器：dataUrl → 临时 PNG → matteImageForContour（与 app:editor 命名相比统一走 app:project 注册点） */
async function handleMatteImageFromDataUrl(
  _: unknown,
  dataUrl: string,
  options?: { mattingModel?: string; downsampleRatio?: number }
): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  try {
    const trimmed = dataUrl.trim();
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(trimmed);
    const base64 = m ? m[1] : trimmed.replace(/^data:image\/\w+;base64,/i, '');
    const tmpDir = fs.realpathSync(os.tmpdir());
    const fname = `yiman_editor_matte_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
    const fullPath = path.join(tmpDir, fname);
    fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
    try {
      return await matteImageForContour(tmpDir, fname, options);
    } finally {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// AI 模型服务独立进程模式：仅启动 HTTP API，不启动主窗口（回退路径，Node 版优先）
const isAiModelServer = process.argv.includes('--ai-model-server');
if (isAiModelServer) {
  const { startServer } = await import('../ai-model-service/server.js');
  await startServer();
  // 服务保持运行，不退出
} else {
  ipcMain.handle('app:project:matteImageFromDataUrl', handleMatteImageFromDataUrl);
  // 兼容旧 preload 通道（若仍有点击旧构建的客户端可工作）
  ipcMain.handle('app:editor:matteImageFromDataUrl', handleMatteImageFromDataUrl);
  ipcMain.handle('app:net:fetchVolcTosImageAsDataUrl', (_evt, url: string) => fetchVolcTosImageAsDataUrl(url));

if (process.env.NODE_ENV !== 'production') {
  app.disableHardwareAcceleration();
}

/** 窗口与系统 UI 固定为深色（标题栏、traffic light 区域等），不随系统浅色模式变化 */
nativeTheme.themeSource = 'dark';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  // preload 构建为 CommonJS，避免 ESM 下 require 未定义
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#141414',
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

/**
 * 用户选定保存路径后，若同目录已存在同名项，则依次使用 `base (1).ext`、`base (2).ext`… 直至可用（与常见桌面软件一致）
 */
ipcMain.handle('app:fs:getSafeFilePath', async (_, fullCandidatePath: string) => {
  const raw = fullCandidatePath?.trim();
  if (!raw) return '';
  try {
    const normalized = path.normalize(raw);
    const dir = path.dirname(normalized);
    const name = path.basename(normalized);
    if (!name) return normalized;
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let n = 0;
    for (;;) {
      const piece = n === 0 ? name : `${base} (${n})${ext}`;
      const candidatePath = path.normalize(path.join(dir, piece));
      try {
        await fs.promises.access(candidatePath, fs.constants.F_OK);
        n += 1;
      } catch {
        return candidatePath;
      }
    }
  } catch {
    return path.normalize(raw);
  }
});

/** 将纯 base64（无 data: 前缀）写入用户选定路径（图片编辑导出等） */
ipcMain.handle('app:fs:writeBase64File', (_, fullPath: string, base64: string) => {
  try {
    if (!fullPath?.trim()) return { ok: false, error: '路径无效' };
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(path.normalize(fullPath), buf);
    return { ok: true as const };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});
/** 读取本地文件为 data URL（图片编辑打开本机图片） */
ipcMain.handle('app:fs:readFileAsDataUrl', (_, fullPath: string) => {
  try {
    if (!fullPath?.trim() || !fs.existsSync(fullPath)) return null;
    const normalized = path.normalize(fullPath);
    const buf = fs.readFileSync(normalized);
    const ext = path.extname(normalized).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
});
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
ipcMain.handle('app:project:getCameraLayer', (_, projectDir: string, sceneId: string) => getCameraLayer(projectDir, sceneId));
ipcMain.handle('app:project:getCameraBlock', (_, projectDir: string, sceneId: string) => getCameraBlock(projectDir, sceneId));
ipcMain.handle('app:project:getSceneContentDuration', (_, projectDir: string, sceneId: string) => getSceneContentDuration(projectDir, sceneId));
ipcMain.handle('app:project:ensureCameraLayerAndBlock', (_, projectDir: string, sceneId: string) => ensureCameraLayerAndBlock(projectDir, sceneId));
ipcMain.handle('app:project:getSubtitleLayer', (_, projectDir: string, sceneId: string) => getSubtitleLayer(projectDir, sceneId));
ipcMain.handle('app:project:getSubtitleBlock', (_, projectDir: string, sceneId: string) => getSubtitleBlock(projectDir, sceneId));
ipcMain.handle('app:project:ensureSubtitleLayerAndBlock', (_, projectDir: string, sceneId: string) => ensureSubtitleLayerAndBlock(projectDir, sceneId));
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
ipcMain.handle(
  'app:project:getAssetsByUiCategory',
  (_, projectDir: string, uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound') =>
    getAssetsByUiCategory(projectDir, uiCategory)
);
ipcMain.handle('app:project:getAssetById', (_, projectDir: string, id: string) => getAssetById(projectDir, id));
ipcMain.handle(
  'app:project:extractVideoFrameToDataUrl',
  async (
    _: unknown,
    projectDir: string,
    relativePath: string,
    timeSeconds: number,
    preserveAlpha?: boolean
  ): Promise<string | null> => {
    const fullPath = path.join(projectDir, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    const tmpPath = path.join(os.tmpdir(), `yiman_frame_${Date.now()}.png`);
    try {
      const res = await extractVideoFrame(fullPath, tmpPath, timeSeconds, preserveAlpha);
      if (!res.ok || !res.path || !fs.existsSync(res.path)) return null;
      const buf = fs.readFileSync(res.path);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
);
ipcMain.handle(
  'app:project:processSingleFrameColorkey',
  async (
    _: unknown,
    projectDir: string,
    relativePath: string,
    frameTime: number,
    color: ChromaKeyColor,
    options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
  ): Promise<{ ok: boolean; dataUrl?: string; error?: string }> => {
    const fullPath = path.join(projectDir, relativePath);
    if (!fs.existsSync(fullPath)) return { ok: false, error: '视频文件不存在' };
    const framePath = path.join(os.tmpdir(), `yiman_frame_ck_${Date.now()}.png`);
    const frameRes = await extractVideoFrame(fullPath, framePath, frameTime, false);
    if (!frameRes.ok || !fs.existsSync(framePath)) return { ok: false, error: '提取帧失败' };
    let outPath: string | null = null;
    try {
      const proc = await processSingleFrameColorkey(framePath, color, options);
      if (!proc.ok || !proc.path || !fs.existsSync(proc.path)) {
        return { ok: false, error: proc.error ?? '单帧扣色失败' };
      }
      outPath = proc.path;
      const buf = fs.readFileSync(proc.path);
      return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
    } finally {
      try { if (fs.existsSync(framePath)) fs.unlinkSync(framePath); } catch { /* ignore */ }
      try { if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ignore */ }
    }
  }
);
ipcMain.handle(
  'app:project:getVideoMetadata',
  async (_: unknown, projectDir: string, relativePath: string) => {
    const fullPath = path.join(projectDir, relativePath);
    return getVideoMetadata(fullPath);
  }
);
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
ipcMain.handle('app:project:getBundledAssetIds', (_, projectDir: string) => getBundledAssetIds(projectDir));
ipcMain.handle('app:project:getAssetBundlesByUiCategory', (_, projectDir: string, uiCategory: 'scene' | 'prop' | 'effect' | 'text' | 'sound') =>
  getAssetBundlesByUiCategory(projectDir, uiCategory)
);
ipcMain.handle('app:project:getAssetBundleById', (_, projectDir: string, bundleId: string) => getAssetBundleById(projectDir, bundleId));
ipcMain.handle('app:project:getAssetBundleMembersOrdered', (_, projectDir: string, bundleId: string) =>
  getAssetBundleMembersOrdered(projectDir, bundleId)
);
ipcMain.handle('app:project:getAssetBundleForAsset', (_, projectDir: string, assetId: string) => getAssetBundleForAsset(projectDir, assetId));
ipcMain.handle('app:project:createAssetBundle', (_, projectDir: string, data: unknown) =>
  createAssetBundle(projectDir, data as Parameters<typeof createAssetBundle>[1])
);
ipcMain.handle('app:project:updateAssetBundle', (_, projectDir: string, bundleId: string, data: unknown) =>
  updateAssetBundle(projectDir, bundleId, data as Parameters<typeof updateAssetBundle>[2])
);
ipcMain.handle('app:project:deleteAssetBundle', (_, projectDir: string, bundleId: string) => deleteAssetBundle(projectDir, bundleId));
ipcMain.handle('app:project:addAssetBundleMember', (_, projectDir: string, bundleId: string, assetId: string) =>
  addAssetBundleMember(projectDir, bundleId, assetId)
);
ipcMain.handle('app:project:removeAssetBundleMember', (_, projectDir: string, bundleId: string, assetId: string) =>
  removeAssetBundleMember(projectDir, bundleId, assetId)
);
ipcMain.handle('app:project:reorderAssetBundleMembers', (_, projectDir: string, bundleId: string, orderedAssetIds: string[]) =>
  reorderAssetBundleMembers(projectDir, bundleId, orderedAssetIds)
);
ipcMain.handle('app:project:addSimilarAssetToBundle', (_, projectDir: string, existingAssetId: string, newAssetId: string) =>
  addSimilarAssetToBundle(projectDir, existingAssetId, newAssetId)
);
ipcMain.handle('app:project:getAssetDataUrl', (_, projectDir: string, relativePath: string) =>
  getAssetDataUrl(projectDir, relativePath)
);
ipcMain.handle('app:project:getTextGadgetPresets', () => getTextGadgetPresets());
  ipcMain.handle('app:project:getTextGadgetConfig', (_, presetId: string) => getTextGadgetConfig(presetId));
  ipcMain.handle('app:project:getParticlesGadgetPresets', () => getParticlesGadgetPresets());
  ipcMain.handle('app:project:getParticlesGadgetConfig', (_, presetId: string) => getParticlesGadgetConfig(presetId));
ipcMain.handle('app:system:getFonts', () => getSystemFonts());
ipcMain.handle('app:system:getFontFaces', () => getSystemFontFaces());
ipcMain.handle('app:plugins:lama:ensure', async () => ensureLamaCleanerRunning());
ipcMain.handle('app:plugins:lama:openInstallTerminal', async () => {
  if (process.platform !== 'darwin') {
    return {
      ok: false as const,
      error:
        '自动打开安装终端目前仅在 macOS 上可用。请在应用数据目录下自行创建 venv：Python 3.10 推荐；pip install torch torchvision torchaudio && pip install iopaint；Apple Silicon 可用 python -m iopaint start --device mps --port 9380。',
    };
  }
  try {
    openLamaCleanerInstallTerminal();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});
/** 保存透明视频时更新封面 + 元数据的复用函数 */
async function updateTransparentVideoMeta(
  projectDir: string,
  assetId: string,
  webmPath: string
): Promise<void> {
  try {
    const savedFullPath = path.join(projectDir, `assets/${assetId}.webm`);
    const targetPath = fs.existsSync(savedFullPath) ? savedFullPath : webmPath;
    const meta = await getVideoMetadata(targetPath);
    if (meta.ok && (meta.duration != null || meta.width != null || meta.height != null)) {
      updateAsset(projectDir, assetId, {
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
    const frameRes = await extractVideoFrame(webmPath, tmpCover, 0.5);
    if (frameRes.ok && frameRes.path) {
      try {
        const assetsDir = getAssetsPath(projectDir);
        const coverFileName = `${assetId}_cover.png`;
        fs.copyFileSync(frameRes.path, path.join(assetsDir, coverFileName));
        updateAsset(projectDir, assetId, { cover_path: `assets/${coverFileName}` });
      } finally {
        try { fs.unlinkSync(tmpCover); } catch { /* ignore */ }
      }
    }
  } catch {
    /* 封面提取失败不影响主流程 */
  }
}

ipcMain.handle(
  'app:project:saveTransparentVideoAsset',
  async (
    _,
    projectDir: string,
    sourcePath: string,
    color: ChromaKeyColor,
    options?: { description?: string | null; is_favorite?: number; tags?: string | null; tolerance?: number; contiguous?: boolean }
  ) => {
    const proc = await processTransparentVideo(sourcePath, color, {
      tolerance: options?.tolerance,
      contiguous: options?.contiguous,
    });
    if (!proc.ok || !proc.path) return { ok: false, error: proc.error ?? '抠图处理失败' };
    const tempPath = proc.path;
    try {
      const res = saveAssetFromFile(projectDir, tempPath, 'transparent_video', options);
      if (!res.ok || !res.id || !res.path) return res;

      // 保存原始视频（用于日后重新扣色）
      try {
        const assetsDir = getAssetsPath(projectDir);
        const origExt = path.extname(sourcePath) || '.mp4';
        const origFileName = `${res.id}_original${origExt}`;
        const origDest = path.join(assetsDir, origFileName);
        fs.copyFileSync(sourcePath, origDest);
        updateAsset(projectDir, res.id, { original_path: `assets/${origFileName}` });
      } catch {
        /* 原始视频保存失败不影响主流程 */
      }

      await updateTransparentVideoMeta(projectDir, res.id, tempPath);
      return res;
    } finally {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }
);

ipcMain.handle(
  'app:project:reprocessTransparentVideo',
  async (
    _,
    projectDir: string,
    assetId: string,
    color: ChromaKeyColor,
    options?: { tolerance?: number; contiguous?: boolean; blend?: number; despill?: 'green' | 'blue' }
  ) => {
    const asset = getAssetById(projectDir, assetId);
    if (!asset) return { ok: false, error: '素材不存在' };
    // 有 original_path 时基于原始视频重处理，否则基于 path 首次处理（应用后保留原始视频）
    const sourcePath = asset.original_path ?? asset.path;
    const sourceFullPath = path.join(projectDir, sourcePath);
    if (!fs.existsSync(sourceFullPath)) return { ok: false, error: '视频文件不存在' };

    const proc = await processTransparentVideo(sourceFullPath, color, {
      tolerance: options?.tolerance,
      contiguous: options?.contiguous,
      blend: options?.blend,
      despill: options?.despill,
    });
    if (!proc.ok || !proc.path) return { ok: false, error: proc.error ?? '扣色失败' };
    const tempPath = proc.path;
    try {
      const assetsDir = getAssetsPath(projectDir);
      if (asset.original_path) {
        // 已有原始视频：替换现有 webm
        const assetFullPath = path.join(projectDir, asset.path);
        fs.copyFileSync(tempPath, assetFullPath);
        await updateTransparentVideoMeta(projectDir, assetId, assetFullPath);
      } else {
        // 首次处理：保留原始视频，保存 webm 到新路径
        const webmPath = path.join(assetsDir, `${assetId}.webm`);
        fs.copyFileSync(tempPath, webmPath);
        const relativeWebm = `assets/${assetId}.webm`;
        updateAsset(projectDir, assetId, {
          path: relativeWebm,
          original_path: asset.path,
          type: 'transparent_video',
        });
        await updateTransparentVideoMeta(projectDir, assetId, webmPath);
      }
      return { ok: true };
    } finally {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
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

ipcMain.handle(
  'app:project:matteImageForContour',
  async (
    _: unknown,
    projectDir: string,
    relativePath: string,
    options?: { mattingModel?: string; downsampleRatio?: number }
  ) => {
    return matteImageForContour(projectDir, relativePath, options);
  }
);

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

// 视频转精灵图：提取关键帧
const videoToSpriteTmpDirs = new Map<string, { frames: string[]; tmpDir: string }>();

ipcMain.handle(
  'app:project:videoToSpriteExtract',
  async (_, projectDir: string, videoRelativePath: string, options: { mode: 'scene' | 'uniform'; sceneThreshold?: number; totalFrames?: number }) => {
    const fullPath = path.join(projectDir, videoRelativePath);
    const res = options.mode === 'uniform'
      ? await extractFramesUniform(fullPath, options.totalFrames ?? 8)
      : await extractKeyFrames(fullPath, options.sceneThreshold ?? 0.3);
    if (!res.ok || !res.frames || !res.tmpDir) return { ok: false, error: res.error };

    const dataUrls = await keyFramesToDataUrls(res.frames);
    const key = `${projectDir}:${videoRelativePath}`;
    const old = videoToSpriteTmpDirs.get(key);
    if (old?.tmpDir) cleanupDir(old.tmpDir);
    videoToSpriteTmpDirs.set(key, { frames: res.frames, tmpDir: res.tmpDir });

    return { ok: true, frameCount: dataUrls.length, dataUrls };
  }
);

ipcMain.handle(
  'app:project:videoToSpriteSave',
  async (_, projectDir: string, videoRelativePath: string) => {
    const key = `${projectDir}:${videoRelativePath}`;
    const cached = videoToSpriteTmpDirs.get(key);
    if (!cached || cached.frames.length === 0) {
      return { ok: false, error: '请先提取关键帧' };
    }

    const tmpOut = path.join(fs.realpathSync(os.tmpdir()), `yiman_sprite_${Date.now()}.png`);
    const res = await generateSpriteSheet(cached.frames, tmpOut);
    if (!res.ok || !res.path) {
      return { ok: false, error: res.error };
    }

    try {
      const saveRes = saveAssetFromFile(projectDir, res.path, 'sprite');
      try { fs.unlinkSync(res.path); } catch { /* ignore */ }
      if (!saveRes.ok || !saveRes.path) {
        return { ok: false, error: saveRes.error ?? '保存精灵图失败' };
      }

      // 将第一帧复制到 assets 目录作为封面（不写入数据库，避免污染素材列表）
      let cover_path: string | undefined;
      if (cached.frames.length > 0) {
        try {
          const assetsDir = getAssetsPath(projectDir);
          const coverId = `cover_${Date.now()}`;
          const coverDest = path.join(assetsDir, `${coverId}.png`);
          fs.copyFileSync(cached.frames[0], coverDest);
          cover_path = `assets/${coverId}.png`;
        } catch { /* ignore */ }
      }

      cleanupDir(cached.tmpDir);
      videoToSpriteTmpDirs.delete(key);

      return {
        ok: true,
        path: saveRes.path,
        frameCount: res.frameCount,
        frames: res.frames,
        cover_path,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
);

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
