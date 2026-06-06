/**
 * Tool 卡片标记 & 展示模式判定 & ThoughtChain 合并/拆分策略
 *
 * 见方案 §1.4（Tool & ThoughtChain 标准定义）、§4（Tool 展示判定优先级）
 */

const PREFIX = 'YIMAN_TOOL_CARD__';

export function isToolCardContent(content: string | undefined | null): boolean {
  return typeof content === 'string' && content.startsWith(PREFIX);
}

export function getToolCardIdFromContent(content: string): string | null {
  if (!isToolCardContent(content)) return null;
  return content.slice(PREFIX.length);
}

export function makeToolCardAssistantContent(toolId: string): string {
  return `${PREFIX}${toolId}`;
}

// ── 新架构 §4：Tool 展示模式判定 ──

/** Tool 展示模式 */
export type ToolDisplayMode = 'thoughtchain' | 'a2ui';

/** 页面级展示偏好配置 */
export interface ToolDisplayPreferences {
  /** 默认展示方式（页面配置覆盖） */
  defaultMode?: ToolDisplayMode;
  /** simplified: 偏向精简 A2UI；professional: 偏向完整 ThoughtChain */
  preference?: 'simplified' | 'professional';
}

/**
 * 判定 Tool 结果的展示模式（方案 §4 优先级规则）。
 *
 * 优先级（高→低）：
 * 1. 涉及用户交互、多 Tool 串联且需解释、调用报错 → 强制 ThoughtChain
 * 2. 单一 Tool 调用且输出为纯多模态内容 → 优先 A2UI
 * 3. 页面偏好设置覆盖
 */
export function decideToolDisplayMode(
  toolName: string,
  options: {
    /** 是否涉及用户交互（需确认/选择） */
    requiresUserInteraction?: boolean;
    /** 是否有多 Tool 串联 */
    hasSequentialTools?: boolean;
    /** 是否有错误 */
    hasError?: boolean;
    /** 是否单 Tool 调用 */
    isSingleTool?: boolean;
    /** Tool 结果渲染类型 */
    resultType?: 'text' | 'image' | 'video' | 'audio' | 'dialogue';
    /** 页面偏好配置 */
    preferences?: ToolDisplayPreferences;
  },
): ToolDisplayMode {
  const { requiresUserInteraction, hasSequentialTools, hasError, isSingleTool, resultType, preferences } = options;

  // 优先级 1：用户交互 / 多 Tool 串联且需解释 / 报错 → 强制 ThoughtChain
  if (requiresUserInteraction || hasError) return 'thoughtchain';
  if (hasSequentialTools) return 'thoughtchain';

  // 优先级 2：单一 Tool + 纯多模态输出 → A2UI
  if (isSingleTool && (resultType === 'image' || resultType === 'video' || resultType === 'audio')) {
    return 'a2ui';
  }

  // 优先级 3：页面偏好设置覆盖
  if (preferences?.defaultMode === 'a2ui') return 'a2ui';
  if (preferences?.defaultMode === 'thoughtchain') return 'thoughtchain';
  if (preferences?.preference === 'simplified') return 'a2ui';

  // 兜底：纯文本 Tool 结果默认用 ThoughtChain
  return 'thoughtchain';
}

// ── 新架构 §2：ThoughtChain 合并/拆分策略 ──

/** 单次 Tool 调用的执行单元元信息 */
export interface ToolInvocationMeta {
  /** Tool 名称 */
  name: string;
  /** 是否需要在调用前输出文字过渡 */
  requiresTextTransition: boolean;
  /** 是否需要在调用后询问用户 */
  requiresUserQuery: boolean;
  /** 是否需要在调用后展示中间结果 */
  requiresIntermediateDisplay: boolean;
  /** 输出类型 */
  outputType: 'text' | 'image' | 'video' | 'audio';
}

/**
 * ThoughtChain 合并/拆分判定（方案 §2 强制规则）。
 *
 * 返回 true 表示当前 Tool 可以与前一个 Tool 合并到同一条 ThoughtChain。
 * 合并条件：不需要文字过渡 && 不需要询问用户 && 不需要展示中间结果
 */
export function canMergeIntoSameThoughtchain(
  current: ToolInvocationMeta,
  previous: ToolInvocationMeta | null,
): boolean {
  // 第一条 Tool 无前驱，不存在合并问题
  if (!previous) return true;

  // 若当前 Tool 需要文字过渡 → 必须分拆
  if (current.requiresTextTransition) return false;

  // 若当前 Tool 需要询问用户 → 必须分拆
  if (current.requiresUserQuery) return false;

  // 若当前 Tool 需要展示中间结果 → 必须分拆
  if (current.requiresIntermediateDisplay) return false;

  // 若前驱 Tool 有文字输出 → 已形成过渡，不可与后驱合并
  if (previous.requiresTextTransition) return false;

  return true;
}

/**
 * 将一组 Tool 执行计划拆分为多个 ThoughtChain 单元。
 * 每个单元内的 Tool 可以合并执行（满足合并条件），单元间在 UI 上独立展示。
 */
export function splitIntoThoughtchains(
  invocations: ToolInvocationMeta[],
): ToolInvocationMeta[][] {
  const chains: ToolInvocationMeta[][] = [];

  for (const inv of invocations) {
    const lastChain = chains[chains.length - 1];
    const lastInvocation = lastChain ? lastChain[lastChain.length - 1] : null;

    if (!chains.length || !canMergeIntoSameThoughtchain(inv, lastInvocation)) {
      // 新开一条 Chain
      chains.push([inv]);
    } else {
      // 合并到当前 Chain
      lastChain!.push(inv);
    }
  }

  return chains;
}
