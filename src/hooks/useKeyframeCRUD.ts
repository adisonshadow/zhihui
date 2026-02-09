/**
 * 关键帧 CRUD：封装素材关键帧的增删查改（见功能文档 6.7、6.8）
 * 关键帧按属性独立：pos | scale | rotation | blur | opacity | color
 */
import { useCallback } from 'react';

export type KeyframeProperty = 'pos' | 'scale' | 'rotation' | 'blur' | 'opacity' | 'color';

export interface KeyframeRow {
  id: string;
  block_id: string;
  time: number;
  property: KeyframeProperty;
  pos_x?: number | null;
  pos_y?: number | null;
  scale_x?: number | null;
  scale_y?: number | null;
  rotation?: number | null;
  blur?: number | null;
  opacity?: number | null;
  color?: string | null;
}

export function useKeyframeCRUD(projectDir: string) {
  const createKeyframe = useCallback(
    async (data: {
      id: string;
      block_id: string;
      time: number;
      property: KeyframeProperty;
      pos_x?: number;
      pos_y?: number;
      scale_x?: number;
      scale_y?: number;
      rotation?: number;
      blur?: number;
      opacity?: number;
      color?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!window.yiman?.project?.createKeyframe) return { ok: false, error: '未就绪' };
      return (await window.yiman.project.createKeyframe(projectDir, data)) as { ok: boolean; error?: string };
    },
    [projectDir]
  );

  const updateKeyframe = useCallback(
    async (id: string, data: { pos_x?: number; pos_y?: number; scale_x?: number; scale_y?: number; rotation?: number; blur?: number; opacity?: number; color?: string }): Promise<{ ok: boolean; error?: string }> => {
      if (!window.yiman?.project?.updateKeyframe) return { ok: false, error: '未就绪' };
      return (await window.yiman.project.updateKeyframe(projectDir, id, data)) as { ok: boolean; error?: string };
    },
    [projectDir]
  );

  const deleteKeyframe = useCallback(
    async (kfId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!window.yiman?.project?.deleteKeyframe) return { ok: false, error: '未就绪' };
      return (await window.yiman.project.deleteKeyframe(projectDir, kfId)) as { ok: boolean; error?: string };
    },
    [projectDir]
  );

  const getKeyframes = useCallback(
    async (blockId: string): Promise<KeyframeRow[]> => {
      if (!window.yiman?.project?.getKeyframes) return [];
      return (await window.yiman.project.getKeyframes(projectDir, blockId)) as KeyframeRow[];
    },
    [projectDir]
  );

  return { createKeyframe, updateKeyframe, deleteKeyframe, getKeyframes };
}
