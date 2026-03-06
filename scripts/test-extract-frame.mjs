#!/usr/bin/env node
/**
 * 调试脚本：从项目中的视频素材提取帧，验证 ffmpeg 是否可用
 *
 * 用法1（直接测视频，无需数据库）：
 *   node scripts/test-extract-frame.mjs --video <视频路径>
 *
 * 用法2（从项目读取视频列表）：
 *   node scripts/test-extract-frame.mjs <项目目录>
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
let videoList = [];
let projectDir = null;

// 模式1：--video <path> 直接测单个视频（无需 better-sqlite3）
const videoIdx = process.argv.indexOf('--video');
if (videoIdx >= 0) {
  if (!process.argv[videoIdx + 1]) {
    console.error('用法: node scripts/test-extract-frame.mjs --video <视频路径>');
    process.exit(1);
  }
  const videoPath = path.resolve(process.argv[videoIdx + 1]);
  if (fs.existsSync(videoPath)) {
    videoList = [{ id: 'direct', path: videoPath, fullPath: videoPath }];
  } else {
    console.error('视频文件不存在:', videoPath);
    process.exit(1);
  }
}
if (videoList.length === 0) {
  // 模式2：从项目 db 读取
  projectDir = process.argv[2] || process.env.PROJECT_DIR;
  if (!projectDir || !fs.existsSync(projectDir)) {
    console.error('用法1: node scripts/test-extract-frame.mjs --video <视频路径>');
    console.error('用法2: node scripts/test-extract-frame.mjs <项目目录>');
    process.exit(1);
  }
  const dbPath = path.join(projectDir, 'project.db');
  if (!fs.existsSync(dbPath)) {
    console.error('项目目录下无 project.db:', projectDir);
    process.exit(1);
  }
  let Database;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch (e) {
    console.error('better-sqlite3 加载失败（Node 版本可能不匹配）。请用用法1直接测视频：');
    console.error('  node scripts/test-extract-frame.mjs --video /path/to/video.mp4');
    process.exit(1);
  }
  const db = new Database(dbPath);
  const assets = db.prepare('SELECT id, path, type FROM assets_index').all();
  db.close();
  videoList = assets
    .filter((a) => {
      const t = (a.type || '').toLowerCase();
      const ext = path.extname(a.path || '').toLowerCase();
      return ['video', 'transparent_video'].includes(t) || VIDEO_EXT.includes(ext);
    })
    .map((a) => ({
      id: a.id,
      path: a.path,
      fullPath: path.join(projectDir, a.path),
    }));
}

const ffmpegPath = await getFfmpegPath();
const outDir = projectDir
  ? path.join(projectDir, 'exports')
  : path.join(path.dirname(videoList[0]?.fullPath || '.'), '_test_frames');

console.log('ffmpeg 路径:', ffmpegPath || '(使用系统 PATH)');
console.log('视频数:', videoList.length);
if (videoList.length === 0) {
  console.log('无视频素材');
  process.exit(0);
}

for (const a of videoList) {
  console.log('\n---', a.id, a.path || a.fullPath, '---');
  const fullPath = a.fullPath;
  if (!fs.existsSync(fullPath)) {
    console.log('  文件不存在:', fullPath);
    continue;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `_test_frame_${a.id}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // 方法1：直接用 ffmpeg 命令行（输入 seeking）
  console.log('  尝试: ffmpeg -ss 0.5 -i <video> -vframes 1 -f image2 <output>');
  const r1 = await runFfmpeg(ffmpegPath, ['-ss', '0.5', '-i', fullPath, '-vframes', '1', '-f', 'image2', outPath]);
  if (r1.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    console.log('  成功! 输出:', outPath, '大小:', fs.statSync(outPath).size);
    continue;
  }
  console.log('  失败:', r1.stderr || r1.error);

  // 方法2：输出 seeking
  console.log('  尝试: ffmpeg -i <video> -ss 0.5 -vframes 1 -f image2 <output>');
  const outPath2 = outPath.replace('.png', '_2.png');
  const r2 = await runFfmpeg(ffmpegPath, ['-i', fullPath, '-ss', '0.5', '-vframes', '1', '-f', 'image2', outPath2]);
  if (r2.ok && fs.existsSync(outPath2) && fs.statSync(outPath2).size > 0) {
    console.log('  成功(输出 seeking)! 输出:', outPath2);
    continue;
  }
  console.log('  失败:', r2.stderr || r2.error);
}

console.log('\n完成');

async function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve) => {
    let stderr = '';
    let stdout = '';
    const proc = spawn(ffmpegPath || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: code !== 0 ? `exit ${code}` : null,
      });
    });
    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message, stderr });
    });
  });
}

async function getFfmpegPath() {
  try {
    const mod = await import('ffmpeg-static');
    const p = mod.default || mod.path;
    if (p && typeof p === 'string' && fs.existsSync(p)) return p;
  } catch {}
  return null;
}
