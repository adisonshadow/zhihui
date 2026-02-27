/**
 * 精灵动作图导出/导入：使用 adm-zip 生成 ZIP（描述文件 + 精灵图 + 封面）
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import AdmZip from 'adm-zip';
import type { SpriteFrameRect } from './spriteOnnxService';
import { saveAssetFromFile } from './projectDb';

const MANIFEST_FILE = 'manifest.json';
const SPRITE_FILE = 'sprite.png';
const COVER_FILE = 'cover.png';

export interface SpriteSheetManifest {
  version: 1;
  name?: string;
  frame_count?: number;
  frames?: SpriteFrameRect[];
  chroma_key?: string;
  background_color?: { r: number; g: number; b: number; a: number };
  matting_model?: 'rvm' | 'birefnet' | 'mvanet' | 'u2netp' | 'rmbg2';
  playback_fps?: number;
}

export interface SpriteSheetItemExport {
  id: string;
  name?: string;
  image_path: string;
  cover_path?: string;
  frame_count?: number;
  chroma_key?: string;
  background_color?: { r: number; g: number; b: number; a: number };
  frames?: SpriteFrameRect[];
  matting_model?: string;
  playback_fps?: number;
}

export interface SpriteSheetItemImport {
  id: string;
  name?: string;
  image_path: string;
  cover_path?: string;
  frame_count?: number;
  chroma_key?: string;
  background_color?: { r: number; g: number; b: number; a: number };
  frames?: SpriteFrameRect[];
  matting_model?: string;
  playback_fps?: number;
}

/** 导出精灵动作为 ZIP：manifest.json + sprite.png + cover.png */
export function exportSpriteSheetToZip(
  projectDir: string,
  item: SpriteSheetItemExport,
  outputPath: string
): { ok: boolean; error?: string } {
  try {
    const actualSpritePath = path.join(projectDir, item.image_path);
    if (!fs.existsSync(actualSpritePath)) {
      return { ok: false, error: '精灵图文件不存在' };
    }

    const zip = new AdmZip();

    const manifest: SpriteSheetManifest = {
      version: 1,
      name: item.name,
      frame_count: item.frame_count,
      frames: item.frames,
      chroma_key: item.chroma_key,
      background_color: item.background_color,
      matting_model: item.matting_model as SpriteSheetManifest['matting_model'],
      playback_fps: item.playback_fps,
    };
    zip.addFile(MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

    zip.addFile(SPRITE_FILE, fs.readFileSync(actualSpritePath));

    if (item.cover_path) {
      const coverFull = path.join(projectDir, item.cover_path);
      if (fs.existsSync(coverFull)) {
        zip.addFile(COVER_FILE, fs.readFileSync(coverFull));
      }
    }

    zip.writeZip(outputPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 从 ZIP 导入精灵动作：解析 manifest，提取图片并保存到 assets，返回新建的 SpriteSheetItem */
export function importSpriteSheetFromZip(
  projectDir: string,
  zipPath: string
): { ok: boolean; item?: SpriteSheetItemImport; error?: string } {
  try {
    const zip = new AdmZip(zipPath);
    const manifestEntry = zip.getEntry(MANIFEST_FILE);
    const spriteEntry = zip.getEntry(SPRITE_FILE);
    if (!manifestEntry || !spriteEntry) {
      return { ok: false, error: 'ZIP 格式无效：缺少 manifest.json 或 sprite.png' };
    }

    const manifestStr = zip.readAsText(manifestEntry, 'utf8');
    const manifest = JSON.parse(manifestStr) as SpriteSheetManifest;
    if (manifest.version !== 1) {
      return { ok: false, error: '不支持的 ZIP 版本' };
    }

    const tmpDir = path.join(os.tmpdir(), `yiman_sprite_import_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const spriteBuf = zip.readFile(spriteEntry);
      if (!spriteBuf || !Buffer.isBuffer(spriteBuf)) {
        return { ok: false, error: '无法读取 sprite.png' };
      }
      const spriteTmp = path.join(tmpDir, SPRITE_FILE);
      fs.writeFileSync(spriteTmp, spriteBuf);

      const saveSprite = saveAssetFromFile(projectDir, spriteTmp, 'character');
      if (!saveSprite.ok || !saveSprite.path) {
        return { ok: false, error: saveSprite.error ?? '保存精灵图失败' };
      }

      let cover_path: string | undefined;
      const coverEntry = zip.getEntry(COVER_FILE);
      if (coverEntry) {
        const coverBuf = zip.readFile(coverEntry);
        if (coverBuf && Buffer.isBuffer(coverBuf)) {
          const coverTmp = path.join(tmpDir, COVER_FILE);
          fs.writeFileSync(coverTmp, coverBuf);
          const saveCover = saveAssetFromFile(projectDir, coverTmp, 'character');
          if (saveCover.ok && saveCover.path) cover_path = saveCover.path;
        }
      }

      const newId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const item: SpriteSheetItemImport = {
        id: newId,
        name: manifest.name,
        image_path: saveSprite.path,
        cover_path,
        frame_count: manifest.frame_count,
        chroma_key: manifest.chroma_key,
        background_color: manifest.background_color,
        frames: manifest.frames,
        matting_model: manifest.matting_model,
        playback_fps: manifest.playback_fps,
      };
      return { ok: true, item };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
