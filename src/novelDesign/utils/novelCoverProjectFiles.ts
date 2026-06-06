/**
 * 小说封面落盘：写入小说项目根目录 cover.{ext}，并同步 project.db cover_path
 */
import { resolveNovelProjectDirForItem } from '@/audiobook/utils/audiobookProjectDir';
import { loadNovelList } from '@/novelDesign/storage/novelListStorage';
import {
  isRemoteImageUrl,
  persistNovelCoverFromRemote,
} from '@/novelDesign/utils/novelCoverImageCache';

const COVER_BASENAME = 'cover';

function toFileUrl(absPath: string): string {
  const p = absPath.trim();
  if (p.startsWith('file://')) return p;
  return `file://${p}`;
}

export function fileUrlToAbsolutePath(fileUrl: string): string {
  const u = fileUrl.trim();
  if (!u.startsWith('file://')) return u;
  const raw = u.replace(/^file:\/\//i, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function extFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/([\w+.-]+)/i);
  if (!m?.[1]) return '.png';
  const t = m[1].toLowerCase();
  if (t === 'jpeg' || t === 'jpg') return '.jpg';
  if (t === 'png' || t === 'webp' || t === 'gif') return `.${t}`;
  return '.png';
}

function base64FromDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  if (i < 0) throw new Error('无效的 data URL');
  return dataUrl.slice(i + 1);
}

async function writeCoverFileToProjectDir(
  projectDir: string,
  sourceAbsPath: string,
): Promise<string> {
  const fs = window.yiman?.fs;
  if (!fs?.readFileAsDataUrl || !fs.writeBase64File || !fs.pathJoin) {
    throw new Error('请在桌面客户端中使用封面落盘');
  }
  const dataUrl = await fs.readFileAsDataUrl(sourceAbsPath);
  if (!dataUrl) throw new Error('读取封面文件失败');

  const ext = extFromDataUrl(dataUrl);
  const destPath = await fs.pathJoin(projectDir, `${COVER_BASENAME}${ext}`);
  const res = await fs.writeBase64File(destPath, base64FromDataUrl(dataUrl));
  if (!res?.ok) throw new Error(res.error ?? '写入项目封面失败');

  try {
    await window.yiman?.project?.updateMeta?.(projectDir, { cover_path: destPath });
  } catch {
    /* project.db 可选 */
  }

  return toFileUrl(destPath);
}

/**
 * 远程/本地封面 → image-cache（如需）→ 复制到项目目录 cover.{ext}
 * 无项目目录时仅写入全局 image-cache（与旧行为一致）
 */
export async function persistNovelCoverForNovel(
  novelId: string,
  remoteOrLocalUrl: string,
): Promise<{ coverDataUrl: string; savedToProjectDir: boolean; projectCoverPath?: string }> {
  const cachedRef = await persistNovelCoverFromRemote(remoteOrLocalUrl);
  const item = loadNovelList().find((x) => x.id === novelId);
  if (!item) {
    return { coverDataUrl: cachedRef, savedToProjectDir: false };
  }

  const projectDir = await resolveNovelProjectDirForItem(item);
  if (!projectDir) {
    return { coverDataUrl: cachedRef, savedToProjectDir: false };
  }

  let sourcePath = fileUrlToAbsolutePath(cachedRef);
  if (isRemoteImageUrl(cachedRef) || isRemoteImageUrl(sourcePath)) {
    const api = window.yiman?.images?.cache;
    if (!api?.save) {
      throw new Error('封面缓存不可用，无法写入项目目录');
    }
    let local = await api.resolve(remoteOrLocalUrl.trim());
    if (!local) {
      const res = await api.save(remoteOrLocalUrl.trim());
      if (!res.ok) throw new Error(res.error ?? '封面下载失败');
      local = res.localPath;
    }
    sourcePath = local;
  }

  const projectFileUrl = await writeCoverFileToProjectDir(projectDir, sourcePath);
  return {
    coverDataUrl: projectFileUrl,
    savedToProjectDir: true,
    projectCoverPath: fileUrlToAbsolutePath(projectFileUrl),
  };
}
