/**
 * 字幕叠加层：不跟随镜头变化，sticky 在画布底部
 * 根据当前时间显示匹配的字幕内容
 */
import React from 'react';
import type { SubtitleConfig, SubtitleItem, SubtitleStyle } from './SubtitleSettingsPanel';

interface SubtitleOverlayProps {
  config: SubtitleConfig | null;
  currentTime: number;
  designWidth: number;
  designHeight: number;
}

const DEFAULT_STYLE: SubtitleStyle = {
  fontSize: 78,
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  color: '#ffffff',
  shadowColor: '#000000',
  shadowSize: 6,
  paddingX: 30,
  paddingBottom: 60,
};

function getActiveSubtitle(items: SubtitleItem[], currentTime: number): SubtitleItem | null {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const item = sorted[i];
    const dur = typeof item.duration === 'number' ? item.duration : 2;
    const end = item.startTime + dur;
    if (currentTime >= item.startTime && currentTime < end) {
      return item;
    }
  }
  return null;
}

export const SubtitleOverlay = React.memo(function SubtitleOverlay({ config, currentTime, designWidth, designHeight }: SubtitleOverlayProps) {
  if (!config || !config.items || config.items.length === 0) return null;

  const style = { ...DEFAULT_STYLE, ...config.style };
  const active = getActiveSubtitle(config.items, currentTime);
  if (!active || !active.content) return null;

  const { fontSize, fontFamily, fontWeight, color, shadowColor, shadowSize, paddingX, paddingBottom } = style;
  const shadow = `${shadowSize}px ${shadowSize}px 0 ${shadowColor}, -${shadowSize}px ${shadowSize}px 0 ${shadowColor}, ${shadowSize}px -${shadowSize}px 0 ${shadowColor}, -${shadowSize}px -${shadowSize}px 0 ${shadowColor}`;
  const cssWeight = fontWeight === 'light' ? 300 : fontWeight === 'bold' ? 700 : 400;

  return (
    <div
      style={{
        position: 'absolute',
        left: paddingX,
        right: paddingX,
        bottom: paddingBottom,
        textAlign: 'center',
        lineHeight: 1.5,
        pointerEvents: 'none',
        zIndex: 9999,
        fontFamily: fontFamily || 'sans-serif',
        fontWeight: cssWeight,
      }}
    >
      <span
        style={{
          fontSize,
          color,
          textShadow: shadow,
        }}
      >
        {active.content}
      </span>
    </div>
  );
});
