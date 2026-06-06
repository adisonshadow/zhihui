/**
 * 有声书正文片段 TTS：内存 + 桌面端磁盘缓存（刷新页面后从磁盘恢复）
 */
import type { AudiobookEpisode, AudioSegment } from '@/constants/Audiobook';
import { segmentHasPlayableText } from '@/audiobook/utils/audiobookModel';
import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';
import { isLocalAudiobookTtsModelKey } from '@/audiobook/utils/audiobookTtsModelOptions';
import { pickReferenceRelPathForSegment } from '@/audiobook/utils/audiobookSegmentReference';
import type { AIModelConfig } from '@/types/settings';
import type { Script } from '@/constants/Script';
import { mimoAssistTextForVoiceOverCacheKey } from '@/audiobook/utils/audiobookMimoAssist';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';

type CacheEntry = { objectUrl: string; blob?: Blob };

/** data: URL → Blob（避免 fetch(blob:) 触发 CSP connect-src） */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('无效的 data URL');
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'audio/wav';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const store = new Map<string, CacheEntry>();

async function sha256HexUtf8(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function cacheKeyToWavFileName(cacheKey: string): Promise<string> {
  const h = await sha256HexUtf8(cacheKey);
  return `${h}.wav`;
}

async function blobToRawBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function ttsDiskApi():
  | {
      saveWav: (novelId: string, fileName: string, base64: string) => Promise<
        { ok: true; path: string } | { ok: false; error: string }
      >;
      resolvePath: (novelId: string, fileName: string) => Promise<string | null>;
    }
  | undefined {
  return window.yiman?.audiobookTtsCache;
}

async function persistEntryToDisk(novelId: string, cacheKey: string, blob: Blob): Promise<void> {
  const disk = ttsDiskApi();
  if (!disk?.saveWav) return;
  const nid = novelId.trim();
  if (!nid) return;
  const fn = await cacheKeyToWavFileName(cacheKey);
  const b64 = await blobToRawBase64(blob);
  const res = await disk.saveWav(nid, fn, b64);
  if (!res.ok) {
    console.warn('[audiobookTtsCache] 磁盘写入失败', res.error);
  }
}

async function loadEntryUrlFromDisk(novelId: string, cacheKey: string): Promise<string | null> {
  const disk = ttsDiskApi();
  const fs = window.yiman?.fs;
  if (!disk?.resolvePath || !fs?.readFileAsDataUrl) return null;
  const nid = novelId.trim();
  if (!nid) return null;
  const fn = await cacheKeyToWavFileName(cacheKey);
  const fullPath = await disk.resolvePath(nid, fn);
  if (!fullPath) return null;
  return fs.readFileAsDataUrl(fullPath);
}

export function buildAudiobookTtsCacheKey(params: {
  episodeId: string;
  segmentIndex: number;
  segment: AudioSegment;
  outline?: AudiobookOutlineVoiceSamples;
  modelKey: string;
  speed: number;
  /**
   * 小米 MiMo 等：与实际请求 assistant 完全一致（含自动音频标签）。
   * 省略时仍为 segment 原文。
   */
  assistTextResolved?: string;
  /** 本地 TTS：剥除 `[…]` / `（）` / 风格指令后的请求正文（与合成一致） */
  localPlainText?: string;
}): string | null {
  const { episodeId, segmentIndex, segment, outline, modelKey, speed, assistTextResolved, localPlainText } =
    params;
  if (!segmentHasPlayableText(segment)) return null;
  const text =
    localPlainText?.trim() ||
    assistTextResolved?.trim() ||
    ('text' in segment ? segment.text.trim() : '');
  if (!text) return null;
  const refRel = pickReferenceRelPathForSegment(segment, outline) ?? '';
  return [episodeId, String(segmentIndex), modelKey, String(speed), refRel, text].join('\x1e');
}

export function audiobookTtsCacheGet(key: string): string | undefined {
  return store.get(key)?.objectUrl;
}

/** 获取 TTS 缓存的原始 Blob */
export function audiobookTtsCacheGetBlob(key: string): Blob | undefined {
  return store.get(key)?.blob;
}

export async function audiobookTtsCacheSet(
  key: string,
  blob: Blob,
  novelId?: string,
): Promise<string> {
  const prev = store.get(key);
  if (prev) {
    try {
      if (prev.objectUrl.startsWith('blob:')) URL.revokeObjectURL(prev.objectUrl);
    } catch {
      /* ignore */
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  store.set(key, { objectUrl, blob });
  if (novelId?.trim()) {
    await persistEntryToDisk(novelId.trim(), key, blob);
  }
  return objectUrl;
}

/** 将磁盘上已存在的 WAV 注入内存（供刷新页面后恢复 UI） */
export function audiobookTtsCachePrimeFromDataUrl(key: string, dataUrl: string, blob?: Blob): void {
  const prev = store.get(key);
  if (prev) {
    try {
      if (prev.objectUrl.startsWith('blob:')) URL.revokeObjectURL(prev.objectUrl);
    } catch {
      /* ignore */
    }
  }
  const resolvedBlob = blob ?? (dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : undefined);
  store.set(key, { objectUrl: dataUrl, blob: resolvedBlob });
}

export function audiobookTtsCacheHas(key: string): boolean {
  return store.has(key);
}

export function audiobookTtsCacheRevokeKey(key: string): void {
  const prev = store.get(key);
  if (!prev) return;
  try {
    if (prev.objectUrl.startsWith('blob:')) URL.revokeObjectURL(prev.objectUrl);
  } catch {
    /* ignore */
  }
  store.delete(key);
}

/** 清除某集某下标片段的全部内存 TTS 缓存（文本/模型/参考音变更后；磁盘旧 key 因含原文不会命中） */
export function audiobookTtsCacheRevokeForSegment(episodeId: string, segmentIndex: number): void {
  const id = episodeId.trim();
  if (!id) return;
  const prefix = `${id}\x1e${segmentIndex}\x1e`;
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) audiobookTtsCacheRevokeKey(key);
  }
}

/** 清除某集全部片段的内存 TTS 缓存（整集重新生成前） */
export function audiobookTtsCacheRevokeForEpisode(episodeId: string): void {
  const id = episodeId.trim();
  if (!id) return;
  const prefix = `${id}\x1e`;
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) audiobookTtsCacheRevokeKey(key);
  }
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function localPlainTextForSegment(modelKey: string, segment: AudioSegment): string | undefined {
  if (!isLocalAudiobookTtsModelKey(modelKey) || !('text' in segment)) return undefined;
  const plain = stripAudiobookTextForLocalTts(segment.text.trim());
  return plain || undefined;
}

/** 刷新后按多种 modelKey / 大纲组合尝试命中磁盘缓存 */
export async function hydrateAudiobookTtsCacheFromDisk(params: {
  novelId: string;
  episode: AudiobookEpisode;
  outline?: AudiobookOutlineVoiceSamples;
  modelKeyForIndex: (index: number) => string;
  /** 额外尝试的 modelKey（如设置里全部本地/云端选项） */
  extraModelKeys?: string[];
  aiModels?: AIModelConfig[];
  novelScript?: Script | null;
  speed?: number;
}): Promise<void> {
  const {
    novelId,
    episode,
    outline,
    modelKeyForIndex,
    extraModelKeys = [],
    aiModels = [],
    novelScript,
    speed = 1,
  } = params;
  if (!ttsDiskApi()?.resolvePath) return;

  const refRel = (seg: AudioSegment, o?: AudiobookOutlineVoiceSamples) =>
    pickReferenceRelPathForSegment(seg, o) ?? '';

  for (let i = 0; i < episode.segments.length; i += 1) {
    const seg = episode.segments[i]!;
    const sessionMk = modelKeyForIndex(i);
    const sessionAssist = mimoAssistTextForVoiceOverCacheKey({
      modelKey: sessionMk,
      aiModels,
      segment: seg,
      outline,
      novelScript,
    });

    const sessionKey = buildAudiobookTtsCacheKey({
      episodeId: episode.id,
      segmentIndex: i,
      segment: seg,
      outline,
      modelKey: sessionMk,
      speed,
      assistTextResolved: sessionAssist,
      localPlainText: localPlainTextForSegment(sessionMk, seg),
    });
    if (sessionKey && store.has(sessionKey)) continue;

    const refCurrent = refRel(seg, outline);
    const modelCandidates = uniqueStrings([sessionMk, ...extraModelKeys]);
    const outlineVariants: (AudiobookOutlineVoiceSamples | undefined)[] = [outline];
    if (refCurrent) outlineVariants.push(undefined);

    let loadedUrl: string | null = null;
    let loadedDiskKey: string | null = null;

    for (const mk of modelCandidates) {
      for (const ov of outlineVariants) {
        const diskAssist = mimoAssistTextForVoiceOverCacheKey({
          modelKey: mk,
          aiModels,
          segment: seg,
          outline: ov,
          novelScript,
        });

        const diskKey = buildAudiobookTtsCacheKey({
          episodeId: episode.id,
          segmentIndex: i,
          segment: seg,
          outline: ov,
          modelKey: mk,
          speed,
          assistTextResolved: diskAssist,
          localPlainText: localPlainTextForSegment(mk, seg),
        });
        if (!diskKey || (loadedDiskKey && diskKey === loadedDiskKey)) continue;
        const url = await loadEntryUrlFromDisk(novelId, diskKey);
        if (url) {
          loadedUrl = url;
          loadedDiskKey = diskKey;
          audiobookTtsCachePrimeFromDataUrl(diskKey, url);
          break;
        }
      }
      if (loadedUrl) break;
    }

    if (loadedUrl && sessionKey && sessionKey !== loadedDiskKey) {
      audiobookTtsCachePrimeFromDataUrl(sessionKey, loadedUrl);
    }
  }
}

/** 单条 key：内存未命中时尝试读盘（整集播放、懒加载） */
export async function audiobookTtsCacheLoadKeyFromDisk(
  novelId: string,
  cacheKey: string,
): Promise<string | undefined> {
  if (store.has(cacheKey)) return store.get(cacheKey)?.objectUrl;
  const url = await loadEntryUrlFromDisk(novelId, cacheKey);
  if (url) audiobookTtsCachePrimeFromDataUrl(cacheKey, url);
  return url ?? undefined;
}

/** 导出拼接用：优先内存 Blob，否则从 data URL / 磁盘解析 */
export async function audiobookTtsCacheResolveBlob(
  novelId: string,
  cacheKey: string,
): Promise<Blob | undefined> {
  const entry = store.get(cacheKey);
  if (entry?.blob) return entry.blob;

  const url = entry?.objectUrl;
  if (url?.startsWith('data:')) {
    const blob = dataUrlToBlob(url);
    store.set(cacheKey, { objectUrl: url, blob });
    return blob;
  }

  const nid = novelId.trim();
  if (!nid) return undefined;

  const diskUrl = await loadEntryUrlFromDisk(nid, cacheKey);
  if (!diskUrl) return undefined;

  const blob = dataUrlToBlob(diskUrl);
  audiobookTtsCachePrimeFromDataUrl(cacheKey, diskUrl, blob);
  return blob;
}
