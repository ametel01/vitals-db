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
import type { EChartsCoreOption } from "echarts/core";
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
  lineType?: "solid" | "dashed";
  lineWidth?: number;
  area?: boolean;
  smooth?: boolean;
}

export interface LineChartProps {
  series: LineSeries[];
  yAxisLabel?: string;
  yAxisLabels?: string[];
  xAxisType?: "time" | "category";
  height?: number;
  markBand?: { yFrom: number; yTo: number; label: string };
  compact?: boolean;
  showLegend?: boolean;
}

export function LineChart({
  series,
  yAxisLabel,
  yAxisLabels,
  xAxisType = "time",
  height = 280,
  markBand,
  compact = false,
  showLegend = true,
}: LineChartProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (target === null) return;

    const chart = echarts.init(target, null, { renderer: "canvas" });
    chart.setOption(
      buildChartOption({
        series,
        yAxisLabel,
        yAxisLabels,
        xAxisType,
        markBand,
        compact,
        showLegend,
      }),
    );

    const handleResize = (): void => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [series, yAxisLabel, yAxisLabels, xAxisType, markBand, compact, showLegend]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}

const axisLabelStyle = {
  color: "#8A9790",
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontSize: 11,
};

function buildChartOption({
  series,
  yAxisLabel,
  yAxisLabels,
  xAxisType,
  markBand,
  compact,
  showLegend,
}: ChartOptionInput): EChartsCoreOption {
  const markArea = buildMarkArea(markBand, series.length);
  return {
    animation: true,
    animationDuration: 650,
    animationEasing: "cubicOut" as const,
    textStyle: { fontFamily: "Figtree, sans-serif", color: "#8A9790" },
    grid: buildGrid(compact, yAxisLabels),
    tooltip: buildTooltip(),
    legend: buildLegend(showLegend, series.length),
    xAxis: buildXAxis(xAxisType, compact),
    yAxis: buildYAxis(yAxisLabel, yAxisLabels, compact),
    series: series.map((item, index) => buildSeriesItem(item, index, series.length, markArea)),
  } as EChartsCoreOption;
}

interface ChartOptionInput {
  series: LineSeries[];
  yAxisLabel: string | undefined;
  yAxisLabels: string[] | undefined;
  xAxisType: "time" | "category";
  markBand: LineChartProps["markBand"] | undefined;
  compact: boolean;
  showLegend: boolean;
}

function buildMarkArea(markBand: LineChartProps["markBand"], seriesCount: number) {
  if (markBand === undefined || seriesCount === 0) return undefined;
  return {
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
  };
}

function buildGrid(compact: boolean, yAxisLabels: string[] | undefined) {
  return {
    left: compact ? 0 : 52,
    right: compact
      ? 0
      : yAxisLabels === undefined
        ? 24
        : 24 + Math.max(0, yAxisLabels.length - 1) * 52,
    top: compact ? 4 : 28,
    bottom: compact ? 0 : 36,
    containLabel: true,
  };
}

function buildTooltip() {
  return {
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
  };
}

function buildLegend(showLegend: boolean, seriesCount: number) {
  if (!showLegend || seriesCount <= 1) return undefined;
  return {
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
  };
}

function buildXAxis(xAxisType: "time" | "category", compact: boolean) {
  return {
    type: xAxisType,
    boundaryGap: false,
    axisLine: compact ? { show: false } : { lineStyle: { color: "#242F2B" } },
    axisTick: { show: false },
    axisLabel: compact ? { show: false } : axisLabelStyle,
    splitLine: { show: false },
  };
}

function buildYAxis(
  yAxisLabel: string | undefined,
  yAxisLabels: string[] | undefined,
  compact: boolean,
) {
  if (yAxisLabels === undefined) return buildSingleYAxis(yAxisLabel, compact);
  return yAxisLabels.map((label, index) => buildMultiYAxis(label, index, compact));
}

function buildAxisBase(compact: boolean) {
  return {
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
    axisLabel: compact ? { show: false } : axisLabelStyle,
  };
}

function buildSingleYAxis(label: string | undefined, compact: boolean) {
  return {
    ...buildAxisBase(compact),
    name: label,
    splitLine: {
      show: !compact,
      lineStyle: { color: "rgba(36, 47, 43, 0.6)", type: "dashed" },
    },
  };
}

function buildMultiYAxis(label: string, index: number, compact: boolean) {
  return {
    ...buildAxisBase(compact),
    name: label,
    position: index === 0 ? "left" : "right",
    offset: index <= 1 ? 0 : (index - 1) * 52,
    splitLine: index === 0 ? buildSplitLine(compact) : { show: false },
  };
}

function buildSplitLine(compact: boolean) {
  return {
    show: !compact,
    lineStyle: { color: "rgba(36, 47, 43, 0.6)", type: "dashed" },
  };
}

function buildSeriesItem(
  item: LineSeries,
  index: number,
  seriesCount: number,
  markArea: ReturnType<typeof buildMarkArea>,
) {
  const color = item.color ?? "#D8FF3D";
  return {
    name: item.name,
    type: "line",
    yAxisIndex: item.yAxisIndex ?? 0,
    showSymbol: false,
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
    data: item.data,
    itemStyle: { color },
    areaStyle: item.area === true || seriesCount === 1 ? buildAreaStyle(color) : undefined,
    ...(index === 0 && markArea !== undefined ? { markArea } : {}),
    lineStyle: {
      width: item.lineWidth ?? 2,
      color,
      cap: "round",
      type: item.lineType ?? "solid",
    },
    smooth: item.smooth ?? true,
  };
}

function buildAreaStyle(color: string) {
  return {
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
  };
}
