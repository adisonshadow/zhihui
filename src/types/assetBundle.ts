/** 同类素材组列表行（与主进程 AssetBundleListRow 一致，见 docs/11） */
export type AssetBundleListRow = {
  id: string;
  title: string;
  cover_path: string | null;
  tags: string | null;
  is_favorite: number;
  created_at: string;
  updated_at: string;
  member_count: number;
  /** 组内排序第一的子素材：description 非空则用 description，否则为 path（用于包标题为空时的展示回退） */
  first_member_fallback?: string | null;
};
