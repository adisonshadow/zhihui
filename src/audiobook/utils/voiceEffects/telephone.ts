/**
 * 电话中的声音音效：带通滤波 300-3400Hz + 轻微失真 + 底噪模拟
 * 模拟电话听筒中的声音效果
 */
export function connectTelephone(
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
): void {
  // 带通滤波器: 模拟电话频响 300-3400Hz
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  hp.Q.value = 0.5;

  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  lp.Q.value = 0.5;

  // 轻微失真: 用 WaveShaper 模拟电话线路过载
  const shaper = offline.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i - 128) / 128;
    curve[i] = Math.tanh(x * 1.3) / Math.tanh(1.3); // 软削波
  }
  shaper.curve = curve;
  shaper.oversample = 'none';

  // 中频提升（电话声特征）
  const eq = offline.createBiquadFilter();
  eq.type = 'peaking';
  eq.frequency.value = 1500;
  eq.Q.value = 1.0;
  eq.gain.value = 4;

  // 音量提升（电话声通常比正常稍大）
  const vol = offline.createGain();
  vol.gain.value = 1.2;

  // 连接
  source.connect(hp);
  hp.connect(lp);
  lp.connect(shaper);
  shaper.connect(eq);
  eq.connect(vol);
  vol.connect(offline.destination);
}
