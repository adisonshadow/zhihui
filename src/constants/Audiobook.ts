/** 有声书片段类型枚举 */
export enum SegmentType {
    /** 正文朗读（旁白/叙述） */
    Narration = 'narration',
    /** 角色对白 */
    Dialogue = 'dialogue',
    /** 画外音（内心独白） */
    InnerVoice = 'innerVoice',
    /** 章节标题朗读（如“第一章 黎明”） */
    ChapterTitle = 'chapterTitle',
    /** 环境音效 */
    SoundEffect = 'soundEffect',
    /** 背景音乐 */
    BackgroundMusic = 'backgroundMusic',
  }
  
  /** AI 设计的角色音色与说话风格 */
  export interface VoiceConfig {
    /** 关联的角色 ID */
    characterId: string;
    /** 指定使用的音色 ID，不填则继承角色默认音色 */
    voiceId?: string;
    /** 本段整体风格指令（MiMo：1～2 个短关键词，合成时拼在 text 最前为 […]；句内 […] 每标签同样 1～2 个短关键词） */
    tone: string;
    /** 可选第二关键词；写入时会并入 tone，勿写长句 */
    emotion?: string;
    /**
     * 人声底色 / 人设腔调短标签（2～12 字为宜）。
     * 用户往往只给主要角色在「故事大纲」绑参考 wav；次要、戏份少的角色一般不绑，由改编 AI 主动填写本字段以便 TTS（与 tone「本段风格指令」区分）。
     * 例：`中老年男性`、`年轻女声`、`沙哑粗嗓`
     */
    personaTag?: string;
    /** 语速倍数，1.0 为正常，大于1加快 */
    speed?: number;
    /** 音调调整值，0 为默认，正值升高 */
    pitch?: number;
  }
  
  /** 挂靠于文本片段的音效 / 背景音乐（不可与旁白/对白并列成独立 segment） */
  export type AttachedAudioKind = 'soundEffect' | 'backgroundMusic';

  export interface SegmentAttachedAudio {
    id: string;
    kind: AttachedAudioKind;
    /** AI / 用户描述，Tag 展示文案 */
    description: string;
    /** 本段 TTS 开始后延迟（秒） */
    delaySec: number;
    /** 音量 0.1–1 */
    volume: number;
    /** 用户绑定本地文件后的绝对路径（AI 不写） */
    audioSrc?: string;
  }

  /** 停顿设计，可用于片段内部文本或片段之间 */
  export interface Pause {
    /** 停顿发生的位置 */
    position: 'before' | 'after' | 'inline';
    /** 停顿时长（毫秒） */
    durationMs: number;
    /** 当 position 为 inline 时，指示在文本中的字符偏移位置（从0开始） */
    charOffset?: number;
  }
  
  /** 正文朗读片段（叙述性文本） */
  export interface NarrationSegment {
    type: SegmentType.Narration;
    /** 朗读的文本内容 */
    text: string;
    /** 叙述者的音色配置（通常为旁白角色） */
    voice: VoiceConfig;
    /** AI 在文本内或前后设计的停顿 */
    pauses?: Pause[];
    /** 该片段播放前的静音时长（毫秒） */
    preDelayMs?: number;
    /** 该片段播放后的静音时长（毫秒） */
    postDelayMs?: number;
    attachedAudio?: SegmentAttachedAudio[];
    /** 选中的声音效果 key（无特效时为空） */
    voiceEffect?: string;
  }
  
  /** 角色对白片段 */
  export interface DialogueSegment {
    type: SegmentType.Dialogue;
    /** 对白文本 */
    text: string;
    /** 说话的角色 ID */
    speakerId: string;
    /** 说话时的音色与语气 */
    voice: VoiceConfig;
    pauses?: Pause[];
    preDelayMs?: number;
    postDelayMs?: number;
    attachedAudio?: SegmentAttachedAudio[];
    /** 选中的声音效果 key（无特效时为空） */
    voiceEffect?: string;
  }
  
  /** 画外音片段（内心独白） */
  export interface InnerVoiceSegment {
    type: SegmentType.InnerVoice;
    /** 内心独白文本 */
    text: string;
    /** 产生独白的角色 ID */
    characterId: string;
    /** 独白时的音色与语气 */
    voice: VoiceConfig;
    pauses?: Pause[];
    preDelayMs?: number;
    postDelayMs?: number;
    attachedAudio?: SegmentAttachedAudio[];
    /** 选中的声音效果 key（无特效时为空） */
    voiceEffect?: string;
  }
  
  /** 章节标题朗读片段 */
  export interface ChapterTitleSegment {
    type: SegmentType.ChapterTitle;
    text: string;
    voice: VoiceConfig;
    pauses?: Pause[];
    preDelayMs?: number;
    postDelayMs?: number;
    attachedAudio?: SegmentAttachedAudio[];
    /** 选中的声音效果 key（无特效时为空） */
    voiceEffect?: string;
  }
  
  /** 环境音效片段 */
  export interface SoundEffectSegment {
    type: SegmentType.SoundEffect;
    /** 音效资源路径或标识 */
    audioSrc: string;
    /** 从音频文件的开始时间（毫秒） */
    startMs?: number;
    /** 结束时间（毫秒），不填则播放至文件尾 */
    endMs?: number;
    /** 音量（0-1） */
    volume?: number;
    /** 是否循环播放（在片段持续时间内） */
    loop?: boolean;
    preDelayMs?: number;
    postDelayMs?: number;
  }
  
  /** 背景音乐片段 */
  export interface BackgroundMusicSegment {
    type: SegmentType.BackgroundMusic;
    audioSrc: string;
    startMs?: number;
    endMs?: number;
    /** 音量（0-1），通常比音效小 */
    volume?: number;
    /** 淡入时长（毫秒） */
    fadeInMs?: number;
    /** 淡出时长（毫秒） */
    fadeOutMs?: number;
    loop?: boolean;
    preDelayMs?: number;
    postDelayMs?: number;
  }
  
  /** 联合所有音频片段类型 */
  export type AudioSegment =
    | NarrationSegment
    | DialogueSegment
    | InnerVoiceSegment
    | ChapterTitleSegment
    | SoundEffectSegment
    | BackgroundMusicSegment;
  
  /** 有声书中的一集 */
  export interface AudiobookEpisode {
    /** 对应原始小说 Episode.id */
    id: string;
    /** 本集标题（可选） */
    title?: string;
    /** 该集内按时间顺序排列的所有音频片段 */
    segments: AudioSegment[];
  }
  
  /** 完整有声书数据结构 */
  export interface Audiobook {
    episodes: AudiobookEpisode[];
  }