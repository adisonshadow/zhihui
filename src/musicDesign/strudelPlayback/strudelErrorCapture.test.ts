import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatStrudelCapturedError,
  isStrudelErrorLog,
  STRUDEL_LOG_EVENT,
  StrudelErrorCollector,
} from './strudelErrorCapture';

describe('formatStrudelCapturedError', () => {
  it('解析 [eval] error 前缀', () => {
    expect(formatStrudelCapturedError('[eval] error: lpfenv is not a function')).toBe(
      'lpfenv is not a function',
    );
  });
});

describe('isStrudelErrorLog', () => {
  it('识别 eval 与 getTrigger 错误', () => {
    expect(isStrudelErrorLog({ message: '[eval] error: boom' })).toBe(true);
    expect(isStrudelErrorLog({ message: '[getTrigger] error: boom' })).toBe(true);
    expect(isStrudelErrorLog({ message: '[eval] code updated' })).toBe(false);
    expect(isStrudelErrorLog({ message: 'ok', type: 'error' })).toBe(true);
  });
});

describe('StrudelErrorCollector', () => {
  it('收集 strudel.log 错误事件', () => {
    vi.stubGlobal(
      'document',
      (() => {
        const handlers = new Map<string, Set<(e: Event) => void>>();
        return {
          addEventListener(type: string, handler: (e: Event) => void) {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type)!.add(handler);
          },
          removeEventListener(type: string, handler: (e: Event) => void) {
            handlers.get(type)?.delete(handler);
          },
          dispatchEvent(e: Event) {
            handlers.get(e.type)?.forEach((h) => h(e));
            return true;
          },
        };
      })(),
    );

    const collector = new StrudelErrorCollector();
    collector.start();
    document.dispatchEvent(
      new CustomEvent(STRUDEL_LOG_EVENT, {
        detail: { message: '[eval] error: note is not defined', type: 'error' },
      }),
    );
    expect(collector.firstError()?.message).toBe('note is not defined');
    collector.stop();
    vi.unstubAllGlobals();
  });
});
