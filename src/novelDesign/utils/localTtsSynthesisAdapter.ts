import { stripAudiobookTextForLocalTts } from '@/audiobook/utils/audiobookLocalTtsPlainText';

/**
 * 本地 TTS 合成 HTTP 请求体按模型适配。
 * Python 常驻进程里再转为各推理栈真实参数：
 * - LongCat（mlx-audio）：`referenceAudioPath` + `referenceText`（或同目录同名 .txt）→ `ref_audio` + `ref_text` + `guidance_method=apg`；勿将路径字符串当作 ref_audio。
 * - MOSS（mlx-speech Local）：`referenceAudioPath` → 服务端缓存编码后 `reference=[audio_codes]`。
 * - MOSS-TTS-Nano：`referenceAudioPath` → 服务端缓存 `prompt_audio_codes`。
 *
 * 参考：
 * - LongCat-AudioDiT（mlx-audio）：https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/longcat_audiodit/README.md
 * - MOSS-TTS：https://huggingface.co/OpenMOSS-Team/MOSS-TTS
 * - MOSS-TTS-Nano（mlx-audio）：https://modelscope.cn/models/openmoss/MOSS-TTS-Nano
 */

export type LocalTtsSynthesisInput = {
  text: string;
  speed: number;
  /** 参考音色音频绝对路径（桌面端须对 Python 子进程可读） */
  referenceAudioPath?: string;
  /**
   * 参考音频对应的文本（LongCat 语音克隆时官方示例要求；暂可从大纲扩展，缺省则由服务端按 None 处理）
   */
  referenceText?: string;
};

/** 与 settings `localTts.modelKey` 一致 */
export type LocalTtsBackendModelKey = 'longcat_audio_dit' | 'moss_tts' | string;

/**
 * 构建 POST `/api/v1/tts/{restSegment}` 的 JSON body。
 * 不同后端在当前架构下仍走统一字段名，由 `longcat_audio_dit_server` / `moss_tts_server` 映射到 mlx 真实参数；
 * 若某模型将来需要完全不同的字段，在此处分支即可。
 */
export function buildLocalTtsSynthesisJsonBody(
  modelKey: LocalTtsBackendModelKey,
  input: LocalTtsSynthesisInput,
): Record<string, unknown> {
  const text = stripAudiobookTextForLocalTts(input.text);
  const normalizedKey = modelKey === 'moss_tts_local_mlx' ? 'moss_tts' : modelKey;
  const isMossFamily = normalizedKey === 'moss_tts' || normalizedKey === 'moss_tts_nano';
  const isLongcat = !isMossFamily;
  const body: Record<string, unknown> = {
    text,
    speed: input.speed,
    ...(isLongcat ? { split_text: false } : {}),
  };

  const refPath = input.referenceAudioPath?.trim();
  if (!refPath) return body;

  switch (normalizedKey) {
    case 'moss_tts':
    case 'moss_tts_nano':
      body.referenceAudioPath = refPath;
      if (input.referenceText?.trim()) body.referenceText = input.referenceText.trim();
      return body;
    case 'longcat_audio_dit':
    default:
      body.referenceAudioPath = refPath;
      if (input.referenceText?.trim()) body.referenceText = input.referenceText.trim();
      return body;
  }
}
