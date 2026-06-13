"use client";

import { PieChart } from "echarts/charts";
import { GraphicComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([PieChart, CanvasRenderer, TooltipComponent, LegendComponent, GraphicComponent]);

export interface DonutChartDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutChartDatum[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 240,
}: DonutChartProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (target === null) return;

    const chart = echarts.init(target, null, { renderer: "canvas" });
    chart.setOption(buildDonutOption(data, centerLabel, centerValue));

    const handleResize = (): void => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [data, centerLabel, centerValue]);

  if (data.length === 0 || data.every((item) => item.value <= 0)) {
    return <div className="empty-state">No stage data to chart.</div>;
  }

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}

function buildDonutOption(
  data: DonutChartDatum[],
  centerLabel: string | undefined,
  centerValue: string | undefined,
): EChartsCoreOption {
  return {
    animation: true,
    animationDuration: 700,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: "Figtree, sans-serif", color: "#8A9790" },
    tooltip: {
      trigger: "item",
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
    graphic:
      centerValue === undefined
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "42%",
              style: {
                text: centerValue,
                fill: "#E8EDE6",
                font: "500 24px JetBrains Mono",
                textAlign: "center",
              },
            },
            {
              type: "text",
              left: "center",
              top: "55%",
              style: {
                text: centerLabel ?? "",
                fill: "#8A9790",
                font: "12px Figtree",
                textAlign: "center",
              },
            },
          ],
    series: [
      {
        name: centerLabel ?? "Breakdown",
        type: "pie",
        radius: ["54%", "76%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: "#111816",
          borderWidth: 2,
        },
        data: data.map((item) => ({
          name: item.name,
          value: item.value,
          itemStyle: { color: item.color ?? "#D8FF3D" },
        })),
      },
    ],
  };
}
