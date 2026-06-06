/**
 * 小说工作台：结构化剧本 Function Calls（Script.ts）
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Beat, Character, Scene, Script, ShotDialogue } from '@/constants/Script';
import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  bumpEpisodeRemount,
  setNovelScript,
  updateEpisodeScript,
  type NovelEpisodeScript,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  applyStagingFromArgs,
  bumpScriptMetadata,
  createEmptyEpisodeScript,
  createEmptyScene,
  ensurePrimaryShot,
  extractDialoguesFromDescription,
  getPrimaryShot,
  normalizeDialogueInput,
  normalizeEpisodeScenes,
  parseShotSoundFromArgs,
  pickDialoguesArg,
} from '@/novelDesign/utils/novelScriptModel';

export type MiddleViewMode = 'novel' | 'both' | 'script';

export interface NovelScriptFunctionCallDeps {
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  setSnapshot: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  novelId: string;
  setMiddleViewMode?: (mode: MiddleViewMode) => void;
}

function ok(extra: Record<string, unknown> = {}) {
  return { ok: true as const, ...extra };
}

function err(message: string, extra?: Record<string, unknown>) {
  return { ok: false as const, error: message, ...(extra ?? {}) };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 别名列表：空项丢弃 */
function normalizeAliases(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const xs = input.map((x) => String(x ?? '').trim()).filter(Boolean);
  return xs.length ? xs : [];
}

function resolveCharacterId(script: Script, nameOrId: string): string {
  const t = nameOrId.trim();
  if (!t) return '';
  const byId = script.characters.find((c) => c.id === t);
  if (byId) return byId.id;
  const byName = script.characters.find((c) => c.name === t || c.aliases?.includes(t));
  return byName?.id ?? t;
}

function resolveSceneDialogues(
  novelScript: Script,
  rawDialogues: unknown,
  description?: string,
): ShotDialogue[] {
  let list = normalizeDialogueInput(rawDialogues);
  if (!list.length) {
    list = extractDialoguesFromDescription(description);
  }
  return list.map((d) => ({
    ...d,
    characterId: resolveCharacterId(novelScript, d.characterId),
  }));
}

function getBodyEpisode(ws: NovelWorkspaceSnapshot, episodeId: string) {
  const ep = ws.episodes.find((e) => e.id === episodeId);
  if (!ep || ep.id === NOVEL_OUTLINE_EPISODE_ID) return null;
  return ep;
}

function ensureEpisodeScriptShell(ws: NovelWorkspaceSnapshot, episodeId: string): {
  ws: NovelWorkspaceSnapshot;
  epScript: NovelEpisodeScript;
} {
  const ep = getBodyEpisode(ws, episodeId)!;
  let script = ep.episodeScript ?? createEmptyEpisodeScript(ep);
  if (!ep.episodeScript) {
    const episodes = ws.episodes.map((e) =>
      e.id === episodeId ? { ...e, episodeScript: script } : e
    );
    ws = { ...ws, episodes };
  }
  return { ws, epScript: script };
}

function commitEpisodeScript(
  ws: NovelWorkspaceSnapshot,
  episodeId: string,
  epScript: NovelEpisodeScript,
  bump = true
): NovelWorkspaceSnapshot {
  let next = updateEpisodeScript(ws, episodeId, epScript, false);
  if (bump) next = bumpEpisodeRemount(next, episodeId);
  return next;
}

function sceneSummary(epScript: NovelEpisodeScript) {
  return epScript.scenes.map((s) => {
    const shot = s.shots[0];
    return {
      scene_id: s.id,
      scene_index: s.sceneIndex,
      heading: s.heading,
      dialogue_count: shot?.dialogues?.length ?? 0,
    };
  });
}

export function buildNovelScriptFunctionCalls(deps: NovelScriptFunctionCallDeps): FunctionCallDef[] {
  /** extraFunctionCalls 会合并进任意 agent 请求；scope 标记来源为 novel 工作台 */
  const commonScope = { type: 'agent' as const, agentKey: 'novel' };

  const applyMutation = (
    updater: (ws: NovelWorkspaceSnapshot) =>
      | NovelWorkspaceSnapshot
      | null
      | { snapshot: NovelWorkspaceSnapshot; extras?: Record<string, unknown> }
      | Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const ws = deps.getSnapshot();
    if (!ws || ws.novelId !== deps.novelId) return Promise.resolve(err('工作区未就绪'));
    const out = updater(ws);
    if (out != null && typeof out === 'object' && 'ok' in out && (out as { ok: boolean }).ok === false) {
      return Promise.resolve(out as Record<string, unknown>);
    }
    let snap: NovelWorkspaceSnapshot | null = null;
    let extras: Record<string, unknown> = {};
    if (out != null && typeof out === 'object' && 'snapshot' in out) {
      snap = (out as { snapshot: NovelWorkspaceSnapshot }).snapshot;
      extras = { ...((out as { extras?: Record<string, unknown> }).extras ?? {}) };
    } else if (out && typeof out === 'object') {
      snap = out as NovelWorkspaceSnapshot;
    }
    if (!snap) return Promise.resolve(err('操作失败'));
    deps.setSnapshot(snap);
    return Promise.resolve(ok(extras));
  };

  const defs: FunctionCallDef[] = [];

  const push = (def: Omit<FunctionCallDef, 'scope'>) => {
    defs.push({ ...def, scope: commonScope });
  };

  push({
    name: 'novel_script_set_middle_view',
    senderLabel: '切换编辑区',
    description: '切换中间编辑区视图：novel=仅小说正文，both=小说+剧本并排，script=仅剧本。',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['novel', 'both', 'script'] },
      },
      required: ['mode'],
    },
    handler: async (args) => {
      const mode = String((args as { mode?: string }).mode ?? '') as MiddleViewMode;
      if (!['novel', 'both', 'script'].includes(mode)) return err('mode 须为 novel | both | script');
      deps.setMiddleViewMode?.(mode);
      return ok({ mode });
    },
  });

  push({
    name: 'novel_script_get_meta',
    senderLabel: '读取剧本设定',
    description: '读取全书顶层 Script 元数据（logline、genre、角色列表等）。',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const ws = deps.getSnapshot();
      if (!ws) return err('工作区未就绪');
      const s = ws.novelScript;
      if (!s) return err('尚未初始化剧本设定');
      return ok({
        title: s.title,
        logline: s.logline,
        genre: s.genre,
        target_duration: s.targetDuration,
        style: s.style,
        target_content_type: s.targetContentType,
        character_count: s.characters.length,
      });
    },
  });

  push({
    name: 'novel_script_update_meta',
    senderLabel: '更新剧本设定',
    description: '更新全书顶层 Script 元数据（不含各集 scenes）。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        logline: { type: 'string' },
        genre: { type: 'array', items: { type: 'string' } },
        target_duration: { type: 'number' },
        target_content_type: { type: 'string' },
        art_style: { type: 'string' },
        aspect_ratio: { type: 'string' },
      },
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      return applyMutation((ws) => {
        if (!ws.novelScript) return err('尚未初始化剧本设定');
        const next = bumpScriptMetadata({
          ...ws.novelScript,
          title: typeof a.title === 'string' ? a.title : ws.novelScript.title,
          logline: typeof a.logline === 'string' ? a.logline : ws.novelScript.logline,
          genre: Array.isArray(a.genre) ? (a.genre as string[]) : ws.novelScript.genre,
          targetDuration:
            typeof a.target_duration === 'number' ? a.target_duration : ws.novelScript.targetDuration,
          targetContentType:
            typeof a.target_content_type === 'string' ?
              a.target_content_type
            : ws.novelScript.targetContentType,
          style: {
            ...ws.novelScript.style,
            artStyle: typeof a.art_style === 'string' ? a.art_style : ws.novelScript.style.artStyle,
            aspectRatio:
              typeof a.aspect_ratio === 'string' ? a.aspect_ratio : ws.novelScript.style.aspectRatio,
          },
        });
        return setNovelScript(ws, next);
      });
    },
  });

  push({
    name: 'novel_script_list_characters',
    senderLabel: '列出角色',
    description: '列出全书 Script 中的角色 id、name、importance、可选 voice_characteristic 与 aliases。',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const ws = deps.getSnapshot();
      if (!ws?.novelScript) return err('工作区未就绪');
      return ok({
        characters: ws.novelScript.characters.map((c) => ({
          id: c.id,
          name: c.name,
          importance: c.importance,
          voice_characteristic: c.voiceCharacteristic?.trim() || undefined,
          aliases: c.aliases?.length ? c.aliases : undefined,
        })),
      });
    },
  });

  push({
    name: 'novel_script_upsert_character',
    senderLabel: '保存角色',
    description:
      '新增或按 id 更新角色（顶层 Script.characters）。有声书「大纲音色样本」表按角色 id 成行；可先补全 MAIN/SECONDARY 人设与 voice_characteristic 再让用户在界面绑定 wav。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '已有角色 id；省略则新建' },
        name: { type: 'string' },
        description: { type: 'string', description: '外貌/人设要点' },
        personality: { type: 'string', description: '性格关键词' },
        importance: { type: 'string', enum: ['MAIN', 'SECONDARY', 'MINOR'] },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: '别名；传 [] 表示清空别名',
        },
        voice_characteristic: {
          type: 'string',
          description: '一句声线/人声底色描述，供大纲选 wav / MiMo voicedesign 参考（传空字符串可清空）',
        },
      },
      required: ['name'],
    },
    handler: async (args) => {
      const a = args as {
        id?: string;
        name?: string;
        description?: string;
        personality?: string;
        importance?: Character['importance'];
        aliases?: unknown;
        voice_characteristic?: unknown;
      };
      return applyMutation((ws) => {
        if (!ws.novelScript) return err('尚未初始化剧本设定');
        const chars = [...ws.novelScript.characters];
        const id = a.id?.trim() || makeId('char');
        const ix = chars.findIndex((c) => c.id === id);
        const nameNew = (a.name ?? '').trim() || '未命名';
        if (ix < 0) {
          const row: Character = {
            id,
            name: nameNew,
            description: typeof a.description === 'string' ? a.description : '',
            personality: typeof a.personality === 'string' ? a.personality : '',
            importance:
              typeof a.importance === 'string' &&
              ['MAIN', 'SECONDARY', 'MINOR'].includes(a.importance as Character['importance']) ?
                a.importance
              : 'SECONDARY',
            aliases: normalizeAliases(a.aliases),
            voiceCharacteristic:
              typeof a.voice_characteristic === 'string' && a.voice_characteristic.trim()
                ? a.voice_characteristic.trim()
                : undefined,
          };
          chars.push(row);
          return setNovelScript(ws, bumpScriptMetadata({ ...ws.novelScript, characters: chars }));
        }
        const prev = chars[ix];
        const nextAliases = normalizeAliases(a.aliases);

        chars[ix] = {
          ...prev,
          id,
          name: nameNew,
          description:
            typeof a.description === 'string' ? a.description : (prev.description ?? ''),
          personality:
            typeof a.personality === 'string' ? a.personality : (prev.personality ?? ''),
          importance:
            typeof a.importance === 'string' && ['MAIN', 'SECONDARY', 'MINOR'].includes(a.importance) ?
              a.importance
            : prev.importance ?? 'SECONDARY',
          aliases: nextAliases !== undefined ? (nextAliases.length ? nextAliases : undefined) : prev.aliases,
          voiceCharacteristic:
            typeof a.voice_characteristic === 'string' ?
              a.voice_characteristic.trim() || undefined
            : prev.voiceCharacteristic,
        };
        return setNovelScript(ws, bumpScriptMetadata({ ...ws.novelScript, characters: chars }));
      });
    },
  });

  push({
    name: 'novel_script_delete_character',
    senderLabel: '删除角色',
    description: '按 id 删除顶层角色。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: async (args) => {
      const id = String((args as { id?: string }).id ?? '').trim();
      return applyMutation((ws) => {
        if (!ws.novelScript) return err('尚未初始化剧本设定');
        return setNovelScript(ws, {
          ...bumpScriptMetadata(ws.novelScript),
          characters: ws.novelScript.characters.filter((c) => c.id !== id),
        });
      });
    },
  });

  push({
    name: 'novel_script_get_episode',
    senderLabel: '读取本集剧本',
    description: '读取指定正文集的 episodeScript 摘要（场列表、对白条数）。',
    parameters: {
      type: 'object',
      properties: { episode_id: { type: 'string' } },
      required: ['episode_id'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const ws = deps.getSnapshot();
      if (!ws) return err('工作区未就绪');
      const ep = getBodyEpisode(ws, episode_id);
      if (!ep) return err('找不到正文集');
      const script = ep.episodeScript;
      if (!script?.scenes?.length) return ok({ episode_id, scene_count: 0, scenes: [] });
      return ok({ episode_id, scene_count: script.scenes.length, scenes: sceneSummary(script) });
    },
  });

  push({
    name: 'novel_script_replace_episode',
    senderLabel: '替换本集剧本',
    description: '整集替换 episodeScript（含 scenes；每场建议 shots 长度为 1）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        episode_script: { type: 'object', description: '完整 Episode JSON' },
      },
      required: ['episode_id', 'episode_script'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const raw = (args as { episode_script?: NovelEpisodeScript }).episode_script;
      if (!raw || !Array.isArray(raw.scenes)) return err('episode_script 须含 scenes 数组');
      return applyMutation((ws) => {
        if (!getBodyEpisode(ws, episode_id)) return err('找不到正文集');
        if (!ws.novelScript) return err('请先在大纲页初始化剧本设定');
        const scenes = normalizeEpisodeScenes(raw.scenes).map((scene) => {
          const s = ensurePrimaryShot(scene);
          const shot = getPrimaryShot(s);
          const dialogues = resolveSceneDialogues(ws.novelScript!, shot.dialogues, shot.description);
          return { ...s, shots: [{ ...shot, dialogues }] };
        });
        const epScript: NovelEpisodeScript = {
          ...raw,
          id: episode_id,
          scenes,
        };
        return {
          snapshot: commitEpisodeScript(ws, episode_id, epScript, true),
          extras: { scene_count: epScript.scenes.length },
        };
      });
    },
  });

  push({
    name: 'novel_script_add_scene',
    senderLabel: '添加场',
    description:
      '向正文集添加一场（自动创建单镜头 shots[0]）。可传 heading、location、staging（背景/前景/道具）、description、dialogues、sound（环境音/BGM/音效）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        heading: { type: 'string' },
        location: { type: 'string' },
        location_type: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
        time_of_day: { type: 'string' },
        summary: { type: 'string' },
        background: { type: 'string', description: '场景背景/环境' },
        foreground: { type: 'string', description: '前景层次' },
        props: { type: 'string', description: '道具陈设' },
        lighting: { type: 'string', description: '光线氛围' },
        staging: {
          type: 'object',
          properties: {
            background: { type: 'string' },
            foreground: { type: 'string' },
            props: { type: 'string' },
            lighting: { type: 'string' },
          },
        },
        description: { type: 'string' },
        shot_type: { type: 'string' },
        camera_movement: { type: 'string' },
        sound: {
          type: 'object',
          properties: {
            ambiance: { type: 'string' },
            bgm: {
              type: 'object',
              properties: {
                track_name: { type: 'string' },
                start_offset: { type: 'number' },
                end_offset: { type: 'number' },
              },
            },
            sfx: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  timing: { type: 'string', enum: ['start', 'continuous', 'one_shot'] },
                },
              },
            },
          },
        },
        dialogues: {
          type: 'array',
          description:
            '对白列表（必填若有台词）。每项用 character_id 或 speaker 表角色名，用 text 或 line 表台词；勿仅用 description 写对白。',
          items: {
            type: 'object',
            properties: {
              character_id: { type: 'string', description: '角色 id 或姓名' },
              speaker: { type: 'string', description: '同 character_id' },
              text: { type: 'string', description: '台词正文' },
              line: { type: 'string', description: '同 text' },
              emotion: { type: 'string' },
              tone: { type: 'string', description: '同 emotion' },
              is_narration: { type: 'boolean' },
            },
          },
        },
      },
      required: ['episode_id'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      return applyMutation((ws) => {
        if (!ws.novelScript) return err('请先在大纲页初始化剧本设定');
        const ep = getBodyEpisode(ws, episode_id);
        if (!ep) return err('找不到正文集');
        let { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const idx = epScript.scenes.length + 1;
        let scene = createEmptyScene(idx, typeof a.heading === 'string' ? a.heading : undefined);
        if (typeof a.location === 'string') scene = { ...scene, location: a.location };
        if (typeof a.location_type === 'string') {
          scene = { ...scene, locationType: a.location_type as Scene['locationType'] };
        }
        if (typeof a.time_of_day === 'string') scene = { ...scene, timeOfDay: a.time_of_day };
        if (typeof a.summary === 'string') scene = { ...scene, summary: a.summary };
        scene = applyStagingFromArgs(scene, a);
        const shot = getPrimaryShot(scene);
        let nextShot = { ...shot };
        const parsedSound = parseShotSoundFromArgs(a.sound);
        if (parsedSound) nextShot = { ...nextShot, sound: parsedSound };
        if (typeof a.description === 'string') nextShot = { ...nextShot, description: a.description };
        if (typeof a.shot_type === 'string') nextShot = { ...nextShot, shotType: a.shot_type as typeof shot.shotType };
        if (typeof a.camera_movement === 'string') {
          nextShot = { ...nextShot, cameraMovement: a.camera_movement as typeof shot.cameraMovement };
        }
        const dlg = resolveSceneDialogues(
          ws.novelScript!,
          pickDialoguesArg(a),
          typeof a.description === 'string' ? a.description : undefined,
        );
        if (dlg.length) nextShot = { ...nextShot, dialogues: dlg };
        scene = { ...scene, shots: [nextShot] };
        epScript = {
          ...epScript,
          scenes: normalizeEpisodeScenes([...epScript.scenes, scene]),
        };
        return {
          snapshot: commitEpisodeScript(w2, episode_id, epScript, true),
          extras: { scene_id: scene.id, scene_index: scene.sceneIndex },
        };
      });
    },
  });

  push({
    name: 'novel_script_update_scene',
    senderLabel: '更新场',
    description:
      '按 scene_id 更新场的 heading/location/summary、staging（背景/前景/道具）等（对白/声音请用专用工具）。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        heading: { type: 'string' },
        location: { type: 'string' },
        location_type: { type: 'string' },
        time_of_day: { type: 'string' },
        summary: { type: 'string' },
        background: { type: 'string' },
        foreground: { type: 'string' },
        props: { type: 'string' },
        lighting: { type: 'string' },
        staging: {
          type: 'object',
          properties: {
            background: { type: 'string' },
            foreground: { type: 'string' },
            props: { type: 'string' },
            lighting: { type: 'string' },
          },
        },
      },
      required: ['episode_id', 'scene_id'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const prev = epScript.scenes[ix]!;
        let nextScene: Scene = {
          ...prev,
          heading: typeof a.heading === 'string' ? a.heading : prev.heading,
          location: typeof a.location === 'string' ? a.location : prev.location,
          locationType:
            typeof a.location_type === 'string' ?
              (a.location_type as Scene['locationType'])
            : prev.locationType,
          timeOfDay: typeof a.time_of_day === 'string' ? a.time_of_day : prev.timeOfDay,
          summary: typeof a.summary === 'string' ? a.summary : prev.summary,
        };
        nextScene = applyStagingFromArgs(nextScene, a);
        const scenes = [...epScript.scenes];
        scenes[ix] = ensurePrimaryShot(nextScene);
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes: normalizeEpisodeScenes(scenes) }, true);
      });
    },
  });

  push({
    name: 'novel_script_delete_scene',
    senderLabel: '删除场',
    description: '按 scene_id 删除一场。',
    parameters: {
      type: 'object',
      properties: { episode_id: { type: 'string' }, scene_id: { type: 'string' } },
      required: ['episode_id', 'scene_id'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const scene_id = String((args as { scene_id?: string }).scene_id ?? '').trim();
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const scenes = epScript.scenes.filter((s) => s.id !== scene_id);
        if (scenes.length === epScript.scenes.length) return err('找不到该场');
        return commitEpisodeScript(
          w2,
          episode_id,
          { ...epScript, scenes: normalizeEpisodeScenes(scenes) },
          true
        );
      });
    },
  });

  push({
    name: 'novel_script_set_shot',
    senderLabel: '更新镜头内容',
    description:
      '更新场内主镜头（shots[0]）的 description、shotType、cameraMovement、duration、sound（环境音/BGM/音效）等。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        description: { type: 'string' },
        shot_type: { type: 'string' },
        camera_movement: { type: 'string' },
        duration_estimate: { type: 'number' },
        sound: {
          type: 'object',
          properties: {
            ambiance: { type: 'string' },
            bgm: {
              type: 'object',
              properties: {
                track_name: { type: 'string' },
                start_offset: { type: 'number' },
                end_offset: { type: 'number' },
              },
            },
            sfx: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  timing: { type: 'string', enum: ['start', 'continuous', 'one_shot'] },
                },
              },
            },
          },
        },
      },
      required: ['episode_id', 'scene_id'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const scene = ensurePrimaryShot(epScript.scenes[ix]!);
        const shot = getPrimaryShot(scene);
        const parsedSound = parseShotSoundFromArgs(a.sound);
        const nextShot = {
          ...shot,
          description: typeof a.description === 'string' ? a.description : shot.description,
          shotType: typeof a.shot_type === 'string' ? (a.shot_type as typeof shot.shotType) : shot.shotType,
          cameraMovement:
            typeof a.camera_movement === 'string' ?
              (a.camera_movement as typeof shot.cameraMovement)
            : shot.cameraMovement,
          durationEstimate:
            typeof a.duration_estimate === 'number' ? a.duration_estimate : shot.durationEstimate,
          ...(parsedSound ? { sound: parsedSound } : {}),
        };
        const scenes = [...epScript.scenes];
        scenes[ix] = { ...scene, shots: [nextShot] };
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes }, true);
      });
    },
  });

  push({
    name: 'novel_script_upsert_dialogue',
    senderLabel: '更新对白',
    description: '在主镜头对白列表追加或按 dialogue_index 替换一条对白。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        dialogue_index: { type: 'integer', description: '从 0 开始；省略则追加' },
        character_id: { type: 'string', description: '角色 id 或姓名' },
        text: { type: 'string' },
        emotion: { type: 'string' },
        is_narration: { type: 'boolean' },
      },
      required: ['episode_id', 'scene_id', 'character_id', 'text'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      return applyMutation((ws) => {
        if (!ws.novelScript) return err('剧本设定未就绪');
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const scene = ensurePrimaryShot(epScript.scenes[ix]!);
        const shot = getPrimaryShot(scene);
        const list = [...(shot.dialogues ?? [])];
        const row: ShotDialogue = {
          characterId: resolveCharacterId(ws.novelScript, String(a.character_id ?? '')),
          text: String(a.text ?? ''),
          emotion: typeof a.emotion === 'string' ? a.emotion : undefined,
          isNarration: a.is_narration === true,
        };
        const di = typeof a.dialogue_index === 'number' ? Math.floor(a.dialogue_index) : -1;
        if (di >= 0 && di < list.length) list[di] = row;
        else list.push(row);
        const scenes = [...epScript.scenes];
        scenes[ix] = { ...scene, shots: [{ ...shot, dialogues: list }] };
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes }, true);
      });
    },
  });

  push({
    name: 'novel_script_delete_dialogue',
    senderLabel: '删除对白',
    description: '按 dialogue_index 删除主镜头内一条对白。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        dialogue_index: { type: 'integer' },
      },
      required: ['episode_id', 'scene_id', 'dialogue_index'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      const di = Math.floor(Number(a.dialogue_index ?? -1));
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const scene = ensurePrimaryShot(epScript.scenes[ix]!);
        const shot = getPrimaryShot(scene);
        const list = (shot.dialogues ?? []).filter((_, i) => i !== di);
        const scenes = [...epScript.scenes];
        scenes[ix] = { ...scene, shots: [{ ...shot, dialogues: list }] };
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes }, true);
      });
    },
  });

  push({
    name: 'novel_script_upsert_beat',
    senderLabel: '更新节拍',
    description: '在主镜头 beats 列表追加或按 beat_index 替换 action/dialogue 节拍。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        beat_index: { type: 'integer' },
        type: { type: 'string', enum: ['action', 'dialogue'] },
        text: { type: 'string' },
        character_id: { type: 'string' },
        is_narration: { type: 'boolean' },
      },
      required: ['episode_id', 'scene_id', 'type', 'text'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      const beatType = a.type === 'dialogue' ? 'dialogue' : 'action';
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const scene = ensurePrimaryShot(epScript.scenes[ix]!);
        const shot = getPrimaryShot(scene);
        const list = [...(shot.beats ?? [])];
        let beat: Beat;
        if (beatType === 'action') {
          beat = { type: 'action', text: String(a.text ?? '') };
        } else {
          const charId =
            ws.novelScript ?
              resolveCharacterId(ws.novelScript, String(a.character_id ?? ''))
            : String(a.character_id ?? '');
          beat = {
            type: 'dialogue',
            characterId: charId,
            text: String(a.text ?? ''),
            isNarration: a.is_narration === true,
          };
        }
        const bi = typeof a.beat_index === 'number' ? Math.floor(a.beat_index) : -1;
        if (bi >= 0 && bi < list.length) list[bi] = beat;
        else list.push(beat);
        const scenes = [...epScript.scenes];
        scenes[ix] = { ...scene, shots: [{ ...shot, beats: list }] };
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes }, true);
      });
    },
  });

  push({
    name: 'novel_script_delete_beat',
    senderLabel: '删除节拍',
    description: '按 beat_index 删除主镜头内一条 beat。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_id: { type: 'string' },
        beat_index: { type: 'integer' },
      },
      required: ['episode_id', 'scene_id', 'beat_index'],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const episode_id = String(a.episode_id ?? '').trim();
      const scene_id = String(a.scene_id ?? '').trim();
      const bi = Math.floor(Number(a.beat_index ?? -1));
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const ix = epScript.scenes.findIndex((s) => s.id === scene_id);
        if (ix < 0) return err('找不到该场');
        const scene = ensurePrimaryShot(epScript.scenes[ix]!);
        const shot = getPrimaryShot(scene);
        const list = (shot.beats ?? []).filter((_, i) => i !== bi);
        const scenes = [...epScript.scenes];
        scenes[ix] = { ...scene, shots: [{ ...shot, beats: list }] };
        return commitEpisodeScript(w2, episode_id, { ...epScript, scenes }, true);
      });
    },
  });

  push({
    name: 'novel_script_reorder_scenes',
    senderLabel: '重排场序',
    description: '按 scene_ids 顺序重排本集各场。',
    parameters: {
      type: 'object',
      properties: {
        episode_id: { type: 'string' },
        scene_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['episode_id', 'scene_ids'],
    },
    handler: async (args) => {
      const episode_id = String((args as { episode_id?: string }).episode_id ?? '').trim();
      const ids = (args as { scene_ids?: string[] }).scene_ids;
      if (!Array.isArray(ids) || ids.length === 0) return err('scene_ids 不能为空');
      return applyMutation((ws) => {
        const { ws: w2, epScript } = ensureEpisodeScriptShell(ws, episode_id);
        const map = new Map(epScript.scenes.map((s) => [s.id, s]));
        const ordered: Scene[] = [];
        for (const id of ids) {
          const s = map.get(id);
          if (s) ordered.push(s);
        }
        if (ordered.length !== epScript.scenes.length) return err('scene_ids 须包含全部场 id');
        return commitEpisodeScript(
          w2,
          episode_id,
          { ...epScript, scenes: normalizeEpisodeScenes(ordered) },
          true
        );
      });
    },
  });

  return defs;
}
