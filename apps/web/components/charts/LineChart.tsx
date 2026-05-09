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
  yAxisIndex?: number;
}

export interface LineChartProps {
  series: LineSeries[];
  yAxisLabel?: string;
  yAxisLabels?: string[];
  xAxisType?: "time" | "category";
  height?: number;
  markBand?: { yFrom: number; yTo: number; label: string };
}

export function LineChart({
  series,
  yAxisLabel,
  yAxisLabels,
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
            itemStyle: { color: "rgba(216, 255, 61, 0.10)" },
            label: {
              color: "#D8FF3D",
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 10,
              fontWeight: 500,
              position: "insideTopLeft",
            },
            data: [[{ yAxis: markBand.yFrom, name: markBand.label }, { yAxis: markBand.yTo }]],
          }
        : undefined;

    const axisLabelStyle = {
      color: "#8A9790",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11,
    };

    const axisBase = {
      type: "value",
      nameGap: 24,
      scale: true,
      nameTextStyle: {
        color: "#546058",
        fontFamily: "Fraunces, serif",
        fontStyle: "italic",
        fontSize: 11,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabelStyle,
    };

    const yAxisConfig =
      yAxisLabels === undefined
        ? ({
            ...axisBase,
            name: yAxisLabel,
            splitLine: {
              lineStyle: { color: "rgba(36, 47, 43, 0.6)", type: "dashed" },
            },
          } as const)
        : yAxisLabels.map((label, index) => ({
            ...axisBase,
            name: label,
            position: index === 0 ? "left" : "right",
            offset: index <= 1 ? 0 : (index - 1) * 52,
            splitLine:
              index === 0
                ? {
                    lineStyle: { color: "rgba(36, 47, 43, 0.6)", type: "dashed" },
                  }
                : { show: false },
          }));

    chart.setOption({
      animation: true,
      animationDuration: 650,
      animationEasing: "cubicOut",
      textStyle: { fontFamily: "Figtree, sans-serif", color: "#8A9790" },
      grid: {
        left: 52,
        right: yAxisLabels === undefined ? 24 : 24 + Math.max(0, yAxisLabels.length - 1) * 52,
        top: 28,
        bottom: 36,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(12, 18, 16, 0.96)",
        borderColor: "#26322F",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: "#E8EDE6",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 12,
        },
        axisPointer: {
          lineStyle: { color: "#354541", type: "dashed", width: 1 },
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
        type: xAxisType,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#242F2B" } },
        axisTick: { show: false },
        axisLabel: axisLabelStyle,
        splitLine: { show: false },
      },
      yAxis: yAxisConfig,
      series: series.map((s, index) => {
        const color = s.color ?? "#D8FF3D";
        return {
          name: s.name,
          type: "line",
          yAxisIndex: s.yAxisIndex ?? 0,
          showSymbol: false,
          smooth: true,
          smoothMonotone: "x",
          symbol: "circle",
          symbolSize: 6,
          emphasis: {
            focus: "series",
            itemStyle: {
              borderColor: color,
              borderWidth: 2,
              color: "#0A0D0B",
            },
          },
          data: s.data,
          lineStyle: { width: 2, color, cap: "round" },
          itemStyle: { color },
          areaStyle:
            series.length === 1
              ? {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: `${color}33` },
                      { offset: 1, color: `${color}00` },
                    ],
                  },
                }
              : undefined,
          ...(index === 0 && markArea !== undefined ? { markArea } : {}),
        };
      }),
    });

    const handleResize = (): void => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [series, yAxisLabel, yAxisLabels, xAxisType, markBand]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
