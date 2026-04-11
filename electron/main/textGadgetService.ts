/**
 * 文字组件 preset 服务：从 public/TextGadgets 读取预设配置
 * 见 docs/09-素材面板分类方案 4.5 文字
 */
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface TextGadgetFieldConfig {
  key: string;
  label: string;
  type: 'text';
  defaults: {
    content: string;
    fontSize: number;
    color: string;
    fontFamily: string;
  };
}

export interface TextGadgetPresetConfig {
  id: string;
  name: string;
  description?: string;
  fields: TextGadgetFieldConfig[];
}

export interface TextGadgetPresetItem {
  id: string;
  name: string;
  description?: string;
  config: TextGadgetPresetConfig;
}

function getTextGadgetsBasePath(): string {
  const base = app.isPackaged ? path.join(app.getAppPath(), '..', 'public', 'TextGadgets') : path.join(process.cwd(), 'public', 'TextGadgets');
  return path.normalize(base);
}

/** 列出所有文字组件 preset */
export function getTextGadgetPresets(): TextGadgetPresetItem[] {
  const base = getTextGadgetsBasePath();
  if (!fs.existsSync(base)) return [];
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
  const result: TextGadgetPresetItem[] = [];
  for (const d of dirs) {
    const configPath = path.join(base, d.name, 'config.json');
    if (!fs.existsSync(configPath)) continue;
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw) as TextGadgetPresetConfig;
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
export function getTextGadgetConfig(presetId: string): TextGadgetPresetConfig | null {
  const base = getTextGadgetsBasePath();
  const configPath = path.join(base, presetId, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as TextGadgetPresetConfig;
    return config.id && config.name && Array.isArray(config.fields) ? config : null;
  } catch {
    return null;
  }
}
