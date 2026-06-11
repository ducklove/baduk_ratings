import { getHistoryPath } from '../lib/rating';
import type { HistoryPoint, Player } from '../types';

export function MiniTrend({
  points,
  width = 112,
  height = 32,
  strong = false,
}: {
  points: HistoryPoint[];
  width?: number;
  height?: number;
  strong?: boolean;
}) {
  const path = getHistoryPath(points, width, height);
  const className = strong ? 'trend-box trend-box-strong' : 'trend-box';

  if (!path) {
    return <span className={`${className} muted`}>—</span>;
  }

  return (
    <span className={className}>
      <svg className={strong ? 'trend trend-strong' : 'trend'} viewBox={`0 0 ${width} ${height}`}>
        <path d={path} />
      </svg>
    </span>
  );
}

export function FormDots({ form }: { form: Player['form'] }) {
  if (!form.length) {
    return <span className="muted">—</span>;
  }

  return (
    <span className="form-dots" aria-label={`${form.filter((item) => item === 'W').length} wins`}>
      {form.slice(0, 10).map((result, index) => (
        <span key={`${result}-${index}`} className={result === 'W' ? 'form-win' : 'form-loss'}>
          {result}
        </span>
      ))}
    </span>
  );
}
