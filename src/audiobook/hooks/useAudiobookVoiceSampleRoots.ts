import { useEffect, useState } from 'react';
import type { AudiobookSettings } from '@/types/settings';
import { resolveAudiobookVoiceSampleRootsResolved } from '@/audiobook/utils/builtinPresetVoiceDir';
import type { AudiobookVoiceSampleRoots } from '@/audiobook/utils/audiobookVoiceSampleRoots';

const EMPTY_ROOTS: AudiobookVoiceSampleRoots = { builtin: '', external: '', custom: '' };

/** 订阅配置并解析内置 PresetVoice/ + 外置/自定义目录 */
export function useAudiobookVoiceSampleRoots(audiobook?: AudiobookSettings | null) {
  const [roots, setRoots] = useState<AudiobookVoiceSampleRoots>(EMPTY_ROOTS);

  useEffect(() => {
    let cancelled = false;
    void resolveAudiobookVoiceSampleRootsResolved(audiobook).then((r) => {
      if (!cancelled) setRoots(r);
    });
    return () => {
      cancelled = true;
    };
  }, [audiobook]);

  return roots;
}
