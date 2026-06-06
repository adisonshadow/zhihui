/**
 * 内心独白音效：低通滤波 + 中频 EQ + 小混响 + 前置回声 + 音量压低
 * 模拟「颅内回响」的内心声音效果
 */
export function connectInnerMonologue(
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
): void {
  const sr = offline.sampleRate;

  // highpass=120, lowpass=7500
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 120;
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7500;

  // EQ: 320Hz +3dB, 2800Hz -6dB
  const eq1 = offline.createBiquadFilter();
  eq1.type = 'peaking';
  eq1.frequency.value = 320;
  eq1.Q.value = 0.707;
  eq1.gain.value = 3;
  const eq2 = offline.createBiquadFilter();
  eq2.type = 'peaking';
  eq2.frequency.value = 2800;
  eq2.Q.value = 0.707;
  eq2.gain.value = -6;

  // 小混响: 多延时叠加
  const dryGain = offline.createGain();
  dryGain.gain.value = 0.9;
  const wetSum = offline.createGain();
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.5;
  const reverbTimes = [0.03, 0.07, 0.12, 0.18, 0.25, 0.35];
  for (const t of reverbTimes) {
    const d = offline.createDelay(1);
    d.delayTime.value = t;
    const g = offline.createGain();
    g.gain.value = Math.exp(-t / 0.3) * 0.3;
    d.connect(g);
    g.connect(wetSum);
    eq2.connect(d);
  }
  wetSum.connect(reverbGain);

  // 前置回声 22ms
  const echoDelay = offline.createDelay(0.5);
  echoDelay.delayTime.value = 0.022;
  const echoGain = offline.createGain();
  echoGain.gain.value = 0.12;

  // 音量 -3dB
  const vol = offline.createGain();
  vol.gain.value = 0.7;

  // 连接
  source.connect(hp);
  hp.connect(lp);
  lp.connect(eq1);
  eq1.connect(eq2);
  eq2.connect(dryGain);
  dryGain.connect(vol);
  reverbGain.connect(vol);
  eq2.connect(echoDelay);
  echoDelay.connect(echoGain);
  echoGain.connect(vol);
  vol.connect(offline.destination);
}
