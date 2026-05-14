/**
 * 小说封面 Popover 专用 Function Call（仅挂载在 novel agent，extraFunctionCalls 注入）。
 */
import type { MutableRefObject } from 'react';
import type { AIModelConfig } from '@/types/settings';
import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import { NOVEL_OUTLINE_EPISODE_ID, type NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { loadNovelList, upsertNovel } from '@/novelDesign/storage/novelListStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { generateFourCoverImages } from '@/novelDesign/AITools/novelCoverImageBatch';

const OUTLINE_MAX = 16000;

export interface NovelCoverPopoverFcDeps {
  getSnapshot: () => NovelWorkspaceSnapshot | null;
  novelId: string;
  getImageModel: () => AIModelConfig | null;
  /** 最近一次「出图」结果，供 choice 落盘 */
  coverCandidatesRef: MutableRefObject<string[]>;
  onCoverSaved: () => void;
  coverCount: number;
}

function ok<T extends Record<string, unknown>>(x: T) {
  return { ok: true as const, ...x };
}

function err(message: string) {
  return { ok: false as const, error: message };
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

  const n = deps.coverCount;

  const coverMutate: FunctionCallDef = {
    name: 'novel_cover_generate_or_apply',
    description: `封面专用二合一工具：① 传入恰好 ${n} 条英文或中文出图提示词，依次调用绘图模型生成 ${n} 张候选并返回预览信息；② 用户在对话里声明选择第几张后，仅传入 choice（1–${n}）将对应图写入小说封面。`,
    parameters: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          minItems: n,
          maxItems: n,
          description: `${n} 条出图提示词，需与小说气质一致；与 choice 互斥。`,
        },
        choice: {
          type: 'integer',
          minimum: 1,
          maximum: n,
          description: `用户确认的第 N 张候选；与 prompts 互斥。`,
        },
      },
      additionalProperties: false,
    },
    scope: { type: 'agent', agentKey: 'novel' },
    senderLabel: '封面出图/落盘',
    handler: async (args: { prompts?: string[]; choice?: number }) => {
      const hasChoice = typeof args.choice === 'number' && Number.isFinite(args.choice);
      const prompts = Array.isArray(args.prompts) ? args.prompts.map((s) => String(s ?? '').trim()) : [];

      if (hasChoice) {
        const c = Math.floor(Number(args.choice));
        if (c < 1 || c > n) return err(`choice 须在 1–${n}`);
        const urls = deps.coverCandidatesRef.current;
        const url = urls[c - 1];
        if (!url) return err(`尚未生成候选图或所选序号无图，请先调用本工具传入 ${n} 条 prompts`);
        const list = loadNovelList();
        const item = list.find((x) => x.id === deps.novelId);
        if (!item) return err('小说列表中找不到该作品');
        const now = new Date().toISOString();
        const next: NovelWorkspaceItem = { ...item, coverDataUrl: url, updatedAt: now };
        upsertNovel(next);
        deps.onCoverSaved();
        deps.coverCandidatesRef.current = [];
        return ok({ applied: true, choice: c, message: '封面已更新到列表与数据库。' });
      }

      if (prompts.length !== n) return err(`生成候选时必须传入恰好 ${n} 条 prompts`);
      const model = deps.getImageModel();
      const { urls, errors } = await generateFourCoverImages(model, prompts);
      deps.coverCandidatesRef.current = urls.filter(Boolean);
      // 不要将 base64 图片数据放进 tool result，避免回传给 LLM 撑爆上下文
      // 图片通过 coverCandidatesRef 传递给 sidePanelAssistantContentRender 展示
      const candidateCount = urls.filter(Boolean).length;
      const md = `已生成 ${candidateCount} 张候选封面。请用户回复「选第 N 个」或「第 N 张」后，你再调用同一工具并只传 choice=1~${n}。`;
      return ok({
        markdownForAssistant: md,
        candidateCount,
        errors: errors.length ? errors : undefined,
      });
    },
  };

  return [readOutline, coverMutate];
}
