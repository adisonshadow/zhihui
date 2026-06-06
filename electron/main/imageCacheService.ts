/**
 * 图片缓存服务 — 将远程图片下载到本地磁盘，后续展示优先读缓存
 *
 * 存储位置：{userData}/yiman/image-cache/{sha256}.{ext}
 * 缓存键：图片 URL 的 SHA256 哈希
 * 自动清理暂不实现；缓存文件较小（单张 <10MB），可长期保留
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const CACHE_DIR_NAME = 'image-cache';

/** 缓存目录完整路径 */
let cacheDir: string | null = null;

function getCacheDir(): string {
  if (cacheDir) return cacheDir;
  const userData = app.getPath('userData');
  cacheDir = path.join(userData, 'yiman', CACHE_DIR_NAME);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/** 从 URL 或 Content-Type 推断文件扩展名 */
function inferExtension(url: string, contentType?: string): string {
  // 优先从 Content-Type 推断
  if (contentType) {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
    };
    if (map[contentType]) return map[contentType];
  }

  // 回退从 URL 扩展名推断
  try {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase().split('?')[0];
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch {
    // URL 解析失败，用默认
  }

  return '.png'; // 默认
}

/**
 * 计算 URL 的 SHA256 哈希作为缓存文件名
 */
function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * 获取缓存文件路径（不检查是否存在）
 */
function getCachedFilePath(url: string, ext?: string): string {
  const hash = hashUrl(url);
  const finalExt = ext || inferExtension(url);
  return path.join(getCacheDir(), `${hash}${finalExt}`);
}

/**
 * 下载远程图片并保存到本地缓存
 * @returns 缓存文件的绝对路径
 */
export async function cacheImage(remoteUrl: string): Promise<string> {
  // 先判断扩展名：用远程 Content-Type，也可从 URL 推断
  // 先 HEAD 一下获取 Content-Type（不下载 body），减少体积
  let ext: string;
  try {
    const headRes = await fetch(remoteUrl, { method: 'HEAD' });
    ext = inferExtension(remoteUrl, headRes.headers.get('content-type') ?? undefined);
  } catch {
    ext = inferExtension(remoteUrl);
  }

  const cachePath = getCachedFilePath(remoteUrl, ext);

  // 已缓存 → 直接返回
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  // 下载图片
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`图片下载失败: HTTP ${res.status} — ${remoteUrl.slice(0, 120)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 写入缓存
  fs.writeFileSync(cachePath, buffer);

  return cachePath;
}

/**
 * 批量缓存多张图片（并行下载，逐张保存）
 */
export async function cacheImages(remoteUrls: string[]): Promise<string[]> {
  if (!remoteUrls.length) return [];
  const results = await Promise.allSettled(remoteUrls.map((url) => cacheImage(url)));
  const paths: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      paths.push(r.value);
    } else {
      console.error('[imageCache] 缓存失败:', r.reason);
    }
  }
  return paths;
}

/**
 * 检查远程图片是否已有缓存
 * @returns 缓存文件路径，或 null（未缓存）
 */
export function resolveCached(remoteUrl: string): string | null {
  const dir = getCacheDir();
  const hash = hashUrl(remoteUrl);

  // 尝试常见扩展名
  for (const ext of ['.png', '.jpg', '.webp', '.gif']) {
    const p = path.join(dir, `${hash}${ext}`);
    if (fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * 读取缓存的图片文件为 data URL
 * @returns data URL 字符串，或 null（未缓存 / 读取失败）
 */
export function readCachedAsDataUrl(remoteUrl: string): string | null {
  const cachedPath = resolveCached(remoteUrl);
  if (!cachedPath) return null;

  try {
    const buffer = fs.readFileSync(cachedPath);
    const ext = path.extname(cachedPath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error('[imageCache] 读取缓存失败:', cachedPath, e);
    return null;
  }
}

/**
 * 缓存一张图片并返回 data URL（存在即读，不存在则下载）
 */
export async function cacheAndGetDataUrl(remoteUrl: string): Promise<string | null> {
  // 先检查缓存
  const existing = readCachedAsDataUrl(remoteUrl);
  if (existing) return existing;

  // 不存在则下载
  try {
    const localPath = await cacheImage(remoteUrl);
    // 再用 data URL 形式读取
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error('[imageCache] 缓存并读取失败:', remoteUrl, e);
    return null;
  }
}

/**
 * 缓存图片并返回可本地访问的 file:// URL
 */
export async function cacheAndGetFileUrl(remoteUrl: string): Promise<string | null> {
  try {
    const localPath = resolveCached(remoteUrl) || (await cacheImage(remoteUrl));
    return `file://${localPath}`;
  } catch (e) {
    console.error('[imageCache] 缓存失败:', remoteUrl, e);
    return null;
  }
}

/**
 * 获取当前缓存统计信息
 */
export function getCacheStats(): { cachedCount: number; cacheDir: string } {
  const dir = getCacheDir();
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg|webp|gif)$/i.test(f));
  return {
    cachedCount: files.length,
    cacheDir: dir,
  };
}
