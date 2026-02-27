/**
 * 虚拟滚动网格：基于 antd Grid，仅渲染可视区域内的列表项
 * 适用于大量数据的列表/网格展示，避免一次性渲染全部 DOM
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Row, Col, Grid } from 'antd';

const { useBreakpoint } = Grid;

/** 响应式列数配置，同 antd 断点：xs sm md lg xl xxl xxxl */
export type ResponsiveColumns = Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl', number>>;

export interface VirtualGridProps<T> {
  /** 数据源 */
  data: T[];
  /** 每行高度（px），固定高度用于计算可视范围，含行间距 */
  rowHeight: number;
  /** 渲染单项 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 每行列数，支持响应式对象，如 { xs: 2, sm: 3, md: 4, lg: 4, xl: 5, xxl: 6 } */
  columns?: number | ResponsiveColumns;
  /** 容器高度，不传则使用父容器 100% */
  height?: number | string;
  /** 视口上下额外渲染的行数，减少滚动白屏 */
  overscan?: number;
  /** 列间距（gutter），同 antd Row gutter */
  gutter?: number | [number, number];
  /** 单项 key 提取 */
  getItemKey?: (item: T, index: number) => string | number;
}

const BREAKPOINT_ORDER: (keyof ResponsiveColumns)[] = ['xxxl', 'xxl', 'xl', 'lg', 'md', 'sm', 'xs'];

function resolveColumns(columns: number | ResponsiveColumns | undefined, screens: Partial<Record<string, boolean>>): number {
  if (columns == null) return 1;
  if (typeof columns === 'number') return columns;
  for (const key of BREAKPOINT_ORDER) {
    if (screens[key] && columns[key] != null) return columns[key]!;
  }
  return columns.xs ?? 1;
}

export function VirtualGrid<T>({
  data,
  rowHeight,
  renderItem,
  columns = 1,
  height = '100%',
  overscan = 3,
  gutter = 12,
  getItemKey = (_, i) => i,
}: VirtualGridProps<T>) {
  const screens = useBreakpoint() ?? {};
  const resolvedColumns = useMemo(() => resolveColumns(columns, screens), [columns, screens]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
  }, []);

  useEffect(() => {
    measureContainer();
    const ro = new ResizeObserver(measureContainer);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measureContainer]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const rowCount = Math.ceil(data.length / resolvedColumns);
  const totalHeight = rowCount * rowHeight;

  const visibleStartRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleRowCount = containerHeight > 0 ? Math.ceil(containerHeight / rowHeight) + overscan * 2 : 10;
  const visibleEndRow = Math.min(rowCount - 1, visibleStartRow + visibleRowCount - 1);

  const offsetY = visibleStartRow * rowHeight;

  const colProps = useMemo(() => {
    if (typeof columns === 'number') {
      return { flex: `${100 / columns}%` };
    }
    if (columns && typeof columns === 'object') {
      const props: Record<string, { flex: string }> = {};
      for (const key of BREAKPOINT_ORDER) {
        const c = columns[key];
        if (c != null && c > 0) props[key] = { flex: `${100 / c}%` };
      }
      return Object.keys(props).length > 0 ? props : { flex: '100%' };
    }
    return { flex: '100%' };
  }, [columns]);

  const rowsByRowIndex = new Map<number, { item: T; index: number }[]>();
  for (let row = visibleStartRow; row <= visibleEndRow; row++) {
    const cells: { item: T; index: number }[] = [];
    for (let col = 0; col < resolvedColumns; col++) {
      const index = row * resolvedColumns + col;
      if (index >= data.length) break;
      cells.push({ item: data[index]!, index });
    }
    if (cells.length > 0) rowsByRowIndex.set(row, cells);
  }

  const sortedRows = Array.from(rowsByRowIndex.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: offsetY,
            width: '100%',
          }}
        >
          {sortedRows.map(([rowIndex, cells]) => (
            <Row key={rowIndex} gutter={gutter} style={{ minHeight: rowHeight - 8, alignItems: resolvedColumns === 1 ? 'center' : 'flex-start', marginBottom: 8 }}>
              {cells.map(({ item, index }) => (
                <Col key={getItemKey(item, index)} {...colProps}>
                  {renderItem(item, index)}
                </Col>
              ))}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
