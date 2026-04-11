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
 * 将远程 URL 转为可预览的 src：火山 TOS 走主进程 / 开发代理，其它 URL 原样使用。
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

    if (!isVolcTosSignedImageUrl(src)) {
      setDisplaySrc(src);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    const revokeRef: { current: (() => void) | null } = { current: null };
    let alive = true;

    setLoading(true);
    setError(null);
    setDisplaySrc(undefined);

    (async () => {
      try {
        const { src: display, revoke } = await loadVolcArkTosImageDisplay(src, ac.signal);
        if (ac.signal.aborted || !alive) {
          revoke();
          return;
        }
        revokeRef.current = revoke;
        setDisplaySrc(display);
        setLoading(false);
      } catch (e) {
        if (ac.signal.aborted || !alive) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
      revokeRef.current?.();
      revokeRef.current = null;
    };
  }, [src]);

  return { displaySrc, loading, error };
}
