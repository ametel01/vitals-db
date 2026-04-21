"use client";

import { BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([
  BarChart,
  CanvasRenderer,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
]);

export interface StackedBarSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface StackedBarProps {
  categories: string[];
  series: StackedBarSeries[];
  yAxisLabel?: string;
  stackName?: string;
  height?: number;
}

export function StackedBar({
  categories,
  series,
  yAxisLabel,
  stackName = "total",
  height = 280,
}: StackedBarProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (target === null) return;

    const chart = echarts.init(target, null, { renderer: "canvas" });
    chart.setOption({
      animation: false,
      grid: { left: 48, right: 24, top: 24, bottom: 36 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: series.length > 1 ? { top: 0 } : undefined,
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value", name: yAxisLabel, nameGap: 24 },
      series: series.map((s) => ({
        name: s.name,
        type: "bar",
        stack: stackName,
        data: s.data,
        ...(s.color === undefined ? {} : { color: s.color }),
      })),
    });

    const handleResize = (): void => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [categories, series, yAxisLabel, stackName]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
