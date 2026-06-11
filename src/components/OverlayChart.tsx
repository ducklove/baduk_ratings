import { useMemo } from 'react';
import { formatRating } from '../lib/format';
import type { Translation } from '../lib/i18n';
import type { HistoryPoint } from '../types';

export type ChartSeries = {
  id: string;
  name: string;
  points: HistoryPoint[];
  /** CSS modifier suffix: chart-line-{variant} */
  variant: 'a' | 'b' | 'primary' | 'secondary';
};

const PAD_LEFT = 8;
const PAD_RIGHT = 50;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

function parseTime(point: HistoryPoint) {
  const time = Date.parse(point.date);
  return Number.isNaN(time) ? null : time;
}

export function OverlayChart({
  series,
  t,
  width = 340,
  height = 160,
}: {
  series: ChartSeries[];
  t: Translation;
  width?: number;
  height?: number;
}) {
  const chart = useMemo(() => {
    const usable = series
      .map((item) => ({
        ...item,
        points: item.points.filter((point) => parseTime(point) !== null),
      }))
      .filter((item) => item.points.length >= 2);

    if (!usable.length) {
      return null;
    }

    const allPoints = usable.flatMap((item) => item.points);
    const times = allPoints.map((point) => parseTime(point) as number);
    const ratings = allPoints.map((point) => point.rating);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);
    const timeSpan = Math.max(1, maxTime - minTime);
    const ratingSpan = Math.max(1, maxRating - minRating);
    const plotWidth = width - PAD_LEFT - PAD_RIGHT;
    const plotHeight = height - PAD_TOP - PAD_BOTTOM;

    const xOf = (point: HistoryPoint) =>
      PAD_LEFT + (((parseTime(point) as number) - minTime) / timeSpan) * plotWidth;
    const yOf = (point: HistoryPoint) =>
      PAD_TOP + plotHeight - ((point.rating - minRating) / ratingSpan) * plotHeight;

    const lines = usable.map((item) => {
      const path = item.points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(point).toFixed(1)},${yOf(point).toFixed(1)}`)
        .join(' ');
      const last = item.points[item.points.length - 1];
      return {
        id: item.id,
        name: item.name,
        variant: item.variant,
        path,
        lastX: xOf(last),
        lastY: yOf(last),
        lastValue: last.rating,
      };
    });

    return { lines, minRating, maxRating };
  }, [height, series, width]);

  if (!chart) {
    return <div className="overlay-chart-empty muted">{t.noChartData}</div>;
  }

  return (
    <div className="overlay-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.comparisonChart}>
        <text className="chart-axis-label" x={PAD_LEFT} y={PAD_TOP - 3}>
          {formatRating(chart.maxRating)}
        </text>
        <text className="chart-axis-label" x={PAD_LEFT} y={height - 2}>
          {formatRating(chart.minRating)}
        </text>
        {chart.lines.map((line) => (
          <g key={line.id} className={`chart-line chart-line-${line.variant}`}>
            <path d={line.path} />
            <circle cx={line.lastX} cy={line.lastY} r={2.6} />
            <text
              className="chart-value-label"
              x={Math.min(line.lastX + 5, width - 2)}
              y={Math.max(PAD_TOP, Math.min(height - 4, line.lastY + 3.5))}
            >
              {formatRating(line.lastValue)}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {chart.lines.map((line) => (
          <span key={line.id} className="chart-legend-item">
            <span className={`chart-legend-swatch chart-swatch-${line.variant}`} aria-hidden="true" />
            {line.name}
          </span>
        ))}
      </div>
    </div>
  );
}
