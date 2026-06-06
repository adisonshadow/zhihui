/**
 * 音效处理器统一导出与组合
 * 接收 AudioBuffer，根据启用的效果类型链式处理，返回处理后的 data URL
 */
import { connectInnerMonologue } from './innerMonologue';
import { connectSpaceEcho } from './spaceEcho';
import { connectTelephone } from './telephone';
import { connectMuffler } from './muffler';
import type { VoiceEffectKey, VoiceEffectProcessor } from './types';

const PROCESSORS: Record<VoiceEffectKey, VoiceEffectProcessor> = {
  innerMonologue: connectInnerMonologue,
  spaceEcho: connectSpaceEcho,
  telephone: connectTelephone,
  muffler: connectMuffler,
};

/**
 * 对 AudioBuffer 应用指定音效，渲染为 WAV data URL
 * @param buffer 原始音频 AudioBuffer
 * @param effects 需要应用的音效 key 列表（按顺序叠加）
 * @returns data:audio/wav;base64,... data URL
 */
export async function renderVoiceEffect(
  buffer: AudioBuffer,
  effects: VoiceEffectKey[],
): Promise<string> {
  // 计算渲染长度：原时长 + 最长混响尾音 ~2s
  const length = Math.ceil(buffer.duration * buffer.sampleRate) + Math.ceil(buffer.sampleRate * 2);
  const offline = new OfflineAudioContext(1, length, buffer.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  // 按顺序叠加所有启用的效果
  for (const key of effects) {
    const processor = PROCESSORS[key];
    if (processor) {
      processor(source, offline, buffer);
    }
  }

  // 如果没有效果器连接，直接走干路
  if (effects.length === 0) {
    const dry = offline.createGain();
    dry.gain.value = 1;
    source.connect(dry);
    dry.connect(offline.destination);
  }

  source.start(0);
  const rendered = await offline.startRendering();

  // 导出为 WAV data URL
  const ch = rendered.getChannelData(0);
  const n = ch.length;
  const wavBuf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(wavBuf);
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rendered.sampleRate, true);
  v.setUint32(28, rendered.sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ws(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(wavBlob);
  });
}

/** 根据 VoiceEffects 对象获取启用的效果 key 列表 */
export function getEnabledEffects(effects: VoiceEffectsConfig): VoiceEffectKey[] {
  const keys: VoiceEffectKey[] = ['innerMonologue', 'spaceEcho', 'telephone', 'muffler'];
  return keys.filter((k) => effects[k] === true);
}

export interface VoiceEffectsConfig {
  innerMonologue?: boolean;
  spaceEcho?: boolean;
  telephone?: boolean;
  muffler?: boolean;
}
