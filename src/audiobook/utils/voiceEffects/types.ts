/**
 * 声效类型枚举与接口定义
 */
export type VoiceEffectKey = 'innerMonologue' | 'spaceEcho' | 'telephone' | 'muffler';

/** 项目设置中存储的效果开关状态 */
export interface VoiceEffects {
  innerMonologue?: boolean;
  spaceEcho?: boolean;
  telephone?: boolean;
  muffler?: boolean;
}

/** 每种效果的显示名称 */
export const VOICE_EFFECT_LABELS: Record<VoiceEffectKey, string> = {
  innerMonologue: '使用本地内心独白音效',
  spaceEcho: '空间回音',
  telephone: '电话中的声音',
  muffler: '闷罐 Muffler',
};

/** 每种效果在片段 UI 中的 tag 名 */
export const VOICE_EFFECT_TAGS: Record<VoiceEffectKey, string> = {
  innerMonologue: '内心独白',
  spaceEcho: '空间回音',
  telephone: '电话音',
  muffler: '闷罐',
};

/** AI 提示词中使用的效果说明 */
export const VOICE_EFFECT_PROMPTS: Record<VoiceEffectKey, string> = {
  innerMonologue:
    '**内心独白音效**：系统自动对 innerVoice 片段叠加低通滤波 + 中频 EQ + 小混响 + 前置回声 + 音量压低，模拟「颅内回响」的内心声音效果。请将角色「未说出口」的内心台词正确标记为 innerVoice 类型。',
  spaceEcho:
    '**空间回音音效**：系统自动对标记片段叠加大量延时混响与回声，模拟在空旷大空间（如礼堂、山洞）中的声音效果。请在对应片段的 voice.tone 中使用 `[空间回音]` tag 标记。',
  telephone:
    '**电话中的声音音效**：系统自动对标记片段叠加带通滤波（300-3400Hz）+ 轻微失真，模拟电话听筒中的声音效果。请在对应片段的 voice.tone 中使用 `[电话音]` tag 标记。',
  muffler:
    '**闷罐 Muffler 音效**：系统自动对标记片段叠加低通滤波 + 低频提升 + 压缩，模拟隔墙/闷罐/捂住嘴说话的声音效果。请在对应片段的 voice.tone 中使用 `[闷罐]` tag 标记。',
};

/** 效果处理器：接收 AudioBuffer 和 OfflineAudioContext，在 context 中完成连线 */
export type VoiceEffectProcessor = (
  source: AudioBufferSourceNode,
  offline: OfflineAudioContext,
  buffer: AudioBuffer,
) => void;
