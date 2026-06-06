import { describe, expect, it } from 'vitest';
import {
  applyStagingFromArgs,
  createEmptyScene,
  ensurePrimaryShot,
  extractDialoguesFromDescription,
  mergeEpisodeScripts,
  normalizeDialogueInput,
  normalizeEpisodeScenes,
  parseEpisodeScriptJson,
  parseShotSoundFromArgs,
  sceneHasContent,
  serializeEpisodeScript,
  serializeNovelScript,
  tryMigrateMarkdownToEpisodeScript,
} from './novelScriptModel';

describe('novelScriptModel', () => {
  it('ensurePrimaryShot 为空场补 shots[0]', () => {
    const scene = createEmptyScene(1, '开场');
    expect(scene.shots).toHaveLength(1);
    expect(scene.shots[0]?.shotIndex).toBe(1);
    expect(scene.shots[0]?.dialogues).toEqual([]);
  });

  it('sceneHasContent 仅在有 scenes 时为 true', () => {
    expect(sceneHasContent(undefined)).toBe(false);
    expect(sceneHasContent({ id: 'e1', episodeIndex: 1, title: '集', scenes: [] })).toBe(false);
    expect(
      sceneHasContent({
        id: 'e1',
        episodeIndex: 1,
        title: '集',
        scenes: [createEmptyScene(1)],
      }),
    ).toBe(true);
  });

  it('parseEpisodeScriptJson / serializeEpisodeScript 往返', () => {
    const ep = {
      id: 'ep_1',
      episodeIndex: 2,
      title: '第二集',
      scenes: [createEmptyScene(1, '内景')],
    };
    const raw = serializeEpisodeScript(ep);
    const parsed = parseEpisodeScriptJson(raw);
    expect(parsed?.id).toBe('ep_1');
    expect(parsed?.scenes).toHaveLength(1);
    expect(parsed?.scenes[0]?.heading).toBe('内景');
    expect(parsed?.scenes[0]?.shots).toHaveLength(1);
  });

  it('serializeNovelScript 强制 episodes 为空（meta_only）', () => {
    const raw = serializeNovelScript({
      id: 'ns_1',
      title: '测试',
      genre: [],
      logline: 'log',
      style: { artStyle: '日漫', aspectRatio: '9:16' },
      targetDuration: 60,
      characters: [],
      episodes: [{ id: 'x', episodeIndex: 1, title: '不应落库', scenes: [] }],
      metadata: {
        createdBy: 't',
        createdAt: '2020',
        updatedAt: '2020',
        version: 1,
        isReviewed: false,
      },
    });
    const obj = JSON.parse(raw) as { episodes: unknown[] };
    expect(obj.episodes).toEqual([]);
  });

  it('mergeEpisodeScripts 合并场并重排 sceneIndex', () => {
    const a = {
      id: 'e1',
      episodeIndex: 1,
      title: 'A',
      scenes: [createEmptyScene(1, '场A')],
    };
    const b = {
      id: 'e2',
      episodeIndex: 2,
      title: 'B',
      scenes: [createEmptyScene(1, '场B')],
    };
    const merged = mergeEpisodeScripts(a, b)!;
    expect(merged.scenes).toHaveLength(2);
    expect(merged.scenes[0]?.heading).toBe('场A');
    expect(merged.scenes[1]?.heading).toBe('场B');
    expect(merged.scenes[0]?.sceneIndex).toBe(1);
    expect(merged.scenes[1]?.sceneIndex).toBe(2);
  });

  it('normalizeEpisodeScenes 保留已有 shot 并规范 shotIndex', () => {
    const scene = ensurePrimaryShot({
      id: 's1',
      sceneIndex: 3,
      heading: '测试',
      location: '',
      locationType: 'EXT',
      timeOfDay: '夜',
      charactersInScene: [],
      shots: [
        {
          id: 'shot_x',
          shotIndex: 9,
          shotType: 'CLOSE',
          cameraMovement: 'PAN',
          dialogues: [{ id: 'd1', characterId: 'c1', text: '你好' }],
          beats: [],
        },
      ],
    });
    const [normalized] = normalizeEpisodeScenes([scene]);
    expect(normalized?.shots[0]?.shotIndex).toBe(1);
    expect(normalized?.shots[0]?.dialogues[0]?.text).toBe('你好');
  });

  it('normalizeDialogueInput 兼容 speaker + line', () => {
    const rows = normalizeDialogueInput([
      { speaker: '林夜', line: '原来你早就知道。', tone: '颤抖' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.characterId).toBe('林夜');
    expect(rows[0]?.text).toBe('原来你早就知道。');
    expect(rows[0]?.emotion).toBe('颤抖');
  });

  it('extractDialoguesFromDescription 从画面描述行抽取对白', () => {
    const desc = [
      '角色转身看向窗外。',
      '对白 - 林夜（低声）：「我们走吧。」',
      '小美：嗯。',
    ].join('\n');
    const rows = extractDialoguesFromDescription(desc);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.text.includes('我们走吧'))).toBe(true);
    expect(rows.some((r) => r.text === '嗯。')).toBe(true);
  });

  it('applyStagingFromArgs 合并场景要素', () => {
    const scene = createEmptyScene(1);
    const next = applyStagingFromArgs(scene, {
      background: '雨夜街道',
      props: '红伞',
    });
    expect(next.staging?.background).toBe('雨夜街道');
    expect(next.staging?.props).toBe('红伞');
  });

  it('parseShotSoundFromArgs 解析环境音/BGM/音效', () => {
    const sound = parseShotSoundFromArgs({
      ambiance: '雨声',
      bgm: { track_name: '紧张弦乐' },
      sfx: [{ name: '关门', timing: 'one_shot' }],
    });
    expect(sound?.ambiance).toBe('雨声');
    expect(sound?.bgm?.trackName).toBe('紧张弦乐');
    expect(sound?.sfx).toHaveLength(1);
  });

  it('tryMigrateMarkdownToEpisodeScript 仅解析 JSON 形态', () => {
    expect(tryMigrateMarkdownToEpisodeScript('# 标题', { id: 'e1', title: '集' })).toBeUndefined();
    const json = serializeEpisodeScript({
      id: 'e1',
      episodeIndex: 1,
      title: '集',
      scenes: [createEmptyScene(1)],
    });
    const migrated = tryMigrateMarkdownToEpisodeScript(json, { id: 'e1', title: '集' });
    expect(migrated?.scenes).toHaveLength(1);
  });
});
