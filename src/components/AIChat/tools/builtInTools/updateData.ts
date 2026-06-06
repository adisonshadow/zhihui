/**
 * 原子 Tool：更新业务数据（update_data）
 *
 * 执行最轻量的业务数据结构更新操作：修改小说封面、更新章节内容、绑定素材等。
 * 由通用 Agent 在需要落地修改时调用，不做大包业务逻辑。
 */
import type { FunctionCallDef } from '../../utils/functionRegistry';
import { registerFunctionCall } from '../../utils/functionRegistry';

async function handler(args: {
  /** 数据域：novel_cover / episode_content / etc. */
  domain: string;
  /** 操作：set / update */
  operation: string;
  /** 目标数据 ID */
  targetId: string;
  /** 要写入的数据值 */
  value: unknown;
}): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  const { domain, operation, targetId, value } = args;

  switch (domain) {
    case 'novel_cover': {
      const { loadNovelList, upsertNovel } = await import(
        '@/novelDesign/storage/novelListStorage'
      );
      const list = loadNovelList();
      const item = list.find((x) => x.id === targetId);
      if (!item) return { ok: false, error: `未找到小说 ${targetId}` };
      if (operation === 'set' && typeof value === 'string') {
        const { persistNovelCoverForNovel } = await import('@/novelDesign/utils/novelCoverProjectFiles');
        const saved = await persistNovelCoverForNovel(targetId, value);
        upsertNovel({ ...item, coverDataUrl: saved.coverDataUrl, updatedAt: new Date().toISOString() });
        const hint =
          saved.savedToProjectDir && saved.projectCoverPath ?
            `，已写入项目目录 ${saved.projectCoverPath}`
          : '';
        return { ok: true, message: `小说「${item.title}」封面已更新${hint}` };
      }
      return { ok: false, error: `novel_cover 不支持操作 ${operation}` };
    }

    case 'novel_episode': {
      const { loadNovelWorkspace, saveWorkspace } = await import(
        '@/novelDesign/storage/novelWorkspaceStorage'
      );
      const ws = loadNovelWorkspace(targetId);
      if (!ws) return { ok: false, error: `未找到小说工作区 ${targetId}` };
      if (operation === 'update') {
        const { getAISettings } = await import('@/utils/settingsStorage');
        const settings = await getAISettings();
        await saveWorkspace(ws, settings?.defaultProjectRoot);
        return { ok: true, message: '集内容已更新' };
      }
      return { ok: false, error: `novel_episode 不支持操作 ${operation}` };
    }

    default:
      return { ok: false, error: `未知数据域: ${domain}` };
  }
}

export function registerUpdateDataTool(): void {
  const def: FunctionCallDef = {
    name: 'update_data',
    description:
      '更新业务数据结构。传入 domain（数据域）、operation（操作）、targetId（目标 ID）、value（新值）。可用于更新小说封面、章节内容等。',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['novel_cover', 'novel_episode'],
          description: '数据域：novel_cover（小说封面） / novel_episode（章节内容）。',
        },
        operation: {
          type: 'string',
          enum: ['set', 'update'],
          description: '操作：set（直接设值） / update（更新）。',
        },
        targetId: {
          type: 'string',
          description: '目标数据 ID（如小说 id）。',
        },
        value: {
          description: '要写入的数据值。novel_cover 时为图片 data URL string。',
        },
      },
      required: ['domain', 'operation', 'targetId', 'value'],
      additionalProperties: false,
    },
    scope: { type: 'orchestrator' },
    handler,
  };

  registerFunctionCall(def);
}
