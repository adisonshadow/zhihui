/**
 * 同类组列表展示与预览解析（包名 asset_bundles.title 与子素材 assets_index.description 独立）
 */
import type { AssetBundleListRow } from '@/types/assetBundle';

/** 与 AssetBundlePickModal 子项字段一致，避免依赖组件文件造成循环引用 */
export type BundlePickMemberLike = {
  id: string;
  path: string;
  type: string;
  description: string | null;
  cover_path?: string | null;
};

/** 卡片/列表标题：优先包名；包名为空时用第一个子素材的名称（description，否则取 path 的文件名） */
export function bundleCardDisplayTitle(b: AssetBundleListRow): string {
  const title = b.title?.trim();
  if (title) return title;
  const fb = b.first_member_fallback?.trim();
  if (fb) {
    if (fb.includes('/') || fb.includes('\\')) {
      return fb.split(/[/\\]/).pop() || fb;
    }
    return fb;
  }
  return '未命名组';
}

/** 侧边栏预览：始终用 DB 中的子素材行，避免列表缓存与子素材 description 不一致 */
/** 返回 assets_index 完整行，供预览 Drawer 使用（含 video 的 original_path、duration 等） */
export async function fetchAssetRowForBundleMemberPreview(
  projectDir: string,
  m: BundlePickMemberLike
): Promise<{
  id: string;
  path: string;
  type: string;
  description?: string | null;
  tags?: string | null;
  original_path?: string | null;
  duration?: number | null;
  cover_path?: string | null;
} | null> {
  const api = window.yiman?.project;
  if (!api?.getAssetById) return null;
  return api.getAssetById(projectDir, m.id);
}
