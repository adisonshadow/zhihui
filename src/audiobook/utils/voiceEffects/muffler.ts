/**
 * 闷罐 Muffler 音效：低通滤波 + 低频提升 + 压缩
 * 模拟隔墙/闷罐/捂住嘴说话的声音效果
 */
export function connectMuffler(
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
): void {
  // 强力低通: 切除高频，只留低频闷声
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  lp.Q.value = 0.7;

  // 进一步削弱 2kHz 以上
  const lp2 = offline.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 800;
  lp2.Q.value = 0.5;

  // 低频提升（胸腔共鸣感）
  const lowshelf = offline.createBiquadFilter();
  lowshelf.type = 'lowshelf';
  lowshelf.frequency.value = 200;
  lowshelf.gain.value = 6;

  // 中频削减（让声音更闷）
  const notch = offline.createBiquadFilter();
  notch.type = 'peaking';
  notch.frequency.value = 1800;
  notch.Q.value = 1.5;
  notch.gain.value = -8;

  // 压缩: 减少动态范围，模拟隔音
  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  // 音量补偿
  const vol = offline.createGain();
  vol.gain.value = 0.9;

  // 连接
  source.connect(lp);
  lp.connect(lp2);
  lp2.connect(lowshelf);
  lowshelf.connect(notch);
  notch.connect(compressor);
  compressor.connect(vol);
  vol.connect(offline.destination);
}
