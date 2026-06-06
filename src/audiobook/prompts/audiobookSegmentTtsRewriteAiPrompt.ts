/** 「重写选中片段 TTS / 润色风格指令」单次 system 追加（勿向用户复述） */

import {
  MIMO_INLINE_STYLE_TAG_RULE_ZH,
  MIMO_STYLE_INSTRUCTION_RULE_ZH,
  MIMO_STYLE_VS_INLINE_NO_OVERLAP_RULE_ZH,
} from '@/components/tts/mimoV25StyleTags';

export interface AudiobookSegmentTtsRewriteContext {
  episodeId?: string;
  segmentIndex?: number | null;
}

export function buildAudiobookSegmentTtsRewriteEphemeralInstructions(
  ctx?: AudiobookSegmentTtsRewriteContext,
): string {
  const idLine =
    ctx?.episodeId && ctx.segmentIndex != null && ctx.segmentIndex >= 0 ?
      `refIndicator 已给出：episode_id="${ctx.episodeId}"，segment_index=${ctx.segmentIndex}（从 0 起）。**直接调用工具，勿再猜下标。**`
    : '从 refIndicator 解析 episode_id 与 segment_index（#N 对应 segment_index=N-1）。';

  return [
    '【本轮：重写选中片段 TTS · 硬性】',
    idLine,
    '**必须调用工具写入**（优先 `novel_audiobook_rewrite_segment_tts`）。**禁止**仅在回复里展示润色对比。',
    MIMO_STYLE_INSTRUCTION_RULE_ZH,
    MIMO_INLINE_STYLE_TAG_RULE_ZH,
    MIMO_STYLE_VS_INLINE_NO_OVERLAP_RULE_ZH,
    '1) text 须含至少 2 处 `[…]`；正例 tone=`打圆场，温和`，text=`[快速]楚瑶，这是林小棠…[轻声]小棠，这是楚瑶…`（勿写 `[圆场]`）。',
    '2) 工具返回 ok 后简短确认即可，勿贴全文。',
  ].join('\n');
}

const TTS_REWRITE_USER_INTENT_RE =
  /重写选中片段|润色.*风格|润色.*内联|re-design-segment|polish-tone|句内演法|MiMo.*\[|整体风格指令/i;

export function isAudiobookSegmentTtsRewriteUserIntent(message: string): boolean {
  return TTS_REWRITE_USER_INTENT_RE.test((message ?? '').trim());
}
