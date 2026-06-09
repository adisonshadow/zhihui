/**
 * 小说编写工作台：章节 + 故事大纲（置顶）本地持久化。
 * 键：小说 id（与 novelListStorage 一致，如 novel_*）
 */
import type { AudiobookEpisode } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import {
  createEmptyNovelScript,
  createEmptyEpisodeScript,
  mergeEpisodeScripts,
  serializeEpisodeScript,
  serializeNovelScript,
  tryMigrateMarkdownToEpisodeScript,
  parseEpisodeScriptJson,
  parseNovelScriptJson,
  type NovelEpisodeScript,
} from '@/novelDesign/utils/novelScriptModel';
import {
  createEmptyEpisodeAudiobook,
  parseEpisodeAudiobookJson,
  serializeEpisodeAudiobook,
} from '@/audiobook/utils/audiobookModel';

export const NOVEL_OUTLINE_EPISODE_ID = '__story_outline__';

export type { NovelEpisodeScript };

export interface NovelEpisode {
  id: string;
  /** 编辑器内与正文语境下的标题（**不含**「1、」等序号前缀）；故事大纲固定为「故事大纲」且不可改名 */
  title: string;
  /**
   * 正文集在人类顺序中的序号，从 1 递增（与侧边栏「n、标题」中的 n 一致）。
   * 故事大纲无章序号，可为 undefined。
   */
  episode?: number;
  contentMarkdown: string;
  /** 本集结构化剧本（Scene 列表；每场底层固定 1 个 Shot），与正文独立持久化 */
  episodeScript?: NovelEpisodeScript;
  /** 本集有声书片段（与正文独立持久化） */
  episodeAudiobook?: AudiobookEpisode;
  order: number;
  updatedAt: string;
}

export interface AudiobookOutlineVoiceSamples {
  /** 相对音色样本根目录 */
  narratorRelPath?: string;
  /** 旁白参考 wav 的逐字稿（LongCat 克隆；可与同名 .txt 二选一） */
  narratorRefText?: string;
  /** 旁白云端复刻：settings 中 AIModelConfig.id */
  narratorCloudEngineId?: string;
  /** 旁白云端复刻 voice_id */
  narratorCloudVoiceId?: string;
  /** 角色 id -> 相对路径 */
  byCharacterId?: Record<string, string>;
  /** 角色 id -> 参考 wav 逐字稿 */
  byCharacterRefText?: Record<string, string>;
  /** 角色 id -> 云端复刻 engineId */
  byCharacterCloudEngineId?: Record<string, string>;
  /** 角色 id -> 云端复刻 voice_id */
  byCharacterCloudVoiceId?: Record<string, string>;
  /** 旁白风格指令（纯文字人声描述，用于音色设计 / 无样本 TTS） */
  narratorStyleInstruction?: string;
  /** 角色 id -> 风格指令 */
  byCharacterStyleInstruction?: Record<string, string>;
}

export interface NovelWorkspaceSnapshot {
  novelId: string;
  title: string;
  /** 从抽卡创建时关联的 Electron 漫剧项目 id（可选） */
  electronProjectId?: string | null;
  /** 小说项目根目录（与创建项目时 project_dir 一致） */
  projectDir?: string | null;
  /** 全书顶层剧本（元数据 + 角色）；episodes 数组在客户端保持空，正文剧本在各 NovelEpisode.episodeScript */
  novelScript?: Script;
  episodes: NovelEpisode[];
  activeEpisodeId: string;
  /** 外部写入（如 AI）后用于强制刷新 Milkdown */
  remountVersionByEpisode: Record<string, number>;
  /** 故事大纲：旁白与角色的音色样本（相对设置中的样本根目录） */
  audiobookOutlineVoiceSamples?: AudiobookOutlineVoiceSamples;
  /** 大纲音色：用本地算法处理内心独白，不单独配置画外音音色行 */
  useLocalSfxForInnerVoice?: boolean;
  /** 项目设置：启用内心独白音效 */
  innerMonologueEnabled?: boolean;
  /** 项目设置：启用空间回音 */
  spaceEchoEnabled?: boolean;
  /** 项目设置：启用电话中的声音 */
  telephoneEnabled?: boolean;
  /** 项目设置：启用闷罐 Muffler */
  mufflerEnabled?: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'yiman:novel-design:workspace-v2';

function trimRefTextMap(raw?: Record<string, string>): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw)) {
    const t = val?.trim();
    if (t) out[k] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function serializeAudiobookOutlineVoiceSamples(v: AudiobookOutlineVoiceSamples | undefined): string {
  if (!v) return '';
  const narrator = v.narratorRelPath?.trim();
  const narratorRefText = v.narratorRefText?.trim();
  const narratorCloudEngineId = v.narratorCloudEngineId?.trim();
  const narratorCloudVoiceId = v.narratorCloudVoiceId?.trim();
  const byCharacterId = trimRefTextMap(v.byCharacterId);
  const byCharacterRefText = trimRefTextMap(v.byCharacterRefText);
  const byCharacterCloudEngineId = trimRefTextMap(v.byCharacterCloudEngineId);
  const byCharacterCloudVoiceId = trimRefTextMap(v.byCharacterCloudVoiceId);
  const narratorStyleInstruction = v.narratorStyleInstruction?.trim();
  const byCharacterStyleInstruction = trimRefTextMap(v.byCharacterStyleInstruction);
  const hasBy = !!byCharacterId;
  const hasRefBy = !!byCharacterRefText;
  const hasCloudBy = !!byCharacterCloudEngineId;
  const hasCloudVoiceBy = !!byCharacterCloudVoiceId;
  const hasStyleBy = !!byCharacterStyleInstruction;
  if (
    !narrator &&
    !narratorRefText &&
    !narratorCloudEngineId &&
    !narratorCloudVoiceId &&
    !narratorStyleInstruction &&
    !hasBy &&
    !hasRefBy &&
    !hasCloudBy &&
    !hasCloudVoiceBy &&
    !hasStyleBy
  ) {
    return '';
  }
  return JSON.stringify({
    narratorRelPath: narrator || undefined,
    narratorRefText: narratorRefText || undefined,
    narratorCloudEngineId: narratorCloudEngineId || undefined,
    narratorCloudVoiceId: narratorCloudVoiceId || undefined,
    narratorStyleInstruction: narratorStyleInstruction || undefined,
    byCharacterId: hasBy ? byCharacterId : undefined,
    byCharacterRefText: hasRefBy ? byCharacterRefText : undefined,
    byCharacterCloudEngineId: hasCloudBy ? byCharacterCloudEngineId : undefined,
    byCharacterCloudVoiceId: hasCloudVoiceBy ? byCharacterCloudVoiceId : undefined,
    byCharacterStyleInstruction: hasStyleBy ? byCharacterStyleInstruction : undefined,
  });
}

function parseAudiobookOutlineVoiceJson(raw: string | null | undefined): AudiobookOutlineVoiceSamples | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return undefined;
    const narratorRelPath = typeof o.narratorRelPath === 'string' ? o.narratorRelPath.trim() : undefined;
    const narratorRefText = typeof o.narratorRefText === 'string' ? o.narratorRefText.trim() : undefined;
    const narratorCloudEngineId =
      typeof o.narratorCloudEngineId === 'string' ? o.narratorCloudEngineId.trim() : undefined;
    const narratorCloudVoiceId =
      typeof o.narratorCloudVoiceId === 'string' ? o.narratorCloudVoiceId.trim() : undefined;
    let byCharacterId: Record<string, string> | undefined;
    if (o.byCharacterId && typeof o.byCharacterId === 'object' && !Array.isArray(o.byCharacterId)) {
      byCharacterId = {};
      for (const [k, val] of Object.entries(o.byCharacterId as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) byCharacterId[k] = val.trim();
      }
      if (Object.keys(byCharacterId).length === 0) byCharacterId = undefined;
    }
    let byCharacterRefText: Record<string, string> | undefined;
    if (o.byCharacterRefText && typeof o.byCharacterRefText === 'object' && !Array.isArray(o.byCharacterRefText)) {
      byCharacterRefText = {};
      for (const [k, val] of Object.entries(o.byCharacterRefText as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) byCharacterRefText[k] = val.trim();
      }
      if (Object.keys(byCharacterRefText).length === 0) byCharacterRefText = undefined;
    }
    let byCharacterCloudEngineId: Record<string, string> | undefined;
    if (
      o.byCharacterCloudEngineId &&
      typeof o.byCharacterCloudEngineId === 'object' &&
      !Array.isArray(o.byCharacterCloudEngineId)
    ) {
      byCharacterCloudEngineId = {};
      for (const [k, val] of Object.entries(o.byCharacterCloudEngineId as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) byCharacterCloudEngineId[k] = val.trim();
      }
      if (Object.keys(byCharacterCloudEngineId).length === 0) byCharacterCloudEngineId = undefined;
    }
    let byCharacterCloudVoiceId: Record<string, string> | undefined;
    if (
      o.byCharacterCloudVoiceId &&
      typeof o.byCharacterCloudVoiceId === 'object' &&
      !Array.isArray(o.byCharacterCloudVoiceId)
    ) {
      byCharacterCloudVoiceId = {};
      for (const [k, val] of Object.entries(o.byCharacterCloudVoiceId as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) byCharacterCloudVoiceId[k] = val.trim();
      }
      if (Object.keys(byCharacterCloudVoiceId).length === 0) byCharacterCloudVoiceId = undefined;
    }
    const narratorStyleInstruction =
      typeof o.narratorStyleInstruction === 'string' ? o.narratorStyleInstruction.trim() : undefined;
    let byCharacterStyleInstruction: Record<string, string> | undefined;
    if (
      o.byCharacterStyleInstruction &&
      typeof o.byCharacterStyleInstruction === 'object' &&
      !Array.isArray(o.byCharacterStyleInstruction)
    ) {
      byCharacterStyleInstruction = {};
      for (const [k, val] of Object.entries(o.byCharacterStyleInstruction as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) byCharacterStyleInstruction[k] = val.trim();
      }
      if (Object.keys(byCharacterStyleInstruction).length === 0) byCharacterStyleInstruction = undefined;
    }
    if (
      !narratorRelPath &&
      !narratorRefText &&
      !narratorCloudEngineId &&
      !narratorCloudVoiceId &&
      !narratorStyleInstruction &&
      !byCharacterId &&
      !byCharacterRefText &&
      !byCharacterCloudEngineId &&
      !byCharacterCloudVoiceId &&
      !byCharacterStyleInstruction
    ) {
      return undefined;
    }
    return {
      narratorRelPath: narratorRelPath || undefined,
      narratorRefText: narratorRefText || undefined,
      narratorCloudEngineId: narratorCloudEngineId || undefined,
      narratorCloudVoiceId: narratorCloudVoiceId || undefined,
      narratorStyleInstruction: narratorStyleInstruction || undefined,
      byCharacterId,
      byCharacterRefText,
      byCharacterCloudEngineId,
      byCharacterCloudVoiceId,
      byCharacterStyleInstruction,
    };
  } catch {
    return undefined;
  }
}

function safeParse(raw: string | null): Record<string, NovelWorkspaceSnapshot> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, NovelWorkspaceSnapshot>) : {};
  } catch {
    return {};
  }
}

function loadAll(): Record<string, NovelWorkspaceSnapshot> {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function api() {
  return window.yiman?.novel;
}

/** 正文集已初始化 episodeAudiobook（含空片段列表）即视为已开通有声书 */
export function novelSnapshotHasAudiobookWorkspace(snapshot: NovelWorkspaceSnapshot): boolean {
  return snapshot.episodes.some(
    (e) => e.id !== NOVEL_OUTLINE_EPISODE_ID && e.episodeAudiobook != null,
  );
}

function resolveAudiobookEnabledForListSync(
  snapshot: NovelWorkspaceSnapshot,
  listItem: ReturnType<typeof loadNovelList>[number] | undefined,
): boolean {
  if (listItem?.audiobookEnabled === true) return true;
  return novelSnapshotHasAudiobookWorkspace(snapshot);
}

/** 先写入 novels 表，满足 novel_workspace_meta / novel_episodes 对 novel_id 的外键 */
async function ensureNovelParentRowInDb(s: NovelWorkspaceSnapshot): Promise<void> {
  const a = api();
  if (!a?.upsert) return;
  const listItem = loadNovelList().find((x) => x.id === s.novelId);
  const title = (listItem?.title ?? s.title ?? '未命名小说').trim() || '未命名小说';
  const audiobookEnabled = resolveAudiobookEnabledForListSync(s, listItem);
  if (listItem && listItem.audiobookEnabled !== audiobookEnabled) {
    upsertNovel({ ...listItem, audiobookEnabled, updatedAt: s.updatedAt });
  }
  await a.upsert({
    id: s.novelId,
    title,
    genres: listItem?.genres ?? [],
    coverDataUrl: listItem?.coverDataUrl ?? null,
    electronProjectId: s.electronProjectId ?? null,
    audiobookEnabled,
    createdAt: listItem?.createdAt,
    updatedAt: listItem?.updatedAt ?? s.updatedAt,
  });
}

/** 异步同步工作区数据到 SQLite（须先 upsert novels，否则会 SQLITE_CONSTRAINT_FOREIGNKEY） */
function syncSnapshotToDb(s: NovelWorkspaceSnapshot): void {
  const a = api();
  if (!a?.saveWorkspaceMeta || !a.replaceAllEpisodes) return;
  const eps = s.episodes.map((e) => ({
    id: e.id,
    novelId: s.novelId,
    title: e.title,
    episode: e.episode ?? null,
    contentMarkdown: e.contentMarkdown,
    scriptJson: serializeEpisodeScript(e.episodeScript),
    audiobookJson: serializeEpisodeAudiobook(e.episodeAudiobook),
    order: e.order,
    updatedAt: e.updatedAt,
  }));
  void (async () => {
    try {
      await ensureNovelParentRowInDb(s);
      await a.saveWorkspaceMeta({
        novelId: s.novelId,
        title: s.title,
        activeEpisodeId: s.activeEpisodeId,
        remountVersions: s.remountVersionByEpisode ?? {},
        updatedAt: s.updatedAt,
        novelScriptJson: serializeNovelScript(s.novelScript),
        audiobookOutlineVoiceJson: serializeAudiobookOutlineVoiceSamples(s.audiobookOutlineVoiceSamples),
        useLocalSfxForInnerVoice: s.useLocalSfxForInnerVoice,
        innerMonologueEnabled: s.innerMonologueEnabled,
        spaceEchoEnabled: s.spaceEchoEnabled,
        telephoneEnabled: s.telephoneEnabled,
        mufflerEnabled: s.mufflerEnabled,
      });
      if (eps.length > 0) {
        await a.replaceAllEpisodes(s.novelId, eps);
      }
    } catch (e) {
      console.warn('[WorkspaceSync] 保存失败:', e);
    }
  })();
}

function saveAll(map: Record<string, NovelWorkspaceSnapshot>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  // 异步同步到 SQLite
  for (const s of Object.values(map)) {
    syncSnapshotToDb(s);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 改书名时同步「故事大纲」正文中对旧书名的写法（《》「」及文中出现的旧名）。
 * 单字旧名不做全文替换，避免误伤。
 */
export function replaceBookTitleInOutlineMarkdown(
  contentMarkdown: string,
  oldTitle: string,
  newTitle: string,
): string {
  const o = oldTitle.trim();
  const n = newTitle.trim();
  if (!o || o === n || !contentMarkdown) return contentMarkdown;
  let md = contentMarkdown;
  const pairs: [string, string][] = [
    [`《${o}》`, `《${n}》`],
    [`「${o}」`, `「${n}」`],
    [`『${o}』`, `『${n}』`],
    [`"${o}"`, `"${n}"`],
    [`'${o}'`, `'${n}'`],
  ];
  for (const [from, to] of pairs) {
    if (md.includes(from)) md = md.split(from).join(to);
  }
  if (o.length >= 2 && md.includes(o)) {
    md = md.split(o).join(n);
  }
  return md;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function stripNumericTitlePrefix(title: string): string {
  return title.trim().replace(/^\d+[、.．:：]\s*/, '').trim() || title.trim();
}

/** localStorage 旧版 scriptMarkdown（Markdown 或误存的 JSON）→ episodeScript + novelScript */
function migrateSnapshotScriptFields(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  const needsNovelScript = !snapshot.novelScript;
  const novelScript = snapshot.novelScript ?? createEmptyNovelScript(snapshot.novelId, snapshot.title);
  let changed = needsNovelScript;

  const episodes = snapshot.episodes.map((e) => {
    const legacy = (e as NovelEpisode & { scriptMarkdown?: string }).scriptMarkdown;
    if (legacy) changed = true;
    const episodeScript =
      e.episodeScript ?? (legacy ? tryMigrateMarkdownToEpisodeScript(legacy, e) : undefined);
    const next: NovelEpisode = {
      id: e.id,
      title: e.title,
      episode: e.episode,
      contentMarkdown: e.contentMarkdown,
      episodeScript,
      episodeAudiobook: e.episodeAudiobook,
      order: e.order,
      updatedAt: e.updatedAt,
    };
    return next;
  });

  if (!changed) return snapshot;
  return { ...snapshot, novelScript, episodes, updatedAt: nowIso() };
}

/** 迁移旧数据：大纲标题锁定；正文标题去掉可选的「n、」前缀 */
export function migrateNovelWorkspaceEpisodeTitles(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  let changed = false;
  const episodes = snapshot.episodes.map((e) => {
    if (e.id === NOVEL_OUTLINE_EPISODE_ID) {
      if (e.title !== '故事大纲') {
        changed = true;
        return { ...e, title: '故事大纲' };
      }
      return e;
    }
    const nextTitle = stripNumericTitlePrefix(e.title);
    if (nextTitle !== e.title) {
      changed = true;
      return { ...e, title: nextTitle || e.title };
    }
    return e;
  });
  return changed ? { ...snapshot, episodes, updatedAt: nowIso() } : snapshot;
}

/** 按当前顺序重算正文集的 order（1..n）与 episode（1..n）；大纲 order=0、标题锁定。无结构变化时返回原 snapshot。 */
export function reindexBodyEpisodes(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  const t = nowIso();
  const outlineEp = snapshot.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
  const body = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);

  let changed = false;
  const outline =
    outlineEp ?
      (() => {
        if (outlineEp.title !== '故事大纲' || outlineEp.order !== 0) changed = true;
        return {
          ...outlineEp,
          title: '故事大纲',
          order: 0,
          updatedAt:
            outlineEp.title !== '故事大纲' || outlineEp.order !== 0 ? t : outlineEp.updatedAt,
        };
      })()
    : null;

  const bodyNext = body.map((e, i) => {
    const n = i + 1;
    if (e.id !== NOVEL_OUTLINE_EPISODE_ID && e.episodeScript) {
      const needsEpUpdate =
        e.order !== n || e.episode !== n || e.episodeScript.episodeIndex !== n;
      if (needsEpUpdate) {
        changed = true;
        return {
          ...e,
          order: n,
          episode: n,
          episodeScript: { ...e.episodeScript, episodeIndex: n },
          updatedAt: t,
        };
      }
      return e;
    }
    if (e.order === n && e.episode === n) return e;
    changed = true;
    return { ...e, order: n, episode: n, updatedAt: t };
  });
  const episodes =
    outline ? [outline, ...bodyNext].sort((a, b) => a.order - b.order) : [...bodyNext];
  if (!changed) return snapshot;
  return { ...snapshot, episodes, updatedAt: t };
}

export function getBodyEpisodesSorted(snapshot: NovelWorkspaceSnapshot): NovelEpisode[] {
  return snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);
}

/** 按集序号 n（≥1）查找正文集；无则 null */
export function findBodyEpisodeByEpisodeNumber(
  snapshot: NovelWorkspaceSnapshot,
  n: number
): NovelEpisode | null {
  if (!Number.isFinite(n) || n < 1) return null;
  const body = getBodyEpisodesSorted(snapshot);
  return body.find((e) => e.episode === n) ?? null;
}

/** 确保第 n 集正文存在；若 n 超过当前集数，会补齐中间空集以保持侧栏编号连续。 */
export function ensureBodyEpisodeByEpisodeNumber(
  snapshot: NovelWorkspaceSnapshot,
  n: number,
  targetTitle?: string
): { snapshot: NovelWorkspaceSnapshot; episode: NovelEpisode } | null {
  const targetN = Math.floor(n);
  if (!Number.isFinite(targetN) || targetN < 1) return null;
  const existing = findBodyEpisodeByEpisodeNumber(snapshot, targetN);
  if (existing) return { snapshot, episode: existing };

  let next = snapshot;
  let created: NovelEpisode | null = null;
  const existingCount = getBodyEpisodesSorted(next).length;
  for (let i = existingCount + 1; i <= targetN; i += 1) {
    const result = upsertEpisode(next, {
      title: i === targetN ? (targetTitle?.trim() || `第${i}集`) : `第${i}集`,
    });
    next = result.snapshot;
    created = result.episode;
  }
  return created ? { snapshot: next, episode: created } : null;
}

export function bumpEpisodeRemount(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string
): NovelWorkspaceSnapshot {
  const next = {
    ...(snapshot.remountVersionByEpisode ?? {}),
    [episodeId]: (snapshot.remountVersionByEpisode?.[episodeId] ?? 0) + 1,
  };
  return { ...snapshot, remountVersionByEpisode: next, updatedAt: nowIso() };
}

let workspaceRestoreAttempted = new Set<string>();

type DbEpisodeRow = {
  id: string;
  title: string;
  episode?: number | null;
  contentMarkdown: string;
  scriptJson: string;
  audiobookJson: string;
  order: number;
  updatedAt: string;
};

type DbWorkspaceMeta = {
  novelId: string;
  title: string;
  activeEpisodeId: string;
  remountVersions: Record<string, number>;
  novelScriptJson?: string;
  audiobookOutlineVoiceJson?: string;
  useLocalSfxForInnerVoice?: boolean;
  innerMonologueEnabled?: boolean;
  spaceEchoEnabled?: boolean;
  telephoneEnabled?: boolean;
  mufflerEnabled?: boolean;
  updatedAt: string;
};

function snapshotFromDbRows(
  novelId: string,
  meta: DbWorkspaceMeta,
  rows: DbEpisodeRow[],
): NovelWorkspaceSnapshot {
  const listItem = loadNovelList().find((x) => x.id === novelId);
  const episodes: NovelEpisode[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    episode: r.episode ?? undefined,
    contentMarkdown: r.contentMarkdown ?? '',
    episodeScript: parseEpisodeScriptJson(r.scriptJson),
    episodeAudiobook: parseEpisodeAudiobookJson(r.audiobookJson),
    order: r.order,
    updatedAt: r.updatedAt,
  }));
  return {
    novelId,
    title: (listItem?.title ?? meta.title).trim() || '未命名小说',
    electronProjectId: listItem?.electronProjectId ?? null,
    novelScript: parseNovelScriptJson(meta.novelScriptJson),
    audiobookOutlineVoiceSamples:
      parseAudiobookOutlineVoiceJson(meta.audiobookOutlineVoiceJson) ?? undefined,
    useLocalSfxForInnerVoice: meta.useLocalSfxForInnerVoice === true,
    innerMonologueEnabled: meta.innerMonologueEnabled === true,
    spaceEchoEnabled: meta.spaceEchoEnabled === true,
    telephoneEnabled: meta.telephoneEnabled === true,
    mufflerEnabled: meta.mufflerEnabled === true,
    episodes,
    activeEpisodeId: meta.activeEpisodeId,
    remountVersionByEpisode: meta.remountVersions ?? {},
    updatedAt: meta.updatedAt,
  };
}

/** 列表项是否已开通有声书 */
export function getAudiobookEnabled(novelId: string): boolean {
  return Boolean(loadNovelList().find((x) => x.id === novelId)?.audiobookEnabled);
}

export function loadNovelWorkspace(novelId: string): NovelWorkspaceSnapshot | null {
  const map = loadAll();
  const s = map[novelId];
  if (s) return s;

  if (!workspaceRestoreAttempted.has(novelId)) {
    workspaceRestoreAttempted.add(novelId);
    const a = api();
    if (a?.getEpisodes && a.getWorkspaceMeta) {
      void Promise.all([a.getWorkspaceMeta(novelId), a.getEpisodes(novelId)])
        .then(([meta, eps]) => {
          if (!meta || !eps?.length) return;
          const snap = snapshotFromDbRows(novelId, meta, eps);
          saveNovelWorkspace(snap);
          window.location.reload();
        })
        .catch(() => {});
    }
  }
  return null;
}

export function saveNovelWorkspace(snapshot: NovelWorkspaceSnapshot): void {
  const map = loadAll();
  map[snapshot.novelId] = { ...snapshot, updatedAt: nowIso() };
  saveAll(map);
}

/** 从 localStorage 移除工作区快照（删除小说项目时调用；SQLite 由 novel.delete 清理） */
export function deleteNovelWorkspaceLocal(novelId: string): void {
  const map = loadAll();
  if (!(novelId in map)) return;
  delete map[novelId];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

/** 占位工作台：置顶故事大纲空文档 + 无分集 */
export function createBlankWorkspace(novelId: string, title: string): NovelWorkspaceSnapshot {
  const t = nowIso();
  const outline: NovelEpisode = {
    id: NOVEL_OUTLINE_EPISODE_ID,
    title: '故事大纲',
    contentMarkdown: '',
    order: 0,
    updatedAt: t,
  };
  const novelTitle = title.trim() || '未命名小说';
  return {
    novelId,
    title: novelTitle,
    novelScript: createEmptyNovelScript(novelId, novelTitle),
    episodes: [outline],
    activeEpisodeId: NOVEL_OUTLINE_EPISODE_ID,
    remountVersionByEpisode: {},
    updatedAt: t,
  };
}

/** 从抽卡大纲初始化：置顶页写入大纲正文 prose */
export function initWorkspaceFromOutline(input: {
  novelId: string;
  novelTitle: string;
  outlineMarkdown: string;
  electronProjectId?: string | null;
  projectDir?: string | null;
}): NovelWorkspaceSnapshot {
  const base = createBlankWorkspace(input.novelId, input.novelTitle);
  const t = nowIso();
  const outline = base.episodes[0];
  return saveAndReturn({
    ...base,
    electronProjectId: input.electronProjectId ?? undefined,
    projectDir: input.projectDir?.trim() || undefined,
    episodes: [{ ...outline, contentMarkdown: input.outlineMarkdown, updatedAt: t }],
    updatedAt: t,
  });
}

function saveAndReturn(s: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  saveNovelWorkspace(s);
  return s;
}

export function upsertEpisode(
  snapshot: NovelWorkspaceSnapshot,
  input: Partial<Pick<NovelEpisode, 'title' | 'contentMarkdown' | 'episodeScript'>> & { id?: string }
): { snapshot: NovelWorkspaceSnapshot; episode: NovelEpisode } {
  const id = input.id ?? makeId('ep');
  const t = nowIso();
  const maxOrder = snapshot.episodes.reduce((m, e) => Math.max(m, e.order), 0);
  const existing = snapshot.episodes.find((e) => e.id === id);
  let episode: NovelEpisode;
  if (existing) {
    if (existing.id === NOVEL_OUTLINE_EPISODE_ID) {
      episode = {
        ...existing,
        title: '故事大纲',
        contentMarkdown: input.contentMarkdown ?? existing.contentMarkdown,
        updatedAt: t,
      };
    } else {
      const rawTitle =
        input.title !== undefined ? input.title.trim() : existing.title;
      const nextTitle =
        rawTitle ? stripNumericTitlePrefix(rawTitle) || rawTitle.trim() : existing.title;
      let epScript = input.episodeScript ?? existing.episodeScript;
      if (epScript && nextTitle && nextTitle !== existing.title) {
        epScript = { ...epScript, title: nextTitle };
      }
      episode = {
        ...existing,
        title: nextTitle || existing.title,
        contentMarkdown: input.contentMarkdown ?? existing.contentMarkdown,
        episodeScript: epScript,
        updatedAt: t,
      };
    }
    const episodes = snapshot.episodes.map((e) => (e.id === id ? episode : e));
    const next = { ...snapshot, episodes, updatedAt: t };
    return { snapshot: saveAndReturn(reindexBodyEpisodes(next)), episode };
  }
  const bodyCount = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).length;
  const rawTitle = input.title?.trim() || `第${bodyCount + 1}集`;
  const titleClean = stripNumericTitlePrefix(rawTitle) || rawTitle;
  episode = {
    id,
    title: titleClean,
    contentMarkdown: input.contentMarkdown ?? '',
    episodeScript: input.episodeScript,
    order: maxOrder + 1,
    updatedAt: t,
  };
  if (!episode.episodeScript) {
    const n = bodyCount + 1;
    episode = {
      ...episode,
      episodeScript: createEmptyEpisodeScript({ id, title: titleClean, episode: n }),
      episode: n,
    };
  }
  const episodes = [...snapshot.episodes, episode].sort((a, b) => a.order - b.order);
  const withNew = { ...snapshot, episodes, activeEpisodeId: id, updatedAt: t };
  const reindexed = reindexBodyEpisodes(withNew);
  const finalEp = reindexed.episodes.find((e) => e.id === id)!;
  return { snapshot: saveAndReturn(reindexed), episode: finalEp };
}

export function updateEpisodeMarkdown(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  contentMarkdown: string,
  bumpRemount: boolean
): NovelWorkspaceSnapshot {
  const t = nowIso();
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, contentMarkdown, updatedAt: t } : e
  );
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes, updatedAt: t };
  if (bumpRemount) next = bumpEpisodeRemount(next, episodeId);
  return saveAndReturn(next);
}

export function updateEpisodeScript(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  episodeScript: NovelEpisodeScript | undefined,
  bumpRemount: boolean
): NovelWorkspaceSnapshot {
  const t = nowIso();
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, episodeScript, updatedAt: t } : e
  );
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes, updatedAt: t };
  if (bumpRemount) next = bumpEpisodeRemount(next, episodeId);
  return saveAndReturn(next);
}

export function updateEpisodeAudiobook(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  episodeAudiobook: AudiobookEpisode | undefined,
  bumpRemount = false
): NovelWorkspaceSnapshot {
  const t = nowIso();
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, episodeAudiobook, updatedAt: t } : e
  );
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes, updatedAt: t };
  if (bumpRemount) next = bumpEpisodeRemount(next, episodeId);
  return saveAndReturn(next);
}

/** 更新故事大纲旁白/角色音色样本（与已有绑定合并；空字符串可清除某项） */
export function updateAudiobookOutlineVoiceSamples(
  snapshot: NovelWorkspaceSnapshot,
  patch: Partial<AudiobookOutlineVoiceSamples>,
): NovelWorkspaceSnapshot {
  const t = nowIso();
  const prev = snapshot.audiobookOutlineVoiceSamples ?? {};
  let narrator: string | undefined;
  if (patch.narratorRelPath !== undefined) {
    narrator = patch.narratorRelPath.trim() || undefined;
  } else {
    narrator = prev.narratorRelPath?.trim() || undefined;
  }
  let narratorRefText: string | undefined;
  if (patch.narratorRefText !== undefined) {
    narratorRefText = patch.narratorRefText.trim() || undefined;
  } else {
    narratorRefText = prev.narratorRefText?.trim() || undefined;
  }
  const by: Record<string, string> = { ...(prev.byCharacterId ?? {}) };
  if (patch.byCharacterId) {
    for (const [k, v] of Object.entries(patch.byCharacterId)) {
      const x = v?.trim();
      if (x) by[k] = x;
      else delete by[k];
    }
  }
  const byRef: Record<string, string> = { ...(prev.byCharacterRefText ?? {}) };
  if (patch.byCharacterRefText) {
    for (const [k, v] of Object.entries(patch.byCharacterRefText)) {
      const x = v?.trim();
      if (x) byRef[k] = x;
      else delete byRef[k];
    }
  }
  let narratorCloudEngineId: string | undefined;
  if (patch.narratorCloudEngineId !== undefined) {
    narratorCloudEngineId = patch.narratorCloudEngineId.trim() || undefined;
  } else {
    narratorCloudEngineId = prev.narratorCloudEngineId?.trim() || undefined;
  }
  let narratorCloudVoiceId: string | undefined;
  if (patch.narratorCloudVoiceId !== undefined) {
    narratorCloudVoiceId = patch.narratorCloudVoiceId.trim() || undefined;
  } else {
    narratorCloudVoiceId = prev.narratorCloudVoiceId?.trim() || undefined;
  }
  const byCloudEngine: Record<string, string> = { ...(prev.byCharacterCloudEngineId ?? {}) };
  if (patch.byCharacterCloudEngineId) {
    for (const [k, v] of Object.entries(patch.byCharacterCloudEngineId)) {
      const x = v?.trim();
      if (x) byCloudEngine[k] = x;
      else delete byCloudEngine[k];
    }
  }
  const byCloudVoice: Record<string, string> = { ...(prev.byCharacterCloudVoiceId ?? {}) };
  if (patch.byCharacterCloudVoiceId) {
    for (const [k, v] of Object.entries(patch.byCharacterCloudVoiceId)) {
      const x = v?.trim();
      if (x) byCloudVoice[k] = x;
      else delete byCloudVoice[k];
    }
  }
  let narratorStyleInstruction: string | undefined;
  if (patch.narratorStyleInstruction !== undefined) {
    narratorStyleInstruction = patch.narratorStyleInstruction.trim() || undefined;
  } else {
    narratorStyleInstruction = prev.narratorStyleInstruction?.trim() || undefined;
  }
  const byStyle: Record<string, string> = { ...(prev.byCharacterStyleInstruction ?? {}) };
  if (patch.byCharacterStyleInstruction) {
    for (const [k, v] of Object.entries(patch.byCharacterStyleInstruction)) {
      const x = v?.trim();
      if (x) byStyle[k] = x;
      else delete byStyle[k];
    }
  }
  const hasBy = Object.keys(by).length > 0;
  const hasRefBy = Object.keys(byRef).length > 0;
  const hasCloudBy = Object.keys(byCloudEngine).length > 0;
  const hasCloudVoiceBy = Object.keys(byCloudVoice).length > 0;
  const hasStyleBy = Object.keys(byStyle).length > 0;
  const audiobookOutlineVoiceSamples =
    narrator ||
    narratorRefText ||
    narratorCloudEngineId ||
    narratorCloudVoiceId ||
    narratorStyleInstruction ||
    hasBy ||
    hasRefBy ||
    hasCloudBy ||
    hasCloudVoiceBy ||
    hasStyleBy ?
      {
        narratorRelPath: narrator || undefined,
        narratorRefText: narratorRefText || undefined,
        narratorCloudEngineId: narratorCloudEngineId || undefined,
        narratorCloudVoiceId: narratorCloudVoiceId || undefined,
        narratorStyleInstruction: narratorStyleInstruction || undefined,
        byCharacterId: hasBy ? by : undefined,
        byCharacterRefText: hasRefBy ? byRef : undefined,
        byCharacterCloudEngineId: hasCloudBy ? byCloudEngine : undefined,
        byCharacterCloudVoiceId: hasCloudVoiceBy ? byCloudVoice : undefined,
        byCharacterStyleInstruction: hasStyleBy ? byStyle : undefined,
      }
    : undefined;
  return saveAndReturn({ ...snapshot, audiobookOutlineVoiceSamples, updatedAt: t });
}

/** 开通有声书：为正文集初始化空 AudiobookEpisode，并标记列表 audiobookEnabled */
export function enableAudiobookForNovel(snapshot: NovelWorkspaceSnapshot): NovelWorkspaceSnapshot {
  const t = nowIso();
  const episodes = snapshot.episodes.map((e) => {
    if (e.id === NOVEL_OUTLINE_EPISODE_ID) return e;
    const episodeAudiobook = e.episodeAudiobook ?? createEmptyEpisodeAudiobook(e);
    return { ...e, episodeAudiobook, updatedAt: t };
  });
  const listItem = loadNovelList().find((x) => x.id === snapshot.novelId);
  upsertNovel(
    listItem ?
      { ...listItem, audiobookEnabled: true, updatedAt: t }
    : {
        id: snapshot.novelId,
        title: snapshot.title.trim() || '未命名小说',
        genres: [],
        audiobookEnabled: true,
        updatedAt: t,
        createdAt: t,
      },
  );
  return saveAndReturn({ ...snapshot, episodes, updatedAt: t });
}

export function setNovelScript(snapshot: NovelWorkspaceSnapshot, novelScript: Script): NovelWorkspaceSnapshot {
  return saveAndReturn({ ...snapshot, novelScript, updatedAt: nowIso() });
}

export function setActiveEpisode(snapshot: NovelWorkspaceSnapshot, episodeId: string): NovelWorkspaceSnapshot {
  if (!snapshot.episodes.some((e) => e.id === episodeId)) return snapshot;
  return saveAndReturn({ ...snapshot, activeEpisodeId: episodeId });
}

export function renameWorkspaceTitle(snapshot: NovelWorkspaceSnapshot, title: string): NovelWorkspaceSnapshot {
  const newT = (title.trim() || snapshot.title).trim() || snapshot.title;
  const oldT = snapshot.title.trim();
  const outline = snapshot.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
  const novelScript =
    snapshot.novelScript ? { ...snapshot.novelScript, title: newT } : createEmptyNovelScript(snapshot.novelId, newT);

  if (!outline || !oldT || oldT === newT) {
    return saveAndReturn({ ...snapshot, title: newT, novelScript, updatedAt: nowIso() });
  }

  const nextMd = replaceBookTitleInOutlineMarkdown(outline.contentMarkdown, oldT, newT);
  if (nextMd === outline.contentMarkdown) {
    return saveAndReturn({ ...snapshot, title: newT, novelScript, updatedAt: nowIso() });
  }

  const t = nowIso();
  const episodes = snapshot.episodes.map((e) =>
    e.id === NOVEL_OUTLINE_EPISODE_ID ? { ...e, contentMarkdown: nextMd, updatedAt: t } : e,
  );
  const withTitle = { ...snapshot, title: newT, novelScript, episodes, updatedAt: t };
  return saveAndReturn(bumpEpisodeRemount(withTitle, NOVEL_OUTLINE_EPISODE_ID));
}

/** 删除一集（不可删除故事大纲） */
export function deleteEpisode(snapshot: NovelWorkspaceSnapshot, episodeId: string): NovelWorkspaceSnapshot | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID) return null;
  const eps = snapshot.episodes.filter((e) => e.id !== episodeId);
  if (eps.length === snapshot.episodes.length) return null;
  const t = nowIso();
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (!eps.some((e) => e.id === activeEpisodeId)) {
    activeEpisodeId = eps.sort((a, b) => a.order - b.order)[0]?.id ?? NOVEL_OUTLINE_EPISODE_ID;
  }
  const nextRaw = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  return saveAndReturn(reindexBodyEpisodes(nextRaw));
}

/** 一次删除多集（不可删除故事大纲） */
export function deleteEpisodes(snapshot: NovelWorkspaceSnapshot, episodeIds: string[]): NovelWorkspaceSnapshot | null {
  const idSet = new Set(episodeIds.filter((id) => id && id !== NOVEL_OUTLINE_EPISODE_ID));
  if (idSet.size === 0) return null;
  const eps = snapshot.episodes.filter((e) => !idSet.has(e.id));
  if (eps.length === snapshot.episodes.length) return null;
  const t = nowIso();
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (!eps.some((e) => e.id === activeEpisodeId)) {
    activeEpisodeId = [...eps].sort((a, b) => a.order - b.order)[0]?.id ?? NOVEL_OUTLINE_EPISODE_ID;
  }
  const nextRaw = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  return saveAndReturn(reindexBodyEpisodes(nextRaw));
}

/**
 * 将正文集移到大纲之后的第 newBodyIndex 位（1-based，1=紧接大纲后的第一篇正文）
 */
export function reorderEpisodeByBodyIndex(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  newBodyIndex: number
): NovelWorkspaceSnapshot | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID) return null;
  const outlineEp = snapshot.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
  const body = snapshot.episodes.filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID).sort((a, b) => a.order - b.order);
  const ix = body.findIndex((e) => e.id === episodeId);
  if (ix < 0) return null;
  const target0 = Math.max(0, Math.min(body.length - 1, Math.floor(newBodyIndex) - 1));
  const arr = [...body];
  const [item] = arr.splice(ix, 1);
  const insertAt = target0 > ix ? target0 - 1 : target0;
  arr.splice(insertAt, 0, item);
  const t = nowIso();
  const bodyOrdered = arr.map((e, i) => ({ ...e, order: i + 1, updatedAt: t }));
  const outline = outlineEp ? [{ ...outlineEp, order: 0, updatedAt: t }] : [];
  const episodes = [...outline, ...bodyOrdered];
  return saveAndReturn(reindexBodyEpisodes({ ...snapshot, episodes, updatedAt: t }));
}

/** 合并两集正文到 keepId，移除 mergeInId */
export function mergeEpisodesContent(
  snapshot: NovelWorkspaceSnapshot,
  episodeIdKeep: string,
  episodeIdMergeIn: string,
  separator = '\n\n'
): NovelWorkspaceSnapshot | null {
  if (
    episodeIdKeep === NOVEL_OUTLINE_EPISODE_ID ||
    episodeIdMergeIn === NOVEL_OUTLINE_EPISODE_ID ||
    episodeIdKeep === episodeIdMergeIn
  ) {
    return null;
  }
  const keep = snapshot.episodes.find((e) => e.id === episodeIdKeep);
  const mergeIn = snapshot.episodes.find((e) => e.id === episodeIdMergeIn);
  if (!keep || !mergeIn) return null;
  const t = nowIso();
  const newMd = `${keep.contentMarkdown.trim()}${separator}${mergeIn.contentMarkdown.trim()}`.trim();
  const mergedScript = mergeEpisodeScripts(keep.episodeScript, mergeIn.episodeScript);
  const eps = snapshot.episodes.filter((e) => e.id !== episodeIdMergeIn).map((e) =>
    e.id === episodeIdKeep ? { ...e, contentMarkdown: newMd, episodeScript: mergedScript, updatedAt: t } : e
  );
  let activeEpisodeId = snapshot.activeEpisodeId;
  if (activeEpisodeId === episodeIdMergeIn) activeEpisodeId = episodeIdKeep;
  let next: NovelWorkspaceSnapshot = { ...snapshot, episodes: eps, activeEpisodeId, updatedAt: t };
  next = bumpEpisodeRemount(next, episodeIdKeep);
  return saveAndReturn(reindexBodyEpisodes(next));
}

/** 按 marker 将一集拆成两集；marker 保留在第一节末尾 */
export function splitEpisodeAtMarker(
  snapshot: NovelWorkspaceSnapshot,
  episodeId: string,
  marker: string,
  newEpisodeTitle: string
): { snapshot: NovelWorkspaceSnapshot; newEpisodeId: string } | null {
  if (episodeId === NOVEL_OUTLINE_EPISODE_ID || !marker.trim()) return null;
  const ep = snapshot.episodes.find((e) => e.id === episodeId);
  if (!ep) return null;
  const md = ep.contentMarkdown;
  const ix = md.indexOf(marker);
  if (ix < 0) return null;
  const left = md.slice(0, ix + marker.length).trimEnd();
  const right = md.slice(ix + marker.length).trimStart();
  if (!right.trim()) return null;
  const t = nowIso();
  const maxOrder = snapshot.episodes.reduce((m, e) => Math.max(m, e.order), 0);
  const newId = makeId('ep');
  const splitTitle =
    stripNumericTitlePrefix(newEpisodeTitle.trim()) ||
    newEpisodeTitle.trim() ||
    `第${snapshot.episodes.filter((x) => x.id !== NOVEL_OUTLINE_EPISODE_ID).length + 1}集`;
  const newEp: NovelEpisode = {
    id: newId,
    title: splitTitle,
    contentMarkdown: right,
    order: maxOrder + 1,
    updatedAt: t,
  };
  const episodes = snapshot.episodes.map((e) =>
    e.id === episodeId ? { ...e, contentMarkdown: left, updatedAt: t } : e
  );
  const withNew = [...episodes, newEp].sort((a, b) => a.order - b.order);
  let next: NovelWorkspaceSnapshot = {
    ...snapshot,
    episodes: withNew,
    updatedAt: t,
    activeEpisodeId: newEp.id,
  };
  next = reindexBodyEpisodes(next);
  const refreshed = next.episodes.find((e) => e.id === newId);
  const nNum = refreshed?.episode ?? 1;
  next = {
    ...next,
    episodes: next.episodes.map((e) =>
      e.id === newId ?
        {
          ...e,
          episodeScript: createEmptyEpisodeScript({ id: newId, title: e.title, episode: nNum }),
        }
      : e
    ),
  };
  next = bumpEpisodeRemount(next, episodeId);
  next = bumpEpisodeRemount(next, newId);
  const saved = saveAndReturn(next);
  return { snapshot: saved, newEpisodeId: newId };
}

/** 若无快照则从小说列表推导标题并创建空白工作台 */
export function ensureNovelWorkspace(novelId: string): NovelWorkspaceSnapshot {
  const existing = loadNovelWorkspace(novelId);
  if (!existing) {
    const listItem = loadNovelList().find((n) => n.id === novelId);
    const title = listItem?.title.trim() || '未命名小说';
    return saveAndReturn(createBlankWorkspace(novelId, title));
  }
  const migrated = migrateNovelWorkspaceEpisodeTitles(existing);
  const normalized = reindexBodyEpisodes(migrated);
  const withScript = migrateSnapshotScriptFields(normalized);
  if (withScript !== normalized) {
    saveNovelWorkspace(withScript);
  }
  return withScript;
}
