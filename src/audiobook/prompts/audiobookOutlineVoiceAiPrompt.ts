/**
 * 「大纲音色样本」一键发往 AI Chat：可见气泡 + 仅写入本轮 system 的执行说明。
 * （与组件侧 AIChatEmitUserMessagePayload 同形，避免本文件反向依赖 AIChat。）
 */
import { NOVEL_OUTLINE_EPISODE_ID } from '@/novelDesign/storage/novelWorkspaceStorage';

const OUTLINE_EPISODE_ID = NOVEL_OUTLINE_EPISODE_ID;

export interface AudiobookOutlineVoiceAiEmitParts {
  displayContent: string;
  ephemeralSystemInstructions: string;
}

export interface AudiobookOutlineVoiceAiOptions {
  /** 大纲音色表使用本地音效，不单独配置画外音行 */
  useLocalSfxForInnerVoice?: boolean;
}

/** Switch 切换「使用本地音效」 */
export function buildAudiobookOutlineUseLocalSfxEmit(
  novelTitle: string,
  enabled: boolean,
): AudiobookOutlineVoiceAiEmitParts {
  if (enabled) {
    return {
      displayContent: '使用本地音效',
      ephemeralSystemInstructions: [
        `用户在工作台「大纲音色样本」开启了「使用本地音效」；书名：「${novelTitle}」。`,
        '',
        '执行须知（勿向用户照念）：',
        '1）本项目**不再**在大纲音色表配置「{名}画外音（{id}-画外音）」专用行；界面已隐藏画外音行。',
        '2）改编有声书时：角色未说出口的内心台词仍标 **innerVoice**，但 **characterId 须填对白用角色 id**（与 dialogue 的 speakerId 相同，**禁止**用 -画外音 后缀），音色走该角色在大纲表的 wav；本地内心独白/音效由项目设置叠加。',
        '3）若 novel_script 中已有画外音专用条目，可保留但不需在大纲表绑 wav；**勿再新建**画外音 Script 行。',
        '4）用中文简要确认已切换为本地音效模式，并说明后续改编将按上述约定处理内心独白。',
      ].join('\n'),
    };
  }
  return {
    displayContent: '关闭本地音效',
    ephemeralSystemInstructions: [
      `用户在工作台「大纲音色样本」关闭了「使用本地音效」；书名：「${novelTitle}」。`,
      '',
      '执行须知（勿向用户照念）：',
      '1）恢复画外音专用音色行模式：内心独白须 **innerVoice** + characterId 指向「{原id}-画外音」专用行。',
      '2）novel_script_list_characters + novel_get_episode 核对哪些角色需要画外音；缺失则 novel_script_upsert_character 新建 name「{中文名}画外音」、id「{原id}-画外音」。',
      '3）novel_audiobook_list_characters 后提醒用户在大纲表为画外音行绑定 wav。',
      '4）用中文简要确认已关闭本地音效，并列出建议补齐的画外音行。',
    ].join('\n'),
  };
}

/** 点击「根据故事大纲自动补齐主要角色音色列表」 */
export function buildAudiobookOutlineFillMainCharactersEmit(
  novelTitle: string,
  options?: AudiobookOutlineVoiceAiOptions,
): AudiobookOutlineVoiceAiEmitParts {
  const useLocalSfx = options?.useLocalSfxForInnerVoice === true;
  const innerVoiceStep = useLocalSfx
    ? `   **画外音**：本项目已开启「使用本地音效」，**勿**新建「{名}画外音」专用 Script 行；内心独白改编时用对白角色 id + 本地音效即可。`
    : `   **画外音行**：若大纲或正文存在该角色的内心独白/画外音需求，须**另建**专用条目（与对白行分开）：name=「{中文名}画外音」，id=「{原id}-画外音」（例：liming → liming-画外音）；voice_characteristic 注明画外音/内心独白质感，与对白行区分。`;
  const reportHint = useLocalSfx
    ? '新增/更新了谁，建议用户在界面为哪些主体点「选择样本」（不含画外音行）。'
    : '新增/更新了谁（含画外音行），建议用户在界面为哪些主体点「选择样本」。';
  return {
    displayContent: [
      `【有声书·大纲音色】请根据当前故事大纲，为我自动补齐需要在大纲音色表里单独绑定样本的主要角色。`,
      '',
      `小说书名：「${novelTitle}」`,
      '',
      `请严格按本轮系统内附带的工作台执行步骤调用工具并完成汇报。`,
    ].join('\n'),
    ephemeralSystemInstructions: [
      `用户从有声书工作台「大纲音色样本」发起自动补齐任务；书名：「${novelTitle}」。以下为须遵守的执行步骤（不要逐条复述给用户）。`,
      '',
      `1）novel_get_episode({ episode_id: "${OUTLINE_EPISODE_ID}" }) 阅读故事大纲 Markdown，找出需在「大纲音色样本」表单独成行绑定 wav 的主角与重点配角。不要把路人全盘写入；不要将「旁白」写入 novel_script.characters（界面有固定旁白行）。`,
      `2）novel_script_list_characters（或 novel_script_get_meta 如需顶层梗概）核对已有角色 id/name，避免重复。`,
      `3）对大纲有而列表尚无的角色：novel_script_upsert_character，id 全书唯一（英文或小写缩写），name 用中文称呼；主角 MAIN，重要配角 SECONDARY；写明 description、personality、voice_characteristic（一句话声线/人声底色）。已存在条目勿重复建档；对已存在 MAIN/SECONDARY 若缺少 voice_characteristic 可顺带补充。`,
      `   **大纲风格指令（须写）**：对旁白与每个需在大纲表成行的角色，调用 **novel_audiobook_set_outline_style_instruction** 写入纯文字「风格指令」（1～2 句，描述年龄性别气质与适合场景，例：「温柔知性的女性，30 岁左右，语调平和，适合有声书朗读」）。旁白 target=narrator；角色 target=character + character_id。与 voice_characteristic 可相近但更偏演播/音色设计用语。`,
      innerVoiceStep,
      `4）novel_audiobook_list_characters 核对 audiobook_outline_sample_bound 与 outline_style_instruction，最后用中文简要汇报：${reportHint}`,
      `若大纲过简无法推断：先列出候选与理由，停下写入工具直至用户在下一条确认。`,
    ].join('\n'),
  };
}

/** 点击「增加角色到音色列表」 */
export function buildAudiobookOutlineAddCharacterEmit(
  novelTitle: string,
  options?: AudiobookOutlineVoiceAiOptions,
): AudiobookOutlineVoiceAiEmitParts {
  const useLocalSfx = options?.useLocalSfxForInnerVoice === true;
  const innerVoiceHint = useLocalSfx
    ? '本项目已开启「使用本地音效」，**勿**新增「{名}画外音」专用行；内心独白用对白角色 id 即可。'
    : '若用户要的是**画外音/内心独白**专用行：name 须为「{中文名}画外音」，id 建议「{原角色id}-画外音」，与对白用角色 id 分开。';
  return {
    displayContent: [
      `【有声书·大纲音色】我想把一个新说话人加入到音色列表，请协助我补齐信息并完成写入。`,
      '',
      `小说书名：「${novelTitle}」`,
      '',
      `若本条还没有具体人设，请先向我追问；有足够信息时再按系统内步骤调用工具。`,
    ].join('\n'),
    ephemeralSystemInstructions: [
      `书名：「${novelTitle}」；工作台任务：为大纲音色列表新增角色条目。以下为执行须知（勿向用户照念）。`,
      '',
      `先与用户厘清：常用中文名或称呼、建议唯一 id（英文/拼音缩写）、档位（主角/配角/客串）、简述外貌人设、一句话 voice_characteristic。${innerVoiceHint}`,
      `写入角色后须 **novel_audiobook_set_outline_style_instruction**（target=character, character_id, style_instruction）补全大纲「风格指令」纯文字描述；若新增旁白相关说明亦可用 target=narrator。`,
      `仅当本条用户气泡里已经出现可用的名字与人设信息后：novel_script_list_characters 查重 → novel_script_upsert_character 写入（id 冲突则换新 id 并说明）→ novel_audiobook_list_characters 简报，提醒用户在大纲表中「选择样本」绑定 wav。`,
      `若用户仅点了按钮尚无具体角色：严禁调用写入类工具；可 novel_get_episode / novel_script_list_characters 做现状提示后追问。`,
    ].join('\n'),
  };
}
