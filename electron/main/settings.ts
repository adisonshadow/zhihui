/**
 * AI 模型配置持久化（见功能文档 3.1、技术文档 3、开发计划 2.3）
 * 存储路径：userData/yiman/ai-settings.json，不提交版本库
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export interface AIModelConfig {
  id: string;
  name?: string;
  provider?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
  capabilityKeys: string[];
}

export type AIMattingProvider = 'volcengine';

export interface AIMattingConfig {
  id: string;
  name?: string;
  provider: AIMattingProvider;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  enabled?: boolean;
}

export interface AISettings {
  models: AIModelConfig[];
  aiMattingConfigs?: AIMattingConfig[];
}

/** 旧版多模态配置，用于迁移 */
interface LegacyAIModalityConfig {
  provider?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
}

interface LegacyAISettings {
  text?: LegacyAIModalityConfig;
  image?: LegacyAIModalityConfig;
  video?: LegacyAIModalityConfig;
  audio?: LegacyAIModalityConfig;
}

function defaultModel(): AIModelConfig {
  return {
    id: randomUUID(),
    apiUrl: '',
    apiKey: '',
    capabilityKeys: [],
  };
}

function migrateFromLegacy(parsed: LegacyAISettings): AISettings {
  const models: AIModelConfig[] = [];
  const add = (legacy: LegacyAIModalityConfig | undefined, keys: string[]) => {
    if (!legacy) return;
    models.push({
      id: randomUUID(),
      name: undefined,
      provider: legacy.provider,
      apiUrl: legacy.apiUrl ?? '',
      apiKey: legacy.apiKey ?? '',
      model: legacy.model,
      capabilityKeys: keys,
    });
  };
  add(parsed.text, ['script']);
  add(parsed.image, ['draw']);
  add(parsed.video, ['video']);
  add(parsed.audio, ['voice_over', 'music', 'sound_effect']);
  return { models };
}

function getSettingsPath(): string {
  const userData = app.getPath('userData');
  const dir = path.join(userData, 'yiman');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'ai-settings.json');
}

export function loadAISettings(): AISettings {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      // 新版格式：{ models: [...], aiMattingConfigs?: [...] }
      if (Array.isArray(parsed?.models)) {
        const result: AISettings = {
          models: parsed.models.map((m: Partial<AIModelConfig>) => ({
            ...defaultModel(),
            ...m,
            id: m.id || randomUUID(),
            capabilityKeys: Array.isArray(m.capabilityKeys) ? m.capabilityKeys : [],
          })),
        };
        if (Array.isArray(parsed.aiMattingConfigs)) {
          result.aiMattingConfigs = parsed.aiMattingConfigs.map((c: Partial<AIMattingConfig>) => ({
            id: c.id || randomUUID(),
            name: c.name,
            provider: c.provider || 'volcengine',
            accessKeyId: c.accessKeyId ?? '',
            secretAccessKey: c.secretAccessKey ?? '',
            region: c.region ?? 'cn-north-1',
            enabled: c.enabled !== false,
          }));
        }
        return result;
      }
      // 旧版格式：{ text, image, video, audio }
      const migrated = migrateFromLegacy(parsed as LegacyAISettings);
      migrated.aiMattingConfigs = Array.isArray(parsed.aiMattingConfigs)
        ? parsed.aiMattingConfigs.map((c: Partial<AIMattingConfig>) => ({
            ...defaultMattingConfig(),
            ...c,
            id: c.id || randomUUID(),
          }))
        : [];
      return migrated;
    }
  } catch (e) {
    console.error('loadAISettings:', e);
  }
  return {
    models: [
      { ...defaultModel(), apiUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo', capabilityKeys: ['script'] },
    ],
    aiMattingConfigs: [],
  };
}

function defaultMattingConfig(): AIMattingConfig {
  return {
    id: randomUUID(),
    provider: 'volcengine',
    accessKeyId: '',
    secretAccessKey: '',
    region: 'cn-north-1',
    enabled: true,
  };
}

export function saveAISettings(data: AISettings): { ok: boolean; error?: string } {
  try {
    const p = getSettingsPath();
    const toSave: AISettings = {
      models: data.models.map((m) => ({
        id: m.id || randomUUID(),
        name: m.name,
        provider: m.provider,
        apiUrl: m.apiUrl ?? '',
        apiKey: m.apiKey ?? '',
        model: m.model,
        capabilityKeys: Array.isArray(m.capabilityKeys) ? m.capabilityKeys : [],
      })),
      aiMattingConfigs: Array.isArray(data.aiMattingConfigs)
        ? data.aiMattingConfigs.map((c) => ({
            ...defaultMattingConfig(),
            ...c,
            id: c.id || randomUUID(),
            provider: c.provider || 'volcengine',
            accessKeyId: c.accessKeyId ?? '',
            secretAccessKey: c.secretAccessKey ?? '',
            region: c.region ?? 'cn-north-1',
          }))
        : [],
    };
    fs.writeFileSync(p, JSON.stringify(toSave, null, 2), 'utf-8');
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
