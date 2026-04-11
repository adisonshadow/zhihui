/**
 * 纯 Vite 开发（无 Electron）时，由开发服务器代拉 TOS 图，避免浏览器 CORS。
 * 仅监听 127.0.0.1，且 URL 须通过白名单校验。
 */
import type { IncomingMessage } from 'node:http';
import type { Connect, Plugin } from 'vite';

const MAX_IMAGE_BYTES = 45 * 1024 * 1024;

function allowVolcTosUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h.endsWith('.volces.com') && (h.includes('tos-') || h.includes('.tos.') || h.includes('ark-acg'));
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function volcTosDevFetchPlugin(): Plugin {
  return {
    name: 'yiman-volc-tos-dev-fetch',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (pathname !== '/__yiman_dev/volc-tos-fetch' || req.method !== 'POST') {
          next();
          return;
        }
        const rawBuf = await readBody(req as IncomingMessage);
        const raw = rawBuf.toString('utf8');
        try {
          const { url } = JSON.parse(raw) as { url?: string };
          if (!url || !allowVolcTosUrl(url)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: '无效地址' }));
            return;
          }
          const r = await fetch(url, { headers: { Accept: 'image/*,*/*' }, redirect: 'follow' });
          if (!r.ok) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: `HTTP ${r.status}` }));
            return;
          }
          const ab = await r.arrayBuffer();
          if (ab.byteLength > MAX_IMAGE_BYTES) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: '图片过大' }));
            return;
          }
          const ct = r.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
          const b64 = Buffer.from(ab).toString('base64');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, dataUrl: `data:${ct};base64,${b64}` }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
      };
      server.middlewares.use(handler);
    },
  };
}
