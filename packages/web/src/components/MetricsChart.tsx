import React, { useEffect, useRef } from 'react';

interface Props {
  inspections: any[];
}

export default function MetricsChart({ inspections }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!chartRef.current || inspections.length === 0) return;

    let disposed = false;
    let removeResize: (() => void) | null = null;

    async function renderChart() {
      const [
        echarts,
        charts,
        components,
        renderers,
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);

      if (disposed || !chartRef.current) return;

      echarts.use([
        charts.LineChart,
        components.GridComponent,
        components.LegendComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ]);

      if (!chartRef.current) return;
      if (instanceRef.current) instanceRef.current.dispose();

      const chart = echarts.init(chartRef.current);
      instanceRef.current = chart;

      const reversed = [...inspections].reverse();
      const dates = reversed.map((i: any) => i.date?.substring(5) || '');

      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['星级', '体验分', '劣质率%'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
        yAxis: [
          { type: 'value', min: 0, max: 5, axisLabel: { fontSize: 10 } },
          { type: 'value', min: 0, axisLabel: { fontSize: 10, formatter: '{value}%' } },
        ],
        series: [
          {
            name: '星级', type: 'line', data: reversed.map((i: any) => i.metrics?.rating || null),
            smooth: true, lineStyle: { color: '#3b82f6' },
          },
          {
            name: '体验分', type: 'line', data: reversed.map((i: any) => i.metrics?.expBasic || null),
            smooth: true, lineStyle: { color: '#10b981' },
          },
          {
            name: '劣质率%', type: 'line', yAxisIndex: 1,
            data: reversed.map((i: any) => i.metrics?.defectRate != null ? (i.metrics.defectRate * 100).toFixed(1) : null),
            smooth: true, lineStyle: { color: '#ef4444' },
          },
        ],
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);
      removeResize = () => window.removeEventListener('resize', handleResize);
    }

    renderChart();

    return () => {
      disposed = true;
      removeResize?.();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [inspections]);

  return <div ref={chartRef} style={{ height: 280 }} />;
}
