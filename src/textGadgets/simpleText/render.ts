/**
 * 双行文字组件的渲染逻辑
 * 导出 render(fields, width, height) 返回虚拟 DOM 树，由 TextGadgetRenderer 转换为 React 渲染
 */

export interface TextGadgetFields {
  [key: string]: { content: string; fontSize: number; color: string; fontFamily: string };
}

export interface RenderTree {
  type: string;
  key?: string;
  props?: Record<string, unknown>;
  children?: RenderTree | RenderTree[] | string;
}

export function render(
  fields: TextGadgetFields,
  _width: number,
  height: number
): RenderTree | null {
  if (!fields || typeof fields !== 'object') return null;
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;

  const scale = height / 200;

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        padding: 8,
      },
    },
    children: entries.map(([key, line]) => ({
      type: 'span',
      key,
      props: {
        style: {
          fontFamily: line.fontFamily || 'cursive',
          fontSize: Math.max(1, (line.fontSize || 24) * scale),
          color: line.color || '#fff',
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
        },
      },
      children: line.content || ' ',
    })),
  };
}
