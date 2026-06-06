/**
 * 空间回音音效：大量延时混响 + 回声，模拟空旷大空间（礼堂/山洞）
 */
export function connectSpaceEcho(
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
): void {
  // 干声减弱
  const dryGain = offline.createGain();
  dryGain.gain.value = 0.4;

  // 早期反射: 短延时簇
  const earlySum = offline.createGain();
  const earlyGain = offline.createGain();
  earlyGain.gain.value = 0.3;
  const earlyTimes = [0.015, 0.025, 0.045, 0.065, 0.095, 0.125];
  for (const t of earlyTimes) {
    const d = offline.createDelay(0.5);
    d.delayTime.value = t;
    const g = offline.createGain();
    g.gain.value = 0.25 * Math.exp(-t / 0.1);
    d.connect(g);
    g.connect(earlySum);
    source.connect(d);
  }
  earlySum.connect(earlyGain);

  // 晚期混响: 长延时叠加
  const lateSum = offline.createGain();
  const lateGain = offline.createGain();
  lateGain.gain.value = 0.35;
  const lateTimes = [0.2, 0.4, 0.7, 1.1, 1.6, 2.2];
  for (const t of lateTimes) {
    const d = offline.createDelay(4);
    d.delayTime.value = t;
    const g = offline.createGain();
    g.gain.value = 0.2 * Math.exp(-t / 0.8);
    d.connect(g);
    g.connect(lateSum);
    source.connect(d);
  }
  lateSum.connect(lateGain);

  // 多重回声
  const echoSum = offline.createGain();
  const echoGain = offline.createGain();
  echoGain.gain.value = 0.2;
  const echoes = [0.08, 0.15, 0.25, 0.4, 0.6];
  for (const t of echoes) {
    const d = offline.createDelay(1);
    d.delayTime.value = t;
    const g = offline.createGain();
    g.gain.value = 0.15 * Math.exp(-t / 0.3);
    d.connect(g);
    g.connect(echoSum);
    source.connect(d);
  }
  echoSum.connect(echoGain);

  // 整体音量 +2dB（空间感提升）
  const vol = offline.createGain();
  vol.gain.value = 0.85; // slight reduction to avoid clipping

  // 汇总
  source.connect(dryGain);
  dryGain.connect(vol);
  earlyGain.connect(vol);
  lateGain.connect(vol);
  echoGain.connect(vol);
  vol.connect(offline.destination);
}
