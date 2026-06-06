/**
 * 每集各 segment 选用的 TTS 模型 — 通过 IPC 持久化到 SQLite
 * 刷新后恢复，与磁盘缓存 key 中的 modelKey 一致
 */
import type { AISettings } from '@/types/settings';
import { resolveAudiobookTtsModelKeyForOptions, buildAudiobookTtsSelectOptions } from '@/audiobook/utils/audiobookTtsModelOptions';

/** 去掉无法对齐当前下拉的 key，并将别名规范为 options 中的 value */
export function sanitizeSegmentTtsModelKeys(
  stored: Record<number, string>,
  config: AISettings | null | undefined,
): { keys: Record<number, string>; changed: boolean } {
  // options 为空时跳过 sanitize（config 未加载/无配音模型时保留原数据不移除）
  const opts = buildAudiobookTtsSelectOptions(config);
  if (opts.length === 0) {
    if (Object.keys(stored).length > 0) {
      console.log('[TtsModel] sanitize 跳过: 无可用选项, 保留', Object.keys(stored).length, '个 key');
    }
    return { keys: { ...stored }, changed: false };
  }

  const next: Record<number, string> = {};
  let changed = false;

  for (const [k, v] of Object.entries(stored)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0) {
      changed = true;
      continue;
    }
    const resolved = resolveAudiobookTtsModelKeyForOptions(v, config);
    if (!resolved) {
      console.log('[TtsModel] sanitize 移除了模型:', { idx, key: v });
      changed = true;
      continue;
    }
    if (resolved !== v.trim()) changed = true;
    next[idx] = resolved;
  }

  if (!changed && Object.keys(next).length !== Object.keys(stored).length) {
    changed = true;
  }
  return { keys: next, changed };
}

/** 从 SQLite 读取片段 TTS 模型选择 */
export async function loadSegmentTtsModelKeys(novelId: string, episodeId: string): Promise<Record<number, string>> {
  const nid = novelId.trim();
  const eid = episodeId.trim();
  console.log('[TtsModel] loadSegmentTtsModelKeys', { nid, eid });
  if (!nid || !eid) return {};
  try {
    const api = window.yiman?.novel?.loadSegmentTtsModels;
    console.log('[TtsModel] load API 是否存在:', !!api);
    if (!api) return {};
    const raw = await api(nid, eid);
    console.log('[TtsModel] SQLite 读取原始数据:', raw);
    if (!raw || raw === '{}') {
      console.log('[TtsModel] 无数据');
      return {};
    }
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(o)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && typeof v === 'string' && v.trim()) {
        out[idx] = v.trim();
      }
    }
    console.log('[TtsModel] 解析结果:', out);
    return out;
  } catch (e) {
    console.log('[TtsModel] 读取失败:', e);
    return {};
  }
}

/** 保存片段 TTS 模型选择到 SQLite */
export async function saveSegmentTtsModelKeys(
  novelId: string,
  episodeId: string,
  keys: Record<number, string>,
): Promise<void> {
  const nid = novelId.trim();
  const eid = episodeId.trim();
  console.log('[TtsModel] saveSegmentTtsModelKeys', { nid, eid, keys });
  if (!nid || !eid) {
    console.log('[TtsModel] 跳过保存: novelId/episodeId 为空');
    return;
  }
  const compact: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && v?.trim()) compact[String(idx)] = v.trim();
  }
  const json = JSON.stringify(compact);
  console.log('[TtsModel] 写入 SQLite:', { nid, eid, json });
  try {
    const api = window.yiman?.novel?.saveSegmentTtsModels;
    console.log('[TtsModel] API 是否存在:', !!api);
    if (api) {
      await api(nid, eid, json);
      console.log('[TtsModel] SQLite 写入成功');
    } else {
      console.log('[TtsModel] API 不存在，无法保存');
    }
  } catch (e) {
    console.log('[TtsModel] SQLite 写入失败:', e);
  }
}

/** 读取并清理过期/无效 modelKey，必要时回写 */
export async function loadAndSanitizeSegmentTtsModelKeys(
  novelId: string,
  episodeId: string,
  config: AISettings | null | undefined,
): Promise<Record<number, string>> {
  const raw = await loadSegmentTtsModelKeys(novelId, episodeId);
  console.log('[TtsModel] loadAndSanitize:', { novelId, episodeId, rawKeys: Object.keys(raw).length, changed: false });
  const { keys, changed } = sanitizeSegmentTtsModelKeys(raw, config);
  if (changed) {
    console.log('[TtsModel] sanitize 有变更，保存清理后数据:', keys);
    await saveSegmentTtsModelKeys(novelId, episodeId, keys);
  }
  return keys;
}
