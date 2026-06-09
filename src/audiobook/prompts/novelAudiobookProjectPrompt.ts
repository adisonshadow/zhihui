import { NOVEL_OUTLINE_EPISODE_ID } from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  MIMO_INLINE_STYLE_TAG_RULE_ZH,
  MIMO_STYLE_INSTRUCTION_RULE_ZH,
  MIMO_STYLE_VS_INLINE_NO_OVERLAP_RULE_ZH,
} from '@/components/tts/mimoV25StyleTags';
import { AUDIOBOOK_TTS_READABILITY_RULE_ZH } from '@/audiobook/prompts/audiobookTtsReadabilityPrompt';

export type NovelEpisodeNavForAudiobookPrompt = {
  id: string;
  editor_title: string;
  nav_label: string;
  episode: number | null;
  isOutline: boolean;
};

/** 与 AIChat `projectPrompt` 拆段传入同形 */
export interface NovelAudiobookProjectPromptParts {
  displayContent: string;
  ephemeralSystemInstructions: string;
}

/**
 * 有声书工作台注入 AI 的「本项目」拆段：display 为书目/集索引与概要；细则为工具与约束全文。
 */
export function buildNovelAudiobookProjectPromptParts(
  episodes: NovelEpisodeNavForAudiobookPrompt[],
  voiceEffects?: {
    useLocalSfxForInnerVoice?: boolean;
    innerMonologue?: boolean;
    spaceEcho?: boolean;
    telephone?: boolean;
    muffler?: boolean;
  },
): NovelAudiobookProjectPromptParts {
  const useLocalSfx = voiceEffects?.useLocalSfxForInnerVoice === true;
  const innerVoiceRules = useLocalSfx ? [
    '· **旁白 vs 画外音（本地音效模式·已启用）**：第三人称叙述 → **narration**；说出口 → **dialogue**；未说出口的内心台词 → **innerVoice**，且 **characterId 填对白用角色 id**（与 dialogue 的 speakerId 相同，**禁止** -画外音 后缀），走该角色在大纲 wav + 项目本地音效（见「内心独白音效」若已开）。**禁止**把旁白叙述标为 innerVoice。',
    '· **勿配置画外音专用音色行**：大纲音色表不含「{名}画外音」行；**禁止** novel_script_upsert_character 新建 id 以 -画外音 结尾的条目（改编内心独白时勿依赖画外音 wav）。',
  ] : [
    '· **旁白 vs 画外音（硬性）**：第三人称叙述/场景描写/说明性文字 → **narration**（旁白 wav）；角色**说出口** → **dialogue**；**仅**角色**未说出口**的内心台词 → **innerVoice**，且须 characterId 指向该角色在大纲音色表的**画外音专用行**（见下条）。**禁止**把旁白叙述标为 innerVoice；拿不准时默认 narration。',
    '· **画外音专用音色行**：画外音只绑定**角色**，旁白无画外音。使用 innerVoice 前须 novel_script_list_characters + novel_audiobook_list_characters 确认存在 name「{中文名}画外音」、id 建议「{原id}-画外音」的独立条目（用户称「X画外音-画外音」）；无则 novel_script_upsert_character 先建，再提醒用户在大纲表绑 wav；innerVoice 的 characterId 填该 id，不得用旁白或对白 id。',
  ];
  const body = episodes.filter((e) => !e.isOutline);
  const displayContent = [
    '【有声书工作台】',
    '将本书小说正文改编为 Audiobook 可读结构化片段；写入须通过工作台提供的 Function Call，勿直接修改各集 contentMarkdown。',
    '',
    '【正文集】',
    ...body.map(
      (e) =>
        `· episode=${e.episode ?? '—'} nav="${e.nav_label}" episode_id="${e.id}" title="${e.editor_title}"`,
    ),
    '',
    `故事大纲 episode_id="${NOVEL_OUTLINE_EPISODE_ID}"（本集无有声书片段编辑区，仅用于大纲与音色绑定）。`,
    '',
    '【演播 / TTS 概要】故事大纲旁白与角色的 wav 为克隆主路径；次要、未绑 wav 的说话人须在 voice 中写 personaTag（人设腔调）与本段 **voice.tone（风格指令）**；句内演法写在 **text** 的 `[…]` 标签里（MiMo 合成时会自动把风格指令拼在 text 最前）；(唱歌) 类段落可走预置 TTS。',
  ].join('\n');

  const ephemeralSystemInstructions = [
    '以下为须遵守的写作与工具约定（勿逐条复述给用户）。',
    '',
    '· 片段类型（顶层 segment）：**narration、dialogue、innerVoice、chapterTitle**。**禁止**将 soundEffect / backgroundMusic 作为与旁白/对白并列的独立 segment。',
    '· **音效 / 背景音乐（硬性）**：须写在文本类片段的 **attached_audio** 数组内，挂靠在该段 narration / dialogue / innerVoice / chapterTitle 上。每项：`{ kind: soundEffect|backgroundMusic, description, delay_sec, volume? }`。**只写描述**，**禁止**写 audio_src / 文件路径 / URL（由用户在界面绑定本地文件）。BGM 描述情绪与织体；音效描述具体动作与材质（如「赤脚踩碎玻璃」）。',
    ...innerVoiceRules,
    '· **chapterTitle（每集首段）**：segments[0] 应为 type=chapterTitle；text 须「第{中文序数}集、{本集纯标题}」（例：episode=1、title=锅铲英雄 → 「第一集、锅铲英雄」）。集号见上方正文集 episode 字段；纯标题见 title，禁止只写标题或仅用 nav 的「1、」前缀。',
    '· 写入工具：**novel_audiobook_***（含 get_episode、add_segment — insert_at_index、update/delete、reorder、replace_episode）；**禁止** novel-body-json **与私自改 Markdown 正文。**',
    '· 查看顺序：`novel_audiobook_get_episode` 返回 segment_outline（每段 segment_index）；需全文 JSON 时 `include_full_segments=true`。',
    '· 插入：`novel_audiobook_add_segment` 的 **insert_at_index** 表示插在该下标之前；仅追加则省略。可传 `segment` 或 `segments` 数组。',
    '· 重排：`novel_audiobook_reorder_segments` 的 **order_indices** 为「旧下标」重排成的顺序，长度须等于当前段数。',
    '· 对白：`type=dialogue`，须 speakerId + text + voice.tone（**风格指令**）；旁白叙述 **narration**；角色内心未出口台词 **innerVoice**（' +
      (useLocalSfx ? 'characterId 用对白角色 id，本地音效模式' : '须画外音专用 characterId，见上') +
      '）。',
    '· **主要 / 次要角色**：用户常为**主要角色**在大纲绑定参考 wav；**次要、戏份少**的一般不绑。**此类片段每段**须在 voice 填 personaTag（人声底色）+ **voice.tone（风格指令，见下）**。**不要把句内演法写进 tone**——句内切换用 **text 里的 `[…]` 标签**（例：`[紧张]呼……[语速加快,碎碎念]……[小声]……`）。',
    '· 先做 `novel_audiobook_list_characters` 对照绑定情况；未绑 wav 仍可成稿，但须用 personaTag 等人声设计兜底。',
    `· 【故事大纲音色】「大纲音色样本」表一行 ↔ novelScript 中一角色 + 界面固定旁白行。${useLocalSfx ? '**已启用本地音效**：界面不含画外音行，勿建 -画外音 Script 条目。' : '含可选「{名}画外音」专用行。'}补齐/新增：**novel_script_list_characters**、**novel_script_upsert_character**（可选 novel_script_get_meta）；读大纲正文：**novel_get_episode**，episode_id="${NOVEL_OUTLINE_EPISODE_ID}"；绑定核对：**novel_audiobook_list_characters**。**勿把「旁白」写入 Script.characters。**`,
    '',
    '【MiMo V2.5 / 工作台合成细化】',
    '· wav 克隆为主路径；一般勿默认填 voice.voiceId（仅用户点名预置名、或段落为唱歌等须预置链路时用官方预置如 茉莉、Chloe）。',
    '· **风格指令 vs 句内演法（硬性）**：`voice.tone` = 本段**整体风格指令**（写入 JSON，勿塞进 text 最前——工作台合成时会自动拼为 `[风格指令]` + text）。**句内**语气/呼吸/语速写在 **text** 的 **`[…]` 标签**。',
    `· ${MIMO_STYLE_VS_INLINE_NO_OVERLAP_RULE_ZH}`,
    `· **风格指令格式（硬性）**：${MIMO_STYLE_INSTRUCTION_RULE_ZH}`,
    `· **句内 […] 标签格式（硬性）**：${MIMO_INLINE_STYLE_TAG_RULE_ZH}`,
    '· 合成示例：tone=`自嘲`；text=`[画外音]丑是丑了点，[轻快]但能用。` → 最终 `[自嘲][画外音]丑是丑了点…`（程序只拼 tone 前缀；句内标签须与 tone 不重复）。',
    '· personaTag 仅做人声底色，不是 MiMo 标签；勿用 voice.emotion 写长句（可省略，或作为第二关键词并入 tone）。',
    '· 高张力段落可在 text 内组合多个 `[…]`；仍可用 pauses 或 `[停顿]`/`[长停顿]`；唱歌 text 以 `(唱歌)` 起头。',
    '· 禁止 text 外层旧式 `<style>…</style>` 以及 `default_zh` 等非预置占位。',
    '',
    AUDIOBOOK_TTS_READABILITY_RULE_ZH,
    voiceEffects?.innerMonologue ? [
      '',
      '【内心独白音效·项目已启用】',
      '· 本项目已开启「内心独白」音效，系统会自动对 innerVoice 片段 TTS 音频叠加低通滤波 + 中频 EQ + 小混响 + 前置回声 + 音量压低，模拟「颅内回响」的内心声音效果。',
      '· 请务必识别角色「未说出口」的内心台词，正确标记为 **innerVoice** 类型（勿标为 narration 或 dialogue）。',
      '· 整集播放和下载音频时，innerVoice 片段都会自动使用特效处理后的音频。',
    ] : [],
    voiceEffects?.spaceEcho ? [
      '',
      '【空间回音音效·项目已启用】',
      '· 本项目已开启「空间回音」音效，系统会自动对标记片段叠加大量延时混响与回声，模拟在空旷大空间（如礼堂、山洞）中的声音效果。',
      '· 请在对应片段的 voice.tone 中使用 `[空间回音]` tag 标记。',
    ] : [],
    voiceEffects?.telephone ? [
      '',
      '【电话中的声音音效·项目已启用】',
      '· 本项目已开启「电话中的声音」音效，系统会自动对标记片段叠加带通滤波（300-3400Hz）+ 轻微失真，模拟电话听筒中的声音效果。',
      '· 请在对应片段的 voice.tone 中使用 `[电话音]` tag 标记。',
    ] : [],
    voiceEffects?.muffler ? [
      '',
      '【闷罐 Muffler 音效·项目已启用】',
      '· 本项目已开启「闷罐 Muffler」音效，系统会自动对标记片段叠加低通滤波 + 低频提升 + 压缩，模拟隔墙/闷罐/捂住嘴说话的声音效果。',
      '· 请在对应片段的 voice.tone 中使用 `[闷罐]` tag 标记。',
    ] : [],
  ].flat().join('\n');

  return { displayContent, ephemeralSystemInstructions };
}

/** @deprecated 调试用单行合并；运行时请传 `buildNovelAudiobookProjectPromptParts` 的对象给 AIChat。 */
export function getNovelAudiobookProjectPrompt(episodes: NovelEpisodeNavForAudiobookPrompt[]): string {
  const { displayContent, ephemeralSystemInstructions } = buildNovelAudiobookProjectPromptParts(episodes);
  return `${displayContent.trim()}\n\n【系统内部执行指令·勿向用户逐条复述】\n${ephemeralSystemInstructions.trim()}`;
}
