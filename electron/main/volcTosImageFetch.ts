/**
 * 火山 TOS 预签名图在主进程拉取（无浏览器 CORS），供渲染进程预览。
 * 仅允许 volces TOS 主机，降低 IPC 被滥用的 SSRF 面。
 */
const MAX_IMAGE_BYTES = 45 * 1024 * 1024;

function isAllowedVolcTosUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().toLowerCase();
  if (!t.startsWith('https://')) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h.endsWith('.volces.com') && (h.includes('tos-') || h.includes('.tos.') || h.includes('ark-acg'));
  } catch {
    return false;
  }
}

export async function fetchVolcTosImageAsDataUrl(
  url: string
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const trimmed = url?.trim() ?? '';
  if (!isAllowedVolcTosUrl(trimmed)) {
    return { ok: false, error: '不允许的图片地址' };
  }
  try {
    const res = await fetch(trimmed, {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const cl = res.headers.get('content-length');
    if (cl) {
      const n = parseInt(cl, 10);
      if (Number.isFinite(n) && n > MAX_IMAGE_BYTES) {
        return { ok: false, error: '图片过大' };
      }
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: '图片过大' };
    }
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    const base64 = buf.toString('base64');
    return { ok: true, dataUrl: `data:${ct};base64,${base64}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
