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
  /** JSON：结构化剧本 { dramaTags, scenes }，见 docs/短漫剧剧本元素说明.md 15，暂不含节拍 */
  script_structured?: string | null;
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
  /** JSON 数组：精灵动作图列表。每项 { id, name?, image_path, frame_count?, chroma_key? } */
  sprite_sheets: string | null;
  /** JSON 数组：元件列表。每项 { id, name, states: [{ id, tags: string[], items: CanvasItem[] }] } */
  component_groups: string | null;
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
        sprite_sheets TEXT,
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
        cover_path TEXT,
        tags TEXT,
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
  data: Partial<Pick<EpisodeRow, 'title' | 'sort_order' | 'summary' | 'script_text' | 'character_refs' | 'script_structured'>>
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
    const hasScriptStructured = columns.some((c) => c.name === 'script_structured');
    if (!hasScriptStructured) {
      db.prepare('ALTER TABLE episodes ADD COLUMN script_structured TEXT').run();
    }
    const scriptStructured =
      (data as { script_structured?: string | null }).script_structured !== undefined
        ? (data as { script_structured?: string | null }).script_structured
        : (row as { script_structured?: string | null }).script_structured;
    db.prepare(
      `UPDATE episodes SET title = ?, sort_order = ?, summary = ?, script_text = ?, character_refs = ?, script_structured = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.title ?? row.title,
      data.sort_order ?? row.sort_order,
      data.summary ?? row.summary,
      data.script_text ?? row.script_text,
      charRefs,
      scriptStructured ?? null,
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
  /** 精灵图播放速度（帧/秒），仅精灵类素材使用 */
  playback_fps?: number;
  /** 精灵图播放次数，duration = (frame_count/fps)*count，仅精灵类素材使用 */
  playback_count?: number;
  /** 音量 0~1，音效/音乐使用 */
  volume?: number;
  /** 是否渐入，音效/音乐使用 */
  fade_in?: number;
  /** 是否渐出，音效/音乐使用 */
  fade_out?: number;
  /** 动画配置 JSON，见 docs/08-素材动画功能技术方案.md */
  animation_config?: string | null;
  /** 状态关键帧 JSON，元件/标签精灵用：[{ time, selectedTagsByGroupId?, selectedTagsBySpriteItemId? }] */
  state_keyframes?: string | null;
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
  if (!columns.includes('playback_fps')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN playback_fps REAL').run();
  }
  if (!columns.includes('playback_count')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN playback_count INTEGER').run();
  }
}

function ensureTimelineBlocksAudioColumns(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(timeline_blocks)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('volume')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN volume REAL NOT NULL DEFAULT 1').run();
  }
  if (!columns.includes('fade_in')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN fade_in INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!columns.includes('fade_out')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN fade_out INTEGER NOT NULL DEFAULT 0').run();
  }
}

function ensureTimelineBlocksAnimationColumn(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(timeline_blocks)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('animation_config')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN animation_config TEXT').run();
  }
}

function ensureTimelineBlocksStateKeyframesColumn(projectDir: string): void {
  const db = getDb(projectDir);
  const columns = (db.prepare('PRAGMA table_info(timeline_blocks)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('state_keyframes')) {
    db.prepare('ALTER TABLE timeline_blocks ADD COLUMN state_keyframes TEXT').run();
  }
}

export function getTimelineBlocks(projectDir: string, layerId: string): TimelineBlockRow[] {
  ensureTimelineBlocksTransformColumns(projectDir);
  ensureTimelineBlocksAudioColumns(projectDir);
  ensureTimelineBlocksAnimationColumn(projectDir);
  ensureTimelineBlocksStateKeyframesColumn(projectDir);
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
  ensureTimelineBlocksAudioColumns(projectDir);
  ensureTimelineBlocksAnimationColumn(projectDir);
  ensureTimelineBlocksStateKeyframesColumn(projectDir);
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
  data: Partial<Pick<TimelineBlockRow, 'layer_id' | 'asset_id' | 'start_time' | 'end_time' | 'pos_x' | 'pos_y' | 'scale_x' | 'scale_y' | 'rotation' | 'lock_aspect' | 'blur' | 'opacity' | 'playback_fps' | 'playback_count' | 'volume' | 'fade_in' | 'fade_out' | 'animation_config' | 'state_keyframes'>>
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureTimelineBlocksAudioColumns(projectDir);
    ensureTimelineBlocksAnimationColumn(projectDir);
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    const row = db.prepare('SELECT * FROM timeline_blocks WHERE id = ?').get(id) as TimelineBlockRow | undefined;
    if (!row) return { ok: false, error: '素材块不存在' };
    const newStart = data.start_time !== undefined ? data.start_time : row.start_time;
    const layer_id = data.layer_id !== undefined ? data.layer_id : row.layer_id;
    const lockAspect = data.lock_aspect !== undefined ? data.lock_aspect : ((row as { lock_aspect?: number }).lock_aspect ?? 1);
    const blur = data.blur !== undefined ? data.blur : ((row as { blur?: number }).blur ?? 0);
    const opacity = data.opacity !== undefined ? data.opacity : ((row as { opacity?: number }).opacity ?? 1);
    const playbackFps = data.playback_fps !== undefined ? data.playback_fps : ((row as { playback_fps?: number }).playback_fps ?? null);
    const playbackCount = data.playback_count !== undefined ? data.playback_count : ((row as { playback_count?: number }).playback_count ?? null);
    const volume = data.volume !== undefined ? data.volume : ((row as { volume?: number }).volume ?? 1);
    const fadeIn = data.fade_in !== undefined ? data.fade_in : ((row as { fade_in?: number }).fade_in ?? 0);
    const fadeOut = data.fade_out !== undefined ? data.fade_out : ((row as { fade_out?: number }).fade_out ?? 0);
    ensureTimelineBlocksStateKeyframesColumn(projectDir);
    const animationConfig = data.animation_config !== undefined ? data.animation_config : ((row as { animation_config?: string | null }).animation_config ?? null);
    const stateKeyframes = data.state_keyframes !== undefined ? data.state_keyframes : ((row as { state_keyframes?: string | null }).state_keyframes ?? null);
    const cols = (db.prepare('PRAGMA table_info(timeline_blocks)').all() as { name: string }[]).map((c) => c.name);
    const hasPlaybackCount = cols.includes('playback_count');
    const hasVolume = cols.includes('volume');
    const hasAnimationConfig = cols.includes('animation_config');
    const hasStateKeyframes = cols.includes('state_keyframes');
    const setClause = hasStateKeyframes
      ? (hasAnimationConfig
        ? (hasVolume
          ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, volume = ?, fade_in = ?, fade_out = ?, animation_config = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`
          : hasPlaybackCount
            ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, animation_config = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`
            : `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, animation_config = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`)
        : (hasVolume
          ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, volume = ?, fade_in = ?, fade_out = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`
          : hasPlaybackCount
            ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`
            : `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, state_keyframes = ?, updated_at = ? WHERE id = ?`))
      : (hasAnimationConfig
        ? (hasVolume
          ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, volume = ?, fade_in = ?, fade_out = ?, animation_config = ?, updated_at = ? WHERE id = ?`
          : hasPlaybackCount
            ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, animation_config = ?, updated_at = ? WHERE id = ?`
            : `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, animation_config = ?, updated_at = ? WHERE id = ?`)
        : (hasVolume
          ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, volume = ?, fade_in = ?, fade_out = ?, updated_at = ? WHERE id = ?`
          : hasPlaybackCount
            ? `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, playback_count = ?, updated_at = ? WHERE id = ?`
            : `UPDATE timeline_blocks SET layer_id = ?, asset_id = ?, start_time = ?, end_time = ?, pos_x = ?, pos_y = ?, scale_x = ?, scale_y = ?, rotation = ?, lock_aspect = ?, blur = ?, opacity = ?, playback_fps = ?, updated_at = ? WHERE id = ?`));
    const baseParams: unknown[] = [layer_id, data.asset_id !== undefined ? data.asset_id : row.asset_id, newStart, data.end_time !== undefined ? data.end_time : row.end_time, data.pos_x !== undefined ? data.pos_x : (row.pos_x ?? 0.5), data.pos_y !== undefined ? data.pos_y : (row.pos_y ?? 0.5), data.scale_x !== undefined ? data.scale_x : (row.scale_x ?? 1), data.scale_y !== undefined ? data.scale_y : (row.scale_y ?? 1), data.rotation !== undefined ? data.rotation : (row.rotation ?? 0), lockAspect, blur, opacity, playbackFps];
    if (hasPlaybackCount) baseParams.push(playbackCount);
    if (hasVolume) baseParams.push(volume, fadeIn, fadeOut);
    if (hasAnimationConfig) baseParams.push(animationConfig);
    if (hasStateKeyframes) baseParams.push(stateKeyframes);
    baseParams.push(now, id);
    const params = baseParams;
    db.prepare(setClause).run(...params);
    const startDelta = newStart - row.start_time;
    if (Math.abs(startDelta) >= 1e-9) shiftKeyframesForBlock(projectDir, id, startDelta);
    const layerRow = db.prepare('SELECT scene_id FROM layers WHERE id = ? AND is_main = 1').get(row.layer_id) as { scene_id: string } | undefined;
    if (layerRow && (data.layer_id !== undefined || data.start_time !== undefined || data.end_time !== undefined)) compactMainTrack(projectDir, layerRow.scene_id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 删除素材条（见功能文档 6.7、开发计划 2.11）；先删该块下关键帧再删块；若为主轨道则 compact */
export function deleteTimelineBlock(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesTable(projectDir);
    const db = getDb(projectDir);
    const block = db.prepare('SELECT layer_id FROM timeline_blocks WHERE id = ?').get(id) as { layer_id: string } | undefined;
    const sceneRow = block ? (db.prepare('SELECT scene_id FROM layers WHERE id = ? AND is_main = 1').get(block.layer_id) as { scene_id: string } | undefined) : undefined;
    const sceneId = sceneRow?.scene_id;
    db.prepare('DELETE FROM keyframes WHERE block_id = ?').run(id);
    db.prepare('DELETE FROM timeline_blocks WHERE id = ?').run(id);
    if (sceneId) compactMainTrack(projectDir, sceneId);
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
    compactMainTrack(projectDir, sceneId);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 音效/音乐放置到声音层：在 startTime 放置，无声音层则创建，冲突则新建声音层；声音层在主层下面（见功能文档 6.7） */
export function insertBlockAtAudioTrack(
  projectDir: string,
  sceneId: string,
  data: { id: string; asset_id: string | null; start_time: number; duration: number }
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureTimelineBlocksAudioColumns(projectDir);
    const db = getDb(projectDir);
    const mainLayerId = getMainLayerId(projectDir, sceneId);
    if (!mainLayerId) return { ok: false, error: '无主轨道，请先创建场景' };

    const duration = Math.max(0.5, data.duration);
    const startTime = Math.max(0, data.start_time);
    const endTime = startTime + duration;

    const layers = getLayers(projectDir, sceneId);
    const audioLayers = layers.filter((l) => (l.layer_type ?? 'video') === 'audio').sort((a, b) => a.z_index - b.z_index);

    let targetLayerId: string | null = null;
    for (const layer of audioLayers) {
      const blocks = db.prepare('SELECT start_time, end_time FROM timeline_blocks WHERE layer_id = ?').all(layer.id) as { start_time: number; end_time: number }[];
      const overlaps = blocks.some((b) => !(endTime <= b.start_time || startTime >= b.end_time));
      if (!overlaps) {
        targetLayerId = layer.id;
        break;
      }
    }

    if (!targetLayerId) {
      const maxZ = Math.max(0, ...layers.map((l) => l.z_index ?? 0));
      const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const cr = createLayer(projectDir, {
        id: newLayerId,
        scene_id: sceneId,
        name: '声音层',
        z_index: maxZ + 1,
        is_main: 0,
        layer_type: 'audio',
      } as { id: string; scene_id: string; name?: string; z_index?: number; is_main?: number; layer_type?: string });
      if (!cr.ok) return cr;
      targetLayerId = newLayerId;
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO timeline_blocks (id, layer_id, asset_id, start_time, end_time, pos_x, pos_y, scale_x, scale_y, rotation, volume, fade_in, fade_out, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0.5, 0.5, 1, 1, 0, 1, 0, 0, ?, ?)`
    ).run(data.id, targetLayerId, data.asset_id ?? null, startTime, endTime, now, now);
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
    compactMainTrack(projectDir, sceneId);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 主轨道无间隔重排：按 blockOrder 顺序（未提供则按 start_time）重新分配 start_time/end_time，
 * 关键帧随素材平移。添加、删除、移出、移入、交换等操作后调用（见功能文档 6.7）
 */
export function compactMainTrack(
  projectDir: string,
  sceneId: string,
  blockOrder?: string[]
): { ok: boolean; error?: string } {
  try {
    ensureTimelineBlocksTransformColumns(projectDir);
    ensureKeyframesExtraColumns(projectDir);
    const db = getDb(projectDir);
    const mainLayerId = getMainLayerId(projectDir, sceneId);
    if (!mainLayerId) return { ok: true };

    const now = new Date().toISOString();
    let order: string[];
    if (blockOrder && blockOrder.length > 0) {
      order = blockOrder;
    } else {
      const rows = db
        .prepare('SELECT id FROM timeline_blocks WHERE layer_id = ? ORDER BY start_time ASC')
        .all(mainLayerId) as { id: string }[];
      order = rows.map((r) => r.id);
    }
    if (order.length === 0) return { ok: true };

    const placeholders = order.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT id, start_time, end_time FROM timeline_blocks WHERE id IN (${placeholders})`)
      .all(...order) as { id: string; start_time: number; end_time: number }[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    db.transaction(() => {
      let t = 0;
      for (const id of order) {
        const row = byId.get(id);
        if (!row) continue;
        const dur = Math.max(0.5, row.end_time - row.start_time);
        const newStart = t;
        const newEnd = t + dur;
        const delta = newStart - row.start_time;
        db.prepare('UPDATE timeline_blocks SET layer_id = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?').run(mainLayerId, newStart, newEnd, now, id);
        if (Math.abs(delta) >= 1e-9) shiftKeyframesForBlock(projectDir, id, delta);
        t = newEnd;
      }
    })();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 主轨道重排（按指定顺序调用 compactMainTrack） */
export function reorderMainTrack(projectDir: string, sceneId: string, blockIds: string[]): { ok: boolean; error?: string } {
  return compactMainTrack(projectDir, sceneId, blockIds);
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
    const layerRow = db.prepare('SELECT scene_id FROM layers WHERE id = ? AND is_main = 1').get(row.layer_id) as { scene_id: string } | undefined;
    if (layerRow) compactMainTrack(projectDir, layerRow.scene_id);
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
function ensureCharactersSpriteSheetsColumn(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(characters)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'sprite_sheets')) {
    db.prepare('ALTER TABLE characters ADD COLUMN sprite_sheets TEXT').run();
  }
}
function ensureCharactersComponentGroupsColumn(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(characters)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'component_groups')) {
    db.prepare('ALTER TABLE characters ADD COLUMN component_groups TEXT').run();
  }
}

export function getCharacters(projectDir: string): CharacterRow[] {
  const db = getDb(projectDir);
  ensureCharactersAnglesColumn(db);
  ensureCharactersSpriteSheetsColumn(db);
  ensureCharactersComponentGroupsColumn(db);
  return db.prepare('SELECT * FROM characters ORDER BY created_at ASC').all() as CharacterRow[];
}

export function createCharacter(
  projectDir: string,
  data: { id: string; name?: string; image_path?: string | null; note?: string | null; tts_voice?: string | null; tts_speed?: number | null; angles?: string | null; sprite_sheets?: string | null; component_groups?: string | null }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    ensureCharactersAnglesColumn(db);
    ensureCharactersSpriteSheetsColumn(db);
    ensureCharactersComponentGroupsColumn(db);
    db.prepare(
      `INSERT INTO characters (id, name, image_path, note, tts_voice, tts_speed, angles, sprite_sheets, component_groups, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.id,
      data.name ?? '',
      data.image_path ?? null,
      data.note ?? null,
      data.tts_voice ?? null,
      data.tts_speed ?? null,
      data.angles ?? null,
      data.sprite_sheets ?? null,
      data.component_groups ?? null,
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
  data: Partial<Pick<CharacterRow, 'name' | 'image_path' | 'note' | 'tts_voice' | 'tts_speed' | 'angles' | 'sprite_sheets' | 'component_groups'>>
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    ensureCharactersAnglesColumn(db);
    ensureCharactersSpriteSheetsColumn(db);
    ensureCharactersComponentGroupsColumn(db);
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
    if (!row) return { ok: false, error: '人物不存在' };
    db.prepare(
      `UPDATE characters SET name = ?, image_path = ?, note = ?, tts_voice = ?, tts_speed = ?, angles = ?, sprite_sheets = ?, component_groups = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.name ?? row.name,
      data.image_path !== undefined ? data.image_path : row.image_path,
      data.note !== undefined ? data.note : row.note,
      data.tts_voice !== undefined ? data.tts_voice : row.tts_voice,
      data.tts_speed !== undefined ? data.tts_speed : row.tts_speed,
      data.angles !== undefined ? data.angles : row.angles ?? null,
      data.sprite_sheets !== undefined ? data.sprite_sheets : row.sprite_sheets ?? null,
      data.component_groups !== undefined ? data.component_groups : row.component_groups ?? null,
      now,
      id
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 项目级未绑定人物的精灵图存储：使用虚拟 character 的 sprite_sheets */
export const STANDALONE_SPRITES_CHARACTER_ID = '__standalone_sprites__';

/** 项目级未绑定人物的元件存储：使用虚拟 character 的 component_groups */
export const STANDALONE_COMPONENTS_CHARACTER_ID = '__standalone_components__';

export function getOrCreateStandaloneSpritesCharacter(projectDir: string): CharacterRow {
  const db = getDb(projectDir);
  ensureCharactersSpriteSheetsColumn(db);
  ensureCharactersComponentGroupsColumn(db);
  let row = db.prepare('SELECT * FROM characters WHERE id = ?').get(STANDALONE_SPRITES_CHARACTER_ID) as CharacterRow | undefined;
  if (!row) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO characters (id, name, image_path, note, tts_voice, tts_speed, angles, sprite_sheets, component_groups, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(STANDALONE_SPRITES_CHARACTER_ID, '(项目精灵图)', null, null, null, null, null, '[]', null, now, now);
    row = db.prepare('SELECT * FROM characters WHERE id = ?').get(STANDALONE_SPRITES_CHARACTER_ID) as CharacterRow;
  }
  return row;
}

export function getOrCreateStandaloneComponentsCharacter(projectDir: string): CharacterRow {
  const db = getDb(projectDir);
  ensureCharactersSpriteSheetsColumn(db);
  ensureCharactersComponentGroupsColumn(db);
  let row = db.prepare('SELECT * FROM characters WHERE id = ?').get(STANDALONE_COMPONENTS_CHARACTER_ID) as CharacterRow | undefined;
  if (!row) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO characters (id, name, image_path, note, tts_voice, tts_speed, angles, sprite_sheets, component_groups, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(STANDALONE_COMPONENTS_CHARACTER_ID, '(项目元件)', null, null, null, null, null, null, '[]', now, now);
    row = db.prepare('SELECT * FROM characters WHERE id = ?').get(STANDALONE_COMPONENTS_CHARACTER_ID) as CharacterRow;
  }
  return row;
}

export function deleteCharacter(projectDir: string, id: string): { ok: boolean; error?: string } {
  try {
    if (id === STANDALONE_SPRITES_CHARACTER_ID) return { ok: false, error: '不可删除项目精灵图容器' };
    if (id === STANDALONE_COMPONENTS_CHARACTER_ID) return { ok: false, error: '不可删除项目元件容器' };
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
  cover_path?: string | null;
  tags?: string | null;
  /** 视频/透明视频：宽（像素） */
  width?: number | null;
  /** 视频/透明视频：高（像素） */
  height?: number | null;
  /** 视频/透明视频/音效/音乐：播放时长（秒） */
  duration?: number | null;
  created_at: string;
  updated_at: string;
}

function ensureAssetsCoverPathColumn(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(assets_index)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'cover_path')) {
    db.prepare('ALTER TABLE assets_index ADD COLUMN cover_path TEXT').run();
  }
}

function ensureAssetsTagsColumn(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(assets_index)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'tags')) {
    db.prepare('ALTER TABLE assets_index ADD COLUMN tags TEXT').run();
  }
}

function ensureAssetsVideoMetadataColumns(db: Database.Database): void {
  const info = db.prepare('PRAGMA table_info(assets_index)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'width')) {
    db.prepare('ALTER TABLE assets_index ADD COLUMN width INTEGER').run();
  }
  if (!info.some((c) => c.name === 'height')) {
    db.prepare('ALTER TABLE assets_index ADD COLUMN height INTEGER').run();
  }
  if (!info.some((c) => c.name === 'duration')) {
    db.prepare('ALTER TABLE assets_index ADD COLUMN duration REAL').run();
  }
}

export function getAssets(projectDir: string, type?: string): AssetRow[] {
  const db = getDb(projectDir);
  ensureAssetsCoverPathColumn(db);
  ensureAssetsTagsColumn(db);
  ensureAssetsVideoMetadataColumns(db);
  if (type) {
    return db.prepare('SELECT * FROM assets_index WHERE type = ? ORDER BY created_at DESC').all(type) as AssetRow[];
  }
  return db.prepare('SELECT * FROM assets_index ORDER BY created_at DESC').all() as AssetRow[];
}

export function getAssetById(projectDir: string, id: string): AssetRow | null {
  const db = getDb(projectDir);
  ensureAssetsCoverPathColumn(db);
  ensureAssetsTagsColumn(db);
  ensureAssetsVideoMetadataColumns(db);
  return db.prepare('SELECT * FROM assets_index WHERE id = ?').get(id) as AssetRow | null;
}

/** 从 base64 数据保存到项目 assets（供渲染进程即时透明抠图等）
 * replaceAssetId: 指定时仅保存文件并更新该素材的 path，不新建素材行（用于裁剪/抠图替换） */
export function saveAssetFromBase64(
  projectDir: string,
  base64Data: string,
  ext: string = '.png',
  type: string = 'character',
  options?: { replaceAssetId?: string }
): { ok: boolean; path?: string; id?: string; error?: string } {
  try {
    const normalized = path.normalize(projectDir);
    const assetsDir = path.join(normalized, DIR_ASSETS);
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const id = options?.replaceAssetId ?? crypto.randomUUID();
    const fileName = id + (ext.startsWith('.') ? ext : '.' + ext);
    const destPath = path.join(assetsDir, fileName);
    const buf = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(destPath, buf);
    const relativePath = DIR_ASSETS + '/' + fileName;
    const db = getDb(projectDir);
    ensureAssetsCoverPathColumn(db);
    ensureAssetsTagsColumn(db);
    ensureAssetsVideoMetadataColumns(db);
    if (options?.replaceAssetId) {
      const now = new Date().toISOString();
      db.prepare('UPDATE assets_index SET path = ?, updated_at = ? WHERE id = ?').run(relativePath, now, options.replaceAssetId);
      return { ok: true, path: relativePath, id: options.replaceAssetId };
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO assets_index (id, path, type, is_favorite, description, cover_path, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, relativePath, type, 0, null, null, null, now, now);
    return { ok: true, path: relativePath, id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
    ensureAssetsCoverPathColumn(db);
    ensureAssetsTagsColumn(db);
    ensureAssetsVideoMetadataColumns(db);
    const isFav = options?.is_favorite ?? 0;
    const desc = options?.description ?? null;
    const tags = (options as { tags?: string | null })?.tags ?? null;
    db.prepare(
      `INSERT INTO assets_index (id, path, type, is_favorite, description, cover_path, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, relativePath, type, isFav, desc, null, tags, now, now);
    return { ok: true, path: relativePath, id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 更新素材索引（描述、常用标记、封面路径、标签、路径、视频尺寸与时长）（见开发计划 2.8） */
export function updateAsset(
  projectDir: string,
  id: string,
  data: {
    description?: string | null;
    is_favorite?: number;
    cover_path?: string | null;
    tags?: string | null;
    path?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  }
): { ok: boolean; error?: string } {
  try {
    const now = new Date().toISOString();
    const db = getDb(projectDir);
    ensureAssetsCoverPathColumn(db);
    ensureAssetsTagsColumn(db);
    ensureAssetsVideoMetadataColumns(db);
    const row = db.prepare('SELECT * FROM assets_index WHERE id = ?').get(id) as AssetRow | undefined;
    if (!row) return { ok: false, error: '素材不存在' };
    const coverPath = data.cover_path !== undefined ? data.cover_path : (row as AssetRow).cover_path ?? null;
    const tags = data.tags !== undefined ? data.tags : (row as AssetRow).tags ?? null;
    const pathVal = data.path !== undefined ? data.path : (row as AssetRow).path;
    const widthVal = data.width !== undefined ? data.width : (row as AssetRow).width ?? null;
    const heightVal = data.height !== undefined ? data.height : (row as AssetRow).height ?? null;
    const durationVal = data.duration !== undefined ? data.duration : (row as AssetRow).duration ?? null;
    db.prepare(
      `UPDATE assets_index SET description = ?, is_favorite = ?, cover_path = ?, tags = ?, path = ?, width = ?, height = ?, duration = ?, updated_at = ? WHERE id = ?`
    ).run(
      data.description !== undefined ? data.description : row.description,
      data.is_favorite !== undefined ? data.is_favorite : row.is_favorite,
      coverPath,
      tags,
      pathVal,
      widthVal,
      heightVal,
      durationVal,
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

/** 读取项目内资源文件为 base64 data URL，供渲染进程显示（见开发计划 2.6）。支持绝对路径（如 ONNX 抠图临时文件） */
export function getAssetDataUrl(projectDir: string, relativePath: string): string | null {
  try {
    const fullPath = path.isAbsolute(relativePath)
      ? path.normalize(relativePath)
      : path.join(path.normalize(projectDir), relativePath);
    if (!fs.existsSync(fullPath)) return null;
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(relativePath).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : ext === '.mp4' ? 'video/mp4'
      : ext === '.webm' ? 'video/webm'
      : ext === '.mov' ? 'video/quicktime'
      : ext === '.mp3' ? 'audio/mpeg'
      : ext === '.wav' ? 'audio/wav'
      : ext === '.aac' ? 'audio/aac'
      : ext === '.m4a' ? 'audio/mp4'
      : ext === '.ogg' ? 'audio/ogg'
      : ext === '.flac' ? 'audio/flac'
      : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
