/**
 * Agent 模型能力检查
 * 根据 agent 配置检查是否有具备所需能力且已配置的模型
 */
import { useMemo } from 'react';
import type { AIModelConfig } from '@/types/settings';
import type { AgentConfig, AgentModelCheckResult } from '../types';
import { AGENT_CONFIGS, getCapabilityLabel } from '../experts';

export type BuiltInAgentsMode = 'default' | 'none';

export interface UseAgentModelOptions {
  /** 与内置合并，同 key 时 extra 覆盖内置 */
  extraAgents?: AgentConfig[];
  /** `none`：仅使用 extraAgents（可空） */
  builtInAgents?: BuiltInAgentsMode;
}

function mergeAgentConfigs(
  builtIn: BuiltInAgentsMode | undefined,
  extra: AgentConfig[] | undefined
): AgentConfig[] {
  const base = builtIn === 'none' ? [] : AGENT_CONFIGS;
  const map = new Map<string, AgentConfig>();
  for (const a of base) {
    map.set(a.key, a);
  }
  for (const a of extra ?? []) {
    map.set(a.key, a);
  }
  return Array.from(map.values());
}

function findModelForAgent(
  models: AIModelConfig[] | undefined,
  agent: AgentConfig
): AgentModelCheckResult {
  const list = models ?? [];
  const required = agent.requiredCapabilityKeys ?? [];
  const hasApi = (m: AIModelConfig) =>
    (m.apiUrl?.trim()?.length ?? 0) > 0 && (m.apiKey?.trim()?.length ?? 0) > 0;

  // 通用 agent：任意已配置 api 的模型即可
  if (required.length === 0) {
    const valid = list.find(hasApi);
    return {
      hasValidModel: !!valid,
      model: valid ?? null,
      missingCapabilityLabels: [],
    };
  }

  // 优先：具备任一所需能力且已配置 api 的模型
  const valid = list.find(
    (m) =>
      required.some((cap) => m.capabilityKeys?.includes(cap)) && hasApi(m)
  );

  if (valid) {
    return {
      hasValidModel: true,
      model: valid,
      missingCapabilityLabels: [],
    };
  }

  const hasCapButNoApi = list.find((m) =>
    required.some((cap) => m.capabilityKeys?.includes(cap))
  );
  const missingLabels = required.map(getCapabilityLabel);

  return {
    hasValidModel: false,
    model: null,
    missingCapabilityLabels: hasCapButNoApi ? [] : missingLabels,
  };
}

export function useAgentModel(
  agentKey: string | undefined,
  models: AIModelConfig[] | undefined,
  options?: UseAgentModelOptions
): AgentModelCheckResult & { agent: AgentConfig | null; mergedAgents: AgentConfig[] } {
  return useMemo(() => {
    const mergedAgents = mergeAgentConfigs(options?.builtInAgents, options?.extraAgents);
    const agent = mergedAgents.find((e) => e.key === agentKey) ?? null;
    if (!agent) {
      return {
        agent: null,
        hasValidModel: false,
        model: null,
        missingCapabilityLabels: [],
        mergedAgents,
      };
    }
    const result = findModelForAgent(models, agent);
    return { ...result, agent, mergedAgents };
  }, [agentKey, models, options?.builtInAgents, options?.extraAgents]);
}
