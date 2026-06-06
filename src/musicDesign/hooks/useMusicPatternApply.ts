import { useCallback, useRef, type RefObject } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { AIChatSidePanelHandle } from '@/components/AIChat/aiChatPanelHandles';
import { extractLastClosedStrudelBlock, extractStreamingStrudelCandidate } from '../utils/parseStrudelCodeBlock';
import {
  buildMusicEvalFixEphemeral,
  MUSIC_EVAL_FIX_USER_DISPLAY,
} from '../utils/buildMusicEvalFixPrompt';
import type { MusicAssistStreamPayload } from './useMusicAiStream';
import type { StrudelPlayOptions } from '../strudelPlayback/StrudelPlaybackController';

const MAX_AUTO_FIX_PER_TURN = 2;
const MUSIC_WRITE_TOOLS = new Set(['music_set_pattern', 'music_patch_pattern']);

export interface UseMusicPatternApplyOptions {
  setCode: (code: string) => void;
  cps: number;
  cycleCount: number;
  engineReady: boolean;
  playPattern: (opts: StrudelPlayOptions) => Promise<void>;
  chatRef: RefObject<AIChatSidePanelHandle | null>;
  message: MessageInstance;
  /** 流式过程中是否预览未闭合围栏（默认 false） */
  streamPreview?: boolean;
}

/**
 * AI 生成代码 → 写入编辑器 → 立即 evaluate；失败则自动让 AI 修正重生成。
 */
export function useMusicPatternApply({
  setCode,
  cps,
  cycleCount,
  engineReady,
  playPattern,
  chatRef,
  message,
  streamPreview = false,
}: UseMusicPatternApplyOptions) {
  const prevRequestingRef = useRef(false);
  const autoFixAttemptsRef = useRef(0);
  const lastUserTurnRef = useRef('');

  const requestAiFix = useCallback(
    (errorMessage: string, failedCode: string) => {
      if (autoFixAttemptsRef.current >= MAX_AUTO_FIX_PER_TURN) {
        message.warning('已多次自动请求修正，请手动说明问题或自行改代码');
        return;
      }
      autoFixAttemptsRef.current += 1;
      chatRef.current?.emitUserMessage({
        displayContent: MUSIC_EVAL_FIX_USER_DISPLAY,
        ephemeralSystemInstructions: buildMusicEvalFixEphemeral(errorMessage, failedCode),
      });
    },
    [chatRef, message],
  );

  const applyAndPlay = useCallback(
    async (raw: string) => {
      const next = raw.trim();
      if (!next) return;

      setCode(next);

      if (!engineReady) {
        message.warning('代码已写入编辑器；Strudel 引擎未就绪，暂未自动播放');
        return;
      }

      try {
        await playPattern({ code: next, cps, cycleCount });
        autoFixAttemptsRef.current = 0;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        message.error(`自动播放失败：${errMsg}`);
        requestAiFix(errMsg, next);
      }
    },
    [cps, cycleCount, engineReady, message, playPattern, requestAiFix, setCode],
  );

  const onAssistStream = useCallback(
    (p: MusicAssistStreamPayload) => {
      if (p.lastUserPlain && p.lastUserPlain !== lastUserTurnRef.current && p.isRequesting) {
        lastUserTurnRef.current = p.lastUserPlain;
        autoFixAttemptsRef.current = 0;
      }

      if (streamPreview && p.isRequesting && (p.assistantStreaming || p.lastAssistantPlain)) {
        const cand = extractStreamingStrudelCandidate(p.lastAssistantPlain);
        if (cand && !extractLastClosedStrudelBlock(p.lastAssistantPlain)) {
          setCode(cand);
        }
      }

      const done =
        prevRequestingRef.current &&
        !p.isRequesting &&
        !p.assistantStreaming &&
        !p.toolCallsPending;

      prevRequestingRef.current = p.isRequesting;

      if (done) {
        const toolApplied = (p.toolCallNamesAfterLastUser ?? []).some((n) => MUSIC_WRITE_TOOLS.has(n));
        if (toolApplied) return;
        const closed = extractLastClosedStrudelBlock(p.lastAssistantPlain);
        if (closed) void applyAndPlay(closed);
      }
    },
    [applyAndPlay, setCode, streamPreview],
  );

  return { applyAndPlay, onAssistStream };
}
