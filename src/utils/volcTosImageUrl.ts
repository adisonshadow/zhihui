/**
 * 火山 TOS / 方舟生图签名链接：与主进程 IPC、Vite 开发代理共用同一套主机白名单。
 */
export function isVolcTosSignedImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().toLowerCase();
  if (t.startsWith('data:') || t.startsWith('blob:')) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h.endsWith('.volces.com') && (h.includes('tos-') || h.includes('.tos.') || h.includes('ark-acg'));
  } catch {
    return false;
  }
}
