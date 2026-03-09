/**
 * Agent 模型能力检查
 * 根据 agent 配置检查是否有具备所需能力且已配置的模型
 */
import { useMemo } from 'react';
import type { AIModelConfig } from '@/types/settings';
import type { AgentConfig, AgentModelCheckResult } from '../types';
import { AGENT_CONFIGS, getCapabilityLabel } from '../experts';

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
  models: AIModelConfig[] | undefined
): AgentModelCheckResult & { agent: AgentConfig | null } {
  return useMemo(() => {
    const agent = AGENT_CONFIGS.find((e) => e.key === agentKey) ?? null;
    if (!agent) {
      return {
        agent: null,
        hasValidModel: false,
        model: null,
        missingCapabilityLabels: [],
      };
    }
    const result = findModelForAgent(models, agent);
    return { ...result, agent };
  }, [agentKey, models]);
}
