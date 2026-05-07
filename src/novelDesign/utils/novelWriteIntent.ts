/** 判断是否应把本轮助手答复同步到正文编辑区 */

import {
  NOVEL_OUTLINE_EPISODE_ID,
  findBodyEpisodeByEpisodeNumber,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';

const WRITE_INTENT_RE =
  /写|撰写|生成|润色|扩写|续写|接着|下文|重写|改写|新增|增加|新建|新开|加一集|再来一集|正文|对白|大纲|章节|剧集|开场|伏笔|桥段|段落/;

/** 新开一集：仅识别意图；创建动作必须由 AI tool function 或用户手工操作发起 */
const NEW_EPISODE_RE =
  /新开[^\n]{0,6}集|新建[^\n]{0,6}集|新增[^\n]{0,6}集|增加[^\n]{0,6}集|加[^\n]{0,4}集|再来[^\n]{0,4}集|新增[^\n]{0,6}(分集|剧集|章|话)/;

const APPEND_RE = /续写|接着写|接下|接续|下文|追加|后面|紧随其后/;

const REPLACE_RE = /重写|改写|替换|全文|整章|重写本|换掉|换一种写法/;

const CN_UNIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 将「一」～「九十九」量级的集序号汉字解析为数字；失败返回 null */
function chineseOrdinalToNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t === '十') return 10;
  const m10 = t.match(/^十([一二三四五六七八九])$/);
  if (m10) return 10 + (CN_UNIT[m10[1]!] ?? 0);
  const m = t.match(/^([一二三四五六七八九])十([一二三四五六七八九]?)$/);
  if (m) {
    const tens = CN_UNIT[m[1]!] ?? 0;
    const ones = m[2] ? (CN_UNIT[m[2]!] ?? 0) : 0;
    return tens * 10 + ones;
  }
  if (t.length === 1 && CN_UNIT[t] != null && CN_UNIT[t]! > 0 && CN_UNIT[t]! < 10) return CN_UNIT[t]!;
  return null;
}

/** 从用户句子里解析「第 N 集」序号（阿拉伯或中文），没有则 null */
export function parseEpisodeOrdinalFromUserText(userText: string): number | null {
  const t = userText.trim();
  const d = t.match(/第\s*(\d{1,3})\s*集/);
  if (d) return parseInt(d[1]!, 10);
  const c = t.match(/第\s*([一二三四五六七八九十两〇零]+)\s*集/);
  if (c) return chineseOrdinalToNumber(c[1]!);
  return null;
}

export function hasNovelBodyWriteIntent(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  return WRITE_INTENT_RE.test(t);
}

export function shouldCreateEpisodeFromUserPrompt(userText: string): boolean {
  return NEW_EPISODE_RE.test(userText.trim());
}

function isBodyEpisodeDirected(userText: string): boolean {
  const t = userText.trim();
  if (shouldCreateEpisodeFromUserPrompt(t)) return true;
  if (parseEpisodeOrdinalFromUserText(t) != null) return true;
  if (/第一集|第二集|第三集|首集|第\s*\d{1,3}\s*集|第\s*[一二三四五六七八九十两]+\s*集/.test(t)) return true;
  if (/(?:写|生成|扩写|续写|润色|重写).{0,8}(?:正文|章节|分集|话)/.test(t)) return true;
  return false;
}

/** 用户句意明显在改「故事大纲」页（非某一集正文） */
function isOutlineStreamingDirected(userText: string): boolean {
  const t = userText.trim();
  if (/故事大纲/.test(t)) return true;
  if (/(?:^|[\s，。])大纲(?:$|[\s，。:：])/.test(t)) return true;
  if (/(?:重写|改写|补充|扩充|更新|润色|续写|撰写|写).{0,14}大纲/.test(t)) return true;
  if (/大纲.{0,14}(?:重写|改写|补充|扩充|更新|润色|续写|写)/.test(t)) return true;
  return false;
}

/** 写入策略：追加或覆盖当前集正文 */
export function inferNovelBodyWriteMode(userText: string): 'append' | 'replace' {
  const t = userText.trim();
  if (APPEND_RE.test(t) && !REPLACE_RE.test(t)) return 'append';
  if (REPLACE_RE.test(t)) return 'replace';
  if (/续写|接着|接下|下文/.test(t)) return 'append';
  return 'replace';
}

function sortedBodyEpisodes(workspace: NovelWorkspaceSnapshot) {
  return workspace.episodes
    .filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID)
    .sort((a, b) => a.order - b.order);
}

/**
 * 流式正文写入应落在哪一集：永远不要把「写正文」流写进故事大纲页。
 * 这里只解析已存在目标；不存在的集必须由 AI 自己调用 novel_create_episode 创建。
 */
export function resolveNovelStreamWriteTarget(
  userText: string,
  workspace: NovelWorkspaceSnapshot
): { snapshot: NovelWorkspaceSnapshot; targetEpisodeId: string | null } {
  const bodies = sortedBodyEpisodes(workspace);

  const ord = parseEpisodeOrdinalFromUserText(userText);
  if (ord != null && ord >= 1) {
    const existing = findBodyEpisodeByEpisodeNumber(workspace, ord);
    if (existing) return { snapshot: workspace, targetEpisodeId: existing.id };
    return { snapshot: workspace, targetEpisodeId: null };
  }

  if (shouldCreateEpisodeFromUserPrompt(userText)) {
    return { snapshot: workspace, targetEpisodeId: null };
  }

  if (
    workspace.activeEpisodeId === NOVEL_OUTLINE_EPISODE_ID &&
    isOutlineStreamingDirected(userText) &&
    !isBodyEpisodeDirected(userText)
  ) {
    return { snapshot: workspace, targetEpisodeId: NOVEL_OUTLINE_EPISODE_ID };
  }

  const active = workspace.activeEpisodeId;
  const activeIsBody = bodies.some((e) => e.id === active);
  if (activeIsBody) {
    return { snapshot: workspace, targetEpisodeId: active };
  }

  if (/首集|开篇|第一集|第\s*1\s*集/i.test(userText) && bodies[0]) {
    return { snapshot: workspace, targetEpisodeId: bodies[0].id };
  }

  if (bodies.length === 1) {
    return { snapshot: workspace, targetEpisodeId: bodies[0]!.id };
  }

  if (bodies.length === 0) {
    return { snapshot: workspace, targetEpisodeId: null };
  }

  return { snapshot: workspace, targetEpisodeId: bodies[0]!.id };
}
