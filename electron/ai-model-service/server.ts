/**
 * AI 模型服务 - 独立 HTTP API
 * 以子进程运行，隔离内存压力，避免主进程 OOM
 * 启动项目 APP 时同时启动本服务
 */
import http from 'node:http';
import { runMatting, listMattingModels } from './registry';

const DEFAULT_PORT = 19815;
const PORT = parseInt(process.env.AIMODEL_PORT ?? String(DEFAULT_PORT), 10);

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function startServer(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const parsed = new URL(url, 'http://localhost');

    if (req.method === 'GET' && parsed.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && parsed.pathname === '/matting/models') {
      const models = listMattingModels();
      sendJson(res, 200, { models });
      return;
    }

    if (req.method === 'POST' && parsed.pathname === '/matting/run') {
      try {
        const body = (await parseJsonBody(req)) as {
          modelId?: string;
          rgbBase64?: string;
          width?: number;
          height?: number;
          channels?: number;
          options?: Record<string, unknown>;
        };
        const { modelId, rgbBase64, width, height, channels, options } = body;
        if (!modelId || !rgbBase64 || typeof width !== 'number' || typeof height !== 'number' || typeof channels !== 'number') {
          sendJson(res, 400, { ok: false, error: '缺少 modelId / rgbBase64 / width / height / channels' });
          return;
        }
        const rgbData = Buffer.from(rgbBase64, 'base64');
        const result = await runMatting(modelId, { rgbData, width, height, channels, options });
        if (result.ok) {
          sendJson(res, 200, { ok: true, rgbaBase64: result.rgba.toString('base64') });
        } else {
          sendJson(res, 200, { ok: false, error: result.message });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 500, { ok: false, error: `服务异常: ${msg}` });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not Found' });
  });

  server.listen(PORT, '127.0.0.1', () => {
    const msg = JSON.stringify({ ready: true, port: PORT });
    process.stdout.write(msg + '\n');
  });

  server.on('error', (e) => {
    console.error('[AI Model Service] 启动失败:', e);
    process.exit(1);
  });
}
