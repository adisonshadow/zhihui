/**
 * useMediaRecorder：封装 getUserMedia + MediaRecorder（开始/暂停/继续/停止→Blob）
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'paused';

interface UseMediaRecorderReturn {
  status: RecorderStatus;
  /** 当前录音时长（秒） */
  elapsed: number;
  /** 录音完成后的 Blob */
  blob: Blob | null;
  /** 开始录音 */
  start: () => Promise<void>;
  /** 暂停录音 */
  pause: () => void;
  /** 继续录音 */
  resume: () => void;
  /** 停止录音并返回 Blob */
  stop: () => Promise<Blob>;
  /** 重置状态 */
  reset: () => void;
  /** 错误信息 */
  error: string | null;
}

export function useMediaRecorder(): UseMediaRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  /** 清除计时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 启动计时 */
  const startTimer = useCallback(() => {
    clearTimer();
    startTimeRef.current = Date.now() - pausedDurationRef.current * 1000;
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 200);
  }, [clearTimer]);

  /** 开始录音 */
  const start = useCallback(async () => {
    try {
      setError(null);
      setBlob(null);
      setElapsed(0);
      chunksRef.current = [];
      pausedDurationRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 优先 opus/webm，回退到 audio/webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setError('录制器出错');
        stop();
      };

      recorder.start(100); // 每 100ms 收集数据
      setStatus('recording');
      startTimer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`麦克风访问被拒绝：${msg}`);
    }
  }, [startTimer]);

  /** 暂停 */
  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setStatus('paused');
      pausedAtRef.current = Date.now();
    }
  }, []);

  /** 继续 */
  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setStatus('recording');
      if (pausedAtRef.current) {
        pausedDurationRef.current += (Date.now() - pausedAtRef.current) / 1000;
        pausedAtRef.current = null;
      }
    }
  }, []);

  /** 停止录音 */
  const stop = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const emptyBlob = new Blob([], { type: 'audio/webm' });
        setBlob(emptyBlob);
        resolve(emptyBlob);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setBlob(blob);
        setStatus('idle');
        clearTimer();
        // 释放流
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        resolve(blob);
      };

      recorder.stop();
    });
  }, [clearTimer]);

  /** 重置 */
  const reset = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    clearTimer();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setStatus('idle');
    setElapsed(0);
    setBlob(null);
    setError(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      // 组件卸载时清理
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      clearTimer();
    };
  }, [clearTimer]);

  return { status, elapsed, blob, start, pause, resume, stop, reset, error };
}
