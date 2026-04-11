/**
 * 脚本特效 preset 服务：从 public/ParticlesGadgets 读取预设配置
 * 见 docs/09-素材面板分类方案 4.4 特效
 */
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface ParticlesGadgetFieldOption {
  value: string;
  label: string;
}

export interface ParticlesGadgetFieldConfig {
  key: string;
  label: string;
  type: 'select' | 'slider';
  options?: ParticlesGadgetFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  defaults: Record<string, string | number>;
}

export interface ParticlesGadgetPresetConfig {
  id: string;
  name: string;
  description?: string;
  renderEntry?: string;
  renderMethod?: string;
  fields: ParticlesGadgetFieldConfig[];
}

export interface ParticlesGadgetPresetItem {
  id: string;
  name: string;
  description?: string;
  config: ParticlesGadgetPresetConfig;
}

function getParticlesGadgetsBasePath(): string {
  const base = app.isPackaged ? path.join(app.getAppPath(), '..', 'public', 'ParticlesGadgets') : path.join(process.cwd(), 'public', 'ParticlesGadgets');
  return path.normalize(base);
}

/** 列出所有脚本特效 preset */
export function getParticlesGadgetPresets(): ParticlesGadgetPresetItem[] {
  const base = getParticlesGadgetsBasePath();
  if (!fs.existsSync(base)) return [];
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
  const result: ParticlesGadgetPresetItem[] = [];
  for (const d of dirs) {
    const configPath = path.join(base, d.name, 'config.json');
    if (!fs.existsSync(configPath)) continue;
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw) as ParticlesGadgetPresetConfig;
      if (config.id && config.name && Array.isArray(config.fields)) {
        result.push({ id: config.id, name: config.name, description: config.description, config });
      }
    } catch {
      /* skip invalid preset */
    }
  }
  return result;
}

/** 获取指定 preset 的 config.json */
export function getParticlesGadgetConfig(presetId: string): ParticlesGadgetPresetConfig | null {
  const base = getParticlesGadgetsBasePath();
  const configPath = path.join(base, presetId, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as ParticlesGadgetPresetConfig;
    return config.id && config.name && Array.isArray(config.fields) ? config : null;
  } catch {
    return null;
  }
}
