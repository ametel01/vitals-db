"use client";

import { LineChart as EChartsLineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([
  EChartsLineChart,
  CanvasRenderer,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
]);

export interface LineSeries {
  name: string;
  data: Array<[string, number]>;
  color?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  yAxisLabel?: string;
  xAxisType?: "time" | "category";
  height?: number;
  markBand?: { yFrom: number; yTo: number; label: string };
}

export function LineChart({
  series,
  yAxisLabel,
  xAxisType = "time",
  height = 280,
  markBand,
}: LineChartProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (target === null) return;

    const chart = echarts.init(target, null, { renderer: "canvas" });

    const firstSeries = series[0];
    const markArea =
      markBand !== undefined && firstSeries !== undefined
        ? {
            silent: true,
            itemStyle: { color: "rgba(96, 165, 250, 0.18)" },
            data: [[{ yAxis: markBand.yFrom, name: markBand.label }, { yAxis: markBand.yTo }]],
          }
        : undefined;

    chart.setOption({
      animation: false,
      grid: { left: 48, right: 24, top: 24, bottom: 36 },
      tooltip: { trigger: "axis" },
      legend: series.length > 1 ? { top: 0 } : undefined,
      xAxis: {
        type: xAxisType,
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        name: yAxisLabel,
        nameGap: 24,
        scale: true,
      },
      series: series.map((s, index) => ({
        name: s.name,
        type: "line",
        showSymbol: false,
        smooth: true,
        data: s.data,
        lineStyle: { width: 2 },
        ...(s.color === undefined ? {} : { color: s.color }),
        ...(index === 0 && markArea !== undefined ? { markArea } : {}),
      })),
    });

    const handleResize = (): void => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [series, yAxisLabel, xAxisType, markBand]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
