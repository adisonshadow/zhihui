/**
 * 视频导出流水线：按场景时间轴与分层生成帧序列，ffmpeg 合成 MP4（见功能文档 6、技术文档 5、开发计划 2.13）
 */
import path from 'node:path';
import fs from 'node:fs';
import { getLayers, getTimelineBlocks, getKeyframes, getAssetById, getProjectMeta, getExportsPath } from './projectDb';
import type { LayerRow } from './projectDb';
import type { TimelineBlockRow } from './projectDb';
import type { KeyframeRow } from './projectDb';
// 共享关键帧插值逻辑（与画布渲染一致，见功能文档 6.8）
import { getInterpolatedTransform, getInterpolatedEffects } from '../../src/utils/keyframeTween';

const DESIGN_WIDTH_LANDSCAPE = 1920;
const DESIGN_HEIGHT_LANDSCAPE = 1080;
const DESIGN_WIDTH_PORTRAIT = 1080;
const DESIGN_HEIGHT_PORTRAIT = 1920;

/** 图片类素材类型（支持导出，视频类暂不参与帧合成） */
const IMAGE_ASSET_TYPES = new Set(['character', 'scene_bg', 'prop', 'sticker']);

export interface ExportOptions {
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** 帧率 */
  fps: number;
  /** 导出目录，不传则用项目 exports */
  outputDir?: string;
  /** 格式：mp4 */
  format?: 'mp4';
}

export interface ExportProgress {
  phase: 'frames' | 'encode' | 'done';
  /** 0-100 */
  percent: number;
  message?: string;
}

export interface ExportResult {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

/** 获取场景时长（秒） */
function getSceneDuration(projectDir: string, sceneId: string): number {
  const layers = getLayers(projectDir, sceneId);
  let maxEnd = 0;
  for (const layer of layers) {
    const blocks = getTimelineBlocks(projectDir, layer.id);
    for (const block of blocks) {
      if (block.end_time > maxEnd) maxEnd = block.end_time;
    }
  }
  return maxEnd;
}

/** 渲染单帧并返回 PNG Buffer */
async function renderFrame(
  projectDir: string,
  sceneId: string,
  time: number,
  designWidth: number,
  designHeight: number,
  outputWidth: number,
  outputHeight: number
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const layers = getLayers(projectDir, sceneId);
  const keyframesAll = getKeyframes(projectDir);

  const scaleX = outputWidth / designWidth;
  const scaleY = outputHeight / designHeight;

  // 创建透明底图
  const base = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  });

  const composites: { input: Buffer; left: number; top: number }[] = [];

  for (const layer of layers as LayerRow[]) {
    if (layer.visible !== 1) continue;
    const blocks = getTimelineBlocks(projectDir, layer.id);
    const keyframesByBlock = keyframesAll.reduce(
      (acc, kf) => {
        if (!acc[kf.block_id]) acc[kf.block_id] = [];
        acc[kf.block_id].push(kf);
        return acc;
      },
      {} as Record<string, KeyframeRow[]>
    );

    for (const block of blocks as TimelineBlockRow[]) {
      if (time < block.start_time || time > block.end_time) continue;
      if (!block.asset_id) continue;

      const asset = getAssetById(projectDir, block.asset_id);
      if (!asset || !IMAGE_ASSET_TYPES.has(asset.type)) continue;

      const assetPath = path.join(projectDir, asset.path);
      if (!fs.existsSync(assetPath)) continue;

      const blockBase = {
        start_time: block.start_time,
        end_time: block.end_time,
        pos_x: block.pos_x,
        pos_y: block.pos_y,
        scale_x: block.scale_x,
        scale_y: block.scale_y,
        rotation: block.rotation,
        blur: 0,
        opacity: 1,
        color: undefined,
      };

      const keyframes = keyframesByBlock[block.id] ?? [];
      const transform = getInterpolatedTransform(blockBase, keyframes, time);
      const effects = getInterpolatedEffects(blockBase, keyframes, time);

      const width = Math.round(transform.scale_x * designWidth * scaleX);
      const height = Math.round(transform.scale_y * designHeight * scaleY);
      const cx = transform.pos_x * designWidth * scaleX;
      const cy = transform.pos_y * designHeight * scaleY;

      if (width <= 0 || height <= 0) continue;

      let img = sharp(assetPath)
        .resize(width, height)
        .rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

      if (effects.opacity < 1) {
        img = img.modulate({ brightness: 1, saturation: 1 }).ensureAlpha();
        // Sharp 无直接 opacity，通过 composite 的 blend 或 pre-multiply 实现较复杂，此处简化
      }

      const buf = await img.png().toBuffer();
      const meta = await sharp(buf).metadata();
      const rw = meta.width ?? width;
      const rh = meta.height ?? height;
      const left = Math.round(cx - rw / 2);
      const top = Math.round(cy - rh / 2);

      composites.push({ input: buf, left, top });
    }
  }

  if (composites.length === 0) {
    return base.png().toBuffer();
  }

  const inputs = composites.map((c) => ({
    input: c.input,
    left: c.left,
    top: c.top,
    blend: 'over' as const,
  }));

  return base.composite(inputs).png().toBuffer();
}

/** 导出场景视频 */
export async function exportSceneVideo(
  projectDir: string,
  sceneId: string,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void
): Promise<ExportResult> {
  try {
    const meta = getProjectMeta(projectDir);
    const landscape = meta?.landscape !== 0;
    const designWidth = landscape ? DESIGN_WIDTH_LANDSCAPE : DESIGN_WIDTH_PORTRAIT;
    const designHeight = landscape ? DESIGN_HEIGHT_LANDSCAPE : DESIGN_HEIGHT_PORTRAIT;

    const duration = getSceneDuration(projectDir, sceneId);
    if (duration <= 0) {
      return { ok: false, error: '场景无有效时间轴内容' };
    }

    const totalFrames = Math.ceil(duration * options.fps);
    const exportsDir = options.outputDir ?? getExportsPath(projectDir);
    fs.mkdirSync(exportsDir, { recursive: true });
    const frameDir = path.join(exportsDir, `_export_frames_${Date.now()}`);
    fs.mkdirSync(frameDir, { recursive: true });

    try {
      // 生成帧序列
      for (let i = 0; i < totalFrames; i++) {
        const time = i / options.fps;
        const buf = await renderFrame(
          projectDir,
          sceneId,
          time,
          designWidth,
          designHeight,
          options.width,
          options.height
        );
        const framePath = path.join(frameDir, `frame_${String(i).padStart(5, '0')}.png`);
        fs.writeFileSync(framePath, buf);

        if (onProgress && (i + 1) % 5 === 0) {
          onProgress({
            phase: 'frames',
            percent: Math.round(((i + 1) / totalFrames) * 80),
            message: `生成帧 ${i + 1}/${totalFrames}`,
          });
        }
      }

      if (onProgress) {
        onProgress({ phase: 'encode', percent: 85, message: '正在编码视频...' });
      }

      const outputFileName = `export_${sceneId}_${Date.now()}.mp4`;
      const outputPath = path.join(exportsDir, outputFileName);

      const ffmpeg = (await import('fluent-ffmpeg')).default;
      // 若安装 ffmpeg-static 则使用内置二进制，否则使用系统 PATH 的 ffmpeg
      try {
        const mod = await import('ffmpeg-static');
        const p = (mod as { default?: string }).default ?? (mod as { path?: string }).path;
        if (p && typeof p === 'string') ffmpeg.setFfmpegPath(p);
      } catch {
        /* 使用系统 ffmpeg */
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(path.join(frameDir, 'frame_%05d.png'))
          .inputOptions(['-framerate', String(options.fps)])
          .outputOptions([
            '-c:v libx264',
            '-pix_fmt yuv420p',
            '-preset medium',
            '-crf 23',
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      if (onProgress) {
        onProgress({ phase: 'done', percent: 100, message: '导出完成' });
      }

      // 清理帧目录
      try {
        const files = fs.readdirSync(frameDir);
        for (const f of files) fs.unlinkSync(path.join(frameDir, f));
        fs.rmdirSync(frameDir);
      } catch (_) {}

      return { ok: true, outputPath };
    } catch (e) {
      try {
        if (fs.existsSync(frameDir)) {
          const files = fs.readdirSync(frameDir);
          for (const f of files) fs.unlinkSync(path.join(frameDir, f));
          fs.rmdirSync(frameDir);
        }
      } catch (_) {}
      throw e;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

