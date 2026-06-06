/**
 * 有声书片段卡片 / Agent 常用提示词（与 novelToAudiobookAgent.prompts 同步）
 */
import type { PromptItem } from '@/components/AIChat/types';

export const AUDIOBOOK_SEGMENT_PROMPT_POLISH_TONE = 'polish-tone';
export const AUDIOBOOK_SEGMENT_PROMPT_REDESIGN_TTS = 're-design-segment-TTS';

export const audiobookSegmentQuickPrompts: PromptItem[] = [
  {
    key: AUDIOBOOK_SEGMENT_PROMPT_POLISH_TONE,
    label: '润色风格和语气',
    message:
      '润色选中片段：必须调用 novel_audiobook_rewrite_segment_tts 写入 text（至少2处 […]，优先语速/音量/呼吸类，勿与 tone 重复）与 tone，禁止只在对话里展示润色前后对比',
  },
  {
    key: AUDIOBOOK_SEGMENT_PROMPT_REDESIGN_TTS,
    label: '重新生成该片段',
    message:
      '重写选中片段 TTS：必须调用 novel_audiobook_rewrite_segment_tts（episode_id 与 segment_index 见 refIndicator），写入含 […]（每标签 1～2 短词）的 text 与 tone。禁止只在回复里展示润色结果。',
  },
];

const promptByKey = new Map(audiobookSegmentQuickPrompts.map((p) => [p.key, p]));

export function getAudiobookSegmentQuickPrompt(key: string): PromptItem | undefined {
  return promptByKey.get(key);
}

export function getAudiobookSegmentQuickPromptMessage(key: string): string | undefined {
  return promptByKey.get(key)?.message;
}
