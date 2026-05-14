/**
 * 小说编写工作台专用 Function Call（extraFunctionCalls）
 */
import type { Dispatch, SetStateAction } from 'react';
import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  deleteEpisode,
  deleteEpisodes,
  findBodyEpisodeByEpisodeNumber,
  getBodyEpisodesSorted,
  mergeEpisodesContent,
  reorderEpisodeByBodyIndex,
  renameWorkspaceTitle,
  setActiveEpisode,
  splitEpisodeAtMarker,
  updateEpisodeMarkdown,
  upsertEpisode,
  type NovelEpisode,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import { formatNovelEpisodeNavLabel, stripNumericEpisodeTitlePrefix } from '@/novelDesign/utils/novelEpisodeDisplay';

export interface NovelEditorFunctionCallDeps {
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  setSnapshot: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  novelId: string;
  requestDeleteEpisodeConfirm: (episodeId: string, title: string) => Promise<boolean>;
  requestDeleteEpisodesConfirm: (
    items: Array<{ episodeId: string; episode: number; title: string }>
  ) => Promise<boolean>;
}

function ok(extra: Record<string, unknown>) {
  return { ok: true as const, ...extra };
}

function err(message: string, extra?: Record<string, unknown>) {
  return { ok: false as const, error: message, ...(extra ?? {}) };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanEpisodeTitleCandidate(raw: string): string {
  const t = stripNumericEpisodeTitlePrefix(raw)
    .replace(/^#{1,6}\s*/, '')
    .replace(/^第\s*(?:\d+|[一二三四五六七八九十两〇零]+)\s*[集章话]\s*$/u, '')
    .replace(/^第\s*(?:\d+|[一二三四五六七八九十两〇零]+)\s*[集章话]\s*[：:、.\-—]\s*/u, '')
    .replace(/^["'“”‘’「」《》]+|["'“”‘’「」《》]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^(正文|章节|分集|剧集)$/u.test(t)) return '';
  return t.slice(0, 48);
}

function inferEpisodeTitleFromMarkdown(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    const plain = line.replace(/^#{1,6}\s*/, '').trim();
    const episodeQuoted = plain.match(
      /第\s*(?:\d+|[一二三四五六七八九十两〇零]+)\s*[集章话][^《「“"']{0,12}[《「“"']([^》」”"']{1,48})[》」”"']/u
    );
    if (episodeQuoted?.[1]) {
      const title = cleanEpisodeTitleCandidate(episodeQuoted[1]);
      if (title) return title;
    }

    const quoted = plain.match(/^[《「“"']([^》」”"']{1,48})[》」”"']/u);
    if (quoted?.[1]) {
      const title = cleanEpisodeTitleCandidate(quoted[1]);
      if (title) return title;
    }

    const title = cleanEpisodeTitleCandidate(plain);
    if (title) return title;
  }
  return '';
}

function looksLikeConfirmationOnly(content: string): boolean {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return true;
  const tooShort = text.length < 220;
  const hasMetaCue =
    /已(?:写入|重写|创建|完成)|我来写|我现在|我将|需要继续写|这一集/.test(text) &&
    /第\s*(?:\d+|[一二三四五六七八九十两〇零]+)\s*[集章话]/.test(text);
  return tooShort && hasMetaCue;
}

function isDefaultEpisodeTitle(ep: NovelEpisode): boolean {
  const title = ep.title.trim();
  if (!title) return true;
  if (ep.episode != null && title === `第${ep.episode}集`) return true;
  return /^第\s*(?:\d+|[一二三四五六七八九十两〇零]+)\s*集$/u.test(title);
}

function updateBodyEpisodeMarkdownWithTitle(
  ws: NovelWorkspaceSnapshot,
  ep: NovelEpisode,
  contentMarkdown: string,
  titleInput?: string
): { snapshot: NovelWorkspaceSnapshot; episode: NovelEpisode } {
  const next = updateEpisodeMarkdown(ws, ep.id, contentMarkdown, true);
  const explicitTitle = cleanEpisodeTitleCandidate(titleInput ?? '');
  const inferredTitle = explicitTitle || (isDefaultEpisodeTitle(ep) ? inferEpisodeTitleFromMarkdown(contentMarkdown) : '');
  if (!inferredTitle) {
    return { snapshot: next, episode: next.episodes.find((e) => e.id === ep.id) ?? ep };
  }
  const renamed = upsertEpisode(next, { id: ep.id, title: inferredTitle });
  return { snapshot: renamed.snapshot, episode: renamed.episode };
}

function getWriteEpisodeExtras(ep: NovelEpisode, contentMarkdown: string): Record<string, unknown> {
  return {
    episode_id: ep.id,
    episode: ep.id === NOVEL_OUTLINE_EPISODE_ID ? null : (ep.episode ?? null),
    title_in_editor: ep.title,
    nav_label: formatNovelEpisodeNavLabel(ep),
    content_length: contentMarkdown.length,
    created_time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    summary: '正文已写入编辑器，聊天区不展示全文。',
  };
}

function sameTrimmedTitle(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? '').replace(/\s+/g, ' ').trim();
  const y = (b ?? '').replace(/\s+/g, ' ').trim();
  return !!x && x === y;
}

export function buildNovelEditorFunctionCalls(deps: NovelEditorFunctionCallDeps): FunctionCallDef[] {
  const commonScope = { type: 'agent' as const, agentKey: 'novel' };

  const applyMutation = (
    updater: (
      ws: NovelWorkspaceSnapshot
    ) =>
      | NovelWorkspaceSnapshot
      | null
      | { snapshot: NovelWorkspaceSnapshot; extras?: Record<string, unknown> }
      | Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const ws = deps.getSnapshot();
    if (!ws) return Promise.resolve(err('工作区未就绪'));
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

  return [
    {
      name: 'novel_list_episodes',
      senderLabel: '列出章节',
      description:
        '列出故事大纲与各正文集：每项含 id、episode（正文集序号≥1）、title（编辑器内标题）、nav_label（侧栏「n、标题」）。',
      parameters: { type: 'object', properties: {}, required: [] },
      scope: commonScope,
      handler: async () => {
        const ws = deps.getSnapshot();
        if (!ws) return err('工作区未就绪');
        const list = [...ws.episodes]
          .sort((a, b) => a.order - b.order)
          .map((e) => ({
            id: e.id,
            title: e.title,
            /** 侧栏与对模型说明用：「n、标题」；编辑器内仅 title */
            nav_label: formatNovelEpisodeNavLabel(e),
            episode: e.id === NOVEL_OUTLINE_EPISODE_ID ? null : (e.episode ?? null),
            order: e.order,
            is_outline: e.id === NOVEL_OUTLINE_EPISODE_ID,
            content_length: e.contentMarkdown.length,
          }));
        return ok({ episodes: list });
      },
    },
    {
      name: 'novel_create_episode_and_open',
      senderLabel: '新建集并打开',
      description:
        '创建一集空正文并立即激活（切换到编辑器）。创建后请直接在下一段输出 novel-body-json 写入正文，禁止再次调用任何工具。title 填**编辑器内标题**（不要加「1、」前缀；侧栏会自动显示为「n、标题」）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '纯标题，如「开往下一个据点」' },
        },
        required: ['title'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { title?: string };
        return applyMutation((ws) => {
          const { snapshot, episode } = upsertEpisode(ws, {
            title: a.title,
            contentMarkdown: '',
          });
          const activated = setActiveEpisode(snapshot, episode.id);
          return {
            snapshot: activated,
            extras: {
              episode_id: episode.id,
              episode: episode.episode,
              title_in_editor: episode.title,
              nav_label: formatNovelEpisodeNavLabel(episode),
              summary: `已创建第${episode.episode}集「${episode.title}」并已切换到该集编辑器。`,
            },
          };
        });
      },
    },
    {
      name: 'novel_get_episode',
      senderLabel: '读取正文',
      description:
        '读取指定 episode_id：返回 episode 序号、title_in_editor（编辑器可见标题）、nav_label、content_markdown。',
      parameters: {
        type: 'object',
        properties: { episode_id: { type: 'string', description: '集的 id' } },
        required: ['episode_id'],
      },
      scope: commonScope,
      handler: async (args) => {
        const episode_id = String((args as { episode_id?: string }).episode_id ?? '');
        const ws = deps.getSnapshot();
        if (!ws) return err('工作区未就绪');
        const ep = ws.episodes.find((e) => e.id === episode_id);
        if (!ep) return err('找不到该集');
        return ok({
          episode_id,
          episode: ep.id === NOVEL_OUTLINE_EPISODE_ID ? null : (ep.episode ?? null),
          title_in_editor: ep.title,
          nav_label: formatNovelEpisodeNavLabel(ep),
          content_markdown: ep.contentMarkdown,
        });
      },
    },
    {
      name: 'novel_body_episode_exists',
      senderLabel: '查第N集',
      description:
        '查询是否存在第 n 集正文（不含故事大纲）；n 为正整数。客户端以 episode 字段编号，与侧栏「n、标题」一致。',
      parameters: {
        type: 'object',
        properties: { n: { type: 'integer', minimum: 1, description: '集序号，从 1 开始' } },
        required: ['n'],
      },
      scope: commonScope,
      handler: async (args) => {
        const n = Math.floor(Number((args as { n?: unknown }).n ?? 0));
        const ws = deps.getSnapshot();
        if (!ws) return err('工作区未就绪');
        if (!Number.isFinite(n) || n < 1) return err('n 须为大于 0 的整数');
        const ep = findBodyEpisodeByEpisodeNumber(ws, n);
        if (!ep)
          return ok({ exists: false, n, episode_id: null as string | null, title_in_editor: null as string | null });
        return ok({
          exists: true,
          n,
          episode_id: ep.id,
          title_in_editor: ep.title,
          nav_label: formatNovelEpisodeNavLabel(ep),
        });
      },
    },
    {
      name: 'novel_open_body_episode',
      senderLabel: '打开第N集',
      description:
        '切换到第 n 集并激活中间编辑器；用户看到的是纯标题（不含「n、」前缀）。n 为正文集序号。',
      parameters: {
        type: 'object',
        properties: { n: { type: 'integer', minimum: 1 } },
        required: ['n'],
      },
      scope: commonScope,
      handler: async (args) => {
        return applyMutation((ws) => {
          const n = Math.floor(Number((args as { n?: unknown }).n ?? 0));
          if (!Number.isFinite(n) || n < 1) return err('n 须为大于 0 的整数');
          const ep = findBodyEpisodeByEpisodeNumber(ws, n);
          if (!ep) return err(`不存在第 ${n} 集`);
          return setActiveEpisode(ws, ep.id);
        });
      },
    },
    {
      name: 'novel_write_body_episode',
      senderLabel: '写第N集',
      description:
        '按集序号 n 写入 Markdown（等同 novel_write_episode，但用序号寻址）。写完整分集时请传 title（纯标题，如「包子铺的最后一天」）；不可用其改故事大纲。',
      parameters: {
        type: 'object',
        properties: {
          n: { type: 'integer', minimum: 1 },
          content: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'] },
          title: { type: 'string', description: '可选，正文集纯标题，不要带「1、」前缀' },
        },
        required: ['n', 'content', 'mode'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { n?: unknown; content?: string; mode?: string; title?: string };
        const n = Math.floor(Number(a.n ?? 0));
        return applyMutation((ws) => {
          if (!Number.isFinite(n) || n < 1) return err('n 须为大于 0 的整数');
          const existing = findBodyEpisodeByEpisodeNumber(ws, n);
          let ensuredWs = ws;
          let ep = existing;
          if (!ep) {
            const lastN = getBodyEpisodesSorted(ws).reduce((max, item) => Math.max(max, item.episode ?? 0), 0);
            if (n !== lastN + 1) {
              return err(`当前只到第 ${lastN} 集，不能跳过中间集直接创建第 ${n} 集`);
            }
            const created = upsertEpisode(ws, { title: a.title || `第${n}集` });
            ensuredWs = created.snapshot;
            ep = created.episode;
          }
          const text = String(a.content ?? '');
          if (looksLikeConfirmationOnly(text)) {
            return err('content 看起来是确认说明而非正文，请写入实际小说正文内容');
          }
          const mode = a.mode === 'append' ? 'append' : 'replace';
          const merged =
            mode === 'append' ? `${ep.contentMarkdown.trimEnd()}\n\n${text}`.trim() : text;
          const result = updateBodyEpisodeMarkdownWithTitle(ensuredWs, ep, merged, a.title);
          const emptyDuplicates = getBodyEpisodesSorted(result.snapshot)
            .filter((item) => item.id !== result.episode.id)
            .filter((item) => !item.contentMarkdown.trim())
            .filter((item) => sameTrimmedTitle(item.title, result.episode.title));
          const deduped =
            emptyDuplicates.length > 0 ?
              deleteEpisodes(result.snapshot, emptyDuplicates.map((item) => item.id)) ?? result.snapshot
            : result.snapshot;
          return { snapshot: deduped, extras: getWriteEpisodeExtras(result.episode, merged) };
        });
      },
    },
    {
      name: 'novel_create_episode',
      senderLabel: '新建集',
      description:
        '新建一集正文。title 填**编辑器内标题**（不要加「1、」前缀；侧栏会自动显示为「n、标题」）。可选 insert_after_id 表示插在该正文集之后。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '纯标题，如「包子铺的秘密」' },
          initial_content: { type: 'string' },
          insert_after_id: { type: 'string' },
        },
        required: [],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { title?: string; initial_content?: string; insert_after_id?: string };
        return applyMutation((ws) => {
          const { snapshot, episode } = upsertEpisode(ws, {
            title: a.title,
            contentMarkdown: a.initial_content ?? '',
          });
          let next = snapshot;
          const afterId = a.insert_after_id?.trim();
          if (afterId) {
            const body = snapshot.episodes
              .filter((e) => e.id !== NOVEL_OUTLINE_EPISODE_ID && e.id !== episode.id)
              .sort((x, y) => x.order - y.order);
            const j = body.findIndex((e) => e.id === afterId);
            if (j >= 0) {
              const target = j + 2;
              next = reorderEpisodeByBodyIndex(next, episode.id, target) ?? next;
            }
          }
          return { snapshot: next, extras: { new_episode_id: episode.id, title: episode.title } };
        });
      },
    },
    {
      name: 'novel_rename_episode',
      senderLabel: '重命名集',
      description:
        '按 episode_id 修改**正文集**在编辑器内的标题（不要加「n、」前缀）。**故事大纲**不可改名。',
      parameters: {
        type: 'object',
        properties: { episode_id: { type: 'string' }, new_title: { type: 'string' } },
        required: ['episode_id', 'new_title'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; new_title?: string };
        const id = String(a.episode_id ?? '').trim();
        if (id === NOVEL_OUTLINE_EPISODE_ID) return err('故事大纲不可改名');
        const nextTitle = stripNumericEpisodeTitlePrefix(String(a.new_title ?? '')).trim();
        if (!nextTitle) return err('标题不能为空');
        return applyMutation((ws) => upsertEpisode(ws, { id, title: nextTitle }).snapshot);
      },
    },
    {
      name: 'novel_reorder_episode',
      senderLabel: '调整顺序',
      description:
        '移动正文集到大纲之后的第 new_body_position 位（1=第一篇正文，不包含「故事大纲」本身）。大纲不可挪动。',
      parameters: {
        type: 'object',
        properties: {
          episode_id: { type: 'string' },
          new_body_position: { type: 'integer', minimum: 1 },
        },
        required: ['episode_id', 'new_body_position'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; new_body_position?: number };
        return applyMutation(
          (ws) => reorderEpisodeByBodyIndex(ws, a.episode_id!, Math.floor(a.new_body_position ?? 1)) ?? ws
        );
      },
    },
    {
      name: 'novel_delete_episode',
      senderLabel: '删除集',
      description: '删除一集（需用户界面确认）；不可删除「故事大纲」。',
      parameters: {
        type: 'object',
        properties: { episode_id: { type: 'string' } },
        required: ['episode_id'],
      },
      scope: commonScope,
      handler: async (args) => {
        const episode_id = String((args as { episode_id?: string }).episode_id ?? '');
        const ws = deps.getSnapshot();
        if (!ws) return err('工作区未就绪');
        if (episode_id === NOVEL_OUTLINE_EPISODE_ID) return err('禁止删除故事大纲');
        const ep = ws.episodes.find((e) => e.id === episode_id);
        if (!ep) return err('找不到该集');
        const okDel = await deps.requestDeleteEpisodeConfirm(episode_id, formatNovelEpisodeNavLabel(ep));
        if (!okDel) return err('用户取消了删除');
        const next = deleteEpisode(ws, episode_id);
        if (!next) return err('删除失败');
        deps.setSnapshot(next);
        return ok({});
      },
    },
    {
      name: 'novel_delete_body_episode_range',
      senderLabel: '删除集范围',
      description:
        '按正文集序号批量删除一段连续集（只弹一次用户确认）。适合“删除第9集及后面所有集”“删除第9集到第30集”。不可删除「故事大纲」。',
      parameters: {
        type: 'object',
        properties: {
          start_n: { type: 'integer', minimum: 1, description: '起始正文集序号，从 1 开始' },
          end_n: {
            type: 'integer',
            minimum: 1,
            description: '结束正文集序号；若 to_end=true 可省略，默认删除到最后一集',
          },
          to_end: {
            type: 'boolean',
            description: '是否从 start_n 删除到当前最后一集；用户说“及后面/之后/后续所有集”时设为 true',
          },
        },
        required: ['start_n'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { start_n?: unknown; end_n?: unknown; to_end?: boolean };
        const startN = Math.floor(Number(a.start_n ?? 0));
        const ws = deps.getSnapshot();
        if (!ws) return err('工作区未就绪');
        if (!Number.isFinite(startN) || startN < 1) return err('start_n 须为大于 0 的整数');

        const body = getBodyEpisodesSorted(ws);
        const lastN = body.reduce((max, ep) => Math.max(max, ep.episode ?? 0), 0);
        const endN =
          a.to_end === true || a.end_n == null ? lastN : Math.floor(Number(a.end_n));
        if (!Number.isFinite(endN) || endN < 1) return err('end_n 须为大于 0 的整数');
        if (endN < startN) return err('end_n 不能小于 start_n');

        const targets = body.filter((ep) => {
          const n = ep.episode ?? 0;
          return n >= startN && n <= endN;
        });
        if (targets.length === 0) return err(`第 ${startN} 集到第 ${endN} 集范围内没有可删除正文集`);

        const items = targets.map((ep) => ({
          episodeId: ep.id,
          episode: ep.episode ?? 0,
          title: formatNovelEpisodeNavLabel(ep),
        }));
        const okDel = await deps.requestDeleteEpisodesConfirm(items);
        if (!okDel) return err('用户取消了删除');

        const next = deleteEpisodes(ws, targets.map((ep) => ep.id));
        if (!next) return err('删除失败');
        deps.setSnapshot(next);
        return ok({
          deleted_count: targets.length,
          start_episode: targets[0]?.episode ?? startN,
          end_episode: targets[targets.length - 1]?.episode ?? endN,
          episodes: items.map((item) => ({
            episode: item.episode,
            nav_label: item.title,
            id: item.episodeId,
          })),
        });
      },
    },
    {
      name: 'novel_split_episode',
      senderLabel: '拆分集',
      description:
        '在正文中首个出现的 split_marker 处拆分为两集，marker 保留在上一段末尾；下游需非空拆分体。',
      parameters: {
        type: 'object',
        properties: {
          episode_id: { type: 'string' },
          split_marker: { type: 'string' },
          new_episode_title: { type: 'string' },
        },
        required: ['episode_id', 'split_marker', 'new_episode_title'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; split_marker?: string; new_episode_title?: string };
        return applyMutation((ws) => {
          const r = splitEpisodeAtMarker(ws, a.episode_id!, a.split_marker!, a.new_episode_title!);
          if (!r) return err('未找到拆分点或拆分后无下文');
          return { snapshot: r.snapshot, extras: { new_episode_id: r.newEpisodeId } };
        });
      },
    },
    {
      name: 'novel_merge_episodes',
      senderLabel: '合并集',
      description: '将 episode_id_merge 的正文合并进 episode_id_keep，并移除被合并的那一集。',
      parameters: {
        type: 'object',
        properties: {
          episode_id_keep: { type: 'string' },
          episode_id_merge: { type: 'string' },
          separator: { type: 'string', description: '合并分隔 Markdown，默认双换行' },
        },
        required: ['episode_id_keep', 'episode_id_merge'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id_keep?: string; episode_id_merge?: string; separator?: string };
        const sep =
          typeof a.separator === 'string' && a.separator.length ?
            String(a.separator).replace(/\\n/g, '\n')
          : '\n\n';
        return applyMutation(
          (ws) => mergeEpisodesContent(ws, a.episode_id_keep!, a.episode_id_merge!, sep) ?? err('合并失败')
        );
      },
    },
    {
      name: 'novel_replace_content',
      senderLabel: '替换片段',
      description:
        '在指定集中替换 search → replacement；先精确匹配，失败则尝试仅空白折叠后匹配。**mode=all 仅对精确匹配的子串有效**。',
      parameters: {
        type: 'object',
        properties: {
          episode_id: { type: 'string' },
          search: { type: 'string' },
          replacement: { type: 'string' },
          mode: { type: 'string', enum: ['first', 'all'] },
        },
        required: ['episode_id', 'search', 'replacement'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; search?: string; replacement?: string; mode?: string };
        return applyMutation((ws) => {
          const ep = ws.episodes.find((e) => e.id === a.episode_id);
          if (!ep) return err('找不到该集');
          const search = String(a.search ?? '');
          const repl = String(a.replacement ?? '');
          const mode = a.mode === 'all' ? 'all' : 'first';
          let md = ep.contentMarkdown;
          let replacements = 0;

          const applyExactFirst = (): boolean => {
            if (!search.length) return false;
            if (mode === 'all') {
              if (!md.includes(search)) return false;
              replacements = md.split(search).length - 1;
              md = md.split(search).join(repl);
              return true;
            }
            const ix = md.indexOf(search);
            if (ix < 0) return false;
            md = md.slice(0, ix) + repl + md.slice(ix + search.length);
            replacements = 1;
            return true;
          };

          if (!applyExactFirst()) {
            if (mode === 'all') return err('未找到精确匹配的子串，无法在全文中替换');

            const words = search.trim().split(/\s+/).filter(Boolean);
            if (!words.length) return err('search 不能为空');
            const rx = new RegExp(words.map(escapeRegExp).join('\\s+'));
            const m = rx.exec(md);
            if (!m || m.index === undefined) return err('未匹配到片段，请用 novel_get_episode 校对原文');
            replacements = 1;
            md = md.slice(0, m.index) + repl + md.slice(m.index + m[0].length);
          }

          let next = updateEpisodeMarkdown(ws, ep.id, md, true);
          return { snapshot: next, extras: { replacements } };
        });
      },
    },
    {
      name: 'novel_delete_segment',
      senderLabel: '删除片段',
      description: '在指定集中删除首个匹配 search 的片段（精确匹配失败后用语词空白折叠正则）。',
      parameters: {
        type: 'object',
        properties: {
          episode_id: { type: 'string' },
          search: { type: 'string' },
        },
        required: ['episode_id', 'search'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; search?: string };
        return applyMutation((ws) => {
          const ep = ws.episodes.find((e) => e.id === a.episode_id);
          if (!ep) return err('找不到该集');
          let md = ep.contentMarkdown;
          const search = String(a.search ?? '');
          let removed = false;
          if (search.length) {
            const ix = md.indexOf(search);
            if (ix >= 0) {
              md = md.slice(0, ix) + md.slice(ix + search.length);
              removed = true;
            } else {
              const words = search.trim().split(/\s+/).filter(Boolean);
              if (words.length) {
                const rx = new RegExp(words.map(escapeRegExp).join('\\s+'));
                const m = rx.exec(md);
                if (m && m.index !== undefined) {
                  md = md.slice(0, m.index) + md.slice(m.index + m[0].length);
                  removed = true;
                }
              }
            }
          }
          if (!removed) return err('未找到匹配片段');
          const next = updateEpisodeMarkdown(ws, ep.id, md, true);
          return next;
        });
      },
    },
    {
      name: 'novel_write_episode',
      senderLabel: '写入正文',
      description:
        '直接向某集写入 Markdown：mode=replace 覆盖正文，append 在原正文后追加。写完整分集时可传 title（纯标题）。**与流式续写互不冲突时请优先用文字输出。**',
      parameters: {
        type: 'object',
        properties: {
          episode_id: { type: 'string' },
          content: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'] },
          title: { type: 'string', description: '可选，正文集纯标题，不要带序号前缀' },
        },
        required: ['episode_id', 'content', 'mode'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { episode_id?: string; content?: string; mode?: string; title?: string };
        return applyMutation((ws) => {
          const ep = ws.episodes.find((e) => e.id === a.episode_id);
          if (!ep) return err('找不到该集');
          if (ep.id === NOVEL_OUTLINE_EPISODE_ID) {
            const text = String(a.content ?? '');
            const mode = a.mode === 'append' ? 'append' : 'replace';
            const merged =
              mode === 'append' ? `${ep.contentMarkdown.trimEnd()}\n\n${text}`.trim() : text;
            const next = updateEpisodeMarkdown(ws, ep.id, merged, true);
            const nextEp = next.episodes.find((e) => e.id === ep.id) ?? ep;
            return { snapshot: next, extras: getWriteEpisodeExtras(nextEp, merged) };
          }
          const text = String(a.content ?? '');
          if (looksLikeConfirmationOnly(text)) {
            return err('content 看起来是确认说明而非正文，请写入实际小说正文内容');
          }
          const mode = a.mode === 'append' ? 'append' : 'replace';
          const merged =
            mode === 'append' ? `${ep.contentMarkdown.trimEnd()}\n\n${text}`.trim() : text;
          const result = updateBodyEpisodeMarkdownWithTitle(ws, ep, merged, a.title);
          return { snapshot: result.snapshot, extras: getWriteEpisodeExtras(result.episode, merged) };
        });
      },
    },
    {
      name: 'novel_update_outline',
      senderLabel: '更新大纲',
      description:
        '更新置顶「故事大纲」页 Markdown；replace 覆盖全文，append 在末尾追加（双换行分隔）。story_outline episode id：__story_outline__。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'] },
        },
        required: ['content', 'mode'],
      },
      scope: commonScope,
      handler: async (args) => {
        const a = args as { content?: string; mode?: string };
        return applyMutation((ws) => {
          const outline = ws.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
          if (!outline) return err('缺少故事大纲');
          const mode = a.mode === 'append' ? 'append' : 'replace';
          const merged =
            mode === 'append' ?
              `${outline.contentMarkdown.trimEnd()}\n\n${String(a.content ?? '').trim()}`.trim()
            : String(a.content ?? '');
          const next = updateEpisodeMarkdown(ws, NOVEL_OUTLINE_EPISODE_ID, merged, true);
          return next;
        });
      },
    },
    {
      name: 'novel_rename_novel',
      senderLabel: '改书名',
      description: '修改当前小说工作台标题（及小说列表条目展示名）。',
      parameters: {
        type: 'object',
        properties: { new_title: { type: 'string' } },
        required: ['new_title'],
      },
      scope: commonScope,
      handler: async (args) =>
        applyMutation((ws) => {
          const t = String((args as { new_title?: string }).new_title ?? '').trim().slice(0, 120);
          if (!t) return err('书名不能为空');
          let nextWs = renameWorkspaceTitle(ws, t);
          const list = loadNovelList();
          const item = list.find((x) => x.id === deps.novelId);
          const nowIso = () => new Date().toISOString();
          upsertNovel(
            item ?
              { ...item, title: t, updatedAt: nowIso() }
            : {
                id: deps.novelId,
                title: t,
                genres: [],
                updatedAt: nowIso(),
                createdAt: nowIso(),
              }
          );
          return nextWs;
        }),
    },
  ];
}
