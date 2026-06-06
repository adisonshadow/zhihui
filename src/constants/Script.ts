// ==================== 顶层剧本 ====================
export interface Script {
    id: string;
    title: string;                              // 小说名
    author?: string;
    genre: string[];                            // 类型标签，来源于故事大纲
    logline: string;                            // 一句话梗概，来源于故事大纲
    targetContentType?: string;                 // 目标作品类型：漫剧、有声书等
    style: VisualStyle;                         // 视觉风格设定
    targetDuration: number;                     // 目标每集时长（秒）
    characters: Character[];
    episodes: Episode[];
    metadata: ScriptMetadata;
  }
  
  // ==================== 视觉风格 ====================
  export interface VisualStyle {
    artStyle: string;                           // 如 "写实", "日漫", "美漫", "水墨" 等
    colorTone?: string;                         // 色彩基调，如 "暖色", "冷色", "中性色"
    aspectRatio?: string;                       // 画幅比："16:9" 或 "9:16" 竖屏
  }
  
  // ==================== 角色 ====================
  export interface Character {
    id: string;
    name: string;
    aliases?: string[];
    description: string;                        // 简明外貌特征
    personality: string;                        // 性格关键词
    importance: 'MAIN' | 'SECONDARY' | 'MINOR';
    voiceCharacteristic?: string;               // 声线描述（TTS 参考）
    modelReference?: string;                    // 立绘/模型素材路径或ID
    relationships?: CharacterRelation[];
  }
  
  export interface CharacterRelation {
    targetCharacterId: string;
    relation: string;                           // “恋人”“仇敌”“师父”
  }
  
  // ==================== 集 ====================
  export interface Episode {
    id: string;
    episodeIndex: number;                       // 第几集（从1开始）
    title: string;
    logline?: string;                           // 本集钩子
    summary?: string;                           // 本集梗概
    scenes: Scene[];
  }
  
  /** 场景视觉要素（背景/前景/道具等），与漫剧 types/script 的 stage/prop/foreground 项对应 */
  export interface SceneStaging {
    background?: string;                        // 背景、环境、布景
    foreground?: string;                        // 前景层次
    props?: string;                             // 道具与陈设
    lighting?: string;                          // 光线、色调、氛围
  }

  // ==================== 场 ====================
  export interface Scene {
    id: string;
    sceneIndex: number;                         // 场内序号
    heading: string;                            // 标准场标：INT. 办公室 - 日
    location: string;                           // 具体地点
    locationType: 'INT' | 'EXT' | 'INT/EXT';
    timeOfDay: string;                          // 时间描述，“清晨”“黄昏”
    summary?: string;                           // 本场概要
    /** 场景要素：背景、前景、道具、光线等 */
    staging?: SceneStaging;
    charactersInScene: string[];                // 出场角色ID列表
    /**
     * 短剧/漫剧模式下，一个场景只包含一个镜头。
     * 前端界面上可以不显示“镜头”这一层级，直接展示该镜头的内容。
     * 底层仍保留 shots 数组（长度为1），以便未来扩展。
     */
    shots: Shot[];
  }
  
  // ==================== 镜头 ====================
  export interface Shot {
    id: string;
    shotIndex: number;
    shotType: ShotType;
    cameraMovement?: CameraMovement;
    durationEstimate?: number;                  // 预估时长（秒）
  
    /**
     * 简单描述模式：用一段文字综合描述画面动作，
     * AI 生成时优先使用此字段 + dialogues 数组。
     */
    description?: string;
  
    /**
     * 镜头内的对话列表，按时间顺序排列。
     * 每句对话可附带情绪、表演指示及精确时间（可选）。
     */
    dialogues?: ShotDialogue[];
  
    /**
     * 复杂拆解模式：当需要精确控制“动作-台词-动作”卡点时启用。
     * 与 description + dialogues 可共存，渲染引擎可自行选择使用方式。
     */
    beats?: Beat[];
  
    sound?: ShotSound;
    transition?: Transition;
    overlay?: Overlay;                          // 硬字幕/花字叠层
  }
  
  // -------------------- 镜头内对话单元 --------------------
  export interface ShotDialogue {
    characterId: string;
    text: string;
    emotion?: string;                           // 情绪：“愤怒”“宠溺”
    action?: string;                            // 表演指示，如“(低声)”
    isNarration?: boolean;                      // 是否为旁白/内心独白
    startTime?: number;                         // 相对镜头开始的时间（秒）
    duration?: number;                          // 持续时长（秒）
  }
  
  // -------------------- 复杂节拍（用于 beats 数组） --------------------
  export type Beat = ActionBeat | DialogueBeat;
  
  export interface ActionBeat {
    type: 'action';
    text: string;                               // 动作描述
    startTime?: number;
    duration?: number;
    emphasis?: boolean;                         // 是否重点动作（可能加特效）
  }
  
  export interface DialogueBeat {
    type: 'dialogue';
    characterId: string;
    text: string;
    emotion?: string;
    action?: string;
    isNarration?: boolean;
    startTime?: number;
    duration?: number;
  }
  
  // -------------------- 声音设计 --------------------
  export interface ShotSound {
    sfx?: SoundEffect[];
    bgm?: BGM;
    ambiance?: string;                          // 环境音描述
  }
  
  export interface SoundEffect {
    name: string;                               // 音效名
    timing?: 'start' | 'continuous' | 'one_shot';
  }
  
  export interface BGM {
    trackName: string;
    startOffset?: number;                       // 在镜头内的开始时间（秒）
    endOffset?: number;
  }
  
  // -------------------- 转场与叠加 --------------------
  export interface Transition {
    type: TransitionType;
    duration?: number;                          // 秒
    direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  }
  
  export interface Overlay {
    text?: string;                              // 字幕文本
    textStyle?: string;                         // “标题黄字”“手写体”
    position?: 'TOP' | 'BOTTOM' | 'CENTER';
  }
  
  // ==================== 枚举类型 ====================
  export type ShotType =
    | 'EXTREME_LONG'
    | 'LONG'
    | 'MEDIUM'
    | 'CLOSE_UP'
    | 'EXTREME_CLOSE_UP'
    | 'OVER_SHOULDER'
    | 'POV'
    | 'TWO_SHOT'
    | 'GROUP'
    | 'INSERT'
    | 'AERIAL';
  
  export type CameraMovement =
    | 'STATIC'
    | 'PAN'
    | 'TILT'
    | 'ZOOM_IN'
    | 'ZOOM_OUT'
    | 'DOLLY_IN'
    | 'DOLLY_OUT'
    | 'TRACK'
    | 'HANDHELD'
    | 'CRANE';
  
  export type TransitionType =
    | 'CUT'
    | 'FADE'
    | 'DISSOLVE'
    | 'WIPE'
    | 'IRIS';
  
  // ==================== 元数据 ====================
  export interface ScriptMetadata {
    createdBy: string;                          // 生成模型/引擎
    createdAt: string;                          // ISO 时间
    updatedAt: string;
    version: number;
    sourceChapters?: string[];                  // 引用的小说章节
    aiPromptUsed?: string;
    isReviewed: boolean;                        // 是否经过人工审核
  }