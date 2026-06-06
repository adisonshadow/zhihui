/** 播放总时长（秒）= cycle 数 / CPS */
export function computePlaybackDurationSec(cycleCount: number, cps: number): number {
  const safeCps = Math.max(0.25, cps);
  const safeCycles = Math.max(1, cycleCount);
  return safeCycles / safeCps;
}

/** 格式化为 m:ss（进度条旁显示） */
export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
