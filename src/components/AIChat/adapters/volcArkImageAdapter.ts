/**
 * 火山方舟文生图等返回的 TOS 预签名链接：
 * - 常带 Content-Disposition: attachment，不宜直接作 img src；
 * - 且对浏览器无 CORS，需在 Electron 主进程或 Vite 开发服务代拉取。
 */
import { useEffect, useState } from 'react';
import { isVolcTosSignedImageUrl } from '@/utils/volcTosImageUrl';

/** @deprecated 使用 isVolcTosSignedImageUrl；保留旧名避免大范围改名 */
export function volcArkImageUrlNeedsBlobProxy(url: string): boolean {
  return isVolcTosSignedImageUrl(url);
}

export interface VolcArkObjectUrlHandle {
  objectUrl: string;
  revoke: () => void;
}

type DisplayLoad = { src: string; revoke: () => void };

async function fetchHttpImageAsBlobObjectUrl(url: string, signal: AbortSignal): Promise<DisplayLoad> {
  const res = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    signal,
  });
  if (!res.ok) {
    throw new Error(`图片请求失败：HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  return {
    src: objectUrl,
    revoke: () => {
      URL.revokeObjectURL(objectUrl);
    },
  };
}

/**
 * 拉取 TOS / 普通 https 图，得到可直接作为 Image src 的字符串（data URL 或 blob URL）及 revoke。
 */
async function loadVolcArkTosImageDisplay(url: string, signal: AbortSignal): Promise<DisplayLoad> {
  if (!isVolcTosSignedImageUrl(url)) {
    return fetchHttpImageAsBlobObjectUrl(url, signal);
  }

  const yiman = typeof window !== 'undefined' ? window.yiman : undefined;
  if (yiman?.net?.fetchVolcTosImageAsDataUrl) {
    const r = await yiman.net.fetchVolcTosImageAsDataUrl(url);
    if (!r.ok) {
      throw new Error(r.error);
    }
    return { src: r.dataUrl, revoke: () => {} };
  }

  if (import.meta.env.DEV) {
    const res = await fetch('/__yiman_dev/volc-tos-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
    const j = (await res.json()) as { ok?: boolean; dataUrl?: string; error?: string };
    if (!j.ok || !j.dataUrl) {
      throw new Error(j.error || `图片加载失败 HTTP ${res.status}`);
    }
    return { src: j.dataUrl, revoke: () => {} };
  }

  return fetchHttpImageAsBlobObjectUrl(url, signal);
}

/**
 * 拉取远程图片为 Blob 并生成 object URL（对外 API 统一返回 blob URL）。
 * 若中间拿到 data URL，会再转成 blob URL；用完务必 revoke()。
 */
export async function fetchVolcArkImageAsObjectUrl(
  url: string,
  init?: RequestInit
): Promise<VolcArkObjectUrlHandle> {
  const ac = new AbortController();
  const signal = init?.signal ?? ac.signal;
  const { src, revoke: revokeOuter } = await loadVolcArkTosImageDisplay(url, signal);

  if (src.startsWith('blob:')) {
    return { objectUrl: src, revoke: revokeOuter };
  }

  const res = await fetch(src);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  return {
    objectUrl,
    revoke: () => {
      URL.revokeObjectURL(objectUrl);
      revokeOuter();
    },
  };
}

export interface UseVolcArkDisplayableImageSrcResult {
  displaySrc: string | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * 将远程 URL 转为可预览的 src：
 * 1. 优先读本地磁盘缓存（{userData}/yiman/image-cache/）
 * 2. 火山 TOS 走主进程 / 开发代理
 * 3. 其它 URL 原样使用 + 异步缓存到本地
 */
export function useVolcArkDisplayableImageSrc(src: string | undefined): UseVolcArkDisplayableImageSrcResult {
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(() => {
    if (!src) return undefined;
    return isVolcTosSignedImageUrl(src) ? undefined : src;
  });
  const [loading, setLoading] = useState(() => Boolean(src && isVolcTosSignedImageUrl(src)));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(undefined);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const imgCache = typeof window !== 'undefined' ? (window as any).yiman?.images?.cache : undefined;

    setLoading(true);
    setError(null);
    setDisplaySrc(undefined);

    (async () => {
      // 1. 优先读本地缓存
      if (imgCache?.readDataUrl) {
        try {
          const cached = await imgCache.readDataUrl(src) as string | null;
          if (cancelled) return;
          if (cached) {
            setDisplaySrc(cached);
            setLoading(false);
            return;
          }
        } catch {
          // 缓存读取失败，静默降级到远程
        }
      }

      // 2. 无缓存，按原逻辑加载远程图片
      try {
        let resolvedSrc: string | undefined;
        if (isVolcTosSignedImageUrl(src)) {
          const { src: display } = await loadVolcArkTosImageDisplay(src, new AbortController().signal);
          resolvedSrc = display;
        } else {
          resolvedSrc = src;
        }

        if (cancelled) return;
        setDisplaySrc(resolvedSrc);
        setLoading(false);

        // 3. 异步缓存到本地（不阻塞展示）
        if (imgCache?.save) {
          imgCache.save(src).catch(() => {});
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { displaySrc, loading, error };
}
