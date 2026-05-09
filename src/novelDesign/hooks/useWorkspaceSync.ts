import { useCallback, useEffect, useRef, useState } from 'react';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';

/**
 * 统一管理 workspace 的 React state 与 ref 同步。
 *
 * 问题背景：AI 回调需要在同一 tick 读到最新 snapshot，
 * 但 setState 是异步的。此 hook 确保 setWorkspace 同时更新 ref。
 */
export function useWorkspaceSync() {
  const [workspace, setWorkspace] = useState<NovelWorkspaceSnapshot | null>(null);
  const workspaceRef = useRef<NovelWorkspaceSnapshot | null>(null);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const updateWorkspace = useCallback(
    (snap: NovelWorkspaceSnapshot | ((prev: NovelWorkspaceSnapshot | null) => NovelWorkspaceSnapshot | null)) => {
      if (typeof snap === 'function') {
        setWorkspace((prev) => {
          const next = snap(prev);
          if (next && typeof next === 'object' && 'novelId' in next) {
            workspaceRef.current = next;
          }
          return next;
        });
      } else {
        if (snap && typeof snap === 'object' && 'novelId' in snap) {
          workspaceRef.current = snap;
        }
        setWorkspace(snap);
      }
    },
    []
  );

  /** 供 AIChat extraFunctionCalls setSnapshot 使用（同时支持函数更新器） */
  const setSnapshot = useCallback(
    (snap: NovelWorkspaceSnapshot | null | ((prev: NovelWorkspaceSnapshot | null) => NovelWorkspaceSnapshot | null)) => {
      if (typeof snap === 'function') {
        setWorkspace((prev) => {
          const next = snap(prev);
          if (next && typeof next === 'object' && 'novelId' in next) {
            workspaceRef.current = next;
          }
          return next;
        });
      } else {
        if (snap && typeof snap === 'object' && 'novelId' in snap) {
          workspaceRef.current = snap;
        }
        setWorkspace(snap);
      }
    },
    []
  );

  return { workspace, workspaceRef, updateWorkspace, setSnapshot };
}
