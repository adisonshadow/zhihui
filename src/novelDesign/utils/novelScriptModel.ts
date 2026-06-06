/**
 * 小说工作台「结构化剧本」：基于 @/constants/Script.ts，与漫剧 OutlineTab 的 types/script 分离。
 */
import type {
  Episode,
  Scene,
  SceneStaging,
  Script,
  Shot,
  ShotDialogue,
  ShotSound,
  SoundEffect,
} from '@/constants/Script';

export type NovelEpisodeScript = Episode;

/** 与 storage 中 NovelEpisode 对齐的最小字段（避免循环依赖） */
export interface NovelEpisodeLike {
  id: string;
  title: string;
  episode?: number;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyNovelScript(novelId: string, title: string): Script {
  const now = new Date().toISOString();
  return {
    id: `novel_script_${novelId}`,
    title: title.trim() || '未命名小说',
    genre: [],
    logline: '',
    style: { artStyle: '日漫', aspectRatio: '9:16' },
    targetDuration: 90,
    characters: [],
    episodes: [],
    metadata: {
      createdBy: 'yiman-novel-workbench',
      createdAt: now,
      updatedAt: now,
      version: 1,
      isReviewed: false,
    },
  };
}

/** 侧栏正文集对应的 Episode 壳（scenes 由工具/用户填充） */
export function createEmptyEpisodeScript(ep: NovelEpisodeLike): NovelEpisodeScript {
  const n = ep.episode ?? 1;
  return {
    id: ep.id,
    episodeIndex: Math.max(1, n),
    title: ep.title,
    scenes: [],
  };
}

export function ensurePrimaryShot(scene: Scene): Scene {
  if (Array.isArray(scene.shots) && scene.shots.length > 0) {
    const first = scene.shots[0]!;
    return {
      ...scene,
      shots: [
        {
          ...first,
          shotIndex: 1,
          shotType: first.shotType ?? 'MEDIUM',
        },
        ...scene.shots.slice(1),
      ],
    };
  }
  const shot: Shot = {
    id: makeId('shot'),
    shotIndex: 1,
    shotType: 'MEDIUM',
    cameraMovement: 'STATIC',
    dialogues: [],
    beats: [],
  };
  return { ...scene, shots: [shot] };
}

export function sceneHasContent(episodeScript: NovelEpisodeScript | undefined): boolean {
  return Array.isArray(episodeScript?.scenes) && episodeScript.scenes.length > 0;
}

export function normalizeEpisodeScenes(scenes: Scene[]): Scene[] {
  return scenes.map((s, i) => ensurePrimaryShot({ ...s, sceneIndex: i + 1 }));
}

export function parseEpisodeScriptJson(raw: string | null | undefined): NovelEpisodeScript | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const v = JSON.parse(raw) as Partial<NovelEpisodeScript>;
    if (!v || typeof v !== 'object' || !Array.isArray(v.scenes)) return undefined;
    return {
      id: String(v.id ?? ''),
      episodeIndex: typeof v.episodeIndex === 'number' ? v.episodeIndex : 1,
      title: String(v.title ?? ''),
      logline: v.logline,
      summary: v.summary,
      scenes: normalizeEpisodeScenes((v.scenes as Scene[]) ?? []),
    };
  } catch {
    return undefined;
  }
}

export function serializeEpisodeScript(ep: NovelEpisodeScript | undefined): string {
  if (!ep) return '';
  const normalized: NovelEpisodeScript = {
    ...ep,
    scenes: normalizeEpisodeScenes(ep.scenes ?? []),
  };
  return JSON.stringify(normalized);
}

export function parseNovelScriptJson(raw: string | null | undefined): Script | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const v = JSON.parse(raw) as Script;
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || typeof v.title !== 'string') return undefined;
    return {
      ...v,
      genre: Array.isArray(v.genre) ? v.genre : [],
      characters: Array.isArray(v.characters) ? v.characters : [],
      episodes: [],
      style: v.style?.artStyle ? v.style : { artStyle: '日漫' },
      metadata: v.metadata ?? {
        createdBy: 'yiman',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        isReviewed: false,
      },
    };
  } catch {
    return undefined;
  }
}

export function serializeNovelScript(script: Script | undefined): string {
  if (!script) return '';
  const metaOnly: Script = {
    ...script,
    episodes: [],
  };
  return JSON.stringify(metaOnly);
}

/** 合并两集剧本：场顺接并重排 sceneIndex */
export function mergeEpisodeScripts(
  keep: NovelEpisodeScript | undefined,
  mergeIn: NovelEpisodeScript | undefined,
): NovelEpisodeScript | undefined {
  const a = keep ?? { id: '', episodeIndex: 1, title: '', scenes: [] };
  const b = mergeIn ?? { id: '', episodeIndex: 1, title: '', scenes: [] };
  const scenesA = normalizeEpisodeScenes([...(a.scenes ?? [])]);
  const scenesB = normalizeEpisodeScenes([...(b.scenes ?? [])]);
  const merged = [...scenesA, ...scenesB].map((s, i) => ({ ...s, sceneIndex: i + 1 }));
  return { ...a, scenes: merged };
}

/** 尝试将旧版 scriptMarkdown 迁成 JSON（仅当整段为合法 Episode JSON） */
export function tryMigrateMarkdownToEpisodeScript(
  scriptMarkdown: string | undefined,
  ep: NovelEpisodeLike,
): NovelEpisodeScript | undefined {
  const t = scriptMarkdown?.trim();
  if (!t || !t.startsWith('{')) return undefined;
  const parsed = parseEpisodeScriptJson(t);
  if (parsed && parsed.id === ep.id) return parsed;
  if (parsed) return { ...parsed, id: ep.id, episodeIndex: ep.episode ?? parsed.episodeIndex, title: ep.title };
  return undefined;
}

export function getPrimaryShot(scene: Scene): Shot {
  const s = ensurePrimaryShot(scene);
  return s.shots[0]!;
}

export function createEmptyScene(sceneIndex: number, heading?: string): Scene {
  const scene: Scene = {
    id: makeId('scene'),
    sceneIndex,
    heading: heading?.trim() || `场 ${sceneIndex}`,
    location: '',
    locationType: 'INT',
    timeOfDay: '日',
    charactersInScene: [],
    shots: [],
  };
  return ensurePrimaryShot(scene);
}

type RawDialogueRow = Record<string, unknown>;

function pickDialogueText(d: RawDialogueRow): string {
  for (const key of ['text', 'line', 'content', 'dialogue', '台词', '对白']) {
    const v = d[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickCharacterRef(d: RawDialogueRow): string {
  for (const key of ['character_id', 'characterId', 'speaker', 'character', 'name', '角色', '说话人']) {
    const v = d[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickDialogueEmotion(d: RawDialogueRow): string | undefined {
  if (typeof d.emotion === 'string' && d.emotion.trim()) return d.emotion.trim();
  if (typeof d.tone === 'string' && d.tone.trim()) return d.tone.trim();
  return undefined;
}

function isNarrationRow(d: RawDialogueRow, lineHint?: string): boolean {
  if (d.is_narration === true || d.isNarration === true) return true;
  if (d.type === 'narration' || d.type === '旁白') return true;
  if (lineHint && /旁白/.test(lineHint)) return true;
  return false;
}

/** 解析单行「角色：台词」或「对白 - 角色（语气）：「…」」 */
function parseOneDialogueLine(line: string): ShotDialogue | null {
  const t = line.trim();
  if (!t) return null;

  const scripted = t.match(
    /^(?:对白|旁白)\s*[-–—]\s*(.+?)(?:[（(]([^）)]+)[）)])?\s*[：:]\s*[「"']([^」"']+)[」"']?\s*$/,
  );
  if (scripted) {
    const speaker = scripted[1]!.replace(/[\[\]]/g, '').trim();
    const text = scripted[3]!.trim();
    if (!text) return null;
    return {
      characterId: speaker,
      text,
      emotion: scripted[2]?.trim() || undefined,
      isNarration: /旁白/.test(t),
    };
  }
  const loose = t.match(/^(?:对白|旁白)?\s*[-–—]?\s*([^：:（(]+?)(?:[（(]([^）)]+)[）)])?\s*[：:]\s*(.+)$/);
  if (loose) {
    const speaker = loose[1]!.trim();
    const text = loose[3]!.replace(/^[「"'](.+)[」"']$/u, '$1').trim();
    if (!text) return null;
    return {
      characterId: speaker,
      text,
      emotion: loose[2]?.trim() || undefined,
      isNarration: /旁白/.test(t),
    };
  }

  const colon = t.match(/^([^：:]+)[：:]\s*(.+)$/);
  if (colon) {
    return {
      characterId: colon[1]!.trim(),
      text: colon[2]!.trim(),
      isNarration: /旁白/.test(t),
    };
  }
  return null;
}

/** 从 description 中抽取结构化对白行（模型常把台词写进画面描述） */
export function extractDialoguesFromDescription(description: string | undefined): ShotDialogue[] {
  if (!description?.trim()) return [];
  const out: ShotDialogue[] = [];
  for (const line of description.split(/\n+/)) {
    const row = parseOneDialogueLine(line);
    if (row?.text) out.push(row);
  }
  return out;
}

/**
 * 规范化 AI/导入的对白数组（兼容 speaker+line、tone、嵌套 dialogue 等）。
 */
export function normalizeDialogueInput(raw: unknown): ShotDialogue[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const one = parseOneDialogueLine(raw);
    return one ? [one] : extractDialoguesFromDescription(raw);
  }
  if (!Array.isArray(raw)) {
    if (typeof raw === 'object') return normalizeDialogueInput([raw]);
    return [];
  }

  const out: ShotDialogue[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const row = parseOneDialogueLine(item);
      if (row?.text) out.push(row);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const d = item as RawDialogueRow;
    const nested = d.dialogue;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      out.push(...normalizeDialogueInput([nested]));
      continue;
    }
    const text = pickDialogueText(d);
    if (!text) continue;
    out.push({
      characterId: pickCharacterRef(d),
      text,
      emotion: pickDialogueEmotion(d),
      isNarration: isNarrationRow(d),
    });
  }
  return out;
}

/** 合并 tool 参数中的 dialogues 字段（含 dialogue / lines 别名） */
export function pickDialoguesArg(args: Record<string, unknown>): unknown {
  return args.dialogues ?? args.dialogue ?? args.lines ?? args.对白;
}

function isStagingEmpty(staging: SceneStaging): boolean {
  return !staging.background?.trim()
    && !staging.foreground?.trim()
    && !staging.props?.trim()
    && !staging.lighting?.trim();
}

/** 从 Function Call 参数合并场景要素（支持扁平字段或 staging 对象） */
export function applyStagingFromArgs(scene: Scene, a: Record<string, unknown>): Scene {
  const staging: SceneStaging = { ...scene.staging };
  let touched = false;
  const mergeKey = (key: keyof SceneStaging, snake: string) => {
    const flat = a[snake];
    if (typeof flat === 'string') {
      staging[key] = flat.trim() || undefined;
      touched = true;
    }
  };
  mergeKey('background', 'background');
  mergeKey('foreground', 'foreground');
  mergeKey('props', 'props');
  mergeKey('lighting', 'lighting');
  const nested = a.staging;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const o = nested as Record<string, unknown>;
    for (const key of ['background', 'foreground', 'props', 'lighting'] as const) {
      if (typeof o[key] === 'string') {
        staging[key] = (o[key] as string).trim() || undefined;
        touched = true;
      }
    }
  }
  if (!touched) return scene;
  return { ...scene, staging: isStagingEmpty(staging) ? undefined : staging };
}

/** 从 Function Call 参数解析 shot.sound */
export function parseShotSoundFromArgs(raw: unknown): ShotSound | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const sound: ShotSound = {};
  if (typeof o.ambiance === 'string' && o.ambiance.trim()) {
    sound.ambiance = o.ambiance.trim();
  }
  const bgmRaw = o.bgm;
  if (bgmRaw && typeof bgmRaw === 'object' && !Array.isArray(bgmRaw)) {
    const b = bgmRaw as Record<string, unknown>;
    const trackName = String(b.track_name ?? b.trackName ?? '').trim();
    if (trackName) {
      sound.bgm = {
        trackName,
        startOffset: typeof b.start_offset === 'number' ? b.start_offset : (
          typeof b.startOffset === 'number' ? b.startOffset : undefined
        ),
        endOffset: typeof b.end_offset === 'number' ? b.end_offset : (
          typeof b.endOffset === 'number' ? b.endOffset : undefined
        ),
      };
    }
  }
  if (Array.isArray(o.sfx)) {
    const sfx: SoundEffect[] = o.sfx
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const fx = item as Record<string, unknown>;
        const name = String(fx.name ?? '').trim();
        if (!name) return null;
        const timing = fx.timing;
        const validTiming =
          timing === 'start' || timing === 'continuous' || timing === 'one_shot' ? timing : undefined;
        return { name, timing: validTiming };
      })
      .filter((x): x is SoundEffect => x != null);
    if (sfx.length > 0) sound.sfx = sfx;
  }
  const hasAmbiance = Boolean(sound.ambiance);
  const hasBgm = Boolean(sound.bgm?.trackName);
  const hasSfx = Boolean(sound.sfx?.length);
  return hasAmbiance || hasBgm || hasSfx ? sound : undefined;
}

export function bumpScriptMetadata(script: Script): Script {
  const now = new Date().toISOString();
  return {
    ...script,
    metadata: {
      ...script.metadata,
      updatedAt: now,
      version: (script.metadata?.version ?? 0) + 1,
    },
  };
}
