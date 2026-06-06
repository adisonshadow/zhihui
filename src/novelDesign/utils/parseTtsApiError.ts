/** 解析 AI 服务 / Python TTS 返回的 error 字段（可能被 JSON 嵌套） */
export function parseTtsApiError(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  let s = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const j = JSON.parse(s) as { error?: unknown; message?: unknown };
      if (typeof j.error === 'string' && j.error.trim()) {
        s = j.error.trim();
        continue;
      }
      if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
      break;
    } catch {
      break;
    }
  }
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}
