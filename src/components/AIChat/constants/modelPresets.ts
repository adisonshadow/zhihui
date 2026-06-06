/**
 * 常见模型一键预设（见功能文档 3.1.3）
 *
 * 结构：① PRESET_META 家族级（apiUrl、docsUrl、defaultModalName / noModalDefaults 等）② 每族 `modals[]` 为变体
 * ③ PRESET_KEY_ORDER 决定「添加常见模型」列表顺序。default* / modelDisplayNameOptions 由 modals 与 defaultModalName 派生。
 */
import type { AIModelConfig } from '@/types/settings';
import type { ModelIOTypeKey, RecommendedModalEntry } from '@/types/recommendedModels';

export type { ModelIOTypeKey } from '@/types/recommendedModels';
import { splitLegacyModelId } from '@/utils/aiModelRequestId';
import {
  VENDOR_KEY_ALIYUN_DASHSCOPE,
  VENDOR_KEY_DEEPSEEK,
  VENDOR_KEY_VOLCENGINE_ARK,
} from '@/utils/vendorApiKey';

/*
 * 阿里云 Qwen3.5-Omni 实时/交互为 WebSocket (wss://)，不在「添加常见模型」中列 variant；需接入时查 DashScope 实时文档。示例 model id:
 *   qwen3.5-omni-flash-realtime、qwen3.5-omni-plus-realtime
 * （另有 Qwen3.5-Omni 多模态实时，见官方实时对话文档。）
 */

interface PresetModalGroupConfig {
  /** 家族在「常见模型」卡片上的展示名 */
  displayName: string;
  description?: string;
  defaultModalName?: string;
  noModalDefaults?: { // 已弃用
    defaultModelDisplayName: string;
    defaultPrimaryVersion: string;
    defaultModel: string;
    /** modals 为空时，卡片能力 / 默认能力来自该条（同 PresetModalConfig） */
    defaultVariant: PresetModalConfig;
  };
  apiUrl?: string;
  docsUrl?: string;
  provider: string;
  modals: PresetModalConfig[];
  isLocal: boolean;
  /** 与 AIModelConfig.vendorKey 一致；同 key 的模型在「添加」时可自动沿用已有 API Key */
  vendorKey?: string;
  usePrimaryVersion?: boolean;
  configOnly?: boolean;
  hideFromAddModal?: boolean;
}

interface PresetModalConfig {
  /** 请求中模型名 / modelDisplayName 段 */
  modalId: string;
  /** 展示用名称 */
  displayName: string;
  description?: string;
  vendorName?: string;
  primaryVersion?: string;
  baseUrl?: string;
  /** 缺省继承家族 */
  apiUrl?: string;
  /** 缺省继承家族 */
  docsUrl?: string;
  capabilityKeys: string[];
  /** 缺省继承家族 */
  isLocal?: boolean;
  configOnly?: boolean;
  hideFromAddModal?: boolean;
  io: {
    input: ModelIOTypeKey[];
    output: ModelIOTypeKey[];
  };
  isWWS?: boolean;
  isSupportThinking?: boolean;
  isSupportStream?: boolean;
  isSupportJSONOutput?: boolean;
  isSupportToolCalls?: boolean;
}

function mergeModalsCapabilityKeys(modals: PresetModalConfig[]): string[] {
  const s = new Set<string>();
  for (const m of modals) {
    for (const k of m.capabilityKeys) s.add(k);
  }
  return [...s];
}

function presetModalToRecommended(m: PresetModalConfig, _g: PresetModalGroupConfig): RecommendedModalEntry {
  return {
    name: m.modalId,
    displayName: m.displayName,
    description: m.description,
    vendorName: m.vendorName,
    primaryVersion: m.primaryVersion,
    baseUrl: m.baseUrl,
    abilityTags: m.capabilityKeys,
    io: { input: [...m.io.input], output: [...m.io.output] },
    isWWS: m.isWWS,
  };
}

const PRESET_META: Record<string, PresetModalGroupConfig> = {
  doubao_seed: {
    displayName: 'Doubao-Seed',
    provider: 'Volcengine Ark',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379/1399009?lang=zh',
    defaultModalName: 'doubao-seed-2-0-lite',
    isLocal: false,
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'doubao-seed-2-0-lite',
        displayName: 'Doubao-Seed-2-0-Lite',
        description:
          '面向高频企业场景兼顾性能与成本的均衡型模型，综合能力超越上一代Doubao-Seed-1.8。胜任非结构化信息处理、内容创作、搜索推荐、数据分析等生产型工作，支持长上下文、多源信息融合、多步指令执行与高保真结构化输出。在保障稳定效果的同时显著优化成本。',
        vendorName: '字节跳动',
        primaryVersion: '260215',
        capabilityKeys: ['action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
      {
        modalId: 'doubao-seed-2-0-mini',
        displayName: 'Doubao-Seed-2-0-Mini',
        description: '面向低时延、高并发与成本敏感场景，提供极致的模型推理速度。模型效果与Doubao-Seed-1.6相当。支持256k上下文、4档思考长度和多模态理解，适合成本和速度优先的轻量级任务。',
        vendorName: '字节跳动',
        primaryVersion: '260215',
        capabilityKeys: ['action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
    ],
  },
  doubao_seed_pro: {
    displayName: 'Doubao-Seed-Pro',
    provider: 'Volcengine Ark',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379/1399009?lang=zh',
    isLocal: false,
    defaultModalName: 'doubao-seed-2-0-pro',
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'doubao-seed-2-0-pro',
        displayName: 'Doubao-Seed-2-0-Pro',
        description:
          '旗舰级全能通用模型，面向 Agent 时代的复杂推理与长链路任务执行场景。强调多模态理解、长上下文推理、结构化生成与工具增强执行。复杂指令与多约束执行能力突出，可稳定应对多步复杂规划、复杂图文推理、视频内容理解与高难度分析等场景。',
        vendorName: '字节跳动',
        primaryVersion: '260215',
        capabilityKeys: ['agent_orchestration', 'action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
    ],
  },
  doubao_seedance: {
    displayName: 'Doubao-Seedance',
    provider: 'Volcengine Ark',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379/2291680?lang=zh',
    isLocal: false,
    defaultModalName: 'doubao-seedance-2-0',
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'doubao-seedance-2-0',
        displayName: 'Doubao-Seedance-2-0',
        description: '豆包大模型团队推出的新一代专业级多模态创作视频模型 Seedance 2.0，支持图像、视频、音频等多模态作为参考输入生成视频，还具备视频编辑、延长等能力，能高精度还原各类细节并稳定角色特征，具备极致拟真的视听稳定性，深度适配商业广告、影视制作与社交媒体营销等各大核心场景',
        vendorName: '字节跳动',
        primaryVersion: '260128',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text', 'image', 'video', 'audio'], output: ['video'] },
      },
      {
        modalId: 'doubao-seedance-2-0-fast',
        displayName: 'Doubao-Seedance-2-0-Fast',
        description: 'Seedance 2.0 fast是豆包大模型团队推出的新一代多模态视频创作模型，它继承了Seedance 2.0模型的核心功能和优势，生成速度更快',
        vendorName: '字节跳动',
        primaryVersion: '260128',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text', 'image', 'video', 'audio'], output: ['video'] },
      },
      {
        modalId: 'doubao-seedance-1-5-pro',
        displayName: 'Doubao-Seedance-1-5-Pro',
        description: '豆包视频生成模型Seedance 1.5 pro 作为全球领先的视频生成模型，可生成音画高精同步的视频内容。支持多人多语言对白，全面覆盖环境音、动作音、合成音、乐器音、背景音及人声，支持首尾帧，实现影视级叙事效果，满足影视、漫剧、电商及广告领域的高阶创作需求',
        vendorName: '字节跳动',
        primaryVersion: '251215',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text', 'image', 'video', 'audio'], output: ['video'] },
      },
    ],
  },
  doubao_seedream: {
    displayName: 'Doubao-Seedream',
    provider: 'Volcengine Ark',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379/1824121?lang=zh',
    isLocal: false,
    defaultModalName: 'doubao-seedream-5-0',
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'doubao-seedream-5-0',
        displayName: 'Doubao-seedream-5-0-lite',
        description: 'Doubao-Seedream-5.0-lite是字节跳动发布的最新图像创作模型。该模型首次搭载联网检索功能，能融合实时网络信息，提升生图时效性。同时，模型的聪明度进一步升级，能够精准解析复杂指令和视觉内容。此外，模型在世界知识广度、参考一致性及专业场景生成质量上均有增强，可更好地满足企业级视觉创作需求。',
        vendorName: '字节跳动',
        primaryVersion: '260128',
        capabilityKeys: ['draw'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
      {
        modalId: 'doubao-seedream-4-5',
        displayName: 'Doubao-Seedream-4-5',
        description: 'Seedream 4.5 是字节跳动最新推出的图像多模态模型，整合了文生图、图生图、组图输出等能力，融合常识和推理能力。相比前代4.0模型生成效果大幅提升，具备更好的编辑一致性和多图融合效果，能更精准的控制画面细节，小字、小人脸生成更自然，图片排版、色彩更和谐，美感提升',
        vendorName: '字节跳动',
        primaryVersion: '251128',
        capabilityKeys: ['draw'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
      {
        modalId: 'doubao-seedream-4-0',
        displayName: 'Doubao-Seedream-4-0',
        description: 'Seedream 4.0 是基于领先架构的SOTA级多模态图像创作模型，其生成美感、指令遵循、结构完整度、主体保持一致性处于世界头部水平。模型采用同一套架构实现文生图与编辑能力的统一，原生支持文本 、单图和多图输入，并能通过对提示词的深度推理，自动适配最优的图像比例尺寸与生成数量，可一次性连续输出最多 15 张内容关联的图像，支持 4K 超高清输出',
        vendorName: '字节跳动',
        primaryVersion: '250828',
        capabilityKeys: ['draw'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
    ],
  },
  doubao_seed_character: {
    displayName: 'Doubao-Seed-Character',
    provider: 'Volcengine Ark',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379/1099504?lang=zh',
    isLocal: false,
    defaultModalName: 'doubao-seed-character',
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'doubao-seed-character',
        displayName: 'Doubao-Seed-Character',
        description: '面向角色扮演与故事叙事场景定向优化，在“叙述能力、剧情调度、虚拟陪伴对话、输出可控性”上做了系统增强，可更稳定地完成单人/多人剧情推进，并提供更细腻的情绪表达与更规范的格式输出。',
        vendorName: '字节跳动',
        primaryVersion: '251128',
        capabilityKeys: ['action_script', 'script', 'novel'],
        isLocal: false,
        io: { input: ['text'], output: ['text'] },
      },
    ],
  },
  doubao_tts: {
    displayName: 'Doubao-语音合成',
    provider: 'ByteDance',
    apiUrl: 'https://openspeech.bytedance.com',
    docsUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-tts-2-0',
    isLocal: false,
    configOnly: true,
    hideFromAddModal: true,
    defaultModalName: 'seed-tts-2.0',
    vendorKey: VENDOR_KEY_VOLCENGINE_ARK,
    modals: [
      {
        modalId: 'seed-tts-2.0', // 其实没有用，这个要定制开发
        displayName: '豆包语音合成2.0-流式',
        description: 'Doubao-语音合成-2.0 是豆包语音在 2024 年 Seed-TTS 基础上的全面升级版本，模型在自然度、情感表现力和场景适配能力上进一步增强，并推出 TTS 对话式合成新范式（Query-Response），可生成更自然、更细腻、更具情感的语音，适用于 AI 交互、听书、内容生产和企业客服等场景。',
        apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream', // https://www.volcengine.com/docs/6561/1719100
        docsUrl: 'https://www.volcengine.com/docs/6561/1257543?lang=zh',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
        isSupportStream: true,
      },
      {
        modalId: 'seed-tts', // 其实没有用，这个要定制开发
        displayName: 'Doubao-语音合成-HTTP',
        description: 'Doubao-语音合成-2.0 是豆包语音在 2024 年 Seed-TTS 基础上的全面升级版本，模型在自然度、情感表现力和场景适配能力上进一步增强，并推出 TTS 对话式合成新范式（Query-Response），可生成更自然、更细腻、更具情感的语音，适用于 AI 交互、听书、内容生产和企业客服等场景。',
        apiUrl: 'https://openspeech.bytedance.com/api/v1/tts',
        docsUrl: 'https://www.volcengine.com/docs/6561/79820?lang=zh',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
        isSupportStream: false,
      },
    ],
  },
  // doubao_music: {
  //   displayName: 'Doubao-音乐大模型',
  //   provider: 'Volcengine Ark',
  //   apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  //   docsUrl: 'https://www.volcengine.com/docs/82379',
  //   isLocal: false,
  //   configOnly: true,
  //   modals: [
  //     {
  //       modalId: 'doubao-music', // 其实没有用，这个要定制开发
  //       displayName: 'Doubao-音乐',
  //       capabilityKeys: ['music'],
  //       isLocal: false,
  //       io: { input: ['text'], output: ['audio'] },
  //     },
  //   ],
  // },
  
  deepseek: {
    displayName: 'DeepSeek-V4',
    provider: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/',
    defaultModalName: 'deepseek-v4-flash',
    isLocal: false,
    usePrimaryVersion: false,
    vendorKey: VENDOR_KEY_DEEPSEEK,
    modals: [
      {
        modalId: 'deepseek-v4-flash',
        displayName: 'DeepSeek-V4-Flash',
        description: '【生成动作脚本、生成剧本、生成执行脚本、通用智能】',
        vendorName: 'DeepSeek',
        capabilityKeys: ['action_script', 'script', 'novel', 'exec_script', 'agent_orchestration'],
        isLocal: false,
        io: { input: ['text'], output: ['text'] },
        isSupportThinking: true,
        isSupportStream: true,
        isSupportJSONOutput: true,
        isSupportToolCalls: true,
      },
      {
        modalId: 'deepseek-v4-pro',
        displayName: 'DeepSeek-V4-Pro',
        description: '【生成动作脚本、生成剧本、生成执行脚本、通用智能】',
        vendorName: 'DeepSeek',
        capabilityKeys: ['action_script', 'script', 'novel', 'exec_script', 'agent_orchestration'],
        isLocal: false,
        io: { input: ['text'], output: ['text'] },
        isSupportThinking: true,
        isSupportStream: true,
        isSupportJSONOutput: true,
        isSupportToolCalls: true,
      },
    ],
  },
  qwen: {
    displayName: 'Qwen-3.6 / Chat',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl:
      'https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope',
    defaultModalName: 'qwen3.6-flash',
    isLocal: false,
    usePrimaryVersion: false,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'qwen3.6-plus',
        displayName: 'Qwen-3.6-Plus',
        description: '【通用智能、生成动作脚本、生成剧本、生成执行脚本】',
        vendorName: '阿里云',
        capabilityKeys: ['agent_orchestration', 'action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
      {
        modalId: 'qwen3.6-flash',
        displayName: 'Qwen-3.6-Flash',
        description: '【通用智能、生成动作脚本、生成剧本、生成执行脚本】',
        vendorName: '阿里云',
        capabilityKeys: ['agent_orchestration', 'action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
      {
        modalId: 'qwen3.6-max-preview',
        displayName: 'Qwen-3.6-Max-Preview',
        description: '【通用智能、生成动作脚本、生成剧本、生成执行脚本】',
        vendorName: '阿里云',
        capabilityKeys: ['agent_orchestration', 'action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text'], output: ['text'] },
      },
    ],
  },
  qwen_omni: {
    displayName: 'Qwen-Omni (HTTP)',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl:
      'https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope',
    isLocal: false,
    usePrimaryVersion: false,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'qwen3.5-omni-flash',
        displayName: 'Qwen-3.5-Omni-Flash',
        description: '【通用智能】',
        vendorName: '阿里云',
        capabilityKeys: ['agent_orchestration'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
      {
        modalId: 'qwen3.5-omni-plus',
        displayName: 'Qwen-3.5-Omni-Plus',
        description: '【通用智能】',
        vendorName: '阿里云',
        capabilityKeys: ['agent_orchestration'],
        isLocal: false,
        io: { input: ['text', 'image', 'video'], output: ['text'] },
      },
    ],
  },
  minimax_music: {
    displayName: 'MiniMax Music',
    provider: 'MiniMax',
    defaultModalName: 'music-2.6',
    isLocal: false,
    configOnly: true,
    modals: [
      {
        modalId: 'music-2.6',
        displayName: 'MiniMax Music',
        apiUrl: 'https://api.minimaxi.com/v1',
        docsUrl: 'https://platform.minimaxi.com/docs/api-reference/music-generation',
        description: 'MiniMax Music 是 MiniMax 推出的一款音乐生成模型，支持音乐生成、音乐编辑、音乐推荐等功能。',
        capabilityKeys: ['music'],
        isLocal: false,
        io: { input: ['text'], output: ['audio'] },
      }
    ],
  },
  qwen_happyhorse_video: {
    displayName: 'Qwen-HappyHorse 视频',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/',
    defaultModalName: 'happyhorse-1.0-t2v',
    isLocal: false,
    usePrimaryVersion: false,
    configOnly: true,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'happyhorse-1.0-r2v',
        displayName: 'HappyHorse-1.0 R2V',
        baseUrl:
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        description: '【生视频】参考图+文本。多模态 HTTP 请求，详见文档。',
        vendorName: '阿里云',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['video'] },
      },
      {
        modalId: 'happyhorse-1.0-video-edit',
        displayName: 'HappyHorse-1.0 Video-Edit',
        baseUrl:
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        description: '【视频编辑】多模态 HTTP 请求。',
        vendorName: '阿里云',
        capabilityKeys: ['video', 'video_edit'],
        isLocal: false,
        io: { input: ['video', 'image'], output: ['video'] },
      },
      {
        modalId: 'happyhorse-1.0-t2v',
        displayName: 'HappyHorse-1.0 T2V',
        baseUrl:
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        description: '【生视频】文生视频。',
        vendorName: '阿里云',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text'], output: ['video'] },
      },
      {
        modalId: 'happyhorse-1.0-i2v',
        displayName: 'HappyHorse-1.0 I2V',
        baseUrl:
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        description: '【生视频】图生视频。',
        vendorName: '阿里云',
        capabilityKeys: ['video'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['video'] },
      },
    ],
  },
  qwen_image: {
    displayName: 'Qwen-Image',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/qwen-image-api',
    isLocal: false,
    usePrimaryVersion: false,
    configOnly: true,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'qwen-image-2.0',
        displayName: 'Qwen-Image-2.0',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        description: '【绘图】多模态 HTTP。',
        vendorName: '阿里云',
        capabilityKeys: ['draw'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
      {
        modalId: 'qwen-image-2.0-pro',
        displayName: 'Qwen-Image-2.0-Pro',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        description: '【绘图】多模态 HTTP。',
        vendorName: '阿里云',
        capabilityKeys: ['draw'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
      {
        modalId: 'qwen-image-edit-max-2026-01-16',
        displayName: 'Qwen-Image-Edit-Max-2026-01-16',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        description: '【绘图、图像编辑】多模态 HTTP，需专用请求体。',
        vendorName: '阿里云',
        capabilityKeys: ['draw', 'image_edit'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
      {
        modalId: 'qwen-image-edit-plus',
        displayName: 'Qwen-Image-Edit-Plus',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        description: '【绘图、图像编辑】多模态 HTTP。',
        vendorName: '阿里云',
        capabilityKeys: ['draw', 'image_edit'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
    ],
  },
  wan_image: {
    displayName: 'Wan-Image',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/wan-image-edit',
    isLocal: false,
    usePrimaryVersion: false,
    configOnly: true,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    defaultModalName: 'wan2.7-image',
    modals: [
      {
        modalId: 'wan2.7-image',
        displayName: 'Wan-2.7-Image',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        description:
          '【绘图、图像编辑、去水印、扩图、变清晰、提取元素、镜头与视角、多图融合、交互式编辑等】参数较复杂，详见 Wan-Image-Edit 官方文档。',
        vendorName: '阿里云',
        capabilityKeys: [
          'draw',
          'image_edit',
          'remove_watermark',
          'image_outpaint',
          'image_clarity',
          'extract_image_elements',
          'image_camera_angle',
          'multi_image_fusion',
          'interactive_image_edit',
          'matting',
        ],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
    ],
  },
  qwen_deepseek: {
    displayName: 'Qwen-DeepSeek (DashScope)',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl:
      'https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope',
    isLocal: false,
    usePrimaryVersion: false,
    defaultModalName: 'deepseek-v4-pro',
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'deepseek-v4-pro',
        displayName: 'DeepSeek-V4-Pro (DashScope)',
        description: '【生成剧本、生成执行脚本、生成动作脚本】OpenAI 兼容，可开 enable_thinking。',
        vendorName: '阿里云',
        capabilityKeys: ['action_script', 'script', 'novel', 'exec_script'],
        isLocal: false,
        io: { input: ['text'], output: ['text'] },
      },
    ],
  },
  qwen_tts: {
    displayName: 'Qwen-TTS',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-tts',
    isLocal: false,
    usePrimaryVersion: false,
    defaultModalName: 'qwen3-tts-flash',
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    modals: [
      {
        modalId: 'qwen3-tts-flash',
        displayName: 'Qwen3-TTS-Flash',
        description: '【配音】同步 HTTP；版本众多，请求/响应形态一致。支持音色复刻→voice id 缓存。',
        vendorName: '阿里云',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'qwen3-tts-instruct-flash',
        displayName: 'Qwen3-TTS-Instruct-Flash',
        description: '【配音】指令控制版',
        vendorName: '阿里云',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'qwen3-tts-vc-2026-01-22',
        displayName: 'Qwen3-TTS 声音复刻',
        description: '【音色复刻】文本描述定制音色（qwen-voice-enrollment API）；合成须使用返回的 voice。',
        vendorName: '阿里云',
        capabilityKeys: ['voice_enrollment'],
        isLocal: false,
        io: { input: ['audio'], output: ['voice'] },
      },
      {
        modalId: 'qwen3-tts-vd-2026-01-26',
        displayName: 'Qwen3-TTS 声音设计',
        description: '【音色设计】文本描述定制音色（qwen-voice-design API）；合成须使用返回的 voice。',
        vendorName: '阿里云',
        capabilityKeys: ['voice_design'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
    ],
  },
  qwen_image_edit: {
    displayName: 'Qwen-Image-Edit (兼容)',
    provider: 'Alibaba DashScope',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/qwen-image-edit-api',
    isLocal: false,
    usePrimaryVersion: false,
    configOnly: true,
    vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
    defaultModalName: 'qwen-image-edit',
    modals: [
      {
        modalId: 'qwen-image-edit',
        displayName: 'Qwen-Image-Edit',
        description: '【绘图、图像编辑】多模态 HTTP。',
        vendorName: '阿里云',
        capabilityKeys: ['draw', 'image_edit'],
        isLocal: false,
        io: { input: ['text', 'image'], output: ['image'] },
      },
    ],
  },
  // cosyvoice: {
  //   displayName: 'CosyVoice',
  //   provider: 'Alibaba DashScope',
  //   apiUrl: 'https://dashscope.aliyuncs.com/api/v1',
  //   docsUrl: 'https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api',
  //   isLocal: false,
  //   usePrimaryVersion: false,
  //   vendorKey: VENDOR_KEY_ALIYUN_DASHSCOPE,
  //   defaultModalName: 'cosyvoice-v3.5-flash',
  //   modals: [
  //     {
  //       modalId: 'cosyvoice-v3.5-flash',
  //       displayName: 'CosyVoice v3.5 Flash',
  //       description: '【配音】WebSocket 流式合成；支持声音设计与复刻。',
  //       vendorName: '阿里云',
  //       capabilityKeys: ['voice_over', 'voice_enrollment', 'voice_design'],
  //       isLocal: false,
  //       io: { input: ['text'], output: ['voice'] },
  //     },
  //     {
  //       modalId: 'cosyvoice-v3.5-plus',
  //       displayName: 'CosyVoice v3.5 Plus',
  //       description: '【配音】高质量版；支持声音设计（voice-enrollment + voice_prompt）。',
  //       vendorName: '阿里云',
  //       capabilityKeys: ['voice_over', 'voice_enrollment', 'voice_design'],
  //       isLocal: false,
  //       io: { input: ['text'], output: ['voice'] },
  //     },
  //   ],
  // },
  xiaomi_mimo_tts: {
    displayName: '小米 MiMo TTS',
    provider: 'Xiaomi MiMo',
    apiUrl: 'https://api.xiaomimimo.com/v1',
    docsUrl: 'https://platform.xiaomimimo.com/#/docs/quick-start/first-api-call',
    isLocal: false,
    usePrimaryVersion: false,
    defaultModalName: 'mimo-v2.5-tts',
    modals: [
      {
        modalId: 'mimo-v2.5-tts',
        displayName: 'MiMo V2.5 预置音色',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'mimo-v2.5-tts-voicedesign',
        displayName: 'MiMo V2.5 音色设计',
        capabilityKeys: ['voice_design'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'mimo-v2.5-tts-voiceclone',
        displayName: 'MiMo V2.5 音色克隆',
        capabilityKeys: ['voice_enrollment'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'mimo-v2-tts',
        displayName: '小米 MiMo TTS（旧版，已映射 V2.5）',
        capabilityKeys: ['voice_over'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
    ],
  },
  minimax_speech: {
    displayName: 'MiniMax Speech',
    provider: 'MiniMax',
    apiUrl: 'https://api.minimaxi.com/v1',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/speech-t2a-http',
    isLocal: false,
    usePrimaryVersion: false,
    defaultModalName: 'speech-2.8-hd',
    modals: [
      {
        modalId: 'speech-2.8-hd',
        displayName: 'MiniMax Speech HD',
        description: '【配音】HTTP 合成；音色设计 / 音色复刻为同账号 API（voice_design、files/upload+voice_clone）。',
        capabilityKeys: ['voice_over', 'voice_enrollment', 'voice_design'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
      {
        modalId: 'speech-2.8-turbo',
        displayName: 'MiniMax Speech Turbo',
        description: '【配音】低延迟版；支持 voice_design / voice_clone API。',
        capabilityKeys: ['voice_over', 'voice_enrollment', 'voice_design'],
        isLocal: false,
        io: { input: ['text'], output: ['voice'] },
      },
    ],
  },
  moss_tts: {
    displayName: 'MOSS-TTS',
    provider: 'OpenMOSS',
    apiUrl: 'http://127.0.0.1:8000/v1',
    docsUrl: 'https://github.com/OpenMOSS/MOSS-TTSD',
    isLocal: true,
    usePrimaryVersion: false,
    modals: [
      {
        modalId: 'moss-ttsd',
        displayName: 'MOSS-TTS',
        capabilityKeys: ['voice_over'],
        isLocal: true,
        io: { input: ['text'], output: ['voice'] },
      },
    ],
  },
  moss_tts_nano: {
    displayName: 'MOSS-TTS-Nano',
    provider: 'OpenMOSS',
    apiUrl: 'http://127.0.0.1:19815/api/v1/tts/MOSS-TTS-Nano',
    docsUrl: 'https://modelscope.cn/models/openmoss/MOSS-TTS-Nano',
    isLocal: true,
    usePrimaryVersion: false,
    modals: [
      {
        modalId: 'moss-tts-nano',
        displayName: 'MOSS-TTS-Nano',
        capabilityKeys: ['voice_over'],
        isLocal: true,
        io: { input: ['text'], output: ['voice'] },
      },
    ],
  },
};

const PRESET_KEY_ORDER: readonly string[] = [
  
  'deepseek',
  'xiaomi_mimo_tts',

  'doubao_seed_pro',
  'doubao_seed',
  'doubao_seedance',
  'doubao_seedream',
  'doubao_seed_character',
  'doubao_tts',
  // 'doubao_music',
  
  'qwen',
  'qwen_omni',
  'qwen_happyhorse_video',
  'qwen_image',
  'wan_image',
  'qwen_deepseek',
  'qwen_tts',
  'qwen_image_edit',
  // 'cosyvoice',
  
  'minimax_speech',
  'minimax_music',

  'moss_tts',
  'moss_tts_nano',

] as const;

export type ModelPreset = {
  presetKey: string;
  displayName: string;
  provider: string;
  apiUrl: string;
  defaultModelDisplayName: string;
  defaultPrimaryVersion: string;
  modelDisplayNameOptions?: string[];
  defaultModel: string;
  capabilityKeys: string[];
  isLocal: boolean;
  docsUrl: string;
  configOnly?: boolean;
  recommendedModals?: RecommendedModalEntry[];
  iconBase64?: string;
  usePrimaryVersion?: boolean;
  hideFromAddModal?: boolean;
  vendorKey?: string;
  isSupportThinking?: boolean;
  isSupportStream?: boolean;
  isSupportJSONOutput?: boolean;
  isSupportToolCalls?: boolean;
};

type PresetMetaEntry = (typeof PRESET_META)[string];

function modelPresetFromParts(presetKey: string, meta: PresetMetaEntry): ModelPreset {
  const usePv = meta.usePrimaryVersion !== false;
  const recommendedModals = meta.modals.map((m) => presetModalToRecommended(m, meta));
  if (recommendedModals.length === 0) {
    const n = meta.noModalDefaults;
    if (!n?.defaultVariant) {
      throw new Error(
        `modelPresets: 预设 ${presetKey} 无变体，请在 PRESET_META 中配置 noModalDefaults.defaultVariant`,
      );
    }
    return {
      presetKey,
      displayName: meta.displayName,
      provider: meta.provider,
      apiUrl: meta.apiUrl ?? '',
      docsUrl: meta.docsUrl ?? '',
      capabilityKeys: mergeModalsCapabilityKeys([n.defaultVariant]),
      isLocal: meta.isLocal,
      defaultModelDisplayName: n.defaultModelDisplayName,
      defaultPrimaryVersion: usePv ? n.defaultPrimaryVersion : '',
      defaultModel: n.defaultModel,
      vendorKey: meta.vendorKey,
      configOnly: meta.configOnly,
      hideFromAddModal: meta.hideFromAddModal,
      usePrimaryVersion: meta.usePrimaryVersion,
    };
  }
  const pickRe = meta.defaultModalName
    ? (recommendedModals.find((m) => m.name === meta.defaultModalName) ?? recommendedModals[0])
    : recommendedModals[0];
  const pickCfg = meta.defaultModalName
    ? (meta.modals.find((m) => m.modalId === meta.defaultModalName) ?? meta.modals[0])
    : meta.modals[0];
  const name = pickRe.name;
  const pv = (pickRe.primaryVersion ?? '').trim();
  const defaultModel = usePv && pv ? `${name}-${pv}` : name;
  return {
    presetKey,
    displayName: meta.displayName,
    provider: meta.provider,
    apiUrl: meta.apiUrl ?? '',
    docsUrl: meta.docsUrl ?? '',
    capabilityKeys: mergeModalsCapabilityKeys(meta.modals),
    isLocal: meta.isLocal,
    defaultModelDisplayName: name,
    defaultPrimaryVersion: usePv ? pv : '',
    modelDisplayNameOptions: recommendedModals.map((m) => m.name),
    defaultModel,
    recommendedModals,
    vendorKey: meta.vendorKey,
    configOnly: meta.configOnly,
    hideFromAddModal: meta.hideFromAddModal,
    usePrimaryVersion: meta.usePrimaryVersion,
    isSupportThinking: pickCfg.isSupportThinking,
    isSupportStream: pickCfg.isSupportStream,
    isSupportJSONOutput: pickCfg.isSupportJSONOutput,
    isSupportToolCalls: pickCfg.isSupportToolCalls,
  };
}


/** 常见模型列表：顺序由 PRESET_KEY_ORDER 决定，内容由 PRESET_META（含 modals）组装 */
export const MODEL_PRESETS: ModelPreset[] = PRESET_KEY_ORDER.map((k) => {
  const meta = PRESET_META[k];
  if (!meta) {
    throw new Error(`modelPresets: PRESET_KEY_ORDER 含未在 PRESET_META 中定义的 key: ${k}`);
  }
  return modelPresetFromParts(k, meta);
});

export const LOCAL_OLLAMA_DEFAULT_API_URL = 'http://127.0.0.1:11434/v1';

export function getPresetFormDefaults(p: ModelPreset): { modelDisplayName: string; primaryVersion: string } {
  const usePv = p.usePrimaryVersion !== false;
  return {
    modelDisplayName: p.defaultModelDisplayName,
    primaryVersion: usePv ? p.defaultPrimaryVersion : '',
  };
}

/** 从已保存模型恢复常见模型表单的 DisplayName / PrimaryVersion */
export function getPresetFormFieldsFromConfig(
  preset: ModelPreset,
  ex: AIModelConfig | undefined,
): { modelDisplayName: string; primaryVersion: string } {
  const def = getPresetFormDefaults(preset);
  if (!ex) return def;
  if (preset.usePrimaryVersion === false) {
    if (ex.modelDisplayName != null && ex.modelDisplayName !== '') {
      return { modelDisplayName: ex.modelDisplayName.trim(), primaryVersion: '' };
    }
    if (ex.model?.trim()) {
      const s = splitLegacyModelId(ex.model);
      return { modelDisplayName: s.modelDisplayName || def.modelDisplayName, primaryVersion: '' };
    }
    return def;
  }
  if (
    (ex.modelDisplayName != null && ex.modelDisplayName !== '') ||
    (ex.primaryVersion != null && ex.primaryVersion !== '')
  ) {
    return {
      modelDisplayName: ex.modelDisplayName?.trim() ?? '',
      primaryVersion: ex.primaryVersion?.trim() ?? '',
    };
  }
  if (ex.model) return splitLegacyModelId(ex.model);
  return def;
}
