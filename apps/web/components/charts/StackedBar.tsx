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
    const axisLabelStyle = {
      color: "#8A9790",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11,
    };

    chart.setOption({
      animation: true,
      animationDuration: 650,
      animationEasing: "cubicOut",
      textStyle: { fontFamily: "Figtree, sans-serif", color: "#8A9790" },
      grid: { left: 52, right: 24, top: 28, bottom: 36, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(216,255,61,0.04)" } },
        backgroundColor: "rgba(12, 18, 16, 0.96)",
        borderColor: "#26322F",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: "#E8EDE6",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 12,
        },
      },
      legend:
        series.length > 1
          ? {
              top: 0,
              right: 0,
              textStyle: {
                color: "#8A9790",
                fontFamily: "Figtree, sans-serif",
                fontSize: 12,
              },
              icon: "roundRect",
              itemWidth: 10,
              itemHeight: 4,
              itemGap: 18,
            }
          : undefined,
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: "#242F2B" } },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
      },
      yAxis: {
        type: "value",
        name: yAxisLabel,
        nameGap: 24,
        nameTextStyle: {
          color: "#546058",
          fontFamily: "Fraunces, serif",
          fontStyle: "italic",
          fontSize: 11,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
        splitLine: {
          lineStyle: { color: "rgba(36, 47, 43, 0.6)", type: "dashed" },
        },
      },
      series: series.map((s, index) => ({
        name: s.name,
        type: "bar",
        stack: stackName,
        barMaxWidth: 36,
        data: s.data,
        itemStyle: {
          color: s.color ?? "#D8FF3D",
          borderRadius: index === series.length - 1 ? [4, 4, 0, 0] : index === 0 ? [0, 0, 4, 4] : 0,
        },
        emphasis: { focus: "series" },
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
