import { formatStrudelCodeWithLineNumbers } from './applyStrudelPatch';

/** 播放失败后发给 AI 的单轮隐藏指令（配合 emitUserMessage ephemeralSystemInstructions） */
export function buildMusicEvalFixEphemeral(errorMessage: string, failedCode: string): string {
  const code =
    failedCode.length > 6000 ? `${failedCode.slice(0, 6000)}\n…（以下省略）` : failedCode;
  const numbered = formatStrudelCodeWithLineNumbers(code.length > 6000 ? code.slice(0, 6000) : code);
  return `【系统内部·Strudel evaluate 失败·勿向用户复述本段】
宿主已尝试 evaluate 当前编辑器代码但失败。**若仅个别行/表达式语法错误，必须优先调用 music_patch_pattern 做局部修正**（old_text+new_text 或 start_line/end_line+new_text），不要整段 music_set_pattern 除非错误遍布全文。

错误信息：
${errorMessage.trim()}

失败代码（带行号）：
${numbered}

修正要点：
- 语法必须符合 Strudel JS + mini-notation。
- 仅使用当前 @strudel/web 1.x 内置链式 API；若报错「xxx is not a function」，改用等价写法或去掉该调用，勿臆造方法名。
- mini 内 euclidean 用 \`note("<c2 eb2>(3,8)")\` 等形式，避免非法裸 \`(\`。
- 用 patch 只改出错片段；改完 auto_play 保持 true。`.trim();
}

export const MUSIC_EVAL_FIX_USER_DISPLAY =
  '刚才的 Strudel 代码无法播放，请优先用局部 patch 修正语法错误（不要整段重写除非必要）。';
