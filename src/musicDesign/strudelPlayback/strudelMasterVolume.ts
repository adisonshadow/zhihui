import { getSuperdoughAudioController } from '@strudel/web';

/** 主输出音量 0–1，作用于 superdough destinationGain */
export function applyStrudelMasterVolume(volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  try {
    const controller = getSuperdoughAudioController();
    const gain = controller?.output?.destinationGain?.gain;
    if (gain) gain.value = v;
  } catch {
    /* 引擎未就绪时忽略 */
  }
}

export function readStrudelMasterVolume(): number {
  try {
    const controller = getSuperdoughAudioController();
    return controller?.output?.destinationGain?.gain?.value ?? 1;
  } catch {
    return 1;
  }
}
