import { describe, expect, it } from 'vitest';
import { filterMusicDesignChatModels } from './musicDesignChatModels';
import type { AIModelConfig } from '@/types/settings';

function m(partial: Partial<AIModelConfig> & Pick<AIModelConfig, 'id'>): AIModelConfig {
  return {
    apiUrl: 'https://api.example.com/v1',
    apiKey: 'k',
    capabilityKeys: [],
    ...partial,
  };
}

describe('filterMusicDesignChatModels', () => {
  it('保留通用智能模型', () => {
    const list = filterMusicDesignChatModels([
      m({ id: '1', capabilityKeys: ['agent_orchestration'] }),
    ]);
    expect(list.map((x) => x.id)).toEqual(['1']);
  });

  it('保留文本能力 tag 模型', () => {
    const list = filterMusicDesignChatModels([m({ id: '2', capabilityKeys: ['novel'] })]);
    expect(list.map((x) => x.id)).toEqual(['2']);
  });

  it('排除纯绘图模型', () => {
    const list = filterMusicDesignChatModels([m({ id: '3', capabilityKeys: ['draw'] })]);
    expect(list).toHaveLength(0);
  });

  it('排除未配置 API 的模型', () => {
    const list = filterMusicDesignChatModels([
      m({ id: '4', apiKey: '', capabilityKeys: ['novel'] }),
    ]);
    expect(list).toHaveLength(0);
  });
});
