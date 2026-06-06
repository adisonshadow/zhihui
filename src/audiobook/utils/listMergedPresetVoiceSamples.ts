/**
 * 合并扫描内置 PresetVoice/ 与外置目录，按相对路径排序
 */
export type DirAudioRow = { relativePath: string; absolutePath: string };

const LOCALE_SORT = 'zh-Hans-CN';

export async function listMergedPresetVoiceSamples(
  rootDirs: string[],
): Promise<{ ok: true; files: DirAudioRow[] } | { ok: false; error: string }> {
  const api = window.yiman?.fs?.listAudiobookVoiceSamples;
  if (!api) {
    return { ok: false, error: '当前环境无法扫描本地目录（请使用桌面版）' };
  }

  const trimmed = rootDirs.map((d) => d.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return { ok: true, files: [] };
  }

  const byRel = new Map<string, DirAudioRow>();
  let firstError: string | undefined;

  for (const root of trimmed) {
    const res = await api(root);
    if (!res.ok) {
      firstError = firstError ?? res.error ?? '读取目录失败';
      continue;
    }
    for (const f of res.files) {
      const key = f.relativePath.trim().replace(/\\/g, '/');
      if (!key) continue;
      if (!byRel.has(key)) {
        byRel.set(key, { relativePath: key, absolutePath: f.absolutePath });
      }
    }
  }

  if (byRel.size === 0 && firstError) {
    return { ok: false, error: firstError };
  }

  const files = [...byRel.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, LOCALE_SORT),
  );
  return { ok: true, files };
}
