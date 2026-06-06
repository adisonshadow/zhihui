import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import type { Script } from '@/constants/Script';
import type { AudiobookSettings } from '@/types/settings';
import { SegmentType, type AudioSegment, type AudiobookEpisode } from '@/constants/Audiobook';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { segmentHasPlayableText } from '@/audiobook/utils/audiobookModel';
import {
  buildAudiobookEpisodeWavBlob,
  saveAudiobookEpisodeWavAndReveal,
  exportAllAudiobookEpisodes,
  type AudiobookEpisodeExportDeps,
} from '@/audiobook/utils/audiobookEpisodeExportService';
import { synthesizeAudiobookSegmentToCache } from '@/audiobook/utils/audiobookSynthesizeSegmentToCache';
import { warmLocalTtsVoiceReferencesForEpisode } from '@/novelDesign/utils/localTtsWarmVoiceReferences';
import {
  audiobookTtsCacheGet,
  audiobookTtsCacheHas,
  audiobookTtsCacheRevokeForEpisode,
  audiobookTtsCacheRevokeForSegment,
  buildAudiobookTtsCacheKey,
  hydrateAudiobookTtsCacheFromDisk,
} from '@/audiobook/utils/audiobookSegmentTtsCache';
import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';
import {
  anyAudiobookTtsModelReady,
  audiobookTtsModelKeysForHydrate,
  defaultAudiobookTtsModelKey,
  isAudiobookTtsModelReady,
  isLocalAudiobookTtsModelKey,
  resolveAudiobookTtsModelKeyForOptions,
  resolveSegmentTtsModelKey,
} from '@/audiobook/utils/audiobookTtsModelOptions';
import {
  loadAndSanitizeSegmentTtsModelKeys,
  loadSegmentTtsModelKeys,
  saveSegmentTtsModelKeys,
} from '@/audiobook/utils/audiobookSegmentTtsModelStorage';
import type {
  AudiobookOutlineVoiceSamples,
  NovelEpisode,
  NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { mimoAssistTextForVoiceOverCacheKey } from '@/audiobook/utils/audiobookMimoAssist';
import {
  getSegmentAttachedAudio,
  makeAttachedAudioKey,
} from '@/audiobook/utils/audiobookAttachedAudio';
import { resolveLocalAudioPlayUrl } from '@/novelDesign/utils/resolveLocalAudioPlayUrl';
import type { SegmentAttachedAudio } from '@/constants/Audiobook';

function delay(ms: number, shouldAbort?: () => boolean): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (shouldAbort?.()) {
        resolve();
        return;
      }
      if (Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(80, ms));
    };
    setTimeout(tick, Math.min(80, ms));
  });
}

export type EpisodePlaybackPhase = 'idle' | 'playing' | 'paused';

/** 整集播放模式：默认 / 强制重生成 TTS / 仅对白 */
export type EpisodePlayMode = 'default' | 'regenerateAll' | 'dialogueOnly';

export interface EpisodePlayOptions {
  mode?: EpisodePlayMode;
}

function episodePlayOptionsFromMode(mode: EpisodePlayMode): Required<Pick<EpisodePlayOptions, 'mode'>> {
  return { mode };
}

function shouldPlaySegmentInEpisodeLoop(seg: AudioSegment, mode: EpisodePlayMode): boolean {
  if (mode === 'dialogueOnly') return seg.type === SegmentType.Dialogue;
  return true;
}

export interface UseAudiobookPlaybackOptions {
  novelId?: string;
  /** 正文集 id（用于切换集时重置播放；勿依赖 episodeAudiobook.id 是否同步） */
  episodeId?: string;
  episode: AudiobookEpisode | undefined;
  outlineVoice?: AudiobookOutlineVoiceSamples;
  audiobookSettings?: AudiobookSettings;
  /** MiMo voicedesign/voiceclone 角色声线与路由用 */
  novelScript?: Script | null;
  /** 项目设置：内心独白音效 */
  innerMonologueEnabled?: boolean;
  /** 项目设置：空间回音 */
  spaceEchoEnabled?: boolean;
  /** 项目设置：电话中的声音 */
  telephoneEnabled?: boolean;
  /** 项目设置：闷罐 Muffler */
  mufflerEnabled?: boolean;
}

export function useAudiobookPlayback(options: UseAudiobookPlaybackOptions) {
  const { novelId, episodeId, episode, outlineVoice, audiobookSettings, novelScript, innerMonologueEnabled, spaceEchoEnabled, telephoneEnabled, mufflerEnabled } = options;
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];
  const defaultTtsModelKey = defaultAudiobookTtsModelKey(config);

  const [segmentTtsModelKeys, setSegmentTtsModelKeys] = useState<Record<number, string>>({});
  const prevDefaultTtsModelKeyRef = useRef<string | undefined>(undefined);

  const getSegmentTtsModelKey = useCallback(
    (index: number) => resolveSegmentTtsModelKey(index, segmentTtsModelKeys, config),
    [segmentTtsModelKeys, config],
  );

  const setSegmentTtsModelKey = useCallback((index: number, modelKey: string) => {
    setSegmentTtsModelKeys((prev) => {
      const next = { ...prev, [index]: modelKey };
      const nid = novelId?.trim();
      const eid = (episodeId ?? episode?.id)?.trim();
      if (nid && eid) void saveSegmentTtsModelKeys(nid, eid, next);
      return next;
    });
  }, [novelId, episodeId, episode?.id]);

  const resolvedEpisodeId = (episodeId ?? episode?.id)?.trim();

  useEffect(() => {
    console.log('[TtsModel] useEffect 触发', { novelId, resolvedEpisodeId, configKeys: Object.keys(config ?? {}).length });
    let cancelled = false;
    const load = async () => {
      const nid = novelId?.trim();
      const eid = resolvedEpisodeId;
      if (!eid) {
        console.log('[TtsModel] eid 为空, 设为空');
        if (!cancelled) setSegmentTtsModelKeys({});
        return;
      }
      console.log('[TtsModel] 开始加载', { nid, eid });
      const keys = nid ? await loadAndSanitizeSegmentTtsModelKeys(nid, eid, config) : {};
      console.log('[TtsModel] 加载完成, keys:', JSON.stringify(keys));
      if (!cancelled) setSegmentTtsModelKeys(keys);
    };
    void load();
    return () => { cancelled = true; };
  }, [novelId, resolvedEpisodeId, config]);

  /** 全局默认模型变更时，去掉与旧默认相同的 per-segment 覆盖，使片段跟新默认 */
  useEffect(() => {
    const prev = prevDefaultTtsModelKeyRef.current;
    prevDefaultTtsModelKeyRef.current = defaultTtsModelKey;
    if (prev === undefined || prev === defaultTtsModelKey) return;

    const nid = novelId?.trim();
    const eid = resolvedEpisodeId;
    setSegmentTtsModelKeys((stored) => {
      let changed = false;
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(stored)) {
        const idx = Number(k);
        if (!Number.isInteger(idx) || idx < 0) continue;
        const resolved = resolveAudiobookTtsModelKeyForOptions(v, config);
        if (v === prev || resolved === prev) {
          changed = true;
          continue;
        }
        next[idx] = v;
      }
      if (changed && nid && eid) void saveSegmentTtsModelKeys(nid, eid, next);
      return changed ? next : stored;
    });
  }, [defaultTtsModelKey, config, novelId, resolvedEpisodeId]);

  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const attachedTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [activeAttachedAudioKeys, setActiveAttachedAudioKeys] = useState<string[]>([]);
  const stopFlagRef = useRef(false);
  const resumeFromIndexRef = useRef(0);
  const episodePlayOptionsRef = useRef<EpisodePlayOptions>({ mode: 'default' });
  /** 递增以作废仍在进行的整集播放循环 */
  const playbackRunIdRef = useRef(0);
  const prevEpisodeIdRef = useRef<string | undefined>(undefined);
  const [episodePlaybackPhase, setEpisodePlaybackPhase] = useState<EpisodePlaybackPhase>('idle');
  const [playingEpisode, setPlayingEpisode] = useState(false);
  /** 「播放整集」时当前处理到的片段下标（含预延迟 / 合成等待 / 实际播放），停止或非整集播放时为 null */
  const [playingEpisodeSegmentIndex, setPlayingEpisodeSegmentIndex] = useState<number | null>(null);
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [exportingEpisode, setExportingEpisode] = useState(false);
  const [cacheEpoch, setCacheEpoch] = useState(0);

  const bumpCache = useCallback(() => setCacheEpoch((e) => e + 1), []);

  const modelKeyForIndex = useCallback((index: number) => getSegmentTtsModelKey(index), [
    getSegmentTtsModelKey,
  ]);

  useEffect(() => {
    const nid = novelId?.trim();
    const ep = episode;
    if (!nid || !ep) return;
    let cancelled = false;
    void (async () => {
      await hydrateAudiobookTtsCacheFromDisk({
        novelId: nid,
        episode: ep,
        outline: outlineVoice,
        modelKeyForIndex,
        extraModelKeys: audiobookTtsModelKeysForHydrate(config),
        aiModels: models,
        novelScript,
        speed: 1,
      });
      if (!cancelled) bumpCache();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    novelId,
    episode,
    outlineVoice,
    modelKeyForIndex,
    bumpCache,
    config,
    models,
    novelScript,
  ]);

  const registerActiveAudio = useCallback((audio: HTMLAudioElement) => {
    activeAudiosRef.current.push(audio);
  }, []);

  const unregisterActiveAudio = useCallback((audio: HTMLAudioElement) => {
    activeAudiosRef.current = activeAudiosRef.current.filter((a) => a !== audio);
  }, []);

  const clearAttachedTimers = useCallback(() => {
    for (const t of attachedTimersRef.current) clearTimeout(t);
    attachedTimersRef.current = [];
  }, []);

  const haltAudioOnly = useCallback(() => {
    clearAttachedTimers();
    for (const audio of activeAudiosRef.current) {
      try {
        audio.pause();
        audio.src = '';
      } catch {
        /* ignore */
      }
    }
    activeAudiosRef.current = [];
    setActiveAttachedAudioKeys([]);
  }, [clearAttachedTimers]);

  const resetEpisodePlayback = useCallback(() => {
    stopFlagRef.current = true;
    playbackRunIdRef.current += 1;
    haltAudioOnly();
    setEpisodePlaybackPhase('idle');
    setPlayingEpisode(false);
    setPlayingEpisodeSegmentIndex(null);
    resumeFromIndexRef.current = 0;
    episodePlayOptionsRef.current = { mode: 'default' };
  }, [haltAudioOnly]);

  /** 切换正文集时重置；首次挂载不重置，避免抹掉用户刚点的播放态 */
  useEffect(() => {
    const id = resolvedEpisodeId;
    const prev = prevEpisodeIdRef.current;
    if (prev !== undefined && prev !== id) {
      resetEpisodePlayback();
    }
    prevEpisodeIdRef.current = id;
  }, [resolvedEpisodeId, resetEpisodePlayback]);

  const stop = useCallback(() => {
    resetEpisodePlayback();
  }, [resetEpisodePlayback]);

  /** pause() 只会触发 pause 事件而不会触发 ended，必须在此结束 Promise，否则整集循环无法响应「停止」。 */
  const bindPlayToStopFlag = (
    audio: HTMLAudioElement,
    resolve: () => void,
    reject: (e: Error) => void,
    mediaErrorMessage: string,
  ) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      detach();
      resolve();
    };
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      detach();
      reject(e);
    };
    const onPauseCheck = () => {
      if (stopFlagRef.current) finish();
    };
    const detach = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.removeEventListener('pause', onPauseCheck);
    };
    audio.onended = () => finish();
    audio.onerror = () => fail(new Error(mediaErrorMessage));
    audio.addEventListener('pause', onPauseCheck);
    void audio.play().catch((e) => fail(e instanceof Error ? e : new Error('播放失败')));
  };

  const playObjectUrl = useCallback(
    async (url: string) => {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        registerActiveAudio(audio);
        bindPlayToStopFlag(
          audio,
          () => {
            unregisterActiveAudio(audio);
            resolve();
          },
          (e) => {
            unregisterActiveAudio(audio);
            reject(e);
          },
          '音频播放失败',
        );
      });
    },
    [registerActiveAudio, unregisterActiveAudio],
  );

  const playAudioSrc = useCallback(
    async (src: string) => {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(resolveLocalAudioPlayUrl(src));
        registerActiveAudio(audio);
        bindPlayToStopFlag(
          audio,
          () => {
            unregisterActiveAudio(audio);
            resolve();
          },
          (e) => {
            unregisterActiveAudio(audio);
            reject(e);
          },
          '音频加载失败',
        );
      });
    },
    [registerActiveAudio, unregisterActiveAudio],
  );

  const scheduleSegmentAttachedAudio = useCallback(
    (segmentIndex: number, items: SegmentAttachedAudio[]) => {
      for (const item of items) {
        const delayMs = Math.max(0, item.delaySec) * 1000;
        const timer = setTimeout(() => {
          if (stopFlagRef.current) return;
          const src = item.audioSrc?.trim();
          if (!src) return;

          const key = makeAttachedAudioKey(segmentIndex, item.id);
          const audio = new Audio(resolveLocalAudioPlayUrl(src));
          audio.volume = Math.min(1, Math.max(0.1, item.volume));

          const finish = () => {
            unregisterActiveAudio(audio);
            setActiveAttachedAudioKeys((prev) => prev.filter((k) => k !== key));
          };

          registerActiveAudio(audio);
          setActiveAttachedAudioKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));

          audio.onended = finish;
          audio.onerror = finish;
          void audio.play().catch(finish);
        }, delayMs);
        attachedTimersRef.current.push(timer);
      }
    },
    [registerActiveAudio, unregisterActiveAudio],
  );

  const cacheKeyForIndex = useCallback(
    (index: number): string | null => {
      const ep = episode;
      if (!ep) return null;
      const seg = ep.segments[index];
      if (!seg) return null;
      const mk = getSegmentTtsModelKey(index);
      const raw = segmentHasPlayableText(seg) && 'text' in seg ? seg.text.trim() : '';
      const localPlainText = isLocalAudiobookTtsModelKey(mk) && raw
        ? stripAudiobookTextForLocalTts(raw)
        : undefined;
      return buildAudiobookTtsCacheKey({
        episodeId: ep.id,
        segmentIndex: index,
        segment: seg,
        outline: outlineVoice,
        modelKey: mk,
        speed: 1,
        assistTextResolved: mimoAssistTextForVoiceOverCacheKey({
          modelKey: mk,
          aiModels: models,
          segment: seg,
          outline: outlineVoice,
          novelScript,
        }),
        localPlainText,
      });
    },
    [episode, outlineVoice, getSegmentTtsModelKey, models, novelScript],
  );

  const isSegmentCached = useCallback(
    (index: number): boolean => {
      const k = cacheKeyForIndex(index);
      if (!k) return false;
      void cacheEpoch;
      return audiobookTtsCacheHas(k);
    },
    [cacheEpoch, cacheKeyForIndex],
  );

  const getSegmentCacheKey = useCallback(
    (index: number): string | undefined => {
      return cacheKeyForIndex(index) ?? undefined;
    },
    [cacheKeyForIndex],
  );

  const getSegmentTtsObjectUrl = useCallback(
    (index: number): string | undefined => {
      const k = cacheKeyForIndex(index);
      if (!k) return undefined;
      void cacheEpoch;
      return audiobookTtsCacheGet(k);
    },
    [cacheEpoch, cacheKeyForIndex],
  );

  const synthesizeToCache = useCallback(
    async (index: number, force: boolean, modelKeyOverride?: string): Promise<string | null> => {
      const ep = episode;
      if (!ep) return null;
      const seg = ep.segments[index];
      if (!seg) return null;

      const modelKey = modelKeyOverride ?? getSegmentTtsModelKey(index);

      setGenerating((g) => ({ ...g, [index]: true }));
      try {
        const url = await synthesizeAudiobookSegmentToCache({
          novelId,
          episode: ep,
          segmentIndex: index,
          modelKey,
          force,
          config,
          models,
          outlineVoice,
          novelScript,
          audiobookSettings,
          onWarning: (msg) => message.warning(msg),
          onError: (msg) => message.error(msg),
        });
        if (url) {
          const nid = novelId?.trim();
          const eid = ep.id?.trim();
          if (nid && eid) {
            setSegmentTtsModelKeys((prev) => {
              const next = { ...prev, [index]: modelKey };
              void saveSegmentTtsModelKeys(nid, eid, next);
              return next;
            });
          }
          bumpCache();
        }
        return url;
      } finally {
        setGenerating((g) => ({ ...g, [index]: false }));
      }
    },
    [
      episode,
      outlineVoice,
      audiobookSettings,
      novelScript,
      getSegmentTtsModelKey,
      bumpCache,
      novelId,
      config,
      models,
      message,
    ],
  );

  const exportDeps = useMemo((): AudiobookEpisodeExportDeps | null => {
    const nid = novelId?.trim();
    if (!nid) return null;
    return {
      novelId: nid,
      config,
      models,
      outlineVoice,
      novelScript,
      audiobookSettings,
      onWarning: (msg) => message.warning(msg),
    };
  }, [novelId, config, models, outlineVoice, novelScript, audiobookSettings, message]);

  const generateSegmentAt = useCallback(
    async (index: number) => {
      const ep = episode;
      if (!ep) return;
      const seg = ep.segments[index];
      if (!seg) return;
      if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
        message.info('音效/BGM 无需生成 TTS');
        return;
      }
      const modelKey = getSegmentTtsModelKey(index);
      if (!isAudiobookTtsModelReady(modelKey, config)) {
        message.warning('当前片段所选 TTS 模型未就绪，请先在设置中完成配置');
        return;
      }
      try {
        await synthesizeToCache(index, true);
        message.success('已生成并缓存');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '生成失败');
      }
    },
    [episode, config, message, synthesizeToCache, getSegmentTtsModelKey],
  );

  /** 下拉切换 TTS 模型：保存选择并立即用新模型强制生成该段 */
  const changeSegmentTtsModelAndGenerate = useCallback(
    async (index: number, modelKey: string) => {
      const prev = getSegmentTtsModelKey(index);
      if (modelKey === prev) return;

      setSegmentTtsModelKey(index, modelKey);

      const ep = episode;
      if (!ep) return;
      const seg = ep.segments[index];
      if (!seg) return;
      if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
        return;
      }
      if (generating[index]) {
        message.info('该段正在生成配音，已保存模型选择');
        return;
      }
      if (!isAudiobookTtsModelReady(modelKey, config)) {
        message.warning('所选 TTS 模型未就绪，请先在设置中完成配置');
        return;
      }
      try {
        await synthesizeToCache(index, true, modelKey);
        message.success('已切换模型并生成配音');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '生成失败');
      }
    },
    [
      episode,
      config,
      message,
      generating,
      getSegmentTtsModelKey,
      setSegmentTtsModelKey,
      synthesizeToCache,
    ],
  );

  const playOneSegment = useCallback(
    async (seg: AudioSegment, index: number, synthMode: 'cacheOrWarn' | 'ensure' | 'forceRegenerate') => {
      if (stopFlagRef.current) return;
      if (seg.preDelayMs) await delay(seg.preDelayMs, () => stopFlagRef.current);
      if (stopFlagRef.current) return;
      if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
        if (seg.audioSrc?.trim()) await playAudioSrc(seg.audioSrc);
      } else {
        const attached = getSegmentAttachedAudio(seg);
        if (attached.length) scheduleSegmentAttachedAudio(index, attached);

        const key = cacheKeyForIndex(index);
        let url: string | null = key ? (audiobookTtsCacheGet(key) ?? null) : null;
        if (synthMode === 'forceRegenerate') {
          url = await synthesizeToCache(index, true);
        } else if (!url && synthMode === 'ensure') {
          url = await synthesizeToCache(index, false);
        }
        if (!url && synthMode === 'ensure') {
          url = await synthesizeToCache(index, true);
        }
        if (!url) {
          message.warning('请先生成本段 TTS');
          return;
        }
        if (stopFlagRef.current) return;
        await playObjectUrl(url);

        // 内心独白音效：InnerVoice 片段 TTS 结束后播放特效音频
        if (innerMonologueEnabled && seg.type === SegmentType.InnerVoice && key) {
          try {
            const blob = await fetch(url).then((r) => r.blob());
            if (blob && blob.size > 0) {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result as string);
                r.onerror = reject;
                r.readAsDataURL(blob);
              });
              const base64 = dataUrl.split(',')[1];
              const tmpPath = `/tmp/yiman_mono_play_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
              const saveRes = await window.yiman?.fs?.writeBase64File(tmpPath, base64);
              if (saveRes?.ok) {
                if (!stopFlagRef.current) {
                  const result = await window.yiman?.innerMonologue?.apply(tmpPath);
                  if (result?.ok && result.outputPath) {
                    const processedDataUrl = await window.yiman?.fs?.readFileAsDataUrl(result.outputPath);
                    if (processedDataUrl) {
                      const procBlob = await fetch(processedDataUrl).then((r) => r.blob());
                      const procUrl = URL.createObjectURL(procBlob);
                      await playObjectUrl(procUrl).catch(() => {});
                      URL.revokeObjectURL(procUrl);
                    }
                    try { await window.yiman?.fs?.removePathRecursive(result.outputPath); } catch { /* ignore */ }
                  }
                }
                try { await window.yiman?.fs?.removePathRecursive(tmpPath); } catch { /* ignore */ }
              }
            }
          } catch {
            // 音效处理失败不阻断正常播放
          }
        }
      }
      if (stopFlagRef.current) return;
      if (seg.postDelayMs) await delay(seg.postDelayMs, () => stopFlagRef.current);
    },
    [
      cacheKeyForIndex,
      message,
      playAudioSrc,
      playObjectUrl,
      scheduleSegmentAttachedAudio,
      synthesizeToCache,
      innerMonologueEnabled,
    ],
  );

  const runEpisodeLoop = useCallback(
    async (fromIndex: number, runId: number, playOpts: EpisodePlayOptions) => {
      const ep = episode;
      const segments = ep?.segments ?? [];
      if (!segments.length) return;
      if (!anyAudiobookTtsModelReady(config)) {
        message.warning('请先在设置中配置本地 TTS 或带「生成配音」能力的云端模型');
        if (playbackRunIdRef.current === runId) {
          setEpisodePlaybackPhase('idle');
          setPlayingEpisode(false);
          setPlayingEpisodeSegmentIndex(null);
        }
        return;
      }

      const mode = playOpts.mode ?? 'default';
      if (mode === 'dialogueOnly' && !segments.some((s) => s.type === SegmentType.Dialogue)) {
        message.warning('本集没有对白片段');
        if (playbackRunIdRef.current === runId) {
          setEpisodePlaybackPhase('idle');
          setPlayingEpisode(false);
          setPlayingEpisodeSegmentIndex(null);
        }
        return;
      }

      let start = Math.floor(fromIndex);
      if (Number.isNaN(start) || start < 0) start = 0;
      if (start >= segments.length) start = 0;

      const synthMode = mode === 'regenerateAll' ? 'forceRegenerate' : 'ensure';

      const modelKeyForWarm = getSegmentTtsModelKey(start);
      if (isLocalAudiobookTtsModelKey(modelKeyForWarm)) {
        const warmResult = await warmLocalTtsVoiceReferencesForEpisode(
          modelKeyForWarm,
          ep,
          outlineVoice,
          audiobookSettings,
        );
        if (warmResult.failed.length > 0) {
          message.warning(
            `部分参考音色预热失败（${warmResult.failed.length}）：${warmResult.failed[0]}`,
          );
        }
      }

      try {
        for (let i = start; i < segments.length; i += 1) {
          if (playbackRunIdRef.current !== runId || stopFlagRef.current) {
            if (playbackRunIdRef.current === runId && stopFlagRef.current) {
              resumeFromIndexRef.current = i;
              setEpisodePlaybackPhase('paused');
              setPlayingEpisode(false);
              setPlayingEpisodeSegmentIndex(i);
            }
            return;
          }
          const seg = segments[i]!;
          if (!shouldPlaySegmentInEpisodeLoop(seg, mode)) continue;

          setPlayingEpisodeSegmentIndex(i);
          resumeFromIndexRef.current = i;
          await playOneSegment(seg, i, synthMode);
          if (playbackRunIdRef.current !== runId) return;
          if (stopFlagRef.current) {
            resumeFromIndexRef.current = i;
            setEpisodePlaybackPhase('paused');
            setPlayingEpisode(false);
            setPlayingEpisodeSegmentIndex(i);
            return;
          }
        }
        if (playbackRunIdRef.current !== runId) return;
        resumeFromIndexRef.current = 0;
        setEpisodePlaybackPhase('idle');
        setPlayingEpisodeSegmentIndex(null);
      } catch (e) {
        if (playbackRunIdRef.current === runId) {
          message.error(e instanceof Error ? e.message : '整集播放失败');
          setEpisodePlaybackPhase('idle');
          setPlayingEpisodeSegmentIndex(null);
        }
      } finally {
        if (playbackRunIdRef.current === runId) {
          setPlayingEpisode(false);
        }
      }
    },
    [
      episode,
      config,
      message,
      playOneSegment,
      getSegmentTtsModelKey,
      outlineVoice,
      audiobookSettings,
    ],
  );

  const startEpisodePlayback = useCallback(
    (fromIndex: number, playOpts: EpisodePlayOptions = episodePlayOptionsRef.current) => {
      const ep = episode;
      const segments = ep?.segments ?? [];
      if (!segments.length) return;
      if (!anyAudiobookTtsModelReady(config)) {
        message.warning('请先在设置中配置本地 TTS 或带「生成配音」能力的云端模型');
        return;
      }

      const mode = playOpts.mode ?? 'default';
      if (mode === 'regenerateAll') {
        const eid = ep?.id?.trim();
        if (eid) {
          audiobookTtsCacheRevokeForEpisode(eid);
          bumpCache();
        }
      }

      let start = Math.floor(fromIndex);
      if (Number.isNaN(start) || start < 0) start = 0;
      if (start >= segments.length) start = 0;

      episodePlayOptionsRef.current = playOpts;
      haltAudioOnly();
      stopFlagRef.current = false;
      const runId = playbackRunIdRef.current + 1;
      playbackRunIdRef.current = runId;
      resumeFromIndexRef.current = start;
      setEpisodePlaybackPhase('playing');
      setPlayingEpisode(true);
      setPlayingEpisodeSegmentIndex(start);
      void runEpisodeLoop(start, runId, playOpts);
    },
    [episode, config, message, haltAudioOnly, runEpisodeLoop, bumpCache],
  );

  const playEpisode = useCallback(
    (startIndex = 0, options?: EpisodePlayOptions) => {
      const mode = options?.mode ?? 'default';
      startEpisodePlayback(startIndex, episodePlayOptionsFromMode(mode));
    },
    [startEpisodePlayback],
  );

  const pauseEpisode = useCallback(() => {
    stopFlagRef.current = true;
    playbackRunIdRef.current += 1;
    haltAudioOnly();
    const idx = resumeFromIndexRef.current;
    setEpisodePlaybackPhase('paused');
    setPlayingEpisode(false);
    setPlayingEpisodeSegmentIndex(idx);
  }, [haltAudioOnly]);

  /** 暂停态下随用户选中片段移动「播放在」光标（继续播放将从此段起） */
  const alignPausedPlaybackCursor = useCallback(
    (index: number) => {
      if (episodePlaybackPhase !== 'paused') return;
      const len = episode?.segments?.length ?? 0;
      let i = Math.floor(index);
      if (Number.isNaN(i) || i < 0 || i >= len) i = 0;
      resumeFromIndexRef.current = i;
      setPlayingEpisodeSegmentIndex(i);
    },
    [episodePlaybackPhase, episode],
  );

  const resumeEpisode = useCallback(
    (fromIndex?: number) => {
      if (episodePlaybackPhase !== 'paused') return;
      const ep = episode;
      const len = ep?.segments?.length ?? 0;
      let start =
        fromIndex !== undefined && !Number.isNaN(fromIndex) ?
          Math.floor(fromIndex)
        : resumeFromIndexRef.current;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (len > 0 && start >= len) start = 0;
      startEpisodePlayback(start);
    },
    [episodePlaybackPhase, startEpisodePlayback, episode],
  );

  const restartEpisode = useCallback(
    (startIndex = 0, options?: EpisodePlayOptions) => {
      stopFlagRef.current = true;
      playbackRunIdRef.current += 1;
      haltAudioOnly();
      const opts = options ?? episodePlayOptionsRef.current;
      startEpisodePlayback(startIndex, opts);
    },
    [haltAudioOnly, startEpisodePlayback],
  );

  const ttsReady = anyAudiobookTtsModelReady(config);

  const downloadEpisodeAsAudio = useCallback(
    async (novelEpisode: NovelEpisode, workspace: NovelWorkspaceSnapshot, listItem?: NovelWorkspaceItem | null) => {
      const ep = episode;
      const segments = ep?.segments ?? [];
      if (!segments.length) {
        message.warning('当前集暂无片段');
        return;
      }
      if (!exportDeps) {
        message.warning('工作区未就绪');
        return;
      }
      const eid = resolvedEpisodeId;
      if (!eid) return;

      setExportingEpisode(true);
      try {
        const segmentKeys = await loadSegmentTtsModelKeys(exportDeps.novelId, eid);
        const blob = await buildAudiobookEpisodeWavBlob(exportDeps, ep!, segmentKeys, workspace?.innerMonologueEnabled);
        const res = await saveAudiobookEpisodeWavAndReveal(blob, novelEpisode, workspace, listItem);
        if (res.saved) {
          message.success(`已保存：${res.fileName}`);
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : '导出失败');
      } finally {
        setExportingEpisode(false);
      }
    },
    [episode, exportDeps, resolvedEpisodeId, message],
  );

  const [exportingAllEpisodes, setExportingAllEpisodes] = useState(false);

  const exportAllEpisodesAsAudio = useCallback(
    async (
      workspace: NovelWorkspaceSnapshot,
      listItem?: NovelWorkspaceItem | null,
      onProgress?: (current: number, total: number, label: string) => void,
    ) => {
      if (!exportDeps) {
        message.warning('工作区未就绪');
        return;
      }
      setExportingAllEpisodes(true);
      try {
        const result = await exportAllAudiobookEpisodes(workspace, exportDeps, listItem, onProgress);
        if (result.exported > 0) {
          message.success(`已导出 ${result.exported} 集音频到项目 audioBookFiles 目录`);
        }
        if (result.errors.length) {
          message.warning(
            `${result.errors.length} 集导出失败：${result.errors.map((e) => e.episodeLabel).join('、')}`,
          );
        }
        if (result.exported === 0 && !result.errors.length) {
          message.info('没有可导出的有声书集（需先有片段内容）');
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : '批量导出失败');
      } finally {
        setExportingAllEpisodes(false);
      }
    },
    [exportDeps, message],
  );

  const clearSegmentTtsCache = useCallback(
    (index: number) => {
      const eid = resolvedEpisodeId;
      if (!eid) return;
      audiobookTtsCacheRevokeForSegment(eid, index);
      bumpCache();
    },
    [resolvedEpisodeId, bumpCache],
  );

  const clearEpisodeTtsCache = useCallback(() => {
    const eid = resolvedEpisodeId;
    if (!eid) return;
    audiobookTtsCacheRevokeForEpisode(eid);
    bumpCache();
  }, [resolvedEpisodeId, bumpCache]);

  const reloadSegmentTtsModelKeys = useCallback(() => {
    const nid = novelId?.trim();
    const eid = resolvedEpisodeId;
    if (nid && eid) {
      void loadAndSanitizeSegmentTtsModelKeys(nid, eid, config).then((keys) => {
        setSegmentTtsModelKeys(keys);
      });
    } else {
      setSegmentTtsModelKeys({});
    }
  }, [novelId, resolvedEpisodeId, config]);

  return {
    playingEpisode,
    episodePlaybackPhase,
    playingEpisodeSegmentIndex,
    ttsReady,
    getSegmentTtsModelKey,
    setSegmentTtsModelKey,
    changeSegmentTtsModelAndGenerate,
    isSegmentCached,
    getSegmentTtsObjectUrl,
    getSegmentCacheKey,
    isSegmentGenerating: (i: number) => Boolean(generating[i]),
    generateSegmentAt,
    clearSegmentTtsCache,
    clearEpisodeTtsCache,
    reloadSegmentTtsModelKeys,
    playEpisode,
    pauseEpisode,
    alignPausedPlaybackCursor,
    resumeEpisode,
    restartEpisode,
    stop,
    downloadEpisodeAsAudio,
    exportAllEpisodesAsAudio,
    exportingEpisode,
    exportingAllEpisodes,
    activeAttachedAudioKeys,
  };
}
