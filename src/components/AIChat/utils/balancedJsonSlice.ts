/** 从起始 `{` 截取平衡 JSON 对象串（支持字符串内转义），供 parseDrawer / generate_images 正文清洗共用 */
export function findBalancedJsonSlice(
  s: string,
  startIdx: number,
): { slice: string; end: number } | null {
  if (s[startIdx] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { slice: s.slice(startIdx, i + 1), end: i };
    }
  }
  return null;
}
