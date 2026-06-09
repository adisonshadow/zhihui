/**
 * MiMo 音色克隆 data URL 磁盘缓存
 * 每次 TTS 读取参考音频并编码为 base64 是重复 I/O，缓存到磁盘可复用
 *
 * 缓存路径：userData/yiman/mimo-voice-clone/{md5(文件路径+修改时间)}.json
 * 每次缓存包含：base64 data URL + 元数据（缓存时间、文件大小）
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

function getCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'yiman', 'mimo-voice-clone');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 根据文件路径 + 修改时间生成缓存 key */
function cacheKey(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    const raw = `${filePath}:${stat.mtimeMs}:${stat.size}`;
    return createHash('md5').update(raw).digest('hex');
  } catch {
    return createHash('md5').update(filePath).digest('hex');
  }
}

interface CacheEntry {
  dataUrl: string;
  cachedAt: string;
  fileSize: number;
}

/** 读取缓存 */
export function getMimoVoiceCloneCache(filePath: string): string | null {
  try {
    const dir = getCacheDir();
    const key = cacheKey(filePath);
    const cacheFile = path.join(dir, `${key}.json`);
    if (!fs.existsSync(cacheFile)) return null;

    const raw = fs.readFileSync(cacheFile, 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);

    // 校验文件是否变化
    try {
      const stat = fs.statSync(filePath);
      if (stat.size !== entry.fileSize) {
        fs.unlinkSync(cacheFile);
        return null;
      }
    } catch {
      fs.unlinkSync(cacheFile);
      return null;
    }

    return entry.dataUrl;
  } catch {
    return null;
  }
}

/** 写入缓存 */
export function setMimoVoiceCloneCache(filePath: string, dataUrl: string): void {
  try {
    const dir = getCacheDir();
    const key = cacheKey(filePath);
    const stat = fs.statSync(filePath);
    const entry: CacheEntry = {
      dataUrl,
      cachedAt: new Date().toISOString(),
      fileSize: stat.size,
    };
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(entry), 'utf-8');
  } catch {
    /* 缓存写入失败不阻塞主流程 */
  }
}

/** 清除所有缓存 */
export function clearMimoVoiceCloneCache(): void {
  try {
    const dir = getCacheDir();
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}
