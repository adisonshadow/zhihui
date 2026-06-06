import { formatStrudelCodeWithLineNumbers } from '../utils/applyStrudelPatch';

const MAX_CHARS = 8000;

/** 拼装音乐工作台 projectPrompt（注入当前编辑器与 CPS）。 */
export function buildMusicProjectPrompt(parts: {
  code: string;
  cps: number;
  isPlayingHint?: string | null;
}): string {
  const { code, cps } = parts;
  const truncated = code.length > MAX_CHARS;
  const slice = truncated ? code.slice(0, MAX_CHARS) : code;
  const numbered = formatStrudelCodeWithLineNumbers(slice);

  let s = `【音乐工作台上下文】
当前 CPS（宿主会在未写 setcps 时前置）：${cps}
编辑器 Strudel 代码（带行号，供 music_patch_pattern 的 start_line/end_line）：
${numbered}
`;

  if (truncated) {
    s += '\n正文过长时已截断；若需重写整段请告知用户可先精简或分页修改。\n';
  }

  s += `
【宿主自动化流程】
1. 修改已有代码时**优先** \`music_patch_pattern\`（局部替换），仅从零创作或大范围重构时用 \`music_set_pattern\` 或 \`\`\`strudel\` 整段。
2. 工具执行后会**立即 evaluate**；失败时系统会把错误发回，小范围语法错误请继续用 patch 修正。

【工具（按优先级）】
1. \`music_patch_pattern\`：old_text+new_text 或 start_line/end_line+new_text（局部，首选）
2. \`music_set_pattern\`：整段 code（大幅重写）
3. 回复中的 \`\`\`strudel\` 围栏：未调用工具时的整段写入（会自动播放）
`.trimEnd();

  if (parts.isPlayingHint) {
    s += `\n【状态】${parts.isPlayingHint}\n`;
  }

  return s;
}
