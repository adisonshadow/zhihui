/**
 * 小说封面 Popover：extraFunctionCalls 注入 novel agent。
 * 出图走内置 generate_images（注册表实现）；同步候选 URL 到 ref；落盘用 novel_cover_apply_choice。
 */
import type { MutableRefObject } from 'react';
import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import { getFunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import { explicitGenerateImagesAspect } from '@/components/AIChat/tools/builtInTools/generate_images/aspectRatioForApi';
import { NOVEL_OUTLINE_EPISODE_ID, type NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { persistNovelCoverForNovel } from '@/novelDesign/utils/novelCoverProjectFiles';

const OUTLINE_MAX = 16000;
const MAX_COVER_CANDIDATES = 6;

export interface NovelCoverPopoverFcDeps {
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  novelId: string;
  coverCandidatesRef: MutableRefObject<string[]>;
  onCoverSaved: () => void;
  coverCount: number;
  /** 设置中填写的作者名；有值时强化出图提示须含「作者 xxx」 */
  coverAuthorName?: string;
}

function ok<T extends Record<string, unknown>>(x: T) {
  return { ok: true as const, ...x };
}

function err(message: string) {
  return { ok: false as const, error: message };
}

function wrapGenerateImagesForCoverPopover(
  deps: NovelCoverPopoverFcDeps,
  n: number,
): FunctionCallDef {
  const base = getFunctionCallDef('generate_images');
  if (!base) {
    throw new Error('[novelCover] 内置 generate_images 未注册，请确认应用已执行 registerGenerateImagesTool');
  }
  const coverAuthor = (deps.coverAuthorName ?? '').trim();
  const authorNote =
    coverAuthor ?
      ` 每条 prompt 还须明确要求画面上有清晰可读的文字「作者 ${coverAuthor}」，与书名版式协调；勿改写署名。`
    : '';
  const coverNote =
    `\n【封面助手】须 aspectRatio: "1:1"；prompts 须恰好 ${n} 条（与当前设置的候选张数一致，至多 ${MAX_COVER_CANDIDATES}）。${authorNote}`;

  return {
    ...base,
    scope: { type: 'agent', agentKey: 'novel' },
    description: `${base.description}${coverNote}`,
    senderLabel: '封面候选出图',
    handler: async (args: Record<string, unknown>) => {
      const prompts = Array.isArray(args.prompts)
        ? (args.prompts as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean)
        : [];
      if (prompts.length !== n) {
        return err(`封面出图须传入恰好 ${n} 条非空 prompts（当前 ${prompts.length} 条）`);
      }
      if (explicitGenerateImagesAspect(args.aspectRatio) !== '1:1') {
        return err('封面出图须显式传入 aspectRatio: "1:1"');
      }
      const out = (await base.handler(args as never)) as {
        ok?: boolean;
        images?: string[];
        errors?: string[];
        summary?: string;
        error?: string;
      };
      if (out?.ok === true && Array.isArray(out.images)) {
        deps.coverCandidatesRef.current = out.images.filter(Boolean);
      }
      return out;
    },
  };
}

export function buildNovelCoverPopoverFunctionCalls(deps: NovelCoverPopoverFcDeps): FunctionCallDef[] {
  const readOutline: FunctionCallDef = {
    name: 'novel_get_story_outline',
    description:
      '读取当前小说的「故事大纲」正文（Markdown），用于设计封面文案与画面。开始封面流程时应先调用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    scope: { type: 'agent', agentKey: 'novel' },
    senderLabel: '读大纲',
    handler: async () => {
      const ws = deps.getSnapshot();
      if (!ws) return err('工作区未就绪');
      const outline = ws.episodes.find((e) => e.id === NOVEL_OUTLINE_EPISODE_ID);
      const md = (outline?.contentMarkdown ?? '').trim();
      if (!md) return ok({ outline: '', notice: '故事大纲为空，可基于书名与已有集名构思封面。' });
      const body = md.length > OUTLINE_MAX ? `${md.slice(0, OUTLINE_MAX)}\n…（已截断）` : md;
      return ok({ outline: body });
    },
  };

  const n = Math.min(Math.max(1, deps.coverCount), MAX_COVER_CANDIDATES);
  const applyChoice: FunctionCallDef = {
    name: 'novel_cover_apply_choice',
    description: `用户已明确选定第几张封面（1–${n}）时调用：将本会话最近一次「封面候选出图」（generate_images）得到的第 N 张图写入当前小说封面。仅在用户确认后调用；不要与出图参数混用。`,
    parameters: {
      type: 'object',
      properties: {
        choice: {
          type: 'integer',
          minimum: 1,
          maximum: n,
          description: `候选序号 1–${n}，与上一轮出图张数一致`,
        },
      },
      required: ['choice'],
      additionalProperties: false,
    },
    scope: { type: 'agent', agentKey: 'novel' },
    senderLabel: '封面选定落盘',
    handler: async (args: { choice?: number }) => {
      const cRaw = args.choice;
      if (typeof cRaw !== 'number' || !Number.isFinite(cRaw)) {
        return err('须传入整数 choice');
      }
      const c = Math.floor(cRaw);
      if (c < 1 || c > n) return err(`choice 须在 1–${n}`);
      const urls = deps.coverCandidatesRef.current;
      const url = urls[c - 1];
      if (!url) {
        return err(`尚未有可用候选图或所选序号无图，请先调用 generate_images 完成 ${n} 张 1:1 出图`);
      }
      const list = loadNovelList();
      const item = list.find((x) => x.id === deps.novelId);
      if (!item) return err('小说列表中找不到该作品');
      const now = new Date().toISOString();
      const saved = await persistNovelCoverForNovel(deps.novelId, url);
      const next: NovelWorkspaceItem = { ...item, coverDataUrl: saved.coverDataUrl, updatedAt: now };
      upsertNovel(next);
      deps.onCoverSaved();
      deps.coverCandidatesRef.current = [];
      const diskHint =
        saved.savedToProjectDir && saved.projectCoverPath ?
          `已保存到项目目录：${saved.projectCoverPath}`
        : '已缓存封面（未配置项目目录时无法写入项目文件夹，请从「创建小说项目」选择存储路径）';
      return ok({ applied: true, choice: c, message: diskHint });
    },
  };

  const generateForCover = wrapGenerateImagesForCoverPopover(deps, n);

  return [readOutline, generateForCover, applyChoice];
}
