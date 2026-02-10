/**
 * 项目级 SQLite 与目录（见技术文档 3.2、开发计划 2.4）
 * 每个项目一个库：project_dir/project.db；目录：assets/、exports/、ai-cache/
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const PROJECT_DB_FILENAME = 'project.db';
const DIR_ASSETS = 'assets';
const DIR_EXPORTS = 'exports';
const DIR_AI_CACHE = 'ai-cache';

const dbCache = new Map<string, Database.Database>();

export function getProjectDbPath(projectDir: string): string {
  return path.join(projectDir, PROJECT_DB_FILENAME);
}

export function getAssetsPath(projectDir: string): string {
  return path.join(projectDir, DIR_ASSETS);
}

export function getExportsPath(projectDir: string): string {
  return path.join(projectDir, DIR_EXPORTS);
}

export function getAiCachePath(projectDir: string): string {
  return path.join(projectDir, DIR_AI_CACHE);
}

/** 创建项目子目录（见开发计划 2.4 目录约定） */
export function initProjectDirs(projectDir: string): void {
  fs.mkdirSync(path.join(projectDir, DIR_ASSETS), { recursive: true });
  fs.mkdirSync(path.join(projectDir, DIR_EXPORTS), { recursive: true });
  fs.mkdirSync(path.join(projectDir, DIR_AI_CACHE), { recursive: true });
}

export interface ProjectMetaRow {
  id: number;
  name: string;
  landscape: number;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpisodeRow {
  id: string;
  title: string;
  sort_order: number;
  summary: string;
  script_text: string;
  character_refs?: string;
  created_at: string;
  updated_at: string;
}

export interface CharacterRow {
  id: string;
  name: string;
  image_path: string | null;
  note: string | null;
  tts_voice: string | null;
  tts_speed: number | null;
  /** JSON 数组：人物角度列表，见 docs/06-人物骨骼贴图功能设计.md。每项 { id, name, image_path?, skeleton? } */
  angles: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiConfigRow {
  script_expert_prompt: string | null;
  painting_prompt: string | null;
  updated_at: string;
}

/** 打开项目库（缓存连接） */
function getDb(projectDir: string): Database.Database {
  const normalized = path.normalize(projectDir);
  let db = dbCache.get(normalized);
  if (!db) {
    const dbPath = getProjectDbPath(normalized);
    if (!fs.existsSync(dbPath)) throw new Error(`项目库不存在: ${dbPath}`);
    db = new Database(dbPath);
    dbCache.set(normalized, db);
  }
  return db;
}

/** 初始化项目库：创建表并写入 project_meta（见功能文档 4、开发计划 2.4） */
export function initProjectDb(
  projectDir: string,
  meta: { name: string; landscape: number; cover_path?: string | null }
): { ok: boolean; error?: string } {
  try {
    initProjectDirs(projectDir);
    const dbPath = getProjectDbPath(projectDir);
    if (fs.existsSync(dbPath)) return { ok: false, error: '项目库已存在' };

    const db = new Database(dbPath);
    dbCache.set(path.normalize(projectDir), db);

    const now = new Date().toISOString();

    db.exec(`
      CREATE TABLE project_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        landscape INTEGER NOT NULL DEFAULT 1,
        cover_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE episodes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        script_text TEXT NOT NULL DEFAULT '',
        character_refs TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        image_path TEXT,
        note TEXT,
        tts_voice TEXT,
        tts_speed REAL,
        angles TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE ai_config (
        script_expert_prompt TEXT,
        painting_prompt TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE scenes (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        play_speed REAL NOT NULL DEFAULT 1,
        camera_enabled INTEGER NOT NULL DEFAULT 0,
        camera_x REAL NOT NULL DEFAULT 0,
        camera_y REAL NOT NULL DEFAULT 0,
        camera_z REAL NOT NULL DEFAULT 1,
        auto_center_speaker INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE layers (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        z_index INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0,
        is_main INTEGER NOT NULL DEFAULT 0,
        layer_type TEXT NOT NULL DEFAULT 'video',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE timeline_blocks (
        id TEXT PRIMARY KEY,
        layer_id TEXT NOT NULL,
        asset_id TEXT,
        start_time REAL NOT NULL DEFAULT 0,
        end_time REAL NOT NULL DEFAULT 0,
        pos_x REAL NOT NULL DEFAULT 0.5,
        pos_y REAL NOT NULL DEFAULT 0.5,
        scale_x REAL NOT NULL DEFAULT 1,
        scale_y REAL NOT NULL DEFAULT 1,
        rotation REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE assets_index (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE keyframes (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL,
        time REAL NOT NULL,
        property TEXT NOT NULL DEFAULT 'pos',
        pos_x REAL,
        pos_y REAL,
        scale_x REAL,
        scale_y REAL,
        rotation REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.prepare(
      `INSERT INTO project_meta (id, name, landscape, cover_path, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)`
    ).run(meta.name, meta.landscape ?? 1, meta.cover_path ?? null, now, now);

    db.prepare(
      `INSERT INTO ai_config (script_expert_prompt, painting_prompt, updated_at) VALUES (NULL, NULL, ?)`
    ).run(now);

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ---------- project_meta ----------
export function getProjectMeta(projectDir: string): ProjectMetaRow | null {
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM project_meta WHERE id = 1').get() as ProjectMetaRow | null;
}

export function updateProjectMeta(
  projectDir: string,
  data: { name?: string; landscape?: number; cover_path?: string | null }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM project_meta WHERE id = 1').get() as ProjectMetaRow | null;
    if (!row) return { ok: false, error: 'project_meta 不存在' };
    db.prepare(
      `UPDATE project_meta SET name = ?, landscape = ?, cover_path = ?, updated_at = ? WHERE id = 1`
    ).run(
      data.name ?? row.name,
      data.landscape ?? row.landscape,
      data.cover_path !== undefined ? data.cover_path : row.cover_path,
      now
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- episodes ----------
export function getEpisodes(projectDir: string): EpisodeRow[] {
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM episodes ORDER BY sort_order ASC, created_at ASC').all() as EpisodeRow[];
}

export function createEpisode(
  projectDir: string,
  data: { id: string; title?: string; sort_order?: number; summary?: string; script_text?: string; character_refs?: string }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    db.prepare(
      `INSERT INTO episodes (id, title, sort_order, summary, script_text, character_refs, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.id,
      data.title ?? '',
      data.sort_order ?? 0,
      data.summary ?? '',
      data.script_text ?? '',
      data.character_refs ?? '[]',
      now,
      now
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateEpisode(
  projectDir: string,
  id: string,
  data: Partial<Pick<EpisodeRow, 'title' | 'sort_order' | 'summary' | 'script_text' | 'character_refs'>>
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as EpisodeRow | undefined;
    if (!row) return { ok: false, error: '集不存在' };
    const charRefs = data.character_refs !== undefined ? data.character_refs : (row.character_refs ?? '[]');
    const columns = db.prepare('PRAGMA table_info(episodes)').all() as { name: string }[];
    const hasCharRefs = columns.some((c) => c.name === 'character_refs');
    if (!hasCharRefs) {
      db.prepare("ALTER TABLE episodes ADD COLUMN character_refs TEXT NOT NULL DEFAULT '[]'").run();
    }
    db.prepare(
      `UPDATE episodes SET title = ?, sort_order = ?, summary = ?, script_text = ?, character_refs = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.title ?? row.title,
      data.sort_order ?? row.sort_order,
      data.summary ?? row.summary,
      data.script_text ?? row.script_text,
      charRefs,
      now,
      id
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function deleteEpisode(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    getDb(projectDir).prepare('DELETE FROM episodes WHERE id = ?').run(id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- scenes（见功能文档 6.3、开发计划 2.9）----------
export interface SceneRow {
  id: string;
  episode_id: string;
  name: string;
  sort_order: number;
  play_speed?: number;
  camera_enabled?: number;
  camera_x?: number;
  camera_y?: number;
  camera_z?: number;
  auto_center_speaker?: number;
  created_at: string;
  updated_at: string;
}

export function getScenes(projectDir: string, episodeId?: string): SceneRow[] {
  const db = getDb(projectDir);
  if (episodeId) {
    return db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY sort_order ASC, created_at ASC').all(episodeId) as SceneRow[];
  }
  return db.prepare('SELECT * FROM scenes ORDER BY episode_id ASC, sort_order ASC, created_at ASC').all() as SceneRow[];
}

export function getScene(projectDir: string, sceneId: string): SceneRow | null {
  ensureSceneSettingsColumns(projectDir);
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as SceneRow | null;
}

const SCENE_SETTINGS_COLUMNS: { name: string; sql: string }[] = [
  { name: 'play_speed', sql: 'REAL NOT NULL DEFAULT 1' },
  { name: 'camera_enabled', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'camera_x', sql: 'REAL NOT NULL DEFAULT 0' },
  { name: 'camera_y', sql: 'REAL NOT NULL DEFAULT 0' },
  { name: 'camera_z', sql: 'REAL NOT NULL DEFAULT 1' },
  { name: 'auto_center_speaker', sql: 'INTEGER NOT NULL DEFAULT 0' },
];

function ensureSceneSettingsColumns(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(scenes)').all() as { name: string }[]).map((c) => c.name);
  for (const col of SCENE_SETTINGS_COLUMNS) {
    if (!columns.includes(col.name)) {
      db.prepare(`ALTER TABLE scenes ADD COLUMN ${col.name} ${col.sql}`).run();
    }
  }
}

export function updateScene(
  projectDir: string,
  id: string,
  data: Partial<Pick<SceneRow, 'name' | 'sort_order' | 'play_speed' | 'camera_enabled' | 'camera_x' | 'camera_y' | 'camera_z' | 'auto_center_speaker'>>
): { ok: boolean; error?: string } {
  try {
    ensureSceneSettingsColumns(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as SceneRow | undefined;
    if (!row) return { ok: false, error: '场景不存在' };
    const name = data.name !== undefined ? data.name : row.name;
    const sort_order = data.sort_order !== undefined ? data.sort_order : row.sort_order;
    const play_speed = data.play_speed !== undefined ? data.play_speed : (row.play_speed ?? 1);
    const camera_enabled = data.camera_enabled !== undefined ? data.camera_enabled : (row.camera_enabled ?? 0);
    const camera_x = data.camera_x !== undefined ? data.camera_x : (row.camera_x ?? 0);
    const camera_y = data.camera_y !== undefined ? data.camera_y : (row.camera_y ?? 0);
    const camera_z = data.camera_z !== undefined ? data.camera_z : (row.camera_z ?? 1);
    const auto_center_speaker = data.auto_center_speaker !== undefined ? data.auto_center_speaker : (row.auto_center_speaker ?? 0);
    db.prepare(
      `UPDATE scenes SET name = ?, sort_order = ?, play_speed = ?, camera_enabled = ?, camera_x = ?, camera_y = ?, camera_z = ?, auto_center_speaker = ?, updated_at = ? WHERE id = ?`
    ).run(name, sort_order, play_speed, camera_enabled, camera_x, camera_y, camera_z, auto_center_speaker, now, id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function createScene(
  projectDir: string,
  data: { id: string; episode_id: string; name?: string; sort_order?: number }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    db.prepare(
      `INSERT INTO scenes (id, episode_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.episode_id, data.name ?? '场景', data.sort_order ?? 0, now, now);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- layers（见功能文档 6.7、开发计划 2.10/2.11）----------
export interface LayerRow {
  id: string;
  scene_id: string;
  name: string;
  z_index: number;
  visible: number;
  locked: number;
  is_main: number;
  layer_type: string; // 'video' | 'audio'，主层恒为 video 逻辑
  created_at: string;
  updated_at: string;
}

function ensureLayersLayerTypeColumn(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(layers)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('layer_type')) {
    db.prepare("ALTER TABLE layers ADD COLUMN layer_type TEXT NOT NULL DEFAULT 'video'").run();
  }
}

function ensureLayersIsMainColumn(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(layers)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('is_main')) {
    db.prepare('ALTER TABLE layers ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0').run();
    const scenes = db.prepare('SELECT DISTINCT scene_id FROM layers').all() as { scene_id: string }[];
    for (const { scene_id } of scenes) {
      const first = db.prepare('SELECT id FROM layers WHERE scene_id = ? ORDER BY created_at ASC LIMIT 1').get(scene_id) as { id: string } | undefined;
      if (first) db.prepare('UPDATE layers SET is_main = 1 WHERE id = ?').run(first.id);
    }
  }
}

export function getLayers(projectDir: string, sceneId: string): LayerRow[] {
  ensureLayersLayerTypeColumn(projectDir);
  ensureLayersIsMainColumn(projectDir);
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM layers WHERE scene_id = ? ORDER BY z_index ASC, created_at ASC').all(sceneId) as LayerRow[];
}

/** 获取场景的主分层 id（is_main=1）；见功能文档 6.7 */
export function getMainLayerId(projectDir: string, sceneId: string): string | null {
  ensureLayersIsMainColumn(projectDir);
  const db = getDb(projectDir);
  const row = db.prepare('SELECT id FROM layers WHERE scene_id = ? AND is_main = 1 LIMIT 1').get(sceneId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function createLayer(
  projectDir: string,
  data: { id: string; scene_id: string; name?: string; z_index?: number; is_main?: number }
): { ok: boolean; error?: string } {
  try {
    ensureLayersIsMainColumn(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const isMain = data.is_main ?? 0;
    const layerType = (data as { layer_type?: string }).layer_type ?? 'video';
    db.prepare(
      `INSERT INTO layers (id, scene_id, name, z_index, visible, locked, is_main, layer_type, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`
    ).run(data.id, data.scene_id, data.name ?? '图层', data.z_index ?? 0, isMain, layerType, now, now);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateLayer(
  projectDir: string,
  id: string,
  data: Partial<Pick<LayerRow, 'name' | 'z_index' | 'visible' | 'locked' | 'layer_type'>>
): { ok: boolean; error?: string } {
  try {
    ensureLayersLayerTypeColumn(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM layers WHERE id = ?').get(id) as LayerRow | undefined;
    if (!row) return { ok: false, error: '图层不存在' };
    const layerType = data.layer_type !== undefined ? data.layer_type : (row.layer_type ?? 'video');
    db.prepare(
      `UPDATE layers SET name = ?, z_index = ?, visible = ?, locked = ?, layer_type = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.name ?? row.name,
      data.z_index !== undefined ? data.z_index : row.z_index,
      data.visible !== undefined ? data.visible : row.visible,
      data.locked !== undefined ? data.locked : row.locked,
      layerType,
      now,
      id
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 删除分层（见功能文档 6.7）；主分层不可删除；先删该层下所有素材条及关键帧，再删层 */
export function deleteLayer(projectDir: string, layerId: string): { ok: boolean; error?: string } {
  try {
    ensureLayersIsMainColumn(projectDir);
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesTable(projectDir);
    const db = getDb(projectDir);
    const layer = db.prepare('SELECT is_main FROM layers WHERE id = ?').get(layerId) as { is_main: number } | undefined;
    if (layer?.is_main) return { ok: false, error: '主分层不可删除' };
    const blocks = db.prepare('SELECT id FROM timeline_blocks WHERE layer_id = ?').all(layerId) as { id: string }[];
    for (const b of blocks) {
      db.prepare('DELETE FROM keyframes WHERE block_id = ?').run(b.id);
    }
    db.prepare('DELETE FROM timeline_blocks WHERE layer_id = ?').run(layerId);
    db.prepare('DELETE FROM layers WHERE id = ?').run(layerId);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- timeline_blocks（见功能文档 6.7、开发计划 2.10；位置/缩放/旋转归一化存储）----------
export interface TimelineBlockRow {
  id: string;
  layer_id: string;
  asset_id: string | null;
  start_time: number;
  end_time: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  lock_aspect?: number;
  blur?: number;
  opacity?: number;
  created_at: string;
  updated_at: string;
}

const TIMELINE_BLOCKS_TRANSFORM_COLUMNS = ['pos_x', 'pos_y', 'scale_x', 'scale_y', 'rotation'] as const;

function ensureTimelineBlocksTransformColumns(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(timeline_blocks)').all() as { name: string }[]).map((c) => c.name);
  for (const col of TIMELINE_BLOCKS_TRANSFORM_COLUMNS) {
    if (!columns.includes(col)) {
      const def = col === 'pos_x' || col === 'pos_y' ? '0.5' : col === 'rotation' ? '0' : '1';
      db.prepare(`ALTER TABLE timeline_blocks ADD COLUMN ${col} REAL NOT NULL DEFAULT ${def}`).run();
    }
  }
  if (!columns.includes('lock_aspect')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN lock_aspect INTEGER NOT NULL DEFAULT 1').run();
  }
  if (!columns.includes('blur')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN blur REAL NOT NULL DEFAULT 0').run();
  }
  if (!columns.includes('opacity')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN opacity REAL NOT NULL DEFAULT 1').run();
  }
}

export function getTimelineBlocks(projectDir: string, layerId: string): TimelineBlockRow[] {
  ensureTimelineBlocksTransformColumns(projectDir);
  const db = getDb(projectDir);
  const rows = db.prepare('SELECT * FROM timeline_blocks WHERE layer_id = ? ORDER BY start_time ASC').all(layerId) as TimelineBlockRow[];
  return rows.map((r) => ({
    ...r,
    pos_x: r.pos_x ?? 0.5,
    pos_y: r.pos_y ?? 0.5,
    scale_x: r.scale_x ?? 1,
    scale_y: r.scale_y ?? 1,
    rotation: r.rotation ?? 0,
    lock_aspect: (r as { lock_aspect?: number }).lock_aspect ?? 1,
    blur: (r as { blur?: number }).blur ?? 0,
    opacity: (r as { opacity?: number }).opacity ?? 1,
  }));
}

/** 按 id 获取单个时间轴块（见开发计划 2.12 选中素材设置） */
export function getTimelineBlockById(projectDir: string, blockId: string): TimelineBlockRow | null {
  ensureTimelineBlocksTransformColumns(projectDir);
  const db = getDb(projectDir);
  const row = db.prepare('SELECT * FROM timeline_blocks WHERE id = ?').get(blockId) as TimelineBlockRow | undefined;
  if (!row) return null;
  return {
    ...row,
    pos_x: row.pos_x ?? 0.5,
    pos_y: row.pos_y ?? 0.5,
    scale_x: row.scale_x ?? 1,
    scale_y: row.scale_y ?? 1,
    rotation: row.rotation ?? 0,
    lock_aspect: (row as { lock_aspect?: number }).lock_aspect ?? 1,
    blur: (row as { blur?: number }).blur ?? 0,
    opacity: (row as { opacity?: number }).opacity ?? 1,
  };
}

export function createTimelineBlock(
  projectDir: string,
  data: { id: string; layer_id: string; asset_id?: string | null; start_time?: number; end_time?: number; pos_x?: number; pos_y?: number; scale_x?: number; scale_y?: number; rotation?: number }
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    db.prepare(
      `INSERT INTO timeline_blocks (id, layer_id, asset_id, start_time, end_time, pos_x, pos_y, scale_x, scale_y, rotation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.id,
      data.layer_id,
      data.asset_id ?? null,
      data.start_time ?? 0,
      data.end_time ?? 1,
      data.pos_x ?? 0.5,
      data.pos_y ?? 0.5,
      data.scale_x ?? 1,
      data.scale_y ?? 1,
      data.rotation ?? 0,
      now,
      now
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateTimelineBlock(
  projectDir: string,
  id: string,
  data: Partial<Pick<TimelineBlockRow, 'layer_id' | 'asset_id' | 'start_time' | 'end_time' | 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'lock_aspect' | 'blur' | 'opacity'>>
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM timeline_blocks WHERE id = ?').get(id) as TimelineBlockRow | undefined;
    if (!row) return { ok: false, error: '素材块不存在' };
    const newStart = data.start_time !== undefined ? data.start_time : row.start_time;
    const layer_id = data.layer_id !== undefined ? data.layer_id : row.layer_id;
    const lockAspect = data.lock_aspect !== undefined ? data.lock_aspect : ((row as { lock_aspect?: number }).lock_aspect ?? 1);
    const blur = data.blur !== undefined ? data.blur : ((row as { blur?: number }).blur ?? 0);
    const opacity = data.opacity !== undefined ? data.opacity : ((row as { opacity?: number }).opacity ?? 1);
    db.prepare(
      `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, updated_at = ? WHERE id = ?`
    ).run(
      layer_id,
      data.asset_id !== undefined ? data.asset_id : row.asset_id,
      newStart,
      data.end_time !== undefined ? data.end_time : row.end_time,
      data.pos_x !== undefined ? data.pos_x : (row.pos_x ?? 0.5),
      data.pos_y !== undefined ? data.pos_y : (row.pos_y ?? 0.5),
      data.scale_x !== undefined ? data.scale_x : (row.scale_x ?? 1),
      data.scale_y !== undefined ? data.scale_y : (row.scale_y ?? 1),
      data.rotation !== undefined ? data.rotation : (row.rotation ?? 0),
      lockAspect,
      blur,
      opacity,
      now,
      id
    );
    const startDelta = newStart - row.start_time;
    if (Math.abs(startDelta) >= 1e-9) shiftKeyframesForBlock(projectDir, id, startDelta);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 删除素材条（见功能文档 6.7、开发计划 2.11）；先删该块下关键帧再删块 */
export function deleteTimelineBlock(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesTable(projectDir);
    const db = getDb(projectDir);
    db.prepare('DELETE FROM keyframes WHERE block_id = ?').run(id);
    db.prepare('DELETE FROM timeline_blocks WHERE id = ?').run(id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 主轨道插入素材（见功能文档 6.4/6.7）：在 insertAt 插入，重叠则截断已有素材，后续素材后移；被后移的素材条其关键帧同步平移 */
export function insertBlockAtMainTrack(
  projectDir: string,
  sceneId: string,
  data: { id: string; asset_id: string | null; duration: number; insertAt: number; pos_x?: number; pos_y?: number; scale_x?: number; scale_y?: number; rotation?: number }
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesExtraColumns(projectDir);
    const db = getDb(projectDir);
    const mainLayerId = getMainLayerId(projectDir, sceneId);
    if (!mainLayerId) return { ok: false, error: '无主轨道，请先创建场景' };

    const duration = Math.max(0.5, data.duration);
    const insertAt = Math.max(0, data.insertAt);

    db.transaction(() => {
      const blocks = db.prepare('SELECT id, start_time, end_time FROM timeline_blocks WHERE layer_id = ? ORDER BY start_time ASC').all(mainLayerId) as { id: string; start_time: number; end_time: number }[];
      const now = new Date().toISOString();

      // 若某块包含 insertAt，将其截断为 [start, insertAt]
      for (const b of blocks) {
        if (b.start_time < insertAt && b.end_time > insertAt) {
          db.prepare('UPDATE timeline_blocks SET end_time = ?, updated_at = ? WHERE id = ?').run(insertAt, now, b.id);
        }
      }

      // 后移 start_time >= insertAt 的块，关键帧随素材条平移
      const toShift = db.prepare('SELECT id, start_time, end_time FROM timeline_blocks WHERE layer_id = ? AND start_time >= ? ORDER BY start_time ASC').all(mainLayerId, insertAt) as { id: string; start_time: number; end_time: number }[];
      for (const b of toShift) {
        db.prepare('UPDATE timeline_blocks SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(b.start_time + duration, b.end_time + duration, now, b.id);
        shiftKeyframesForBlock(projectDir, b.id, duration);
      }

      // 创建新块
      db.prepare(
        `INSERT INTO timeline_blocks (id, layer_id, asset_id, start_time, end_time, pos_x, pos_y, scale_x, scale_y, rotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        data.id,
        mainLayerId,
        data.asset_id ?? null,
        insertAt,
        insertAt + duration,
        data.pos_x ?? 0.5,
        data.pos_y ?? 0.5,
        data.scale_x ?? 0.25,
        data.scale_y ?? 0.25,
        data.rotation ?? 0,
        now,
        now
      );
    })();

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 将已有素材条移动到主轨道指定位置（插入+后移，见功能文档 6.7）；关键帧随素材条平移 */
export function moveBlockToMainTrack(projectDir: string, sceneId: string, blockId: string, insertAt: number): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesExtraColumns(projectDir);
    const db = getDb(projectDir);
    const block = db.prepare('SELECT * FROM timeline_blocks WHERE id = ?').get(blockId) as TimelineBlockRow | undefined;
    if (!block) return { ok: false, error: '素材块不存在' };
    const mainLayerId = getMainLayerId(projectDir, sceneId);
    if (!mainLayerId) return { ok: false, error: '无主轨道' };
    const duration = Math.max(0.5, block.end_time - block.start_time);
    const at = Math.max(0, insertAt);

    db.transaction(() => {
      const now = new Date().toISOString();
      const mainBlocks = db.prepare('SELECT id, start_time, end_time FROM timeline_blocks WHERE layer_id = ? AND id != ? ORDER BY start_time ASC').all(mainLayerId, blockId) as { id: string; start_time: number; end_time: number }[];
      for (const b of mainBlocks) {
        if (b.start_time < at && b.end_time > at) {
          db.prepare('UPDATE timeline_blocks SET end_time = ?, updated_at = ? WHERE id = ?').run(at, now, b.id);
        }
      }
      const toShift = db.prepare('SELECT id, start_time, end_time FROM timeline_blocks WHERE layer_id = ? AND id != ? AND start_time >= ? ORDER BY start_time ASC').all(mainLayerId, blockId, at) as { id: string; start_time: number; end_time: number }[];
      for (const b of toShift) {
        db.prepare('UPDATE timeline_blocks SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(b.start_time + duration, b.end_time + duration, now, b.id);
        shiftKeyframesForBlock(projectDir, b.id, duration);
      }
      db.prepare('UPDATE timeline_blocks SET layer_id = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(mainLayerId, at, at + duration, now, blockId);
      shiftKeyframesForBlock(projectDir, blockId, at - block.start_time);
    })();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 调整素材条 end_time 并级联后移后续素材（见功能文档 6.7，仅主轨道）；被后移的素材条其关键帧同步平移 */
export function resizeTimelineBlockWithCascade(projectDir: string, blockId: string, newEndTime: number): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesExtraColumns(projectDir);
    const db = getDb(projectDir);
    const row = db.prepare('SELECT id, layer_id, start_time, end_time FROM timeline_blocks WHERE id = ?').get(blockId) as { id: string; layer_id: string; start_time: number; end_time: number } | undefined;
    if (!row) return { ok: false, error: '素材块不存在' };
    const minDur = 0.5;
    const newEnd = Math.max(row.start_time + minDur, newEndTime);
    const delta = newEnd - row.end_time;
    if (Math.abs(delta) < 0.001) return { ok: true };

    const now = new Date().toISOString();
    const toShiftIds = db.prepare('SELECT id FROM timeline_blocks WHERE layer_id = ? AND start_time >= ? AND id != ?').all(row.layer_id, row.end_time, blockId) as { id: string }[];
    db.prepare('UPDATE timeline_blocks SET end_time = ?, updated_at = ? WHERE id = ?').run(newEnd, now, blockId);
    db.prepare('UPDATE timeline_blocks SET start_time = start_time + ?, end_time = end_time + ?, updated_at = ? WHERE layer_id = ? AND start_time >= ? AND id != ?').run(delta, delta, now, row.layer_id, row.end_time, blockId);
    for (const { id } of toShiftIds) shiftKeyframesForBlock(projectDir, id, delta);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- keyframes（见功能文档 6.7、6.8；关键帧按属性独立：位置/缩放/旋转/模糊/透明度/色彩）----------
export type KeyframeProperty = 'pos' | 'scale' | 'rotation' | 'blur' | 'opacity' | 'color';

export interface KeyframeRow {
  id: string;
  block_id: string;
  time: number;
  property: KeyframeProperty;
  pos_x: number | null;
  pos_y: number | null;
  scale_x: number | null;
  scale_y: number | null;
  rotation: number | null;
  blur: number | null;
  opacity: number | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function ensureKeyframesTable(projectDir: string): void {
  const db = getDb(projectDir);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='keyframes'").all() as { name: string }[]);
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE keyframes (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL,
        time REAL NOT NULL,
        property TEXT NOT NULL DEFAULT 'pos',
        pos_x REAL,
        pos_y REAL,
        scale_x REAL,
        scale_y REAL,
        rotation REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }
}

function ensureKeyframesPropertyColumn(projectDir: string): void {
  ensureKeyframesTable(projectDir);
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(keyframes)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('property')) {
    db.prepare("ALTER TABLE keyframes ADD COLUMN property TEXT NOT NULL DEFAULT 'pos'").run();
  }
}

function ensureKeyframesExtraColumns(projectDir: string): void {
  ensureKeyframesPropertyColumn(projectDir);
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(keyframes)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('blur')) db.prepare('ALTER TABLE keyframes ADD COLUMN blur REAL').run();
  if (!columns.includes('opacity')) db.prepare('ALTER TABLE keyframes ADD COLUMN opacity REAL').run();
  if (!columns.includes('color')) db.prepare('ALTER TABLE keyframes ADD COLUMN color TEXT').run();
}

/** 将某素材条下的所有关键帧时间平移 delta（关键帧相对于素材条，移动素材条时需同步平移关键帧，见功能文档 6.8） */
function shiftKeyframesForBlock(projectDir: string, blockId: string, delta: number): void {
  if (Math.abs(delta) < 1e-9) return;
  ensureKeyframesExtraColumns(projectDir);
  const db = getDb(projectDir);
  const now = new Date().toISOString();
  db.prepare('UPDATE keyframes SET time = time + ?, updated_at = ? WHERE block_id = ?').run(delta, now, blockId);
}

export function getKeyframes(projectDir: string, blockId?: string): KeyframeRow[] {
  ensureKeyframesExtraColumns(projectDir);
  const db = getDb(projectDir);
  const rows = blockId
    ? (db.prepare('SELECT * FROM keyframes WHERE block_id = ? ORDER BY time ASC').all(blockId) as KeyframeRow[])
    : (db.prepare('SELECT * FROM keyframes ORDER BY block_id ASC, time ASC').all() as KeyframeRow[]);
  return rows.map((r) => ({
    ...r,
    property: (r.property || 'pos') as KeyframeProperty,
    blur: r.blur ?? null,
    opacity: r.opacity ?? null,
    color: r.color ?? null,
  }));
}

export function createKeyframe(
  projectDir: string,
  data: {
    id: string;
    block_id: string;
    time: number;
    property: KeyframeProperty;
    pos_x?: number | null;
    pos_y?: number | null;
    scale_x?: number | null;
    scale_y?: number | null;
    rotation?: number | null;
    blur?: number | null;
    opacity?: number | null;
    color?: string | null;
  }
): { ok: boolean; error?: string } {
  try {
    ensureKeyframesExtraColumns(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const prop = data.property || 'pos';
    const posX = prop === 'pos' ? (data.pos_x ?? null) : null;
    const posY = prop === 'pos' ? (data.pos_y ?? null) : null;
    const scaleX = prop === 'scale' ? (data.scale_x ?? null) : null;
    const scaleY = prop === 'scale' ? (data.scale_y ?? null) : null;
    const rot = prop === 'rotation' ? (data.rotation ?? null) : null;
    const blur = prop === 'blur' ? (data.blur ?? null) : null;
    const opacity = prop === 'opacity' ? (data.opacity ?? null) : null;
    const color = prop === 'color' ? (data.color ?? null) : null;
    db.prepare(
      `INSERT INTO keyframes (id, block_id, time, property, pos_x, pos_y, scale_x, scale_y, rotation, blur, opacity, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.block_id, data.time, prop, posX, posY, scaleX, scaleY, rot, blur, opacity, color, now, now);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateKeyframe(
  projectDir: string,
  id: string,
  data: {
    pos_x?: number;
    pos_y?: number;
    scale_x?: number;
    scale_y?: number;
    rotation?: number;
    blur?: number;
    opacity?: number;
    color?: string;
  }
): { ok: boolean; error?: string } {
  try {
    ensureKeyframesExtraColumns(projectDir);
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM keyframes WHERE id = ?').get(id) as KeyframeRow | undefined;
    if (!row) return { ok: false, error: '关键帧不存在' };
    const now = new Date().toISOString();
    const prop = (row.property || 'pos') as KeyframeProperty;
    const posX = prop === 'pos' && data.pos_x !== undefined ? data.pos_x : row.pos_x;
    const posY = prop === 'pos' && data.pos_y !== undefined ? data.pos_y : row.pos_y;
    const scaleX = prop === 'scale' && data.scale_x !== undefined ? data.scale_x : row.scale_x;
    const scaleY = prop === 'scale' && data.scale_y !== undefined ? data.scale_y : row.scale_y;
    const rot = prop === 'rotation' && data.rotation !== undefined ? data.rotation : row.rotation;
    const blur = prop === 'blur' && data.blur !== undefined ? data.blur : row.blur;
    const opacity = prop === 'opacity' && data.opacity !== undefined ? data.opacity : row.opacity;
    const color = prop === 'color' && data.color !== undefined ? data.color : row.color;
    db.prepare(
      `UPDATE keyframes SET pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, blur = ?, opacity = ?, color = ?, updated_at = ? WHERE id = ?`
    ).run(posX, posY, scaleX, scaleY, rot, blur ?? null, opacity ?? null, color ?? null, now, id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function deleteKeyframe(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    ensureKeyframesExtraColumns(projectDir);
    getDb(projectDir).prepare('DELETE FROM keyframes WHERE id = ?').run(id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- characters ----------
function ensureCharactersAnglesColumn(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(characters)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'angles')) {
    db.prepare('ALTER TABLE characters ADD COLUMN angles TEXT').run();
  }
}

export function getCharacters(projectDir: string): CharacterRow[] {
  const db = getDb(projectDir);
  ensureCharactersAnglesColumn(db);
  return db.prepare('SELECT * FROM characters ORDER BY created_at ASC').all() as CharacterRow[];
}

export function createCharacter(
  projectDir: string,
  data: { id: string; name?: string; image_path?: string | null; note?: string | null; tts_voice?: string | null; tts_speed?: number | null; angles?: string | null }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    ensureCharactersAnglesColumn(db);
    db.prepare(
      `INSERT INTO characters (id, name, image_path, note, tts_voice, tts_speed, angles, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.id,
      data.name ?? '',
      data.image_path ?? null,
      data.note ?? null,
      data.tts_voice ?? null,
      data.tts_speed ?? null,
      data.angles ?? null,
      now,
      now
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateCharacter(
  projectDir: string,
  id: string,
  data: Partial<Pick<CharacterRow, 'name' | 'image_path' | 'note' | 'tts_voice' | 'tts_speed' | 'angles'>>
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    ensureCharactersAnglesColumn(db);
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
    if (!row) return { ok: false, error: '人物不存在' };
    db.prepare(
      `UPDATE characters SET name = ?, image_path = ?, note = ?, tts_voice = ?, tts_speed = ?, angles = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.name ?? row.name,
      data.image_path !== undefined ? data.image_path : row.image_path,
      data.note !== undefined ? data.note : row.note,
      data.tts_voice !== undefined ? data.tts_voice : row.tts_voice,
      data.tts_speed !== undefined ? data.tts_speed : row.tts_speed,
      data.angles !== undefined ? data.angles : row.angles ?? null,
      now,
      id
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function deleteCharacter(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    getDb(projectDir).prepare('DELETE FROM characters WHERE id = ?').run(id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- ai_config ----------
export function getAiConfig(projectDir: string): AiConfigRow | null {
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM ai_config LIMIT 1').get() as AiConfigRow | null;
}

export function saveAiConfig(
  projectDir: string,
  data: { script_expert_prompt?: string | null; painting_prompt?: string | null }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM ai_config LIMIT 1').get() as AiConfigRow | undefined;
    if (!row) return { ok: false, error: 'ai_config 不存在' };
    db.prepare(
      `UPDATE ai_config SET script_expert_prompt = ?, painting_prompt = ?, updated_at = ?`
    ).run(
      data.script_expert_prompt !== undefined ? data.script_expert_prompt : row.script_expert_prompt,
      data.painting_prompt !== undefined ? data.painting_prompt : row.painting_prompt,
      now
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- assets_index（见功能文档 5、开发计划 2.6/2.8）----------
export interface AssetRow {
  id: string;
  path: string;
  type: string;
  is_favorite: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function getAssets(projectDir: string, type?: string): AssetRow[] {
  const db = getDb(projectDir);
  if (type) {
    return db.prepare('SELECT * FROM assets_index WHERE type = ? ORDER BY created_at ASC').all(type) as AssetRow[];
  }
  return db.prepare('SELECT * FROM assets_index ORDER BY created_at ASC').all() as AssetRow[];
}

export function getAssetById(projectDir: string, id: string): AssetRow | null {
  const db = getDb(projectDir);
  return db.prepare('SELECT * FROM assets_index WHERE id = ?').get(id) as AssetRow | null;
}

/** 从本地文件复制到项目 assets 并写入 assets_index（见开发计划 2.6/2.8 本地上传） */
export function saveAssetFromFile(
  projectDir: string,
  sourcePath: string,
  type: string = 'character',
  options?: { description?: string | null; is_favorite?: number }
): { ok: boolean; path?: string; id?: string; error?: string } {
  try {
    const normalized = path.normalize(projectDir);
    const assetsDir = path.join(normalized, DIR_ASSETS);
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const ext = path.extname(sourcePath) || '.png';
    const id = crypto.randomUUID();
    const fileName = id + ext;
    const destPath = path.join(assetsDir, fileName);
    fs.copyFileSync(sourcePath, destPath);
    const relativePath = DIR_ASSETS + '/' + fileName;
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const isFav = options?.is_favorite ?? 0;
    const desc = options?.description ?? null;
    db.prepare(
      `INSERT INTO assets_index (id, path, type, is_favorite, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, relativePath, type, isFav, desc, now, now);
    return { ok: true, path: relativePath, id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 更新素材索引（描述、常用标记）（见开发计划 2.8） */
export function updateAsset(
  projectDir: string,
  id: string,
  data: { description?: string | null; is_favorite?: number }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM assets_index WHERE id = ?').get(id) as AssetRow | undefined;
    if (!row) return { ok: false, error: '素材不存在' };
    db.prepare(
      `UPDATE assets_index SET description = ?, is_favorite = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.description !== undefined ? data.description : row.description,
      data.is_favorite !== undefined ? data.is_favorite : row.is_favorite,
      now,
      id
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 删除素材索引（不删物理文件，见开发计划 2.8） */
export function deleteAsset(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    getDb(projectDir).prepare('DELETE FROM assets_index WHERE id = ?').run(id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 读取项目内资源文件为 base64 data URL，供渲染进程显示（见开发计划 2.6） */
export function getAssetDataUrl(projectDir: string, relativePath: string): string | null {
  try {
    const fullPath = path.join(path.normalize(projectDir), relativePath);
    if (!fs.existsSync(fullPath)) return null;
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(relativePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
