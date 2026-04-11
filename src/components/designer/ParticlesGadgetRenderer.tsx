/**
 * 脚本特效渲染器：从 src/particlesGadgets/${presetId}/ 加载渲染模块，
 * 将 fields 传入 createRenderer，在容器内启动 Canvas 粒子动画
 */
import React, { useEffect, useRef } from 'react';

const renderModules = import.meta.glob<{
  createRenderer: (
    container: HTMLDivElement,
    fields: Record<string, string | number>,
    width: number,
    height: number
  ) => () => void;
}>('/src/particlesGadgets/*/render.ts');

interface ParticlesGadgetRendererProps {
  presetId: string;
  fields: Record<string, string | number>;
  width: number;
  height: number;
}

function propsAreEqual(
  prev: ParticlesGadgetRendererProps,
  next: ParticlesGadgetRendererProps
): boolean {
  if (prev.presetId !== next.presetId) return false;
  if (prev.width !== next.width || prev.height !== next.height) return false;
  return JSON.stringify(prev.fields) === JSON.stringify(next.fields);
}

export const ParticlesGadgetRenderer = React.memo(function ParticlesGadgetRenderer({
  presetId,
  fields,
  width,
  height,
}: ParticlesGadgetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const destroyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const loadFn = renderModules[`/src/particlesGadgets/${presetId}/render.ts`];
    if (!loadFn) return;

    let cancelled = false;
    loadFn().then((mod) => {
      if (cancelled || !containerRef.current) return;
      const createRenderer = mod.createRenderer ?? (mod as { default?: typeof mod.createRenderer }).default;
      if (typeof createRenderer !== 'function') return;
      destroyRef.current?.();
      destroyRef.current = createRenderer(containerRef.current!, fields, width, height);
    });

    return () => {
      cancelled = true;
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, [presetId, fields, width, height]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'transparent', overflow: 'hidden' }}
    />
  );
}, propsAreEqual);
