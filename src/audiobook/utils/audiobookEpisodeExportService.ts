/**
 * 有声书整集导出：确保缓存 → 拼接 WAV → 写入项目 audioBookFiles
 */
import { SegmentType, type AudioSegment, type AudiobookEpisode, type InnerVoiceSegment } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import type { AudiobookSettings } from '@/types/settings';
import type { AIModelConfig, AISettings } from '@/types/settings';
import { segmentHasPlayableText } from '@/audiobook/utils/audiobookModel';
import { episodeAudiobookHasContent } from '@/audiobook/utils/audiobookModel';
import {
  audiobookEpisodeExportWavBlob,
  concatAudiobookEpisodeBuffers,
  saveAudiobookWavToPath,
  audiobookExportWavFileName,
  revealAudiobookExportInFolder,
} from '@/audiobook/utils/audiobookEpisodeAudioExport';
import {
  buildAudiobookTtsCacheKey,
  audiobookTtsCacheHas,
  audiobookTtsCacheResolveBlob,
  hydrateAudiobookTtsCacheFromDisk,
} from '@/audiobook/utils/audiobookSegmentTtsCache';
import { synthesizeAudiobookSegmentToCache } from '@/audiobook/utils/audiobookSynthesizeSegmentToCache';
import {
  anyAudiobookTtsModelReady,
  audiobookTtsModelKeysForHydrate,
  isAudiobookTtsModelReady,
  isLocalAudiobookTtsModelKey,
  resolveSegmentTtsModelKey,
} from '@/audiobook/utils/audiobookTtsModelOptions';
import { loadSegmentTtsModelKeys } from '@/audiobook/utils/audiobookSegmentTtsModelStorage';
import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';
import { mimoAssistTextForVoiceOverCacheKey } from '@/audiobook/utils/audiobookMimoAssist';
import { resolveAudiobookExportDir } from '@/audiobook/utils/audiobookProjectDir';
import { formatNovelEpisodeNavLabel } from '@/novelDesign/utils/novelEpisodeDisplay';
import {
  NOVEL_OUTLINE_EPISODE_ID,
  getBodyEpisodesSorted,
  type NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import type { NovelEpisode } from '@/novelDesign/storage/novelWorkspaceStorage';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';

export type AudiobookEpisodeExportDeps = {
  novelId: string;
  config: AISettings | null | undefined;
  models: AIModelConfig[];
  outlineVoice?: AudiobookOutlineVoiceSamples;
  novelScript?: Script | null;
  audiobookSettings?: AudiobookSettings;
  onWarning?: (msg: string) => void;
};

function buildCacheKey(
  deps: AudiobookEpisodeExportDeps,
  episode: AudiobookEpisode,
  segmentIndex: number,
  segment: AudioSegment,
  modelKey: string,
): string | null {
  const raw = segmentHasPlayableText(segment) && 'text' in segment ? segment.text.trim() : '';
  const localPlainText =
    isLocalAudiobookTtsModelKey(modelKey) && raw ? stripAudiobookTextForLocalTts(raw) : undefined;
  return buildAudiobookTtsCacheKey({
    episodeId: episode.id,
    segmentIndex,
    segment,
    outline: deps.outlineVoice,
    modelKey,
    speed: 1,
    assistTextResolved: mimoAssistTextForVoiceOverCacheKey({
      modelKey,
      aiModels: deps.models,
      segment,
      outline: deps.outlineVoice,
      novelScript: deps.novelScript,
    }),
    localPlainText,
  });
}

function modelKeyForSegment(
  deps: AudiobookEpisodeExportDeps,
  segmentIndex: number,
  segmentKeys: Record<number, string>,
): string {
  return resolveSegmentTtsModelKey(segmentIndex, segmentKeys, deps.config);
}

/** 优先磁盘/内存缓存，缺失时才合成 */
export async function ensureAudiobookEpisodeSegmentsForExport(
  deps: AudiobookEpisodeExportDeps,
  episode: AudiobookEpisode,
  segmentKeys: Record<string, string>,
): Promise<void> {
  const { novelId, config } = deps;
  if (!anyAudiobookTtsModelReady(config)) {
    throw new Error('请先在设置中配置 TTS 模型');
  }

  await hydrateAudiobookTtsCacheFromDisk({
    novelId,
    episode,
    outline: deps.outlineVoice,
    modelKeyForIndex: (i) => modelKeyForSegment(deps, i, segmentKeys),
    extraModelKeys: audiobookTtsModelKeysForHydrate(config),
    aiModels: deps.models,
    novelScript: deps.novelScript,
  });

  const segments = episode.segments;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (!segmentHasPlayableText(seg)) continue;
    if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) continue;

    const mk = modelKeyForSegment(deps, i, segmentKeys);
    if (!isAudiobookTtsModelReady(mk, config)) {
      throw new Error(`第 ${i + 1} 段所选 TTS 模型未就绪，请检查设置`);
    }

    const key = buildCacheKey(deps, episode, i, seg, mk);
    if (key && audiobookTtsCacheHas(key)) continue;

    const url = await synthesizeAudiobookSegmentToCache({
      novelId,
      episode,
      segmentIndex: i,
      modelKey: mk,
      force: false,
      config: deps.config,
      models: deps.models,
      outlineVoice: deps.outlineVoice,
      novelScript: deps.novelScript,
      audiobookSettings: deps.audiobookSettings,
      onWarning: deps.onWarning,
    });
    if (!url) {
      await synthesizeAudiobookSegmentToCache({
        novelId,
        episode,
        segmentIndex: i,
        modelKey: mk,
        force: true,
        config: deps.config,
        models: deps.models,
        outlineVoice: deps.outlineVoice,
        novelScript: deps.novelScript,
        audiobookSettings: deps.audiobookSettings,
        onWarning: deps.onWarning,
      });
    }
  }
}

/** 对 InnerVoice 片段应用内心独白音效 */
async function applyMonologueEffectToBlob(blob: Blob): Promise<Blob> {
  try {
    // Blob → base64 → 保存临时文件 → ffmpeg 处理 → 读回 Blob
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(',')[1];

    // 使用 fs IPC 保存临时文件
    const tmpDir = '/tmp'; // macOS/Linux
    const tmpPath = `${tmpDir}/yiman_mono_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
    await window.yiman?.fs?.writeBase64File(tmpPath, base64);

    // 应用音效
    const result = await window.yiman?.innerMonologue?.apply(tmpPath);
    if (!result?.ok || !result.outputPath) {
      try { await window.yiman?.fs?.removePathRecursive(tmpPath); } catch { /* ignore */ }
      return blob; // fallback 到原声
    }

    // 读回处理后的文件
    const processedDataUrl = await window.yiman?.fs?.readFileAsDataUrl(result.outputPath);
    // 清理临时文件
    try { await window.yiman?.fs?.removePathRecursive(tmpPath); } catch { /* ignore */ }
    try { await window.yiman?.fs?.removePathRecursive(result.outputPath); } catch { /* ignore */ }

    if (!processedDataUrl) return blob;
    const res = await fetch(processedDataUrl);
    return res.blob();
  } catch {
    return blob;
  }
}

export async function buildAudiobookEpisodeWavBlob(
  deps: AudiobookEpisodeExportDeps,
  episode: AudiobookEpisode,
  segmentKeys: Record<string, string>,
  innerMonologueEnabled?: boolean,
): Promise<Blob> {
  await ensureAudiobookEpisodeSegmentsForExport(deps, episode, segmentKeys);
  const nid = deps.novelId.trim();

  const buffer = await concatAudiobookEpisodeBuffers({
    segments: episode.segments,
    getSegmentBlob: async (index) => {
      const seg = episode.segments[index];
      if (!seg) return undefined;
      const mk = modelKeyForSegment(deps, index, segmentKeys);
      const key = buildCacheKey(deps, episode, index, seg, mk);
      if (!key) return undefined;
      const blob = await audiobookTtsCacheResolveBlob(nid, key);
      if (!blob) return undefined;
      // innerVoice 片段 + 内心独白启用 → 应用音效
      if (innerMonologueEnabled && seg.type === SegmentType.InnerVoice) {
        return applyMonologueEffectToBlob(blob);
      }
      return blob;
    },
  });
  return audiobookEpisodeExportWavBlob(buffer);
}

export type SaveAudiobookEpisodeWavResult = {
  saved: boolean;
  filePath: string;
  fileName: string;
};

/** 写入项目 audioBookFiles（不弹保存对话框）；保存后由调用方 reveal 选中文件 */
export async function saveAudiobookEpisodeWav(
  blob: Blob,
  novelEpisode: NovelEpisode,
  workspace: NovelWorkspaceSnapshot,
  listItem?: NovelWorkspaceItem | null,
): Promise<SaveAudiobookEpisodeWavResult> {
  if (!window.yiman?.fs?.pathJoin || !window.yiman.fs.writeBase64File) {
    throw new Error('请在桌面客户端中使用「下载为音频文件」');
  }

  const fileName = audiobookExportWavFileName(novelEpisode);
  const exportDir = await resolveAudiobookExportDir(workspace, listItem);
  if (!exportDir) {
    throw new Error(
      '未找到小说项目目录。请从「小说编剧」创建项目时选择存储路径，或在工作区配置 projectDir。',
    );
  }

  const fullPath = await window.yiman.fs.pathJoin(exportDir, fileName);
  await saveAudiobookWavToPath(blob, fullPath);
  return { saved: true, filePath: fullPath, fileName };
}

/** 保存单集 WAV 到 audioBookFiles 并在 Finder/资源管理器中选中该文件 */
export async function saveAudiobookEpisodeWavAndReveal(
  blob: Blob,
  novelEpisode: NovelEpisode,
  workspace: NovelWorkspaceSnapshot,
  listItem?: NovelWorkspaceItem | null,
): Promise<SaveAudiobookEpisodeWavResult> {
  const res = await saveAudiobookEpisodeWav(blob, novelEpisode, workspace, listItem);
  revealAudiobookExportInFolder(res.filePath);
  return res;
}

export type ExportAllAudiobookEpisodesResult = {
  exported: number;
  skipped: number;
  paths: string[];
  errors: Array<{ episodeLabel: string; message: string }>;
};

/** 导出工作区全部正文集（每集一个 WAV，跳过故事大纲与空集） */
export async function exportAllAudiobookEpisodes(
  workspace: NovelWorkspaceSnapshot,
  deps: AudiobookEpisodeExportDeps,
  listItem?: NovelWorkspaceItem | null,
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<ExportAllAudiobookEpisodesResult> {
  const exportDir = await resolveAudiobookExportDir(workspace, listItem);
  if (!exportDir) {
    throw new Error('未找到小说项目目录。请从「小说编剧」创建项目时选择存储路径，或确认已关联项目目录。');
  }

  const targets = getBodyEpisodesSorted(workspace).filter(
    (ep) => ep.id !== NOVEL_OUTLINE_EPISODE_ID && episodeAudiobookHasContent(ep.episodeAudiobook),
  );

  const bodyCount = getBodyEpisodesSorted(workspace).filter(
    (e) => e.id !== NOVEL_OUTLINE_EPISODE_ID,
  ).length;

  const result: ExportAllAudiobookEpisodesResult = {
    exported: 0,
    skipped: bodyCount - targets.length,
    paths: [],
    errors: [],
  };

  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const ep = targets[i]!;
    const ab = ep.episodeAudiobook!;
    const label = formatNovelEpisodeNavLabel(ep);
    onProgress?.(i + 1, total, label);

    const segmentKeys = await loadSegmentTtsModelKeys(deps.novelId, ep.id);
    try {
      const blob = await buildAudiobookEpisodeWavBlob(deps, { ...ab, id: ep.id }, segmentKeys, workspace.innerMonologueEnabled);
      const fileName = audiobookExportWavFileName(ep);
      const fullPath = await window.yiman!.fs.pathJoin(exportDir, fileName);
      const ok = await saveAudiobookWavToPath(blob, fullPath);
      if (ok) {
        result.exported += 1;
        result.paths.push(fullPath);
      } else {
        result.errors.push({ episodeLabel: label, message: '写入文件失败' });
      }
    } catch (e) {
      result.errors.push({
        episodeLabel: label,
        message: e instanceof Error ? e.message : '导出失败',
      });
    }
  }

  return result;
}
