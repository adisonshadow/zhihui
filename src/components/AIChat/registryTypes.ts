/**
 * 宿主侧注册类型（业务外置）。
 * 见 docs/06 §13
 *
 * 升级至新架构后新增：
 * - SkillAgentDefinition：业务 Skill Agent 标准化定义
 * - MultiModalToolDefinition：多模态 Tool 定义
 * - Agent uiConfig 相关类型
 * - exposedMultimodalAgents 配置类型
 * 见 docs/AI对话组件全业务逻辑方案（完整修订版）.md §1.3
 */
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';

/** 提示词模版内 slot 声明（语义化 id + 默认值） */
export interface PromptTemplateSlotDef {
  id: string;
  defaultFulltext?: string;
  defaultLabel?: string;
}

/** 语义化唯一 id 的提示词模版；body 支持 {{slot:slotId}} */
export interface PromptTemplateDef {
  id: string;
  /** 限定仅某 Agent 可选用；省略表示不限制 */
  agentKey?: string;
  body: string;
  slots?: PromptTemplateSlotDef[];
}

/** 与 Ant Design X Sender 对齐的可注册槽位 */
export interface RegisterableSenderSlot {
  id: string;
  slot: SlotConfigType;
}

/** applyPromptTemplate 传入的 slot 值：提交用 fulltext，展示用 label */
export interface TemplateSlotValue {
  slotId: string;
  label: string;
  fulltext: string;
}

// ──────────────────────────────────────────────
// 新架构类型：Skill Agent 标准化定义 (§1.3)
// ──────────────────────────────────────────────

/** Agent 类型：skill（业务执行） 或 multimodal（多模态独立包装） */
export type AgentTypeV2 = 'skill' | 'multimodal';

/** Agent UI 配置面板字段定义 */
export interface AgentUIConfigField {
  /** 字段名，如 'aspectRatio' */
  name: string;
  /** 展示标签 */
  label: string;
  /** 字段类型 */
  type: 'select' | 'number' | 'slider' | 'switch' | 'text';
  /** select 类型时提供选项 */
  options?: Array<{ value: string; label: string }>;
  /** 默认值 */
  defaultValue?: string | number | boolean;
  /** 最小值（number/slider） */
  min?: number;
  /** 最大值（number/slider） */
  max?: number;
  /** 步进（number/slider） */
  step?: number;
}

/** Agent UI 配置面板 */
export interface AgentUIConfig {
  /** 是否显示配置面板 */
  showPanel: boolean;
  /** 配置字段列表 */
  fields: AgentUIConfigField[];
}

/**
 * 业务 Skill Agent 标准化定义
 * 对应方案 §1.3「业务Skill Agent定义与注册规范」
 */
export interface SkillAgentDefinition {
  /** 全局唯一标识符（如 novel_writer） */
  agentId: string;
  /** 前端显示名称 */
  agentName: string;
  /** 固定为 'skill' 或 'multimodal' */
  agentType: AgentTypeV2;
  /** 简短描述，供通用 Agent 理解其能力 */
  description: string;
  /** 能力强化提示词模板，支持 {{extra_requirements}} 等变量 */
  skillPromptTemplate: string;
  /** 优先使用的模型 ID 列表（基于能力 Tag 匹配） */
  supportedModels: string[];
  /** 无可匹配模型时的兜底模型 */
  fallbackModel?: string;
  /** 用户手动选中时显示的专属配置区 */
  uiConfig?: AgentUIConfig;
  /** 该 Skill Agent 可直接建议调用的原子 Tool 白名单 */
  allowedTools: string[];
  /** 输入类型：通常为纯文本 */
  inputType: 'text' | 'image_text';
  /** 输出类型 */
  outputType: 'text' | 'image' | 'video' | 'audio';
}

// ──────────────────────────────────────────────
// 新架构类型：多模态 Tool 定义 (§1.3 / §6)
// ──────────────────────────────────────────────

/** 多模态 Tool 定义——每个多模态能力对应一个定义，可被包装为独立 Agent */
export interface MultiModalToolDefinition {
  /** 全局唯一标识符（如 draw_tool） */
  toolId: string;
  /** 展示名称 */
  displayName: string;
  /** 对应 FunctionCallDef.name */
  functionCallName: string;
  /** 简短描述 */
  description: string;
  /** 关联的模型能力 Tag（如 'draw'、'video_generation'） */
  capabilityTag: string;
  /** 暴露为独立 Agent 时的默认配置区字段（§5.5 各 Tool 配置表） */
  defaultUIConfig: AgentUIConfig;
  /** 生成中默认占位样式 */
  defaultPlaceholderStyle?: 'skeleton' | 'waveform' | 'spinner' | 'progress_bar';
  /** 结果渲染组件标识 */
  resultRenderType: 'image' | 'video' | 'audio' | 'dialogue_bubbles';
  /** 输入类型 */
  inputType: 'text' | 'image' | 'image_text';
  /** 输出类型 */
  outputType: 'image' | 'video' | 'audio' | 'text';
}

// ──────────────────────────────────────────────
// 新架构类型：A2UI 统一样式定义 (§1.5 / §4.6)
// ──────────────────────────────────────────────

/** A2UI 统一样式参数（unifiedStyleSchema） */
export interface UnifiedStyleSchema {
  /** 图片最大显示宽度（px），默认 400 */
  imageMaxWidth?: number;
  /** 图片圆角（px），默认 8 */
  imageBorderRadius?: number;
  /** 图片边框 */
  imageBorder?: string;
  /** 图片间距（px），默认 8 */
  imageGap?: number;
  /** 音频播放器宽度（px），默认 320 */
  audioPlayerWidth?: number;
  /** 视频最大宽度（px），默认 400 */
  videoMaxWidth?: number;
  /** 视频圆角（px），默认 8 */
  videoBorderRadius?: number;
  /** 结果卡片间距（px），默认 8 */
  cardGap?: number;
}

/** A2UI 组件配置 */
export interface A2UIConfig {
  /** 是否启用 A2UI 组件展示 Tool 结果 */
  enabled?: boolean;
  /** catalog 路径（本地或远程） */
  catalogPath?: string;
  /** 统一样式参数 */
  unifiedStyleSchema?: UnifiedStyleSchema;
  /** 默认展示方式 */
  defaultDisplayMode?: 'a2ui' | 'thoughtchain';
}

// ──────────────────────────────────────────────
// 新架构类型：页面配置 (§4)
// ──────────────────────────────────────────────

/** exposedMultimodalAgents 声明元素：引用多模态 Tool 暴露为独立 Agent */
export interface ExposedMultimodalAgentDecl {
  /** 要暴露的多模态 Tool 的 toolId */
  toolId: string;
  /** 可选：覆盖默认显示名称 */
  displayNameOverride?: string;
  /** 可选：覆盖默认 UI 配置字段 */
  uiConfigOverride?: AgentUIConfig;
}

// ──────────────────────────────────────────────
// Skill Agent 全局注册表
// ──────────────────────────────────────────────

const _skillAgentRegistry = new Map<string, SkillAgentDefinition>();
const _multimodalToolRegistry = new Map<string, MultiModalToolDefinition>();

/** 注册一个 Skill Agent（幂等） */
export function registerSkillAgent(def: SkillAgentDefinition): void {
  _skillAgentRegistry.set(def.agentId, def);
}

/** 获取所有已注册的 Skill Agent */
export function getAllSkillAgents(): SkillAgentDefinition[] {
  return Array.from(_skillAgentRegistry.values());
}

/** 按 agentId 获取 Skill Agent */
export function getSkillAgent(agentId: string): SkillAgentDefinition | undefined {
  return _skillAgentRegistry.get(agentId);
}

/** Skill 注册 agentId → 内置专家 `AgentConfig.key`（与 `AGENT_PROMPTS_MAP` 对齐） */
const SKILL_AGENT_ID_TO_EXPERT_KEY: Record<string, string> = {
  novel_writer: 'novel',
  novel_idea: 'novel-idea',
  novel_to_script: 'novel-to-script',
  script_writer: 'script',
  music_composer: 'music',
  draw_tool: 'drawer',
};

/** 由 Footer 中选中的 Skill agentId 解析为路由用的 expert `agentKey` */
export function expertKeyFromSkillAgentId(agentId: string): string | undefined {
  const k = SKILL_AGENT_ID_TO_EXPERT_KEY[agentId];
  return k;
}

/** 由当前 expert `agentKey` 反查 Skill agentId（用于 Footer 选中态与配置区） */
export function skillAgentIdFromExpertKey(expertKey: string): string | undefined {
  for (const [id, key] of Object.entries(SKILL_AGENT_ID_TO_EXPERT_KEY)) {
    if (key === expertKey) return id;
  }
  return undefined;
}

/** 注销 Skill Agent */
export function unregisterSkillAgent(agentId: string): void {
  _skillAgentRegistry.delete(agentId);
}

/** 注册一个多模态 Tool 定义（幂等） */
export function registerMultiModalTool(def: MultiModalToolDefinition): void {
  _multimodalToolRegistry.set(def.toolId, def);
}

/** 获取所有已注册的多模态 Tool */
export function getAllMultiModalTools(): MultiModalToolDefinition[] {
  return Array.from(_multimodalToolRegistry.values());
}

/** 按 toolId 获取多模态 Tool 定义 */
export function getMultiModalTool(toolId: string): MultiModalToolDefinition | undefined {
  return _multimodalToolRegistry.get(toolId);
}

/** 从 exposedMultimodalAgents 声明生成 SkillAgentDefinition 列表 */
export function buildExposedMultimodalAgents(
  declarations: ExposedMultimodalAgentDecl[]
): SkillAgentDefinition[] {
  return declarations
    .map((decl) => {
      const tool = _multimodalToolRegistry.get(decl.toolId);
      if (!tool) return null;
      return {
        agentId: tool.toolId,
        agentName: decl.displayNameOverride ?? tool.displayName,
        agentType: 'multimodal' as AgentTypeV2,
        description: tool.description,
        skillPromptTemplate: '',
        supportedModels: [],
        uiConfig: decl.uiConfigOverride ?? tool.defaultUIConfig,
        allowedTools: [tool.functionCallName],
        inputType: tool.inputType,
        outputType: tool.outputType,
      };
    })
    .filter((v): v is SkillAgentDefinition => v !== null);
}

/**
 * 将模版 body 中 {{slot:id}} 替换为 fulltext。
 * 未在 values 中出现的占位尝试使用 slots[].defaultFulltext。
 */
export function renderPromptTemplate(
  template: PromptTemplateDef,
  values: TemplateSlotValue[]
): { fulltext: string; displayLabel: string } {
  const map = new Map(values.map((v) => [v.slotId, v]));
  let body = template.body;
  for (const s of template.slots ?? []) {
    const v = map.get(s.id);
    const text = v?.fulltext ?? s.defaultFulltext ?? '';
    body = body.split(`{{slot:${s.id}}}`).join(text);
  }
  body = body.replace(/\{\{slot:([^}]+)\}\}/g, (_, rawId: string) => {
    const id = String(rawId).trim();
    const v = map.get(id);
    if (v) return v.fulltext;
    const def = template.slots?.find((s) => s.id === id);
    return def?.defaultFulltext ?? '';
  });
  const displayLabel =
    values.length > 0 ? values.map((v) => v.label).join(' · ') : template.id;
  return { fulltext: body, displayLabel };
}
