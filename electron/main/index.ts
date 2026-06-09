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
import { startStrudelSampleServer } from './strudelSampleServer';
import { convertWavBase64ToMp3File } from './strudelAudioConvertService';
import {
  getRemoteVoiceId,
  setRemoteVoiceId,
  invalidateRemoteVoiceId,
  type RemoteVoiceIdProvider,
  type RemoteVoiceIdEntry,
} from './remoteVoiceIdCache';
// CosyVoice 已停用
// import { synthesizeCosyVoiceWs } from './cosyVoiceWsService';
import { initAppDb, getProjects, createProject, deleteProject, importProject } from './db';
import { readImageFileForEditor } from './imageEditorImport';
import {
  loadAISettings,
  saveAISettings,
  type AISettings,
  type LocalSfxConfig,
  type LocalTtsConfig,
} from './settings';
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
import { processSpriteWithOnnx, matteImageForContour, matteImageAndSave, type ProcessSpriteWithOnnxResult } from './spriteOnnxService';
import { exportSpriteSheetToZip, importSpriteSheetFromZip, type SpriteSheetItemExport } from './spriteSheetExportService';
import { getTextGadgetPresets, getTextGadgetConfig } from './textGadgetService';
import { getParticlesGadgetPresets, getParticlesGadgetConfig } from './particlesGadgetService';
import { getSystemFonts, getSystemFontFaces } from './fontService';
import { extractKeyFrames, extractFramesUniform, keyFramesToDataUrls, generateSpriteSheet, cleanupDir } from './videoToSpriteService';
import {
  cacheImage as imgCacheSaveOne,
  cacheImages as imgCacheSaveBatch,
  resolveCached as imgCacheResolve,
  readCachedAsDataUrl as imgCacheReadDataUrl,
  getCacheStats,
} from './imageCacheService';
import {
  listRecordings,
  saveRecording,
  getDuration,
  processRecording,
  exportRecording,
  deleteRecording,
  renameRecording,
  checkDemucsInstalled,
} from './audioRecorderService';
import { ensureLamaCleanerRunning, openLamaCleanerInstallTerminal } from './lamaCleanerHost';
import { getMimoVoiceCloneCache, setMimoVoiceCloneCache } from './mimoVoiceCloneCache';
import { applyInnerMonologueEffect } from './innerMonologueService';
import { fetchVolcTosImageAsDataUrl } from './volcTosImageFetch';
import {
  initNovelDb,
  listNovels,
  upsertNovel as dbUpsertNovel,
  deleteNovel,
  getEpisodes as getNovelEpisodes,
  getWorkspaceMeta,
  upsertEpisode as dbUpsertEpisode,
  deleteEpisode as dbDeleteNovelEpisode,
  getEpisodeTtsModelJson,
  saveEpisodeTtsModelJson,
  saveWorkspaceMeta,
  replaceAllEpisodes,
  listScreenwriterFavorites,
  insertScreenwriterFavorite,
  deleteScreenwriterFavorite,
  deleteScreenwriterFavoriteBySeedUuid,
  getScreenwriterFavoriteBySeedUuid,
  replaceAllScreenwriterFavorites,
  listScreenwriterOutlineFavorites,
  insertScreenwriterOutlineFavorite,
  deleteScreenwriterOutlineFavorite,
  deleteScreenwriterOutlineFavoriteByOutlineUuid,
  getScreenwriterOutlineFavoriteByOutlineUuid,
  type NovelRow,
  type EpisodeRow,
  type WorkspaceMetaRow,
  type ScreenwriterFavoriteRow,
  type ScreenwriterOutlineFavoriteRow,
} from './novelDb';

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
      webSecurity: false, // 关闭跨域校验
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

/** 持久化本地 TTS 设置后推送至 AI 模型服务，更新内存路径/超时并结束旧常驻 Python */
async function pushLocalSfxReloadToAiServer(localSfx: LocalSfxConfig): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${AIMODEL_PORT}/api/v1/sfx/reload-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localSfx }),
    });
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn('[Main] AI 模型服务 sfx reload-config 失败 HTTP', res.status, txt.slice(0, 300));
      return;
    }
    console.log('[Main] 本地音效已通过 reload-config 同步到 AI 模型服务');
  } catch (e) {
    console.warn('[Main] AI 模型服务 sfx reload-config 不可达:', e instanceof Error ? e.message : String(e));
  }
}

async function pushLocalTtsReloadToAiServer(localTts: LocalTtsConfig): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${AIMODEL_PORT}/api/v1/tts/reload-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localTts }),
    });
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn('[Main] AI 模型服务 reload-config 失败 HTTP', res.status, txt.slice(0, 300));
      return;
    }
    console.log('[Main] 本地 TTS 已通过 reload-config 同步到 AI 模型服务');
  } catch (e) {
    console.warn('[Main] AI 模型服务 reload-config 不可达:', e instanceof Error ? e.message : String(e));
  }
}

app.whenReady().then(async () => {
  initAppDb();
  initNovelDb();
  // 读取 AI 设置，提取本地 TTS 配置
  const aiSettings = loadAISettings();
  const ttsEnv: Record<string, string> = { ...process.env, AIMODEL_PORT: String(AIMODEL_PORT) };
  if (aiSettings.localTts) {
    ttsEnv.YIMAN_LOCAL_TTS_CONFIG = JSON.stringify(aiSettings.localTts);
    const mk = aiSettings.localTts.modelKey ?? 'longcat_audio_dit';
    const activePath = aiSettings.localTts.profiles?.[mk]?.modelPath?.trim();
    if (aiSettings.localTts.enabled && activePath) {
      console.log('[Main] 本地 TTS 配置已注入:', mk, activePath);
    }
  }
  if (aiSettings.localSfx) {
    ttsEnv.YIMAN_LOCAL_SFX_CONFIG = JSON.stringify(aiSettings.localSfx);
    const sk = aiSettings.localSfx.modelKey ?? 'moss_sound_effect';
    const sfxPath = aiSettings.localSfx.profiles?.[sk]?.modelPath?.trim();
    if (aiSettings.localSfx.enabled && sfxPath) {
      console.log('[Main] 本地音效配置已注入:', sk, sfxPath);
    }
  }
  // 启动 AI 模型服务子进程（纯 Node 优先，无 Electron/Dock 图标；否则回退到 Electron 子进程）
  const serverScript = path.join(__dirname, '../ai-server/index.js');
  const useNodeServer = fs.existsSync(serverScript);
  const spawnCwd = path.join(__dirname, '../../'); // 项目根，便于 node 解析 node_modules
  // stdout/stderr 继承当前终端，便于直接看到 ai-model-service 内全部日志（含 [TTS LongCat-AudioDiT]）；
  // 若用 pipe 且只解析 JSON，则普通 console.log 会被吞掉。
  aiModelServerProcess = useNodeServer
    ? spawn('node', [serverScript], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: ttsEnv,
        cwd: spawnCwd,
      })
    : spawn(process.execPath, [path.join(__dirname, 'index.js'), '--ai-model-server'], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: ttsEnv,
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

  if (app.isPackaged) {
    const samplesPath = path.join(process.resourcesPath, 'samples');
    startStrudelSampleServer(samplesPath);
  }

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
  // 新建项目：创建目录 + 初始化项目库；默认可选写入应用级列表（见开发计划 2.4）
  // registerInAppList === false：仅落盘，不写入 app.db（如「小说编剧」独立项目，不出现在漫剧列表）
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
  if (payload.registerInAppList === false) {
    return { ok: true };
  }
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
  const r = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0] ?? null;
});
// 选择图片文件（见开发计划 2.6 本地上传）
ipcMain.handle('app:dialog:openFile', async (_, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const filters = options?.filters ?? [
    {
      name: '图片与文档',
      extensions: [
        'png',
        'jpg',
        'jpeg',
        'gif',
        'webp',
        'bmp',
        'tif',
        'tiff',
        'svg',
        'svgz',
        'pdf',
        'eps',
        'ps',
        'odg',
      ],
    },
  ];
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

ipcMain.handle('app:fs:pathDirname', (_, p: string) => {
  try {
    if (!p?.trim()) return '';
    return path.dirname(path.normalize(p));
  } catch {
    return '';
  }
});

ipcMain.handle('app:fs:pathJoin', (_, parts: string[]) => {
  try {
    const a = (parts ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (!a.length) return '';
    return path.normalize(path.join(...a));
  } catch {
    return '';
  }
});

/**
 * 在指定目录内为 `fileName` 生成第一个不冲突的完整路径（用于打开「保存为」对话框前的默认路径）
 */
ipcMain.handle('app:fs:getUnusedSaveDefaultPath', async (_, dir: string, fileName: string) => {
  const rawDir = dir?.trim();
  const rawName = fileName?.trim();
  if (!rawDir || !rawName) return null;
  try {
    const resolvedDir = path.normalize(rawDir);
    const name = path.basename(path.normalize(rawName));
    if (!name) return path.join(resolvedDir, rawName);
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let n = 0;
    for (;;) {
      const piece = n === 0 ? name : `${base} (${n})${ext}`;
      const candidatePath = path.normalize(path.join(resolvedDir, piece));
      try {
        await fs.promises.access(candidatePath, fs.constants.F_OK);
        n += 1;
      } catch {
        return candidatePath;
      }
    }
  } catch {
    return null;
  }
});

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
    const normalized = path.normalize(fullPath.trim());
    const dir = path.dirname(normalized);
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(normalized, buf);
    return { ok: true as const };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});

/** 递归删除目录或文件（小说项目「同时删除本地目录」等） */
ipcMain.handle('app:fs:removePathRecursive', (_, fullPath: string) => {
  try {
    if (!fullPath?.trim()) return { ok: false as const, error: '路径无效' };
    const normalized = path.normalize(fullPath.trim());
    if (fs.existsSync(normalized)) {
      fs.rmSync(normalized, { recursive: true, force: true });
    }
    return { ok: true as const };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});

/** 有声书工作台：TTS 片段 WAV 持久化（userData/yiman/audiobook-tts-cache） */
function safeAudiobookTtsNovelDirSegment(novelId: string): string {
  const t = (novelId ?? '').trim();
  if (!t || t.includes('..') || path.isAbsolute(t)) return 'invalid-novel';
  const base = path.basename(t);
  return base.slice(0, 200) || 'invalid-novel';
}

ipcMain.handle(
  'app:audiobook:ttsCache:saveWav',
  (_e, novelId: string, fileName: string, base64: string) => {
    try {
      const nid = safeAudiobookTtsNovelDirSegment(String(novelId));
      const safeName = path.basename(String(fileName || ''));
      if (!safeName.endsWith('.wav')) return { ok: false as const, error: '仅支持 .wav 文件名' };
      const dir = path.join(app.getPath('userData'), 'yiman', 'audiobook-tts-cache', nid);
      fs.mkdirSync(dir, { recursive: true });
      const full = path.join(dir, safeName);
      fs.writeFileSync(full, Buffer.from(String(base64), 'base64'));
      return { ok: true as const, path: full };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  },
);

ipcMain.handle('app:audiobook:ttsCache:resolvePath', (_e, novelId: string, fileName: string) => {
  try {
    const nid = safeAudiobookTtsNovelDirSegment(String(novelId));
    const safeName = path.basename(String(fileName || ''));
    if (!safeName.endsWith('.wav')) return null;
    const full = path.join(app.getPath('userData'), 'yiman', 'audiobook-tts-cache', nid, safeName);
    return fs.existsSync(full) ? full : null;
  } catch {
    return null;
  }
});

/** Strudel / 通用：WAV base64 → MP3（ffmpeg） */
ipcMain.handle('app:audio:convertWavToMp3', async (_e, wavBase64: string, outputPath: string) => {
  return convertWavBase64ToMp3File(String(wavBase64), String(outputPath));
});

/** 云端 TTS 复刻 voice id 磁盘缓存 */
ipcMain.handle(
  'app:voiceId:get',
  (_e, provider: RemoteVoiceIdProvider, cacheKey: string): RemoteVoiceIdEntry | null =>
    getRemoteVoiceId(provider, cacheKey),
);
ipcMain.handle(
  'app:voiceId:set',
  (_e, provider: RemoteVoiceIdProvider, cacheKey: string, entry: RemoteVoiceIdEntry) => {
    setRemoteVoiceId(provider, cacheKey, entry);
    return { ok: true as const };
  },
);
ipcMain.handle('app:voiceId:invalidate', (_e, provider: RemoteVoiceIdProvider, cacheKey: string) => {
  invalidateRemoteVoiceId(provider, cacheKey);
  return { ok: true as const };
});

/** CosyVoice WebSocket 合成已停用 */
/*
ipcMain.handle(
  'app:cosyVoice:synthesize',
  async (_e, payload: { ... }) => {
    const out = await synthesizeCosyVoiceWs(payload);
    ...
  },
);
*/

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
            : ext === '.svg' || ext === '.svgz'
              ? 'image/svg+xml'
              : ext === '.bmp'
                ? 'image/bmp'
                : ext === '.tif' || ext === '.tiff'
                  ? 'image/tiff'
                  : ext === '.mp3'
                    ? 'audio/mpeg'
                    : ext === '.wav'
                      ? 'audio/wav'
                      : ext === '.m4a' || ext === '.mp4'
                        ? 'audio/mp4'
                        : ext === '.aac'
                          ? 'audio/aac'
                          : ext === '.flac'
                            ? 'audio/flac'
                      : ext === '.ogg' || ext === '.oga'
                        ? 'audio/ogg'
                        : ext === '.webm'
                          ? 'audio/webm'
                          : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
});

/** 有声书：读取参考音色 sidecar 文稿（UTF-8，如 旁白.wav 同目录 旁白.txt） */
ipcMain.handle('app:fs:readUtf8File', (_, fullPath: string) => {
  try {
    if (!fullPath?.trim() || !fs.existsSync(fullPath)) return null;
    const normalized = path.normalize(fullPath);
    const raw = fs.readFileSync(normalized, 'utf8');
    const t = raw.replace(/^\uFEFF/, '').trim();
    return t || null;
  } catch {
    return null;
  }
});

/** 图片编辑器：位图正确 MIME，SVG 保留矢量 data URL，PDF/EPS/ODG 等栅格化为 PNG */
ipcMain.handle('app:fs:readImageFileForEditor', async (_, fullPath: string) => readImageFileForEditor(fullPath));

/**
 * 列出 medias 目录下所有视频文件（背景视频选择器使用）
 * 优先 source public/medias（dev），其次 dist-electron/ai-server/medias（prod）
 */
ipcMain.handle('app:fs:listMedias', async () => {
  const candidates = [
    path.join(__dirname, '../../public/medias'),
    path.join(__dirname, '../ai-server/medias'),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      return files
        .filter((f) => /\.(mp4|webm)$/i.test(f))
        .sort();
    } catch {
      /* try next */
    }
  }
  return [];
});

const AUDIO_SAMPLE_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|oga)$/i;
const LIST_AUDIO_SAMPLES_MAX = 2000;

function listAudioSamplesRecursive(
  rootReal: string,
  relBase: string,
  out: { relativePath: string; absolutePath: string }[],
): void {
  if (out.length >= LIST_AUDIO_SAMPLES_MAX) return;
  const absBase = relBase ? path.join(rootReal, relBase) : rootReal;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absBase, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= LIST_AUDIO_SAMPLES_MAX) break;
    /** macOS AppleDouble / Finder 产生的元数据文件与目录 */
    if (ent.name.startsWith('._')) continue;
    const rel = relBase ? `${relBase.replace(/\\/g, '/')}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (ent.name === '.' || ent.name === '..') continue;
      listAudioSamplesRecursive(rootReal, rel, out);
    } else if (ent.isFile() && AUDIO_SAMPLE_EXT.test(ent.name)) {
      out.push({ relativePath: rel, absolutePath: path.join(absBase, ent.name) });
    }
  }
}

/** 内置音色样本目录：项目根 PresetVoice/ */
function resolveBuiltinPresetVoiceDir(): string {
  const base = app.isPackaged ? path.join(app.getAppPath(), '..') : process.cwd();
  return path.join(base, 'PresetVoice');
}

ipcMain.handle('app:fs:getBuiltinPresetVoiceDir', () => resolveBuiltinPresetVoiceDir());

/** 有声书：递归枚举音色样本根目录下的音频文件（相对路径统一为正斜杠） */
ipcMain.handle('app:fs:listAudiobookVoiceSamples', (_, rootDir: string) => {
  try {
    const raw = String(rootDir ?? '').trim();
    if (!raw) return { ok: false as const, error: '未配置目录' };
    if (!fs.existsSync(raw)) return { ok: false as const, error: '目录不存在' };
    const stat = fs.statSync(raw);
    if (!stat.isDirectory()) return { ok: false as const, error: '路径不是目录' };
    const rootReal = fs.realpathSync(raw);
    const out: { relativePath: string; absolutePath: string }[] = [];
    listAudioSamplesRecursive(rootReal, '', out);
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-Hans-CN'));
    return { ok: true as const, files: out };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});
ipcMain.handle('app:shell:showItemInFolder', (_, fullPath: string) => shell.showItemInFolder(fullPath));
ipcMain.handle('app:shell:openPath', (_: unknown, path: string) => shell.openPath(path));
ipcMain.handle('app:shell:openExternal', async (_: unknown, url: string) => {
  const u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) {
    return { ok: false, error: '仅支持 http(s) 链接' };
  }
  try {
    await shell.openExternal(u);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// AI 供应商配置（见功能文档 3.1、开发计划 2.3）
ipcMain.handle('app:settings:get', () => loadAISettings());
ipcMain.handle('app:settings:save', async (_, data: AISettings) => {
  const result = saveAISettings(data);
  if (result.ok && data.localTts) {
    await pushLocalTtsReloadToAiServer(data.localTts);
  }
  if (result.ok && data.localSfx) {
    await pushLocalSfxReloadToAiServer(data.localSfx);
  }
  return result;
});

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
    const res: ProcessSpriteWithOnnxResult = await processSpriteWithOnnx(projectDir, relativePath, options);
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
    item: SpriteSheetItemExport
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

// ===== 小说编剧 =====

// 小说列表
ipcMain.handle('app:novel:list', () => {
  return listNovels().map(toNovelWorkspaceItem);
});

ipcMain.handle('app:novel:upsert', (_e, item: {
  id: string; title: string; genres: string[]; coverDataUrl?: string | null;
  electronProjectId?: string | null; audiobookEnabled?: boolean;
  createdAt?: string; updatedAt?: string;
}) => {
  const row = dbUpsertNovel(item);
  return toNovelWorkspaceItem(row);
});

ipcMain.handle('app:novel:delete', (_e, id: string) => {
  return { ok: deleteNovel(id) };
});

// 小说工作区
ipcMain.handle('app:novel:getEpisodes', (_e, novelId: string) => {
  return getNovelEpisodes(novelId).map(toEpisodeItem);
});

ipcMain.handle('app:novel:getWorkspaceMeta', (_e, novelId: string) => {
  const meta = getWorkspaceMeta(novelId);
  if (!meta) return null;
  return {
    novelId: meta.novel_id,
    title: meta.title,
    activeEpisodeId: meta.active_episode_id,
    remountVersions: safeJsonParse(meta.remount_versions, {}),
    novelScriptJson: meta.novel_script_json ?? '',
    audiobookOutlineVoiceJson: meta.audiobook_outline_voice_json ?? '',
    innerMonologueEnabled: meta.inner_monologue_enabled === 1,
    useLocalSfxForInnerVoice: meta.use_local_sfx_for_inner_voice === 1,
    updatedAt: meta.updated_at,
  };
});

ipcMain.handle('app:novel:upsertEpisode', (_e, ep: {
  id: string; novelId: string; title: string; episode?: number | null;
  contentMarkdown?: string; scriptJson?: string; audiobookJson?: string;
  order: number; updatedAt: string;
}) => {
  dbUpsertEpisode(ep);
});

ipcMain.handle('app:novel:deleteEpisode', (_e, novelId: string, episodeId: string) => {
  dbDeleteNovelEpisode(novelId, episodeId);
});

/** 保存片段 TTS 模型选择到 SQLite */
ipcMain.handle('app:novel:saveSegmentTtsModels', (_e, novelId: string, episodeId: string, ttsModelJson: string) => {
  console.log('[IPC saveSegmentTtsModels] 收到请求:', { novelId, episodeId, ttsModelJson: ttsModelJson?.slice(0, 100) });
  saveEpisodeTtsModelJson(novelId, episodeId, ttsModelJson);
  console.log('[IPC saveSegmentTtsModels] 保存成功');
});

/** 从 SQLite 读取片段 TTS 模型选择 */
ipcMain.handle('app:novel:loadSegmentTtsModels', (_e, novelId: string, episodeId: string): string => {
  const result = getEpisodeTtsModelJson(novelId, episodeId);
  console.log('[IPC loadSegmentTtsModels] 读取结果:', { novelId, episodeId, result: result?.slice(0, 200) });
  return result;
});

ipcMain.handle('app:novel:saveWorkspaceMeta', (_e, meta: {
  novelId: string; title?: string; activeEpisodeId: string;
  remountVersions: Record<string, number>; novelScriptJson?: string;
  audiobookOutlineVoiceJson?: string; innerMonologueEnabled?: boolean;
  useLocalSfxForInnerVoice?: boolean;
  spaceEchoEnabled?: boolean; telephoneEnabled?: boolean; mufflerEnabled?: boolean;
  updatedAt: string;
}) => {
  saveWorkspaceMeta(meta);
});

ipcMain.handle('app:novel:replaceAllEpisodes', (_e, novelId: string, episodes: Array<{
  id: string; novelId: string; title: string; episode?: number | null;
  contentMarkdown: string; scriptJson?: string; audiobookJson?: string;
  order: number; updatedAt: string;
}>) => {
  replaceAllEpisodes(novelId, episodes);
});

// 编剧收藏 - 故事雏形
ipcMain.handle('app:novel:favorites:list', () => {
  return listScreenwriterFavorites().map(toFavoriteStory);
});

ipcMain.handle('app:novel:favorites:insert', (_e, item: {
  id: string; seedUuid?: string | null; title: string; content: string;
  sourceConversationKey?: string | null; createdAt: string;
}) => {
  insertScreenwriterFavorite(item);
});

ipcMain.handle('app:novel:favorites:delete', (_e, id: string) => {
  return { ok: deleteScreenwriterFavorite(id) };
});

ipcMain.handle('app:novel:favorites:deleteBySeedUuid', (_e, seedUuid: string) => {
  return { ok: deleteScreenwriterFavoriteBySeedUuid(seedUuid) };
});

ipcMain.handle('app:novel:favorites:getBySeedUuid', (_e, seedUuid: string) => {
  const row = getScreenwriterFavoriteBySeedUuid(seedUuid);
  return row ? toFavoriteStory(row) : null;
});

ipcMain.handle('app:novel:favorites:replaceAll', (_e, items: Array<{
  id: string; seedUuid?: string | null; title: string; content: string;
  sourceConversationKey?: string | null; createdAt: string;
}>) => {
  replaceAllScreenwriterFavorites(items);
});

// 编剧收藏 - 大纲
ipcMain.handle('app:novel:outlineFavorites:list', () => {
  return listScreenwriterOutlineFavorites().map(toFavoriteOutline);
});

ipcMain.handle('app:novel:outlineFavorites:insert', (_e, item: {
  id: string; outlineUuid?: string | null; title: string; prose: string;
  panelStoryName?: string | null; panelSource?: string; panelSummary?: string;
  fullContent?: string | null; favoriteAppendix?: string | null;
  sourceConversationKey?: string | null; createdAt: string;
}) => {
  insertScreenwriterOutlineFavorite(item);
});

ipcMain.handle('app:novel:outlineFavorites:delete', (_e, id: string) => {
  return { ok: deleteScreenwriterOutlineFavorite(id) };
});

ipcMain.handle('app:novel:outlineFavorites:deleteByOutlineUuid', (_e, outlineUuid: string) => {
  return { ok: deleteScreenwriterOutlineFavoriteByOutlineUuid(outlineUuid) };
});

ipcMain.handle('app:novel:outlineFavorites:getByOutlineUuid', (_e, outlineUuid: string) => {
  const row = getScreenwriterOutlineFavoriteByOutlineUuid(outlineUuid);
  return row ? toFavoriteOutline(row) : null;
});

// ----- helper types & converters -----
interface NovelWorkspaceItem {
  id: string; title: string; genres: string[];
  coverDataUrl?: string | null; electronProjectId?: string | null;
  audiobookEnabled?: boolean;
  updatedAt: string; createdAt: string;
}
interface EpisodeItem {
  id: string; novelId: string; title: string; episode?: number | null;
  contentMarkdown: string; scriptJson: string; audiobookJson: string;
  order: number; updatedAt: string;
}
interface FavoriteStoryItem {
  id: string; seedUuid?: string | null; title: string; content: string;
  sourceConversationKey?: string | null; createdAt: string;
}
interface FavoriteOutlineItem {
  id: string; outlineUuid?: string | null; title: string; prose: string;
  panel: { storyName?: string; source: string; summary: string };
  fullContent?: string; favoriteAppendix?: string;
  sourceConversationKey?: string | null; createdAt: string;
}

function safeJsonParse(s: string, fallback: unknown) { try { return JSON.parse(s); } catch { return fallback; } }

function toNovelWorkspaceItem(r: NovelRow): NovelWorkspaceItem {
  return {
    id: r.id, title: r.title,
    genres: safeJsonParse(r.genres, []),
    coverDataUrl: r.cover_data_url,
    electronProjectId: r.electron_project_id,
    audiobookEnabled: Boolean(r.audiobook_enabled),
    updatedAt: r.updated_at, createdAt: r.created_at,
  };
}
function toEpisodeItem(r: EpisodeRow): EpisodeItem {
  const scriptJson =
    (r.script_json?.trim() ? r.script_json : null) ??
    (r.script_markdown?.trim().startsWith('{') ? r.script_markdown : '') ??
    '';
  return {
    id: r.id, novelId: r.novel_id, title: r.title,
    episode: r.episode, contentMarkdown: r.content_markdown,
    scriptJson,
    audiobookJson: r.audiobook_json ?? '',
    order: r.order, updatedAt: r.updated_at,
  };
}
function toFavoriteStory(r: ScreenwriterFavoriteRow): FavoriteStoryItem {
  return {
    id: r.id, seedUuid: r.seed_uuid, title: r.title,
    content: r.content, sourceConversationKey: r.source_conversation_key,
    createdAt: r.created_at,
  };
}
function toFavoriteOutline(r: ScreenwriterOutlineFavoriteRow): FavoriteOutlineItem {
  return {
    id: r.id, outlineUuid: r.outline_uuid, title: r.title, prose: r.prose,
    panel: { storyName: r.panel_story_name ?? undefined, source: r.panel_source, summary: r.panel_summary },
    fullContent: r.full_content ?? undefined,
    favoriteAppendix: r.favorite_appendix ?? undefined,
    sourceConversationKey: r.source_conversation_key,
    createdAt: r.created_at,
  };
}

// ===== 本地 TTS（通过 AI 模型服务代理） =====

const AIMODEL_BASE = `http://127.0.0.1:${AIMODEL_PORT}`;

/** modelKey → REST 路径段（与 ai-model-service 一致） */
const LOCAL_TTS_REST_SEGMENT: Record<string, string> = {
  longcat_audio_dit: 'LongCat-AudioDiT',
  moss_tts: 'MOSS-TTS',
  moss_tts_local_mlx: 'MOSS-TTS',
  moss_tts_nano: 'MOSS-TTS-Nano',
};

function restSegmentForLocalTts(modelId: string): string {
  return LOCAL_TTS_REST_SEGMENT[modelId] ?? 'LongCat-AudioDiT';
}

/** 获取本地 TTS 模型列表 */
ipcMain.handle('app:tts:local:models', async () => {
  return {
    models: [
      { id: 'longcat_audio_dit', name: 'LongCat-AudioDiT' },
      { id: 'moss_tts', name: 'MOSS-TTS' },
      { id: 'moss_tts_nano', name: 'MOSS-TTS-Nano' },
    ],
  };
});

/** 本地 TTS 健康检查（代理到 AI 服务） */
ipcMain.handle('app:tts:local:health', async (_e, modelId?: string) => {
  try {
    const id = modelId ?? loadAISettings().localTts?.modelKey ?? 'longcat_audio_dit';
    const seg = restSegmentForLocalTts(id);
    const res = await fetch(`${AIMODEL_BASE}/api/v1/tts/${seg}/health`);
    return await res.json();
  } catch (e) {
    return { ok: false, message: `AI 服务不可达: ${e instanceof Error ? e.message : String(e)}` };
  }
});

/** 执行本地 TTS 合成（代理到 AI 服务） */
ipcMain.handle(
  'app:tts:local:run',
  async (_e, payload: { modelId?: string; text: string; options?: Record<string, unknown> }) => {
    const { text, options } = payload;
    const modelId =
      payload.modelId ?? loadAISettings().localTts?.modelKey ?? 'longcat_audio_dit';
    if (!text?.trim()) {
      return { ok: false, message: '文本为空' };
    }
    try {
      const speed = (options as { speed?: number })?.speed ?? 1.0;
      const seg = restSegmentForLocalTts(modelId);
      const res = await fetch(`${AIMODEL_BASE}/api/v1/tts/${seg}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), speed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, message: err.error || `HTTP ${res.status}` };
      }
      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return { ok: true, audioBase64: audioBuffer.toString('base64'), format: 'wav' };
    } catch (e) {
      return { ok: false, message: `请求失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
);

/** 缓存单张远程图片，返回本地缓存路径 */
ipcMain.handle('app:images:cache:save', async (_e, remoteUrl: string) => {
  try {
    const localPath = await imgCacheSaveOne(remoteUrl);
    return { ok: true, localPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

/** 批量缓存远程图片，返回本地路径列表 */
ipcMain.handle('app:images:cache:saveBatch', async (_e, remoteUrls: string[]) => {
  try {
    const paths = await imgCacheSaveBatch(remoteUrls);
    return { ok: true, paths };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

/** 查询远程图片是否已缓存，返回本地路径或 null */
ipcMain.handle('app:images:cache:resolve', (_e, remoteUrl: string) => {
  return imgCacheResolve(remoteUrl);
});

/** 读取缓存的图片为 data URL */
ipcMain.handle('app:images:cache:readDataUrl', (_e, remoteUrl: string) => {
  return imgCacheReadDataUrl(remoteUrl);
});

/** 获取缓存统计信息 */
ipcMain.handle('app:images:cache:stats', () => {
  return getCacheStats();
});

// ===== 声音录制 =====

/** 列出录音文件 */
ipcMain.handle('app:audioRecorder:list', () => {
  return listRecordings();
});

/** 保存录音 base64 → 文件 */
ipcMain.handle('app:audioRecorder:save', (_e, base64: string, ext: string) => {
  return saveRecording(String(base64), String(ext));
});

/** ffprobe 取音频时长 */
ipcMain.handle('app:audioRecorder:duration', async (_e, filePath: string) => {
  return getDuration(String(filePath));
});

/** 裁剪/降噪处理 */
ipcMain.handle(
  'app:audioRecorder:process',
  async (
    _e,
    filePath: string,
    options: { trimStart?: number; trimEnd?: number; denoise?: boolean },
  ) => {
    return processRecording(String(filePath), options);
  },
);

/** 导出 mp3/wav */
ipcMain.handle(
  'app:audioRecorder:export',
  async (
    _e,
    filePath: string,
    outPath: string,
    options: { format: 'mp3' | 'wav'; trimStart?: number; trimEnd?: number; denoise?: boolean },
  ) => {
    return exportRecording(String(filePath), String(outPath), options);
  },
);

/** 删除录音 */
ipcMain.handle('app:audioRecorder:delete', (_e, filePath: string) => {
  return deleteRecording(String(filePath));
});

/** 重命名录音 */
ipcMain.handle('app:audioRecorder:rename', (_e, filePath: string, name: string) => {
  return renameRecording(String(filePath), String(name));
});

/** demucs 占位检查 */
ipcMain.handle('app:audioRecorder:demucsCheck', () => {
  return checkDemucsInstalled();
});

// ===== 内心独白音效 =====

ipcMain.handle('app:innerMonologue:apply', async (_e, inputPath: string, force?: boolean) => {
  return applyInnerMonologueEffect(String(inputPath), force === true);
});

// ===== MiMo 音色克隆缓存 =====

ipcMain.handle('app:mimoVoiceClone:get', (_e, filePath: string): string | null => {
  return getMimoVoiceCloneCache(String(filePath));
});

ipcMain.handle('app:mimoVoiceClone:set', (_e, filePath: string, dataUrl: string) => {
  setMimoVoiceCloneCache(String(filePath), String(dataUrl));
});
}
