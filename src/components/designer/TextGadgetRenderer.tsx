/**
 * 文字组件渲染器：从 src/textGadgets/${presetId}/ 加载渲染模块，
 * 将 fields 传入渲染函数，在画布中渲染文字内容
 */
import React, { useState, useEffect, useRef } from 'react';

export interface TextGadgetRenderTree {
  type: string;
  key?: string;
  props?: Record<string, unknown>;
  children?: TextGadgetRenderTree | TextGadgetRenderTree[] | string;
}

function treeToReact(
  tree: TextGadgetRenderTree | string | null | undefined,
  React: typeof import('react')
): React.ReactNode {
  if (tree == null) return null;
  if (typeof tree === 'string') return tree;
  const { type, props = {}, children } = tree;
  const key = (props.key as string) ?? (tree as TextGadgetRenderTree).key;
  const restProps = { ...props };
  delete restProps.key;
  const childNodes = Array.isArray(children)
    ? children.map((c) => treeToReact(c, React))
    : treeToReact(children as TextGadgetRenderTree | string | undefined, React);
  return React.createElement(type, key ? { ...restProps, key } : restProps, childNodes);
}

// Vite 预加载 src/textGadgets/*/render.ts，避免 public 的 CSP 限制
const renderModules = import.meta.glob<{ render: (fields: unknown, width: number, height: number) => TextGadgetRenderTree | null }>('/src/textGadgets/*/render.ts');

interface TextGadgetRendererProps {
  presetId: string;
  fields: Record<string, { content: string; fontSize: number; color: string; fontFamily: string }>;
  width: number;
  height: number;
}

function propsAreEqual(
  prev: TextGadgetRendererProps,
  next: TextGadgetRendererProps
): boolean {
  if (prev.presetId !== next.presetId) return false;
  if (prev.width !== next.width || prev.height !== next.height) return false;
  return JSON.stringify(prev.fields) === JSON.stringify(next.fields);
}

/** 动态加载 preset 的 render 模块并渲染；拆分加载与渲染，避免播放时 fields/width/height 每帧变化导致闪烁 */
export const TextGadgetRenderer = React.memo(function TextGadgetRenderer({ presetId, fields, width, height }: TextGadgetRendererProps) {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [error, setError] = useState<string | null>(null);
  const renderFnRef = useRef<((f: unknown, w: number, h: number) => TextGadgetRenderTree | null) | null>(null);
  const lastRenderKeyRef = useRef<string>('');

  // 仅 presetId 变化时加载模块，避免播放时每帧重载
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setContent(null);
    renderFnRef.current = null;
    lastRenderKeyRef.current = '';

    const load = async () => {
      try {
        const loadFn = renderModules[`/src/textGadgets/${presetId}/render.ts`];
        if (!loadFn) {
          setError(`未找到 preset: ${presetId}`);
          return;
        }
        const mod = await loadFn();
        if (cancelled) return;
        const fn = mod.render ?? (mod as { default?: unknown }).default;
        if (typeof fn !== 'function') {
          setError('渲染方法不存在');
          return;
        }
        renderFnRef.current = fn;
        const tree = fn(fields, width, height);
        if (cancelled) return;
        lastRenderKeyRef.current = JSON.stringify({ fields, width, height });
        setContent(tree ? treeToReact(tree, React) : null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [presetId]);

  // fields/width/height 变化时仅重新渲染，不重置为加载态，避免闪烁
  useEffect(() => {
    const fn = renderFnRef.current;
    if (!fn) return;
    const key = JSON.stringify({ fields, width, height });
    if (key === lastRenderKeyRef.current) return;
    lastRenderKeyRef.current = key;
    const tree = fn(fields, width, height);
    setContent(tree ? treeToReact(tree, React) : null);
  }, [presetId, fields, width, height]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        {error}
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        加载中…
      </div>
    );
  }

  return <>{content}</>;
}, propsAreEqual);
