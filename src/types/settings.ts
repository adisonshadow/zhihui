/**
 * AI 模型配置类型（见功能文档 3.1）
 * 能力 tag 化：不同模型有不同擅长方向，一个模型可拥有多种能力
 */
export interface CapabilityTag {
  key: string;
  label: string;
}

/** 预设能力 tag（key | label） */
export const CAPABILITY_TAGS: CapabilityTag[] = [
  { key: 'draw', label: '绘图' },
  { key: 'matting', label: '抠图' },
  { key: 'sprite', label: '生成精灵图' },
  { key: 'skeleton_skinning', label: '生成骨骼蒙皮' },
  { key: 'action_script', label: '生成动作脚本' },
  { key: 'script', label: '生成剧本' },
  { key: 'novel', label: '小说创作' },
  { key: 'voice_over', label: '生成配音' },
  { key: 'voice_design', label: '音色设计' },
  { key: 'voice_enrollment', label: '音色复制' },
  { key: 'music', label: '生成音乐' },
  { key: 'sound_effect', label: '生成语音特效' },
  { key: 'exec_script', label: '生成执行脚本' },
  { key: 'video', label: '生视频' },
  { key: 'video_edit', label: '视频编辑' },
  { key: 'image_edit', label: '图像编辑' },
  /** Wan-Image 等可拆分的多能力（可叠加勾选） */
  { key: 'remove_watermark', label: '去水印' },
  { key: 'image_outpaint', label: '扩图' },
  { key: 'image_clarity', label: '图像变清晰' },
  { key: 'extract_image_elements', label: '提取图像元素' },
  { key: 'image_camera_angle', label: '镜头与视角' },
  { key: 'multi_image_fusion', label: '多图融合' },
  { key: 'interactive_image_edit', label: '交互式图像编辑' },
  /** 通用智能 Agent 专属能力 Tag */
  { key: 'agent_orchestration', label: '通用智能' },
];

export interface AIModelConfig {
  id: string;
  name?: string;
  provider?: string;
  apiUrl: string;
  apiKey: string;
  /** 已保存的完整 model（兼容旧版）；有 modelDisplayName 时以 resolveRequestModelId 为准 */
  model?: string;
  /**
   * 服务商控制台上的模型名称/显示名（如 Doubao-Seed3D-2.0 或 API 用 slug），
   * 与 primaryVersion 在请求时组合，避免随版本全量重填一整串 ID
   */
  modelDisplayName?: string;
  /** 易变主版本，如 260328；可单独编辑，请求时与 modelDisplayName 用「-」拼接 */
  primaryVersion?: string;
  /** 能力 tag 的 key 列表，一个模型可拥有多种能力 */
  capabilityKeys: string[];
  /** 常见模型预设 key，自定义模型无此字段（见功能文档 3.1.2） */
  presetKey?: string;
  /**
   * 同一厂商可复用 API Key（如 aliyun_dashscope）；来自常见模型预设，自定义模型通常无
   * @see findReusableApiKeyForPreset
   */
  vendorKey?: string;
  /** 本地部署：可无密钥，请求不带 Authorization（见功能文档 3.1.4） */
  isLocal?: boolean;
  /** MiniMax 音色复刻/上传所需 GroupId（控制台「账户信息」） */
  minimaxGroupId?: string;
}

/** AI 抠图服务提供商（见 docs/AI抠图配置说明.md） */
export type AIMattingProvider = 'volcengine';

/** 单条 AI 抠图配置 */
export interface AIMattingConfig {
  id: string;
  /** 显示名称，可选 */
  name?: string;
  /** 服务提供商，如 volcengine */
  provider: AIMattingProvider;
  /** 火山引擎：Access Key ID */
  accessKeyId: string;
  /** 火山引擎：Secret Access Key */
  secretAccessKey: string;
  /** 火山引擎：区域，如 cn-north-1 */
  region?: string;
  /** 是否启用（可禁用某条配置而不删除） */
  enabled?: boolean;
}

/** 本地 TTS 模型选项 */
export interface LocalTtsModelOption {
  /** 模型 key，用于标识（如 'longcat_audio_dit'） */
  key: string;
  /** 显示名称 */
  label: string;
  /** 模型描述 */
  description?: string;
}

/** 可用本地 TTS 模型列表 */
export const LOCAL_TTS_MODEL_OPTIONS: LocalTtsModelOption[] = [
  {
    key: 'longcat_audio_dit',
    label: 'LongCat-AudioDiT',
    description: '基于 MLX 的高质量语音合成模型，需 Apple Silicon Mac',
  },
  {
    key: 'moss_tts',
    label: 'MOSS-TTS',
    description:
      'OpenMOSS MOSS-TTS 本地推理；可按设备选择合适权重/推理后端（访问方式一致）。需配合 mlx-speech 与模型 README 指引',
  },
  {
    key: 'moss_tts_nano',
    label: 'MOSS-TTS-Nano',
    description:
      'OpenMOSS 轻量多语 TTS（mlx-audio）；须 MLX 权重（非 ModelScope 原版 pytorch_model.bin）。克隆须参考音频 + MOSS-Audio-Tokenizer-Nano',
  },
];

/** 单个本地 TTS 模型的持久化配置 */
export interface LocalTtsModelProfile {
  /** 模型仓库/权重根目录（LongCat：下载目录；MOSS：含 mlx-int8 的上级目录） */
  modelPath: string;
  /** 常驻服务空闲超时（分钟）；默认 3；0 表示永不超时（LongCat/MOSS 均由 Node 侧计时） */
  idleTimeoutMinutes?: number;
  /**
   * MOSS-TTS / MOSS-TTS-Nano：Audio Tokenizer（codec）权重根目录；可与主模型分开下载。
   * 保存后分别注入 YIMAN_MOSS_CODEC_DIR / YIMAN_MOSS_NANO_CODEC_DIR。
   */
  mossAudioTokenizerPath?: string;
  /** 是否启用该模型（默认 false）；仅在启用且配置了路径后才出现在 TTS 下拉中 */
  enabled?: boolean;
}

/** REST 路径段（与 ai-model-service 路由一致） */
export const LOCAL_TTS_MODEL_KEY_TO_REST_SEGMENT: Record<string, string> = {
  longcat_audio_dit: 'LongCat-AudioDiT',
  moss_tts: 'MOSS-TTS',
  /** 旧版设置中的 key，仍路由到同一 MOSS-TTS API */
  moss_tts_local_mlx: 'MOSS-TTS',
  moss_tts_nano: 'MOSS-TTS-Nano',
};

export function restSegmentForLocalTtsModelKey(modelKey: string): string {
  return LOCAL_TTS_MODEL_KEY_TO_REST_SEGMENT[modelKey] ?? 'LongCat-AudioDiT';
}

/** 本地 TTS 总配置 */
export interface LocalTtsConfig {
  enabled: boolean;
  /** 剧本/预览当前选用的模型 key */
  modelKey: string;
  /** 各模型独立配置 */
  profiles: Record<string, LocalTtsModelProfile>;
}

/** 本地音效模型选项 */
export interface LocalSfxModelOption {
  key: string;
  label: string;
  description?: string;
}

/** 可用本地音效模型列表 */
export const LOCAL_SFX_MODEL_OPTIONS: LocalSfxModelOption[] = [
  {
    key: 'moss_sound_effect',
    label: 'MOSS SoundEffect',
    description:
      'OpenMOSS 文本生成环境音/音效（mlx-speech）；需 MLX-4bit 权重与 MOSS-Audio-Tokenizer。ModelScope：mlx-community/MOSS-SoundEffect-MLX-4bit',
  },
];

/** 单个本地音效模型配置 */
export interface LocalSfxModelProfile {
  modelPath: string;
  idleTimeoutMinutes?: number;
  /** MOSS-Audio-Tokenizer 目录（可选，可与 MOSS-TTS 共用） */
  mossAudioTokenizerPath?: string;
  /** Modal 默认生成时长（秒） */
  defaultDurationSeconds?: number;
}

/** REST 路径段（与 ai-model-service 路由一致） */
export const LOCAL_SFX_MODEL_KEY_TO_REST_SEGMENT: Record<string, string> = {
  moss_sound_effect: 'MOSS-SoundEffect',
};

export function restSegmentForLocalSfxModelKey(modelKey: string): string {
  return LOCAL_SFX_MODEL_KEY_TO_REST_SEGMENT[modelKey] ?? 'MOSS-SoundEffect';
}

/** 本地音效总配置 */
export interface LocalSfxConfig {
  enabled: boolean;
  modelKey: string;
  profiles: Record<string, LocalSfxModelProfile>;
}

export function migrateLocalSfxConfig(
  raw: Partial<LocalSfxConfig> | undefined | null,
): LocalSfxConfig | undefined {
  if (raw == null) return undefined;
  const modelKey = raw.modelKey ?? 'moss_sound_effect';
  const profiles: Record<string, LocalSfxModelProfile> = {};
  if (raw.profiles && typeof raw.profiles === 'object') {
    for (const [k, v] of Object.entries(raw.profiles)) {
      if (!v || typeof v !== 'object') continue;
      const p = v as LocalSfxModelProfile;
      const row: LocalSfxModelProfile = {
        modelPath: (p.modelPath ?? '').trim(),
        idleTimeoutMinutes: p.idleTimeoutMinutes ?? 3,
        defaultDurationSeconds: p.defaultDurationSeconds ?? 6,
      };
      const tx = p.mossAudioTokenizerPath?.trim();
      if (tx) row.mossAudioTokenizerPath = tx;
      profiles[k] = row;
    }
  }
  for (const m of LOCAL_SFX_MODEL_OPTIONS) {
    if (!profiles[m.key]) {
      profiles[m.key] = { modelPath: '', idleTimeoutMinutes: 3, defaultDurationSeconds: 6 };
    }
  }
  return {
    enabled: raw.enabled === true,
    modelKey,
    profiles,
  };
}

export function localSfxProfileIsSaved(cfg: LocalSfxConfig | undefined, modelKey: string): boolean {
  return !!cfg?.profiles?.[modelKey]?.modelPath?.trim();
}

/** 旧版扁平字段（迁移用） */
export type LegacyLocalTtsFlat = {
  modelPath?: string;
  idleTimeoutMinutes?: number;
};

/** 将旧版或部分配置规范化为 LocalTtsConfig */
export function migrateLocalTtsConfig(
  raw: (Partial<LocalTtsConfig> & LegacyLocalTtsFlat) | undefined | null,
): LocalTtsConfig | undefined {
  if (raw == null) return undefined;
  const modelKey = raw.modelKey ?? 'longcat_audio_dit';
  const profiles: Record<string, LocalTtsModelProfile> = {};
  if (raw.profiles && typeof raw.profiles === 'object') {
    for (const [k, v] of Object.entries(raw.profiles)) {
      if (!v || typeof v !== 'object') continue;
      const p = v as LocalTtsModelProfile;
      const row: LocalTtsModelProfile = {
        modelPath: (p.modelPath ?? '').trim(),
        idleTimeoutMinutes: p.idleTimeoutMinutes ?? 3,
        enabled: p.enabled === true,
      };
      if (k === 'moss_tts' || k === 'moss_tts_local_mlx' || k === 'moss_tts_nano') {
        const tx = p.mossAudioTokenizerPath?.trim();
        if (tx) row.mossAudioTokenizerPath = tx;
      }
      profiles[k] = row;
    }
  }
  const legacyPath = typeof raw.modelPath === 'string' ? raw.modelPath.trim() : '';
  if (legacyPath && !(profiles[modelKey]?.modelPath ?? '').trim()) {
    profiles[modelKey] = {
      modelPath: legacyPath,
      idleTimeoutMinutes: raw.idleTimeoutMinutes ?? 3,
      enabled: true,
    };
  }
  if (profiles.moss_tts_local_mlx && !profiles.moss_tts) {
    profiles.moss_tts = profiles.moss_tts_local_mlx;
    delete profiles.moss_tts_local_mlx;
  }
  let resolvedModelKey = modelKey;
  if (resolvedModelKey === 'moss_tts_local_mlx') {
    resolvedModelKey = 'moss_tts';
  }
  return {
    enabled: raw.enabled === true,
    modelKey: resolvedModelKey,
    profiles,
  };
}

export function getActiveLocalTtsProfile(cfg: LocalTtsConfig | undefined): LocalTtsModelProfile | undefined {
  if (!cfg?.profiles) return undefined;
  return cfg.profiles[cfg.modelKey];
}

/** 是否已为某模型保存过非空目录（用于 Segmented ✅） */
export function localTtsProfileIsSaved(cfg: LocalTtsConfig | undefined, modelKey: string): boolean {
  const p = cfg?.profiles?.[modelKey]?.modelPath?.trim();
  return !!p;
}

/** 小说编剧配置 */
export interface NovelWriterConfig {
  /** 每次生成封面图片的数量，默认 4 */
  coverImageCount: number;
  /**
   * 作者显示名（可选）。若在设置中填写，封面助手会要求在画面上包含「作者 xxx」样式的署名。
   */
  authorName?: string;
}

/** 有声书：用户收藏的 AI 设计音色（相对 customVoiceSamplesRootDir） */
export interface AudiobookSavedVoiceSample {
  id: string;
  name: string;
  /** 相对 customVoiceSamplesRootDir，如 `.yiman-voices/旁白-阳光.wav` */
  relativePath: string;
  voiceDescription?: string;
  createdAt: string;
}

/** 有声书全局设置（跨小说） */
export interface AudiobookSettings {
  /**
   * @deprecated 旧版单一根目录；读写时若未设 preset/custom 则作为回退
   */
  voiceSamplesRootDir?: string;
  /** 外置音色样本目录（绝对路径）；与内置 PresetVoice/ 合并展示 */
  presetVoiceSamplesRootDir?: string;
  /** 自定义音色样本目录（绝对路径）；AI 生成 wav 写入 `.yiman-voices/` */
  customVoiceSamplesRootDir?: string;
  /** 新建片段或未单独指定时使用的默认 TTS 模型（与片段卡片下拉 value 一致） */
  defaultTtsModelKey?: string;
  /** 「音色设计库」条目，选择样本时置顶 */
  savedVoiceSamples?: AudiobookSavedVoiceSample[];
}

export interface AISettings {
  models: AIModelConfig[];
  /** AI 抠图配置列表（与模型配置分离，因抠图服务非 OpenAI 协议） */
  aiMattingConfigs?: AIMattingConfig[];
  /** 本地 TTS 配置 */
  localTts?: LocalTtsConfig;
  /** 本地音效生成配置 */
  localSfx?: LocalSfxConfig;
  /** 小说编剧配置 */
  novelWriter?: NovelWriterConfig;
  /** 有声书：音色样本目录等 */
  audiobook?: AudiobookSettings;
  /** 小说编剧列表页背景视频文件名（如 bg1.mp4），无背景时为空 */
  novelBgVideo?: string;
  /** 漫剧项目列表页背景视频文件名（如 bg1.mp4），无背景时为空 */
  projectBgVideo?: string;
  /** 有声书项目列表页背景视频文件名（如 bg1.mp4），无背景时为空 */
  audiobookBgVideo?: string;
  /** 实用工具列表页背景视频文件名（如 bg1.mp4），无背景时为空 */
  toolboxBgVideo?: string;
  /** 新建漫剧项目时「本地项目目录」的默认父路径（可选） */
  defaultProjectRoot?: string;
  /** 设计器画布：视口尺寸变化时自动按画布适配缩放（见 CanvasContainer fit） */
  canvasAutoFitViewport?: boolean;
  /**
   * 弹窗遮罩是否使用模糊效果；默认 true（未写入配置时视为开启）
   * 对应 antd Modal / AdaptiveModal：`mask: { blur: true }` 与 `mask: true`
   */
  modalMaskBlur?: boolean;
}
