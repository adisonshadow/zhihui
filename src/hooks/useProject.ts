/**
 * 根据项目 id 获取项目信息（含 project_dir），供项目编辑页使用
 * 见功能文档 4、开发计划 2.5
 */
import { useState, useEffect } from 'react';

export interface ProjectInfo {
  id: string;
  name: string;
  landscape: number;
  project_dir: string;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export function useProject(projectId: string | undefined): { project: ProjectInfo | null; loading: boolean; error: string | null } {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      setError('缺少项目 ID');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.yiman?.projects
      .list()
      .then((list) => {
        if (cancelled) return;
        const found = list.find((p) => p.id === projectId);
        if (found) setProject(found);
        else setError('项目不存在');
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { project, loading, error };
}
