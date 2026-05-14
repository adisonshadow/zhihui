/**
 * 小说编剧 SQLite 数据库（独立于漫剧项目 app.db）
 * 存储路径：userData/yiman/novel.db
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database | null = null;

function getDbPath(): string {
  const userData = app.getPath('userData');
  const dir = path.join(userData, 'yiman');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'novel.db');
}

export function initNovelDb(): void {
  if (db) return;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genres TEXT NOT NULL DEFAULT '[]',
      cover_data_url TEXT,
      electron_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS novel_episodes (
      novel_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      episode INTEGER,
      content_markdown TEXT NOT NULL DEFAULT '',
      "order" INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (novel_id, id),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_novel_episodes_novel ON novel_episodes(novel_id);

    CREATE TABLE IF NOT EXISTS novel_workspace_meta (
      novel_id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      active_episode_id TEXT NOT NULL DEFAULT '',
      remount_versions TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screenwriter_favorites (
      id TEXT PRIMARY KEY,
      seed_uuid TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_conversation_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sf_seed_uuid ON screenwriter_favorites(seed_uuid);

    CREATE TABLE IF NOT EXISTS screenwriter_outline_favorites (
      id TEXT PRIMARY KEY,
      outline_uuid TEXT,
      title TEXT NOT NULL,
      prose TEXT NOT NULL,
      panel_story_name TEXT,
      panel_source TEXT NOT NULL DEFAULT '',
      panel_summary TEXT NOT NULL DEFAULT '',
      full_content TEXT,
      favorite_appendix TEXT,
      source_conversation_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sof_outline_uuid ON screenwriter_outline_favorites(outline_uuid);
  `);

  migrateNovelEpisodesToCompositePrimaryKey();
}

/**
 * 旧版 novel_episodes 以 id 为全局主键，多本书共用 __story_outline__ 会冲突。
 * 已存在旧表时迁移为 PRIMARY KEY (novel_id, id)。
 */
function migrateNovelEpisodesToCompositePrimaryKey(): void {
  const database = getDb();
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='novel_episodes'`)
    .get() as { sql?: string } | undefined;
  const sql = row?.sql ?? '';
  if (!sql || sql.includes('PRIMARY KEY (novel_id, id)')) return;

  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE novel_episodes_migrated (
      novel_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      episode INTEGER,
      content_markdown TEXT NOT NULL DEFAULT '',
      "order" INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (novel_id, id),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    INSERT INTO novel_episodes_migrated (novel_id, id, title, episode, content_markdown, "order", updated_at)
      SELECT novel_id, id, title, episode, content_markdown, "order", updated_at FROM novel_episodes;
    DROP TABLE novel_episodes;
    ALTER TABLE novel_episodes_migrated RENAME TO novel_episodes;
    CREATE INDEX IF NOT EXISTS idx_novel_episodes_novel ON novel_episodes(novel_id);
    COMMIT;
  `);
}

function getDb(): Database.Database {
  if (!db) initNovelDb();
  return db!;
}

/** 保证 novels 父表存在，否则 workspace_meta / episodes 外键插入失败 */
function ensureNovelRowExists(novelId: string, titleHint: string): void {
  const row = getDb().prepare('SELECT id FROM novels WHERE id = ?').get(novelId) as { id: string } | undefined;
  if (row) return;
  const now = new Date().toISOString();
  upsertNovel({
    id: novelId,
    title: titleHint.trim() || '未命名小说',
    genres: [],
    createdAt: now,
    updatedAt: now,
  });
}

// ===== Novel List =====

export interface NovelRow {
  id: string;
  title: string;
  genres: string; // JSON array string
  cover_data_url: string | null;
  electron_project_id: string | null;
  created_at: string;
  updated_at: string;
}

export function listNovels(): NovelRow[] {
  return getDb().prepare('SELECT * FROM novels ORDER BY updated_at DESC').all() as NovelRow[];
}

export function upsertNovel(item: {
  id: string;
  title: string;
  genres: string[];
  coverDataUrl?: string | null;
  electronProjectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): NovelRow {
  const now = new Date().toISOString();
  const existing = getDb().prepare('SELECT id FROM novels WHERE id = ?').get(item.id) as { id: string } | undefined;
  if (existing) {
    getDb().prepare(`
      UPDATE novels SET title=?, genres=?, cover_data_url=?, electron_project_id=?, updated_at=?
      WHERE id=?
    `).run(
      item.title,
      JSON.stringify(item.genres ?? []),
      item.coverDataUrl ?? null,
      item.electronProjectId ?? null,
      item.updatedAt ?? now,
      item.id
    );
  } else {
    getDb().prepare(`
      INSERT INTO novels (id, title, genres, cover_data_url, electron_project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.title,
      JSON.stringify(item.genres ?? []),
      item.coverDataUrl ?? null,
      item.electronProjectId ?? null,
      item.createdAt ?? now,
      item.updatedAt ?? now
    );
  }
  return getDb().prepare('SELECT * FROM novels WHERE id = ?').get(item.id) as NovelRow;
}

export function deleteNovel(id: string): boolean {
  const result = getDb().prepare('DELETE FROM novels WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===== Novel Episodes & Workspace =====

export interface EpisodeRow {
  id: string;
  novel_id: string;
  title: string;
  episode: number | null;
  content_markdown: string;
  order: number;
  updated_at: string;
}

export interface WorkspaceMetaRow {
  novel_id: string;
  title: string;
  active_episode_id: string;
  remount_versions: string;
  updated_at: string;
}

export function getEpisodes(novelId: string): EpisodeRow[] {
  return getDb().prepare('SELECT * FROM novel_episodes WHERE novel_id = ? ORDER BY "order" ASC').all(novelId) as EpisodeRow[];
}

export function getWorkspaceMeta(novelId: string): WorkspaceMetaRow | null {
  return (getDb().prepare('SELECT * FROM novel_workspace_meta WHERE novel_id = ?').get(novelId) as WorkspaceMetaRow) ?? null;
}

export function upsertEpisode(ep: {
  id: string;
  novelId: string;
  title: string;
  episode?: number | null;
  contentMarkdown?: string;
  order: number;
  updatedAt: string;
}): void {
  ensureNovelRowExists(ep.novelId, ep.title);
  const existing = getDb()
    .prepare('SELECT 1 FROM novel_episodes WHERE novel_id = ? AND id = ?')
    .get(ep.novelId, ep.id) as { 1: number } | undefined;
  if (existing) {
    getDb().prepare(`
      UPDATE novel_episodes SET title=?, episode=?, content_markdown=?, "order"=?, updated_at=?
      WHERE novel_id=? AND id=?
    `).run(ep.title, ep.episode ?? null, ep.contentMarkdown ?? '', ep.order, ep.updatedAt, ep.novelId, ep.id);
  } else {
    getDb().prepare(`
      INSERT INTO novel_episodes (novel_id, id, title, episode, content_markdown, "order", updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ep.novelId, ep.id, ep.title, ep.episode ?? null, ep.contentMarkdown ?? '', ep.order, ep.updatedAt);
  }
}

export function deleteEpisode(novelId: string, episodeId: string): void {
  getDb().prepare('DELETE FROM novel_episodes WHERE novel_id = ? AND id = ?').run(novelId, episodeId);
}

export function saveWorkspaceMeta(meta: {
  novelId: string;
  title?: string;
  activeEpisodeId: string;
  remountVersions: Record<string, number>;
  updatedAt: string;
}): void {
  ensureNovelRowExists(meta.novelId, meta.title ?? '未命名小说');
  const existing = getDb().prepare('SELECT novel_id FROM novel_workspace_meta WHERE novel_id = ?').get(meta.novelId);
  const remountJson = JSON.stringify(meta.remountVersions ?? {});
  if (existing) {
    getDb().prepare(`
      UPDATE novel_workspace_meta SET title=?, active_episode_id=?, remount_versions=?, updated_at=?
      WHERE novel_id=?
    `).run(meta.title ?? '', meta.activeEpisodeId, remountJson, meta.updatedAt, meta.novelId);
  } else {
    getDb().prepare(`
      INSERT INTO novel_workspace_meta (novel_id, title, active_episode_id, remount_versions, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(meta.novelId, meta.title ?? '', meta.activeEpisodeId, remountJson, meta.updatedAt);
  }
}

export function replaceAllEpisodes(novelId: string, episodes: Array<{
  id: string;
  novelId: string;
  title: string;
  episode?: number | null;
  contentMarkdown: string;
  order: number;
  updatedAt: string;
}>): void {
  ensureNovelRowExists(novelId, episodes[0]?.title ?? '未命名小说');
  const byId = new Map<string, (typeof episodes)[0]>();
  for (const ep of episodes) {
    byId.set(ep.id, { ...ep, novelId });
  }
  const unique = [...byId.values()].sort((a, b) => a.order - b.order);

  const del = getDb().prepare('DELETE FROM novel_episodes WHERE novel_id = ?');
  const ins = getDb().prepare(`
    INSERT INTO novel_episodes (novel_id, id, title, episode, content_markdown, "order", updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const txn = getDb().transaction(() => {
    del.run(novelId);
    for (const ep of unique) {
      ins.run(novelId, ep.id, ep.title, ep.episode ?? null, ep.contentMarkdown, ep.order, ep.updatedAt);
    }
  });
  txn();
}

// ===== Screenwriter Favorites =====

export interface ScreenwriterFavoriteRow {
  id: string;
  seed_uuid: string | null;
  title: string;
  content: string;
  source_conversation_key: string | null;
  created_at: string;
}

export function listScreenwriterFavorites(): ScreenwriterFavoriteRow[] {
  return getDb().prepare('SELECT * FROM screenwriter_favorites ORDER BY created_at DESC').all() as ScreenwriterFavoriteRow[];
}

export function insertScreenwriterFavorite(item: {
  id: string;
  seedUuid?: string | null;
  title: string;
  content: string;
  sourceConversationKey?: string | null;
  createdAt: string;
}): void {
  getDb().prepare(`
    INSERT INTO screenwriter_favorites (id, seed_uuid, title, content, source_conversation_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(item.id, item.seedUuid ?? null, item.title, item.content, item.sourceConversationKey ?? null, item.createdAt);
}

export function deleteScreenwriterFavorite(id: string): boolean {
  const result = getDb().prepare('DELETE FROM screenwriter_favorites WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteScreenwriterFavoriteBySeedUuid(seedUuid: string): boolean {
  const result = getDb().prepare('DELETE FROM screenwriter_favorites WHERE seed_uuid = ?').run(seedUuid);
  return result.changes > 0;
}

export function getScreenwriterFavoriteBySeedUuid(seedUuid: string): ScreenwriterFavoriteRow | null {
  return (getDb().prepare('SELECT * FROM screenwriter_favorites WHERE seed_uuid = ?').get(seedUuid) as ScreenwriterFavoriteRow) ?? null;
}

export function replaceAllScreenwriterFavorites(items: Array<{
  id: string;
  seedUuid?: string | null;
  title: string;
  content: string;
  sourceConversationKey?: string | null;
  createdAt: string;
}>): void {
  const del = getDb().prepare('DELETE FROM screenwriter_favorites');
  const ins = getDb().prepare(`
    INSERT INTO screenwriter_favorites (id, seed_uuid, title, content, source_conversation_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const txn = getDb().transaction(() => {
    del.run();
    for (const item of items) {
      ins.run(item.id, item.seedUuid ?? null, item.title, item.content, item.sourceConversationKey ?? null, item.createdAt);
    }
  });
  txn();
}

// ===== Screenwriter Outline Favorites =====

export interface ScreenwriterOutlineFavoriteRow {
  id: string;
  outline_uuid: string | null;
  title: string;
  prose: string;
  panel_story_name: string | null;
  panel_source: string;
  panel_summary: string;
  full_content: string | null;
  favorite_appendix: string | null;
  source_conversation_key: string | null;
  created_at: string;
}

export function listScreenwriterOutlineFavorites(): ScreenwriterOutlineFavoriteRow[] {
  return getDb().prepare('SELECT * FROM screenwriter_outline_favorites ORDER BY created_at DESC').all() as ScreenwriterOutlineFavoriteRow[];
}

export function insertScreenwriterOutlineFavorite(item: {
  id: string;
  outlineUuid?: string | null;
  title: string;
  prose: string;
  panelStoryName?: string | null;
  panelSource?: string;
  panelSummary?: string;
  fullContent?: string | null;
  favoriteAppendix?: string | null;
  sourceConversationKey?: string | null;
  createdAt: string;
}): void {
  getDb().prepare(`
    INSERT INTO screenwriter_outline_favorites (id, outline_uuid, title, prose, panel_story_name, panel_source, panel_summary, full_content, favorite_appendix, source_conversation_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.outlineUuid ?? null, item.title, item.prose,
    item.panelStoryName ?? null, item.panelSource ?? '', item.panelSummary ?? '',
    item.fullContent ?? null, item.favoriteAppendix ?? null,
    item.sourceConversationKey ?? null, item.createdAt
  );
}

export function deleteScreenwriterOutlineFavorite(id: string): boolean {
  const result = getDb().prepare('DELETE FROM screenwriter_outline_favorites WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteScreenwriterOutlineFavoriteByOutlineUuid(outlineUuid: string): boolean {
  const result = getDb().prepare('DELETE FROM screenwriter_outline_favorites WHERE outline_uuid = ?').run(outlineUuid);
  return result.changes > 0;
}

export function getScreenwriterOutlineFavoriteByOutlineUuid(outlineUuid: string): ScreenwriterOutlineFavoriteRow | null {
  return (getDb().prepare('SELECT * FROM screenwriter_outline_favorites WHERE outline_uuid = ?').get(outlineUuid) as ScreenwriterOutlineFavoriteRow) ?? null;
}
