/**
 * 双行文字组件的渲染逻辑
 * 导出 render(fields, width, height) 返回虚拟 DOM 树，由 TextGadgetRenderer 转换为 React 渲染
 *
 * @param {Record<string, { content: string; fontSize: number; color: string; fontFamily: string }>} fields - 各文字字段配置
 * @param {number} width - 渲染区域宽度（px）
 * @param {number} height - 渲染区域高度（px）
 * @returns {{ type: string; props?: object; children?: unknown } | null} 虚拟 DOM 树
 */
export function render(fields, width, height) {
  if (!fields || typeof fields !== 'object') return null;
  const scale = height / 200;
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;

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
