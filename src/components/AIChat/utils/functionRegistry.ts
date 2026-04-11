/**
 * Function Call 注册机制
 * 支持灵活插拔，通过注册机制让不同 Agent/场景挂载不同工具函数。
 * 见功能文档 06 § 7
 */

/** Function 作用域 - 决定哪些 Agent 可使用该工具 */
export type FunctionScope =
  /** 专属某 Agent 调用，只在该 Agent 会话中对模型可见 */
  | { type: 'agent'; agentKey: string }
  /** 具备指定能力的 Agent 均可使用 */
  | { type: 'capability'; keys: string[] }
  /** 仅调度 Agent（Agent 模式）可在专家执行后调用 */
  | { type: 'orchestrator' };

/** Function Call 定义 */
export interface FunctionCallDef<TArgs = Record<string, unknown>, TResult = unknown> {
  /** 与模型返回的 tool_call name 对应 */
  name: string;
  /** 传给模型的描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: object;
  /** 作用域，决定哪些 Agent 可使用 */
  scope: FunctionScope;
  /** 实际处理函数 */
  handler: (args: TArgs) => Promise<TResult>;
  /** Sender 槽位短文案；缺省为 name。见 docs/06 §13.3 */
  senderLabel?: string;
}

/** 内部注册表 */
const _registry: Map<string, FunctionCallDef> = new Map();

/**
 * 注册一个 Function Call。
 * 相同 name 重复注册会覆盖之前的定义（便于热更新/覆盖）。
 */
export function registerFunctionCall(def: FunctionCallDef): void {
  _registry.set(def.name, def);
}

/**
 * 注销一个 Function Call（按 name）。
 */
export function unregisterFunctionCall(name: string): void {
  _registry.delete(name);
}

/**
 * 获取指定 Agent 可用的所有 Function Call（包含 orchestrator 作用域）。
 * 用于在请求模型时附带 tools 列表。
 */
export function getFunctionCallsForAgent(
  agentKey: string,
  capabilityKeys: string[] = []
): FunctionCallDef[] {
  const result: FunctionCallDef[] = [];
  for (const def of _registry.values()) {
    const { scope } = def;
    if (scope.type === 'agent' && scope.agentKey === agentKey) {
      result.push(def);
      continue;
    }
    if (
      scope.type === 'capability' &&
      scope.keys.some((k) => capabilityKeys.includes(k))
    ) {
      result.push(def);
      continue;
    }
  }
  return result;
}

/**
 * 获取调度 Agent（orchestrator）可用的所有 Function Call。
 * 用于 main Agent 在 Agent 模式下的工具列表。
 */
export function getFunctionCallsForOrchestrator(): FunctionCallDef[] {
  const result: FunctionCallDef[] = [];
  for (const def of _registry.values()) {
    if (def.scope.type === 'orchestrator') {
      result.push(def);
    }
  }
  return result;
}

/**
 * 按 name 调用已注册的 Function。
 * 若未找到注册项则抛出错误。
 */
export async function invokeFunctionCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const def = _registry.get(name);
  if (!def) {
    throw new Error(`[FunctionRegistry] 未找到 function: ${name}`);
  }
  return def.handler(args);
}

/**
 * 将已注册的 FunctionCallDef 列表转为传递给模型的 tools 格式（OpenAI 兼容）。
 */
export function toOpenAITools(defs: FunctionCallDef[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: object };
}> {
  return defs.map((d) => ({
    type: 'function' as const,
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  }));
}

/**
 * 获取全部已注册的 Function Call（调试用）。
 */
export function getAllFunctionCalls(): FunctionCallDef[] {
  return Array.from(_registry.values());
}

/**
 * 合并多路 FunctionCall 定义，按 name 去重，**后出现的覆盖先出现的**。
 */
export function mergeFunctionCallDefs(
  ...groups: (FunctionCallDef[] | undefined)[]
): FunctionCallDef[] {
  const m = new Map<string, FunctionCallDef>();
  for (const g of groups) {
    for (const d of g ?? []) {
      m.set(d.name, d);
    }
  }
  return Array.from(m.values());
}
