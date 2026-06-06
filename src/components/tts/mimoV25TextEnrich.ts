import type { Pause } from '@/constants/Audiobook';
import { inferTextLanguageHint } from '@/components/tts/mimoV25PresetVoices';
import {
  buildOverallStyleInstruction,
  detectExistingLeadingStyleTags,
  detectSingIntent,
  keywordsForOverallStylePrefix,
  wrapOverallCnStyleBracket,
} from '@/components/tts/mimoV25StyleTags';

export interface MimoTextEnrichResult {
  text: string;
  hadLeadingStyleApplied: boolean;
  hadPauseInsertions: boolean;
}

/** 是否在 inline 标点处近似插入节拍标签（不改变语义标点） */
function insertInlinePauses(
  raw: string,
  pauses: Pause[] | undefined,
  lang: 'zh' | 'en',
): { text: string; did: boolean } {
  const body = raw.trim();
  if (!body || !pauses?.length) return { text: body, did: false };
  const tagLong = lang === 'en' ? '[long pause]' : '[长停顿]';
  const tagShort = lang === 'en' ? '[pause]' : '[停顿]';
  let out = body;
  let did = false;
  /** 始终在原始 body 上从尾到头插入标签，索引不漂移 */
  const sorted = [...pauses]
    .filter((x) => x.position === 'inline' && typeof x.charOffset === 'number' && x.durationMs >= 80)
    .sort((a, b) => (b.charOffset ?? 0) - (a.charOffset ?? 0));
  for (const p of sorted) {
    const off = Math.max(0, Math.min(body.length, Math.floor(p.charOffset ?? 0)));
    const insert = (p.durationMs ?? 0) >= 800 ? tagLong : tagShort;
    out = `${out.slice(0, off)}${insert}${out.slice(off)}`;
    did = true;
  }
  return { text: out, did };
}

/**
 * 将「待合成的 assistant.content」补上整体风格前缀、唱歌前缀与 inline 节拍标签。
 * voicedesign 路径文档不支持音频括号标签：若 audioTagSupported=false 仅做 trim。
 */
export function enrichMimoAssistantText(input: {
  rawText: string;
  tone?: string;
  emotion?: string;
  pauses?: Pause[];
  /** preset / voiceclone：true；voicedesign：false */
  audioTagSupported?: boolean;
  /** 禁用自动前缀（仍会插 inline pause） */
  autoOverallStyle?: boolean;
}): MimoTextEnrichResult {
  const rawTrim = (input.rawText ?? '').trim();
  if (!input.audioTagSupported) {
    return { text: rawTrim, hadLeadingStyleApplied: false, hadPauseInsertions: false };
  }
  const lang = inferTextLanguageHint(rawTrim);
  const { text: withPauses, did: pauseDid } = insertInlinePauses(rawTrim, input.pauses, lang);

  const wantsSing = detectSingIntent(input.tone, input.emotion, withPauses);
  /** strip 已有 (唱歌) 再判断是否需包风格 */
  const bodyWoSingLead = wantsSing ?
    withPauses.replace(/^\(\s*(唱歌|sing|singing)\s*\)/i, '').trim()
  : withPauses;

  if (detectExistingLeadingStyleTags(withPauses)) {
    return {
      text: withPauses,
      hadLeadingStyleApplied: false,
      hadPauseInsertions: pauseDid,
    };
  }

  const styleInstruction = buildOverallStyleInstruction(input.tone, input.emotion);
  if (styleInstruction && withPauses.startsWith(`[${styleInstruction}]`)) {
    const out = wantsSing ? `(唱歌)${bodyWoSingLead}` : withPauses;
    return {
      text: out,
      hadLeadingStyleApplied: !!wantsSing,
      hadPauseInsertions: pauseDid,
    };
  }

  if (input.autoOverallStyle === false) {
    return {
      text: wantsSing ? `(唱歌)${bodyWoSingLead}` : withPauses,
      hadLeadingStyleApplied: !!wantsSing,
      hadPauseInsertions: pauseDid,
    };
  }

  if (lang === 'en') {
    /** 英文：整体 `(mood)` 较少用；仅以 tone/emotion 作短括号前缀 */
    const k = keywordsForOverallStylePrefix(input.tone, input.emotion);
    /** 映射为简短英文括号较随意；若没有关键词则仅用唱歌 */
    let out = bodyWoSingLead;
    let applied = wantsSing;
    if (k.length) {
      out = `(${k.join(', ')}) ${bodyWoSingLead}`.trim();
      applied = true;
    }
    if (wantsSing) out = `(唱歌)${out}`;
    return { text: out, hadLeadingStyleApplied: applied || pauseDid, hadPauseInsertions: pauseDid };
  }

  /** 中文：voice.tone = 本段整体风格指令 → `[…]` 前缀；句内演法由 text 内 `[…]` 承担 */
  const wrapped = wrapOverallCnStyleBracket(styleInstruction, bodyWoSingLead, wantsSing);
  const hadLeading = Boolean(styleInstruction.trim()) || wantsSing;
  return {
    text: wrapped,
    hadLeadingStyleApplied: hadLeading || pauseDid,
    hadPauseInsertions: pauseDid,
  };
}
