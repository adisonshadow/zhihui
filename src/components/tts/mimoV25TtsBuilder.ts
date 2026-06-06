import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import type { Character } from '@/constants/Script';
import type { AudioSegment } from '@/constants/Audiobook';
import { SegmentType } from '@/constants/Audiobook';

export type MimoV25EffectiveModelId =
  | 'mimo-v2.5-tts'
  | 'mimo-v2.5-tts-voicedesign'
  | 'mimo-v2.5-tts-voiceclone';

/** 用户设置里的「模型名称」通常为三选一之一；旧的 mimo-v2-tts → 预置 */
export function normalizeMimoV25StoredModelId(id: string | undefined): MimoV25EffectiveModelId {
  const s = (id ?? '').trim().toLowerCase();
  if (s.includes('voiceclone')) return 'mimo-v2.5-tts-voiceclone';
  if (s.includes('voicedesign')) return 'mimo-v2.5-tts-voicedesign';
  if (!s || s === 'mimo-v2-tts') return 'mimo-v2.5-tts';
  return 'mimo-v2.5-tts';
}

export function coerceMimoApiAudioFormat(
  fmt: string | undefined
): string {
  const f = (fmt ?? 'mp3').trim().toLowerCase();
  if (f === 'pcm') return 'pcm16';
  return f;
}

function segmentChineseLabel(seg: AudioSegment): string {
  switch (seg.type) {
    case SegmentType.Narration:
      return '旁白/叙述朗读';
    case SegmentType.Dialogue:
      return '角色对白';
    case SegmentType.InnerVoice:
      return '内心独白';
    case SegmentType.ChapterTitle:
      return '章节标题朗读';
    default:
      return '语音片段';
  }
}

/** 【导演模式】结构化 user.content：自然语言控制 + 角色/场景/指导 */
export function buildMimoDirectorUserContent(input: {
  segment?: AudioSegment;
  character?: Character | null;
  /** 有声书 narration 的常见旁白口吻 */
  narratorHint?: string;
  /** user 手写覆盖追加 */
  extraFromParams?: string;
}): string {
  const blocks: string[] = [];
  const seg = input.segment;
  const ch = input.character ?? undefined;

  const scene = seg ? `${segmentChineseLabel(seg)}。` : '语音合成片段。';

  /** 场景 / 上下文 */
  if (seg && 'voice' in seg) {
    const v = seg.voice;
    const tone = v.tone?.trim();
    const emotion = v.emotion?.trim();
    const speed = typeof v.speed === 'number' && !Number.isNaN(v.speed) ? v.speed : undefined;
    const sceneTxt = `${scene}${ch ? `角色：「${ch.name}」。` : ''}`;
    blocks.push(`【场景】\n${sceneTxt}`);
    blocks.push(`【角色】`);
    const roleLines: string[] = [];
    const persona = v.personaTag?.trim();
    if (persona) roleLines.push(`人设腔调（人声底色）：${persona}。`);
    if (ch?.description?.trim()) roleLines.push(ch.description.trim());
    if (ch?.personality?.trim()) roleLines.push(`性格：${ch.personality.trim()}。`);
    if (ch?.voiceCharacteristic?.trim()) roleLines.push(`剧本声线参考：${ch.voiceCharacteristic.trim()}。`);
    if (!roleLines.length) roleLines.push(ch ? `${ch.name}，按台词自然演绎。` : '按文本自然朗读。');
    blocks.push(roleLines.join('\n'));
    /** 导演指导 */
    const guide: string[] = [];
    guide.push(`用自然语言表演的语气念出 assistant 正文；正文可能含括号/方括号音频标签（除非使用纯音色描述模型）。`);
    if (emotion) guide.push(`整体情绪底色：${emotion}。`);
    if (persona) guide.push(`保持人声底色与人设腔调标签「${persona}」一致，勿与下一条本段演法混写。`);
    if (tone) guide.push(`本段语气与演法：${tone}。`);
    if (typeof speed === 'number' && Math.abs(speed - 1) > 1e-3) {
      guide.push(
        speed > 1 ? `语速略快（约 ×${speed.toFixed(2)}）；用更密集的吐字模拟。` :
          `语速略慢（约 ×${speed.toFixed(2)}）；吐字更清晰、留白略多。`,
      );
    }
    if (input.narratorHint?.trim()) guide.push(input.narratorHint.trim());

    blocks.push(`【指导】\n${guide.join('\n')}`);
  }

  /** 兜底：无任何片段信息 */
  if (blocks.length === 0) {
    blocks.push('【指导】自然地朗读 assistant 正文，贴合语气标签与标点停顿。');
  }

  if (input.extraFromParams?.trim()) {
    blocks.push(`【附加说明】\n${input.extraFromParams.trim()}`);
  }

  return blocks.join('\n\n').trim();
}

export interface BuildMimoV25BodyInput {
  modelFromSettings: AIModelConfig;
  assistantContentEnriched: string;
  params: Record<string, unknown>;
  segment?: AudioSegment;
  scriptCharacter?: Character | null;
  /** 已由路由填入 */
  effectiveModelId?: MimoV25EffectiveModelId;
  presetVoiceFallback?: string;
  voiceCloneDataUrl?: string;
  voiceDesignPrompt?: string;
}

/**
 * MiMo V2.5：`user` = 音色/导演；`assistant` = 正文含音频标签。（禁止 role=system）
 */
export function buildMimoV25ChatBodyParts(inp: BuildMimoV25BodyInput): {
  model: string;
  messages: Array<{ role: string; content: string }>;
  audio: Record<string, unknown>;
} {
  const m = inp.modelFromSettings;
  const savedSlug = resolveRequestModelId(m) ?? '';
  let modelId = inp.effectiveModelId ?? normalizeMimoV25StoredModelId(savedSlug);
  /** 可被 params 运行时覆盖（有声书克隆） */
  const paramOverride =
    typeof inp.params.mimoEffectiveModelId === 'string' ? inp.params.mimoEffectiveModelId.trim() : '';
  if (
    paramOverride === 'mimo-v2.5-tts-voiceclone' ||
    paramOverride === 'mimo-v2.5-tts-voicedesign' ||
    paramOverride === 'mimo-v2.5-tts'
  ) {
    modelId = paramOverride as MimoV25EffectiveModelId;
  }

  const fmt = coerceMimoApiAudioFormat(typeof inp.params.format === 'string' ? inp.params.format : 'mp3');
  let userContent =
    typeof inp.params.mimoUserPrompt === 'string' && inp.params.mimoUserPrompt.trim() ?
      inp.params.mimoUserPrompt.trim()
    : '';

  /** 运行时注入的导演大块（有声书 synthesize） */
  const injectedDir =
    typeof inp.params.mimoDirectorUserContent === 'string' && inp.params.mimoDirectorUserContent.trim() ?
      inp.params.mimoDirectorUserContent.trim()
    : '';

  if (modelId === 'mimo-v2.5-tts-voiceclone') {
    /**
     * MiMo 克隆为无状态内联：每次请求把参考 wav 写入 audio.voice（data URL），
     * 接口不返回可复用 voice id，故不走 remoteVoiceIdCache（见 ensureRemoteVoiceId）。
     */
    const cloneUrl =
      inp.voiceCloneDataUrl ??
      (typeof inp.params.mimoVoiceCloneDataUrl === 'string' ? inp.params.mimoVoiceCloneDataUrl.trim() : '');
    const handwritten = inp.params.mimoUserPrompt?.toString().trim() ?? '';

    /** user：导演；若手写 mimoUserPrompt 则其与导演拼接 */
    const dir = buildMimoDirectorUserContent({
      segment: inp.segment,
      character: inp.scriptCharacter ?? null,
      narratorHint:
        inp.segment?.type === SegmentType.Narration || inp.segment?.type === SegmentType.ChapterTitle ?
          '有声书叙述：稳定、连贯、口齿清晰；情绪随正文标签起伏。'
        : undefined,
      extraFromParams: undefined,
    });
    const baseParts = [];
    if (injectedDir) baseParts.push(injectedDir.trim());
    baseParts.push(dir);
    userContent =
      handwritten ? `${baseParts.join('\n\n')}\n\n【附加指令】\n${handwritten}` : baseParts.join('\n\n');

    const audio: Record<string, unknown> = { format: fmt, voice: cloneUrl || '' };
    return {
      model: modelId,
      audio,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: inp.assistantContentEnriched },
      ],
    };
  }

  if (modelId === 'mimo-v2.5-tts-voicedesign') {
    const design =
      inp.voiceDesignPrompt ??
      (typeof inp.params.mimoVoiceDesignPrompt === 'string' ? inp.params.mimoVoiceDesignPrompt.trim() : '') ??
      '';

    /** 第一段：音色卡；第二段：表演指导 */
    const dir = buildMimoDirectorUserContent({
      segment: inp.segment,
      character: inp.scriptCharacter ?? null,
      extraFromParams: userContent || undefined,
    });
    userContent =
      design ?
        `${design}\n\n【表演与语境】\n${injectedDir ? `${injectedDir}\n\n` : ''}${dir}`
      : `${injectedDir ? `${injectedDir}\n\n` : ''}${dir}`;

    const opt =
      typeof inp.params.mimoOptimizeTextPreview === 'boolean' ? inp.params.mimoOptimizeTextPreview : false;

    const audio: Record<string, unknown> = { format: fmt };
    if (opt === true) audio.optimize_text_preview = true;

    return {
      model: modelId,
      audio,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: inp.assistantContentEnriched },
      ],
    };
  }

  /** 预置音色 */
  const preset =
    (typeof inp.params.voice === 'string' && inp.params.voice.trim() ? inp.params.voice.trim() : '') ||
    (inp.presetVoiceFallback ?? '茉莉');

  const dir = buildMimoDirectorUserContent({
    segment: inp.segment,
    character: inp.scriptCharacter ?? null,
    narratorHint:
      inp.segment?.type === SegmentType.Narration || inp.segment?.type === SegmentType.ChapterTitle ?
        '有声书叙述：稳定、语感自然。'
      : undefined,
    extraFromParams:
      inp.params.mimoUserPrompt?.toString().trim() ? String(inp.params.mimoUserPrompt).trim() : undefined,
  });
  userContent = injectedDir ? `${injectedDir}\n\n${dir}` : dir;

  const audio: Record<string, unknown> = { format: fmt, voice: preset };
  return {
    model: 'mimo-v2.5-tts',
    audio,
    messages: [
      { role: 'user', content: userContent },
      { role: 'assistant', content: inp.assistantContentEnriched },
    ],
  };
}
