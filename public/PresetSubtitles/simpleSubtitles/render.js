/**
 * 简单字幕组件渲染逻辑
 * 根据当前时间从字幕列表中找到匹配项并渲染（不显示说话人）
 *
 * @param {Array<{ speaker?: string; startTime: number; duration?: number; content: string }>} items - 字幕列表
 * @param {number} currentTime - 当前播放时间（秒）
 * @param {{ fontSize?: number; fontFamily?: string; fontWeight?: string; color?: string; shadowColor?: string; shadowSize?: number; paddingX?: number; paddingBottom?: number }} style - 样式配置
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {{ type: string; props?: object; children?: unknown } | null}
 */
export function render(items, currentTime, style, width, height) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  let active = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const item = sorted[i];
    const dur = typeof item.duration === 'number' ? item.duration : 2;
    const end = item.startTime + dur;
    if (currentTime >= item.startTime && currentTime < end) {
      active = item;
      break;
    }
  }

  if (!active || !active.content) return null;

  const fontSize = style?.fontSize ?? 78;
  const fontFamily = style?.fontFamily ?? 'sans-serif';
  const fontWeight = style?.fontWeight === 'light' ? 300 : style?.fontWeight === 'bold' ? 700 : 400;
  const color = style?.color ?? '#ffffff';
  const shadowColor = style?.shadowColor ?? '#000000';
  const shadowSize = style?.shadowSize ?? 6;
  const paddingX = style?.paddingX ?? 30;
  const paddingBottom = style?.paddingBottom ?? 60;
  const shadow = `${shadowSize}px ${shadowSize}px 0 ${shadowColor}, -${shadowSize}px ${shadowSize}px 0 ${shadowColor}, ${shadowSize}px -${shadowSize}px 0 ${shadowColor}, -${shadowSize}px -${shadowSize}px 0 ${shadowColor}`;

  const children = [{
    type: 'span',
    key: 'content',
    props: {
      style: {
        fontSize,
        color,
        textShadow: shadow,
      },
    },
    children: active.content,
  }];

  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        left: paddingX,
        right: paddingX,
        bottom: paddingBottom,
        textAlign: 'center',
        lineHeight: 1.5,
        pointerEvents: 'none',
        zIndex: 9999,
        fontFamily,
        fontWeight,
      },
    },
    children,
  };
}
