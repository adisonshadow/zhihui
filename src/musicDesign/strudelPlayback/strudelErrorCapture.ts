/** Strudel logger 通过 document CustomEvent 广播，见 @strudel/core/logger.mjs */
export const STRUDEL_LOG_EVENT = 'strudel.log';

export interface StrudelLogDetail {
  message: string;
  type?: string;
  data?: Record<string, unknown>;
}

const ERROR_MESSAGE_RE =
  /\[(eval|getTrigger|cyclist|webaudio|superdough)\] error:/i;

/** 从 Strudel logger 消息中提取可读错误文案 */
export function formatStrudelCapturedError(message: string): string {
  const trimmed = message.trim();
  const evalMatch = trimmed.match(/\[eval\] error:\s*(.+)/i);
  if (evalMatch?.[1]) return evalMatch[1].trim();
  const genericMatch = trimmed.match(/\[[^\]]+\] error:\s*(.+)/i);
  if (genericMatch?.[1]) return genericMatch[1].trim();
  return trimmed;
}

export function isStrudelErrorLog(detail: StrudelLogDetail | undefined): boolean {
  if (!detail?.message) return false;
  if (detail.type === 'error') return true;
  return ERROR_MESSAGE_RE.test(detail.message);
}

/** 单次 evaluate / 播放会话内收集 Strudel 控制台错误 */
export class StrudelErrorCollector {
  private messages: string[] = [];
  private listener: ((e: Event) => void) | null = null;

  start(): void {
    this.stop();
    this.messages = [];
    if (typeof document === 'undefined') return;
    this.listener = (e: Event) => {
      const detail = (e as CustomEvent<StrudelLogDetail>).detail;
      if (!isStrudelErrorLog(detail)) return;
      const msg = detail!.message.trim();
      if (!this.messages.includes(msg)) this.messages.push(msg);
    };
    document.addEventListener(STRUDEL_LOG_EVENT, this.listener);
  }

  stop(): void {
    if (this.listener && typeof document !== 'undefined') {
      document.removeEventListener(STRUDEL_LOG_EVENT, this.listener);
    }
    this.listener = null;
  }

  firstErrorMessage(): string | null {
    return this.messages[0] ?? null;
  }

  firstError(): Error | null {
    const msg = this.firstErrorMessage();
    return msg ? new Error(formatStrudelCapturedError(msg)) : null;
  }
}
