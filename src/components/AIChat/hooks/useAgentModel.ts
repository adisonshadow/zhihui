/**
 * Agent 模型能力检查
 * 根据 agent 配置检查是否有具备所需能力且已配置的模型
 */
import { useMemo } from 'react';
import type { AIModelConfig } from '@/types/settings';
import type { AgentConfig, AgentModelCheckResult } from '../types';
import { AGENT_CONFIGS, getCapabilityLabel, MAIN_AGENT_KEY } from '../experts';

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

function hasCallableApi(m: AIModelConfig): boolean {
  const urlOk = (m.apiUrl?.trim()?.length ?? 0) > 0;
  if (!urlOk) return false;
  if (m.isLocal === true) return true;
  return (m.apiKey?.trim()?.length ?? 0) > 0;
}

/** 当前 Agent 下可用于请求的模型列表（与首次选用规则一致，便于多模型时切换） */
export function listModelsForAgent(
  models: AIModelConfig[] | undefined,
  agent: AgentConfig
): AIModelConfig[] {
  const list = models ?? [];
  const required = agent.requiredCapabilityKeys ?? [];

  if (agent.key === MAIN_AGENT_KEY && required.length === 0) {
    return list.filter(
      (m) => m.capabilityKeys?.includes('agent_orchestration') && hasCallableApi(m)
    );
  }

  if (required.length === 0) {
    return list.filter(hasCallableApi);
  }

  return list.filter(
    (m) => required.some((cap) => m.capabilityKeys?.includes(cap)) && hasCallableApi(m)
  );
}

function findModelForAgent(
  models: AIModelConfig[] | undefined,
  agent: AgentConfig
): AgentModelCheckResult {
  const list = listModelsForAgent(models, agent);
  const required = agent.requiredCapabilityKeys ?? [];

  if (list.length > 0) {
    return {
      hasValidModel: true,
      model: list[0]!,
      missingCapabilityLabels: [],
    };
  }

  if (agent.key === MAIN_AGENT_KEY && required.length === 0) {
    return {
      hasValidModel: false,
      model: null,
      missingCapabilityLabels: [getCapabilityLabel('agent_orchestration')],
    };
  }

  if (required.length === 0) {
    return {
      hasValidModel: false,
      model: null,
      missingCapabilityLabels: [],
    };
  }

  const fullList = models ?? [];
  const hasCapButNoApi = fullList.find((m) => required.some((cap) => m.capabilityKeys?.includes(cap)));
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
): AgentModelCheckResult & {
  agent: AgentConfig | null;
  mergedAgents: AgentConfig[];
  validModels: AIModelConfig[];
} {
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
        validModels: [],
      };
    }
    const result = findModelForAgent(models, agent);
    const validModels = listModelsForAgent(models, agent);
    return { ...result, agent, mergedAgents, validModels };
  }, [agentKey, models, options?.builtInAgents, options?.extraAgents]);
}
