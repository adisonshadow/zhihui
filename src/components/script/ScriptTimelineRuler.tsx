/**
 * 剧本时间线刻度尺
 */
import React from 'react';

interface ScriptTimelineRulerProps {
  maxTime: number;
  timeToX: (t: number) => number;
}

const MIN_PX_PER_TICK = 50;
const NICE_STEPS = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120];

export function ScriptTimelineRuler({ maxTime, timeToX }: ScriptTimelineRulerProps) {
  const rawStep = MIN_PX_PER_TICK / 40;
  const rulerStep = NICE_STEPS.find((s) => s >= rawStep) ?? Math.ceil(rawStep);
  const ticks: number[] = [];
  for (let t = 0; t <= maxTime; t += rulerStep) ticks.push(t);
  const lastTick = Math.ceil(maxTime);
  if (ticks[ticks.length - 1] !== lastTick) ticks.push(lastTick);

  return (
    <div
      style={{
        flexShrink: 0,
        height: 24,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        background: 'rgba(0,0,0,0.15)',
        paddingLeft: 100,
      }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          style={{
            position: 'absolute',
            left: 100 + timeToX(t) + 2,
            top: 2,
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {Math.abs(t - Math.round(t)) < 1e-6 ? Math.round(t) : t.toFixed(1)}s
        </span>
      ))}
    </div>
  );
}
