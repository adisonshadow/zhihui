/**
 * 素材包（Package）目录与 YAML 解析（见功能文档 5.2、开发计划 2.8）
 * 扫描 assets 下含 YAML 的子目录，解析元信息、状态映射、Tag 映射
 */
import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { getAssetsPath } from './projectDb';

export interface PackageMeta {
  path: string;
  name?: string;
  description?: string;
  type?: string;
  states?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

/** 列出项目 assets 下包含 .yaml/.yml 的子目录路径（相对 assets） */
export function listPackageDirs(projectDir: string): string[] {
  const assetsDir = getAssetsPath(projectDir);
  if (!fs.existsSync(assetsDir)) return [];
  const dirs: string[] = [];
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const subPath = path.join(assetsDir, e.name);
    const files = fs.readdirSync(subPath);
    const hasYaml = files.some((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (hasYaml) dirs.push('assets/' + e.name);
  }
  return dirs;
}

/** 解析素材包目录内的 YAML（取第一个 .yaml/.yml 文件） */
export function parsePackageYaml(projectDir: string, relativeDirPath: string): PackageMeta | null {
  const fullDir = path.join(path.normalize(projectDir), relativeDirPath);
  if (!fs.existsSync(fullDir) || !fs.statSync(fullDir).isDirectory()) return null;
  const files = fs.readdirSync(fullDir);
  const yamlFile = files.find((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (!yamlFile) return null;
  try {
    const content = fs.readFileSync(path.join(fullDir, yamlFile), 'utf8');
    const raw = yaml.load(content) as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') return { path: relativeDirPath, raw: raw ?? {} };
    return {
      path: relativeDirPath,
      name: (raw.name as string) ?? undefined,
      description: (raw.description as string) ?? undefined,
      type: (raw.type as string) ?? undefined,
      states: (raw.states as Record<string, unknown>) ?? undefined,
      tags: (raw.tags as Record<string, unknown>) ?? undefined,
      raw,
    };
  } catch {
    return null;
  }
}

/** 获取所有素材包元信息（见开发计划 2.8，YAML 变更可刷新） */
export function getPackages(projectDir: string): PackageMeta[] {
  const dirs = listPackageDirs(projectDir);
  const result: PackageMeta[] = [];
  for (const d of dirs) {
    const meta = parsePackageYaml(projectDir, d);
    if (meta) result.push(meta);
  }
  return result;
}
