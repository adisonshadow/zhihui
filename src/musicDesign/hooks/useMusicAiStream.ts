import { useCallback, useRef } from 'react';
import { extractLastClosedStrudelBlock, extractStreamingStrudelCandidate } from '../utils/parseStrudelCodeBlock';

export interface MusicAssistStreamPayload {
  isRequesting: boolean;
  lastAssistantPlain: string;
  lastUserPlain: string;
  assistantStreaming: boolean;
  toolCallsPending: boolean;
  toolCallNamesAfterLastUser?: string[];
}

export interface UseMusicAiStreamOptions {
  onApplyCode: (code: string) => void;
  /** 流式过程中是否把未闭合围栏内容写入编辑器（默认 false，仅在请求结束后应用闭合块） */
  streamPreview?: boolean;
}

/**
 * 监听 AIChat onAssistStream：从助手正文解析 ```strudel / ```tidal 块并写回编辑器。
 */
export function useMusicAiStream({ onApplyCode, streamPreview = false }: UseMusicAiStreamOptions) {
  const prevRequestingRef = useRef(false);

  const onAssistStream = useCallback(
    (p: MusicAssistStreamPayload) => {
      if (streamPreview && p.isRequesting && (p.assistantStreaming || p.lastAssistantPlain)) {
        const cand = extractStreamingStrudelCandidate(p.lastAssistantPlain);
        if (cand && !extractLastClosedStrudelBlock(p.lastAssistantPlain)) {
          onApplyCode(cand);
        }
      }

      const done =
        prevRequestingRef.current &&
        !p.isRequesting &&
        !p.assistantStreaming &&
        !p.toolCallsPending;

      prevRequestingRef.current = p.isRequesting;

      if (done) {
        const closed = extractLastClosedStrudelBlock(p.lastAssistantPlain);
        if (closed) onApplyCode(closed);
      }
    },
    [onApplyCode, streamPreview],
  );

  return { onAssistStream };
}
