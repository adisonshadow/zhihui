/**
 * 电话中的声音音效：带通滤波 300-3400Hz + 轻微失真 + 底噪模拟
 * 模拟电话听筒中的声音效果
 */
export function connectTelephone(
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
): void {
  // --------------------------
  // 1. 电话核心窄频带通（真正电话频段：300–2800Hz）
  // --------------------------
  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 320; // 切掉更低频，更干净
  highpass.Q.value = 0.7;

  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  // lowpass.frequency.value = 2600; // 切掉高频 → 立刻“变远”
  lowpass.frequency.value = 2200; // 更远、更闷
  lowpass.Q.value = 0.8;

  // --------------------------
  // 2. 中频峰值（电话人声核心区 1200Hz）
  // --------------------------
  const midEQ = offline.createBiquadFilter();
  midEQ.type = "peaking";
  midEQ.frequency.value = 1200;
  midEQ.Q.value = 1.5;
  midEQ.gain.value = 5;

  // --------------------------
  // 3. 动态压缩 → 电话声音“平、不突兀、远距离感”
  // --------------------------
  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 10;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.25;

  // --------------------------
  // 4. 轻微软失真（电话线路质感）
  // --------------------------
  const waveshaper = offline.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i - 128) / 128;
    curve[i] = Math.tanh(x * 1.15); // 更轻、更自然的失真
  }
  waveshaper.curve = curve;
  waveshaper.oversample = "4x";

  // --------------------------
  // 5. 主音量控制（避免爆音）
  // --------------------------
  const masterGain = offline.createGain();
  masterGain.gain.value = 0.9;

  // --------------------------
  // 6. 可选：轻微线路底噪（更像真实电话）
  // --------------------------
  const noiseGain = offline.createGain();
  noiseGain.gain.value = 0.008; // 极轻微，不刺耳

  // 连接
  // 连接顺序（关键！决定最终声音质感）
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(midEQ);
  midEQ.connect(waveshaper);
  waveshaper.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(offline.destination);
}
