/**
 * 多模态 AI 供应商配置持久化（见功能文档 3.1、技术文档 3、开发计划 2.3）
 * 存储路径：userData/yiman/ai-settings.json，不提交版本库
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface AIModalityConfig {
  provider?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
}

export interface AISettings {
  text: AIModalityConfig;
  image: AIModalityConfig;
  video: AIModalityConfig;
  audio: AIModalityConfig;
}

const defaultModality = (): AIModalityConfig => ({
  apiUrl: '',
  apiKey: '',
  model: '',
});

const defaultSettings = (): AISettings => ({
  text: { ...defaultModality(), apiUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' },
  image: defaultModality(),
  video: defaultModality(),
  audio: defaultModality(),
});

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
      const parsed = JSON.parse(raw) as Partial<AISettings>;
      return {
        text: { ...defaultModality(), ...defaultSettings().text, ...parsed.text },
        image: { ...defaultModality(), ...defaultSettings().image, ...parsed.image },
        video: { ...defaultModality(), ...defaultSettings().video, ...parsed.video },
        audio: { ...defaultModality(), ...defaultSettings().audio, ...parsed.audio },
      };
    }
  } catch (e) {
    console.error('loadAISettings:', e);
  }
  return defaultSettings();
}

export function saveAISettings(data: AISettings): { ok: boolean; error?: string } {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
