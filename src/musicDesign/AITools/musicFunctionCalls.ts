import type { FunctionCallDef } from '@/components/AIChat/utils/functionRegistry';
import { applyStrudelPatch } from '../utils/applyStrudelPatch';

export interface MusicFunctionCallHandlers {
  getCurrentCode: () => string;
  onPatternSet: (code: string, autoPlay: boolean) => void | Promise<void>;
}

/**
 * 音乐页专用工具：整段写入 + 局部 patch。
 */
export function buildMusicFunctionCalls(h: MusicFunctionCallHandlers): FunctionCallDef[] {
  return [
    {
      name: 'music_patch_pattern',
      description:
        '【优先于整段重写】在编辑器当前 Strudel 代码上做局部修改。语法纠错、改一行/一段参数、替换单个 pattern 片段时务必用本工具，避免 music_set_pattern 整段重写。支持两种方式二选一：① old_text + new_text（old_text 须在编辑器中唯一匹配，含空格与引号）；② start_line + end_line（1 起算，闭区间）+ new_text 替换该行段。默认 auto_play=true 立即验证。',
      parameters: {
        type: 'object',
        properties: {
          old_text: {
            type: 'string',
            description: '要被替换的原文片段（须与编辑器内容完全一致；多处出现时需加长上下文或设 replace_all）',
          },
          new_text: {
            type: 'string',
            description: '替换后的新片段（search 模式）或插入的多行内容（lines 模式）',
          },
          start_line: {
            type: 'integer',
            description: '按行替换：起始行号（从 1 开始，含）',
          },
          end_line: {
            type: 'integer',
            description: '按行替换：结束行号（含）',
          },
          replace_all: {
            type: 'boolean',
            description: 'search 模式：old_text 多次出现时是否全部替换（默认 false，仅允许唯一匹配）',
          },
          auto_play: {
            type: 'boolean',
            description: 'patch 后是否立即 evaluate（默认 true）',
          },
        },
        required: ['new_text'],
      },
      scope: { type: 'agent', agentKey: 'music' },
      handler: async (args: {
        old_text?: string;
        new_text: string;
        start_line?: number;
        end_line?: number;
        replace_all?: boolean;
        auto_play?: boolean;
      }) => {
        const newText = typeof args.new_text === 'string' ? args.new_text : '';
        const autoPlay = args.auto_play !== false;
        const source = h.getCurrentCode();

        const hasLines =
          typeof args.start_line === 'number' &&
          typeof args.end_line === 'number' &&
          Number.isFinite(args.start_line) &&
          Number.isFinite(args.end_line);

        const result = hasLines
          ? applyStrudelPatch(source, {
              mode: 'lines',
              startLine: args.start_line!,
              endLine: args.end_line!,
              newText,
            })
          : applyStrudelPatch(source, {
              mode: 'search',
              oldText: args.old_text ?? '',
              newText,
              replaceAll: args.replace_all,
            });

        if (!result.ok) return { ok: false as const, error: result.error };
        await Promise.resolve(h.onPatternSet(result.code, autoPlay));
        return { ok: true as const, message: result.message };
      },
      senderLabel: '局部修改',
    },
    {
      name: 'music_set_pattern',
      description:
        '整段替换编辑器中的 Strudel 代码并默认立即播放。仅用于从零创作、大幅重构或局部 patch 无法表达的全局变更；小改语法/单行请用 music_patch_pattern。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '写入编辑器的完整 Strudel 代码' },
          auto_play: {
            type: 'boolean',
            description: '写入后是否立即 evaluate 播放（默认 true）',
          },
        },
        required: ['code'],
      },
      scope: { type: 'agent', agentKey: 'music' },
      handler: async (args: { code: string; auto_play?: boolean }) => {
        const code = typeof args.code === 'string' ? args.code : '';
        const autoPlay = args.auto_play !== false;
        if (!code.trim()) return { ok: false as const, error: 'code 不能为空' };
        await Promise.resolve(h.onPatternSet(code, autoPlay));
        return {
          ok: true as const,
          message: autoPlay ? '已整段写入并将自动播放验证' : '已整段写入（未播放）',
        };
      },
      senderLabel: '整段写入',
    },
  ];
}
