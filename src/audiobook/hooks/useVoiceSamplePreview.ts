import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { resolveVoiceSampleAbsolutePath } from '@/audiobook/utils/audiobookSegmentReference';
import type { AudiobookVoiceSampleRoots } from '@/audiobook/utils/audiobookVoiceSampleRoots';

/** 大纲 / 样本选择等：按相对路径试听本地音色 wav */
export function useVoiceSamplePreview(roots: AudiobookVoiceSampleRoots) {
  const { message } = App.useApp();
  const [playingRelPath, setPlayingRelPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlayingRelPath(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(
    async (relativePath: string) => {
      const rel = relativePath.trim();
      if (!rel) return;
      if (playingRelPath === rel) {
        stop();
        return;
      }
      stop();
      const read = window.yiman?.fs?.readFileAsDataUrl;
      if (!read) {
        message.warning('无法试听（缺少文件读取接口）');
        return;
      }
      const abs = await resolveVoiceSampleAbsolutePath(roots, rel);
      if (!abs) {
        message.warning('无法解析音色样本路径');
        return;
      }
      try {
        const dataUrl = await read(abs);
        if (!dataUrl) {
          message.error('读取音频失败');
          return;
        }
        const a = new Audio(dataUrl);
        audioRef.current = a;
        a.onended = () => {
          audioRef.current = null;
          setPlayingRelPath(null);
        };
        setPlayingRelPath(rel);
        await a.play();
      } catch {
        message.error('播放失败');
        stop();
      }
    },
    [roots, playingRelPath, stop, message],
  );

  const isPlaying = useCallback(
    (relativePath: string) => playingRelPath === relativePath.trim(),
    [playingRelPath],
  );

  return { toggle, stop, isPlaying, playingRelPath };
}
