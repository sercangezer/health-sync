import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { formatShortDateTR } from '../format';
import { Button, Panel, StateBlock } from '../primitives';

function readActiveChartPalette() {
  if (typeof window === 'undefined') {
    return {
      text: 'var(--color-text-sub)',
      border: 'var(--color-border)',
      surface: 'var(--color-bg-elevated)',
      colors: [
        'var(--color-chart-1)',
        'var(--color-chart-2)',
        'var(--color-chart-3)',
        'var(--color-chart-4)',
        'var(--color-chart-5)',
        'var(--color-chart-6)',
      ],
    };
  }
  const style = getComputedStyle(document.documentElement);
  const val = (name: string) => style.getPropertyValue(name).trim() || 'currentColor';
  return {
    text: val('--color-text-sub'),
    border: val('--color-border'),
    surface: val('--color-bg-elevated'),
    colors: [
      val('--color-chart-1'),
      val('--color-chart-2'),
      val('--color-chart-3'),
      val('--color-chart-4'),
      val('--color-chart-5'),
      val('--color-chart-6'),
    ],
  };
}

function useAccessibleChartSvg(containerRef: React.RefObject<HTMLDivElement | null>, title: string) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const applyLabel = () => {
      el.querySelectorAll('svg').forEach((svg) => {
        if (!svg.getAttribute('aria-label')) {
          svg.setAttribute('aria-label', title);
        }
      });
    };
    applyLabel();
    const obs = new MutationObserver(applyLabel);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [containerRef, title]);
}

export interface LineSeries {
  id: string;
  data: Array<{ x: string | number; y: number | null }>;
}

export function LineChart({
  title,
  xAxisLabel,
  yAxisLabel,
  series,
  loading = false,
  error = null,
  onInspect,
}: {
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  series: LineSeries[];
  loading?: boolean;
  error?: string | null;
  onInspect?: () => void;
}) {
  const [palette, setPalette] = useState(readActiveChartPalette);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useAccessibleChartSvg(boxRef, title);

  useEffect(() => {
    const update = () => setPalette(readActiveChartPalette());
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const cappedSeries = series.slice(0, 6).map((s) => ({
    ...s,
    data: s.data.map((pt) => ({
      ...pt,
      x: typeof pt.x === 'string' ? formatShortDateTR(pt.x) : pt.x,
    })),
  }));
  const hasPoints = cappedSeries.some((s) => s.data.length > 0);

  return (
    <Panel
      title={title}
      actions={
        onInspect ? (
          <Button variant="ghost" onPress={onInspect}>
            Kaynak tabloya git
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <StateBlock state="loading" title={`${title} yükleniyor`} description="Grafik serisi hazırlanıyor..." />
      ) : error ? (
        <StateBlock state="error" title={`${title} hatası`} description={error} />
      ) : !hasPoints ? (
        <StateBlock state="empty" title={title} description="Seçili zaman penceresinde grafik verisi bulunmuyor." />
      ) : (
        <div ref={boxRef} className="hs-chart-box" role="img" aria-label={title}>
          <ResponsiveLine
            data={cappedSeries}
            ariaLabel={title}
            colors={palette.colors}
            animate={false}
            margin={{ top: 16, right: 20, bottom: 56, left: 52 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
            axisBottom={{
              legend: xAxisLabel,
              legendOffset: 34,
              legendPosition: 'middle',
              tickSize: 4,
              tickPadding: 6,
            }}
            axisLeft={{
              legend: yAxisLabel,
              legendOffset: -42,
              legendPosition: 'middle',
              tickSize: 4,
              tickPadding: 6,
            }}
            pointSize={6}
            useMesh={true}
            enableGridX={false}
            legends={
              cappedSeries.length > 1
                ? [
                    {
                      anchor: 'bottom',
                      direction: 'row',
                      translateY: 54,
                      itemWidth: 130,
                      itemHeight: 16,
                      symbolSize: 10,
                    },
                  ]
                : []
            }
            theme={{
              text: {
                fill: palette.text,
                fontSize: 12,
                fontFamily: 'IBM Plex Sans, sans-serif',
              },
              grid: {
                line: {
                  stroke: palette.border,
                  strokeWidth: 1,
                },
              },
              axis: {
                domain: { line: { stroke: palette.border, strokeWidth: 1 } },
                ticks: {
                  line: { stroke: palette.border, strokeWidth: 1 },
                  text: { fill: palette.text, fontSize: 12 },
                },
                legend: {
                  text: { fill: palette.text, fontSize: 12, fontWeight: 600 },
                },
              },
              tooltip: {
                container: {
                  background: palette.surface,
                  color: palette.text,
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${palette.border}`,
                },
              },
            }}
          />
        </div>
      )}
    </Panel>
  );
}

export function BarChart({
  title,
  indexBy,
  keys,
  xAxisLabel,
  yAxisLabel,
  data,
  loading = false,
  error = null,
  onInspect,
}: {
  title: string;
  indexBy: string;
  keys: string[];
  xAxisLabel: string;
  yAxisLabel: string;
  data: Array<Record<string, string | number>>;
  loading?: boolean;
  error?: string | null;
  onInspect?: () => void;
}) {
  const [palette, setPalette] = useState(readActiveChartPalette);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useAccessibleChartSvg(boxRef, title);

  useEffect(() => {
    const update = () => setPalette(readActiveChartPalette());
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const formattedData = data.map((row) => {
    const idxVal = row[indexBy];
    if (typeof idxVal === 'string') {
      return { ...row, [indexBy]: formatShortDateTR(idxVal) };
    }
    return row;
  });

  return (
    <Panel
      title={title}
      actions={
        onInspect ? (
          <Button variant="ghost" onPress={onInspect}>
            Kaynak tabloya git
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <StateBlock state="loading" title={`${title} yükleniyor`} description="Grafik serisi hazırlanıyor..." />
      ) : error ? (
        <StateBlock state="error" title={`${title} hatası`} description={error} />
      ) : formattedData.length === 0 ? (
        <StateBlock state="empty" title={title} description="Seçili zaman penceresinde grafik verisi bulunmuyor." />
      ) : (
        <div ref={boxRef} className="hs-chart-box" role="img" aria-label={title}>
          <ResponsiveBar
            data={formattedData}
            ariaLabel={title}
            keys={keys.slice(0, 6)}
            indexBy={indexBy}
            colors={palette.colors}
            animate={false}
            groupMode="grouped"
            margin={{ top: 16, right: 20, bottom: 56, left: 52 }}
            padding={0.28}
            axisBottom={{
              legend: xAxisLabel,
              legendPosition: 'middle',
              legendOffset: 34,
            }}
            axisLeft={{
              legend: yAxisLabel,
              legendPosition: 'middle',
              legendOffset: -42,
            }}
            enableLabel={false}
            legends={
              keys.length > 1
                ? [
                    {
                      dataFrom: 'keys',
                      anchor: 'bottom',
                      direction: 'row',
                      translateY: 54,
                      itemWidth: 140,
                      itemHeight: 16,
                      symbolSize: 10,
                    },
                  ]
                : []
            }
            theme={{
              text: {
                fill: palette.text,
                fontSize: 12,
                fontFamily: 'IBM Plex Sans, sans-serif',
              },
              grid: {
                line: {
                  stroke: palette.border,
                  strokeWidth: 1,
                },
              },
              axis: {
                domain: { line: { stroke: palette.border, strokeWidth: 1 } },
                ticks: {
                  line: { stroke: palette.border, strokeWidth: 1 },
                  text: { fill: palette.text, fontSize: 12 },
                },
                legend: {
                  text: { fill: palette.text, fontSize: 12, fontWeight: 600 },
                },
              },
            }}
          />
        </div>
      )}
    </Panel>
  );
}
