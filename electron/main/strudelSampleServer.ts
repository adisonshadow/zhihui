/**
 * 本地 Strudel 采样 HTTP 服务（兼容 @strudel/sampler 协议），供 samples/ 目录。
 */
import { createReadStream, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import http from 'node:http';
import { join, resolve, sep } from 'node:path';

const DEFAULT_PORT = 5432;
const VALID_AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg'];

type StrudelSampleGlobals = typeof globalThis & {
  __yimanStrudelSampleServer?: http.Server | null;
  __yimanStrudelSamplePort?: number;
};

const G = globalThis as StrudelSampleGlobals;

let port = DEFAULT_PORT;

const isAudioFile = (f: string) => VALID_AUDIO_EXTENSIONS.includes(f.split('.').slice(-1)[0]!.toLowerCase());

async function getFilesInDirectory(directory: string): Promise<string[]> {
  let files: string[] = [];
  const dirents = await readdir(directory, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = join(directory, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name.startsWith('.')) continue;
      try {
        files = files.concat((await getFilesInDirectory(fullPath)).filter(isAudioFile));
      } catch {
        /* skip */
      }
    } else if (isAudioFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function getBanks(directory: string) {
  let files = await getFilesInDirectory(directory);
  const banks: Record<string, string[]> = {};
  const dirNorm = directory.split(sep).join('/');
  files = files.map((filePath) => {
    filePath = filePath.split(sep).join('/');
    const subDir = filePath.replace(dirNorm, '');
    const bank = filePath.split('/').slice(-2)[0]!;
    banks[bank] = banks[bank] ?? [];
    banks[bank].push(subDir);
    return subDir;
  });
  return { banks, files };
}

export function strudelSampleServerUrl(): string {
  return `http://127.0.0.1:${G.__yimanStrudelSamplePort ?? port}`;
}

export function startStrudelSampleServer(dir: string, opts?: { port?: number }): boolean {
  if (G.__yimanStrudelSampleServer) {
    port = G.__yimanStrudelSamplePort ?? port;
    return true;
  }

  const directory = resolve(dir);
  if (!existsSync(directory)) {
    console.warn('[strudel-sampler] samples dir missing:', directory);
    return false;
  }

  port = opts?.port ?? DEFAULT_PORT;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const { banks } = await getBanks(directory);
      if (req.url === '/' || req.url === '') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(banks));
        return;
      }
      const subpath = decodeURIComponent(req.url ?? '');
      const filePath = join(directory, subpath.split('/').join(sep));
      if (!filePath.startsWith(directory) || !existsSync(filePath)) {
        res.statusCode = 404;
        res.end('File not found');
        return;
      }
      createReadStream(filePath)
        .on('error', () => {
          res.statusCode = 500;
          res.end('Internal server error');
        })
        .pipe(res);
    } catch (e) {
      res.statusCode = 500;
      res.end(e instanceof Error ? e.message : 'error');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(
        `[strudel-sampler] 端口 ${port} 已被占用，复用已有服务（${strudelSampleServerUrl()}）`,
      );
      G.__yimanStrudelSampleServer = null;
      return;
    }
    console.error('[strudel-sampler] 启动失败:', err.message);
  });

  server.listen(port, '127.0.0.1', () => {
    G.__yimanStrudelSampleServer = server;
    G.__yimanStrudelSamplePort = port;
    console.log(`[strudel-sampler] ${directory} → ${strudelSampleServerUrl()}`);
  });

  return true;
}

export function stopStrudelSampleServer(): void {
  G.__yimanStrudelSampleServer?.close();
  G.__yimanStrudelSampleServer = null;
}
