/**
 * 默认 Strudel 示例：优先使用内置合成器，不依赖 dirt-samples 加载结果。
 * 用户可在界面中加载示例或让 AI 生成基于 s("bd sd") 的鼓点（需 samples 预加载成功）。
 */
export const DEFAULT_STRUDEL_CODE = `// Ctrl/Cmd+Enter 或点「播放」
setcps(0.9)
note("<c2 eb2 g2 bb2>(3,8)")
  .s("sawtooth")
  .gain(0.35)
  .lpf(sine.slow(8).range(400, 2400))`;

/** 本地 samples/piano 采样示例（须预加载 samples('http://127.0.0.1:5432')） */
export const PIANO_STRUDEL_CODE = `// 本地 piano 采样 · samples/piano
setcps(0.55)
note("c3 ds3 fs3 a3 c4 ds4 fs4 a4")
  .s("piano")
  .gain(0.9)
  .room(0.25)
  .size(4)`;
