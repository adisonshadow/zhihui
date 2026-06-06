export type StrudelPatchArgs =
  | { mode: 'search'; oldText: string; newText: string; replaceAll?: boolean }
  | { mode: 'lines'; startLine: number; endLine: number; newText: string };

export type StrudelPatchResult =
  | { ok: true; code: string; message: string }
  | { ok: false; error: string };

/**
 * 在 Strudel 源码上做局部替换（search/replace 或按行号区间）。
 */
export function applyStrudelPatch(source: string, args: StrudelPatchArgs): StrudelPatchResult {
  if (args.mode === 'lines') {
    return patchByLineRange(source, args.startLine, args.endLine, args.newText);
  }
  return patchBySearch(source, args.oldText, args.newText, args.replaceAll ?? false);
}

function patchByLineRange(
  source: string,
  startLine: number,
  endLine: number,
  newText: string,
): StrudelPatchResult {
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) {
    return { ok: false, error: '行号无效：start_line 须 ≥1 且 end_line ≥ start_line' };
  }
  const lines = source.split('\n');
  if (startLine > lines.length) {
    return { ok: false, error: `start_line=${startLine} 超出当前行数 ${lines.length}` };
  }
  const end = Math.min(endLine, lines.length);
  const head = lines.slice(0, startLine - 1);
  const tail = lines.slice(end);
  const inserted = newText.replace(/\r\n/g, '\n').split('\n');
  const code = [...head, ...inserted, ...tail].join('\n');
  return {
    ok: true,
    code,
    message: `已替换第 ${startLine}–${end} 行（共 ${end - startLine + 1} 行）`,
  };
}

function patchBySearch(
  source: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
): StrudelPatchResult {
  const needle = oldText.replace(/\r\n/g, '\n');
  if (!needle) return { ok: false, error: 'old_text 不能为空' };

  const haystack = source.replace(/\r\n/g, '\n');
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }

  if (count === 0) {
    return {
      ok: false,
      error: '未在编辑器中找到 old_text，请核对是否与当前代码完全一致（含空格与引号）',
    };
  }
  if (count > 1 && !replaceAll) {
    return {
      ok: false,
      error: `old_text 在代码中出现 ${count} 次，请加长上下文使匹配唯一，或设 replace_all=true`,
    };
  }

  const code = replaceAll ? haystack.split(needle).join(newText) : haystack.replace(needle, newText);
  return {
    ok: true,
    code,
    message: replaceAll ? `已替换全部 ${count} 处匹配` : '已局部替换 1 处匹配',
  };
}

/** projectPrompt 用：带行号的代码块，便于 AI 调用 start_line/end_line */
export function formatStrudelCodeWithLineNumbers(code: string): string {
  return code
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')}| ${line}`)
    .join('\n');
}
