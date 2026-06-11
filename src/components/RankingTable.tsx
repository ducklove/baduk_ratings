import { ChevronDown, Filter } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatRating, getExternalComparison, regionLabel } from '../lib/format';
import type { Translation } from '../lib/i18n';
import { getPlayerDisplayName, type RankingMode } from '../lib/rating';
import type {
  CountryCode,
  OwnHistoryPoint,
  Player,
  RatingComparison,
  RatingMetric,
} from '../types';
import { FormDots, MiniTrend } from './MiniTrend';
import { RatingValueCell, ExternalRatingCell } from './RatingCells';
import { RegionBadge } from './RegionBadge';

const PAGE_SIZE = 200;

const countryTabs: Array<{ key: CountryCode | 'all'; labelKey: keyof Translation }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'kr', labelKey: 'korea' },
  { key: 'cn', labelKey: 'china' },
  { key: 'jp', labelKey: 'japan' },
  { key: 'tw', labelKey: 'taiwan' },
];

const modeTabs: Array<{ key: RankingMode; labelKey: keyof Translation }> = [
  { key: 'overall', labelKey: 'overall' },
  { key: 'women', labelKey: 'women' },
  { key: 'rising', labelKey: 'rising' },
];

const ratingMetricTabs: Array<{ key: RatingMetric; labelKey: keyof Translation }> = [
  { key: 'own', labelKey: 'ownRating' },
  { key: 'goratings', labelKey: 'goRatingsScore' },
  { key: 'chinese_qiyuan', labelKey: 'chineseQiyuanScore' },
  { key: 'korean_baduk', labelKey: 'koreanBadukScore' },
];

function SortableHeader({
  t,
  metric,
  activeMetric,
  label,
  className,
  onSort,
}: {
  t: Translation;
  metric: RatingMetric;
  activeMetric: RatingMetric;
  label: string;
  className: string;
  onSort: (metric: RatingMetric) => void;
}) {
  const active = metric === activeMetric;
  return (
    <th className={className} aria-sort={active ? 'descending' : 'none'}>
      <button
        type="button"
        className={active ? 'sort-header active' : 'sort-header'}
        onClick={() => onSort(metric)}
        title={`${t.sortMetric}: ${label}`}
      >
        {label}
        <ChevronDown size={12} aria-hidden="true" className="sort-indicator" />
      </button>
    </th>
  );
}

export function RankingTable({
  t,
  nameKey,
  country,
  onCountryChange,
  mode,
  onModeChange,
  sortMetric,
  onSortMetricChange,
  players,
  comparisons,
  selectedId,
  onSelect,
  ownHistory,
}: {
  t: Translation;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  country: CountryCode | 'all';
  onCountryChange: (country: CountryCode | 'all') => void;
  mode: RankingMode;
  onModeChange: (mode: RankingMode) => void;
  sortMetric: RatingMetric;
  onSortMetricChange: (metric: RatingMetric) => void;
  players: Player[];
  comparisons: Map<string, RatingComparison>;
  selectedId: string;
  onSelect: (id: string) => void;
  ownHistory: Record<string, OwnHistoryPoint[]> | null;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isMobile = useMediaQuery('(max-width: 719px)');

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [players]);

  const tableRows = players.slice(0, visibleCount);
  const hasMore = players.length > tableRows.length;

  const trendFor = (player: Player) => {
    const ownSeries = ownHistory?.[player.id];
    if (ownSeries && ownSeries.length >= 2) {
      return { points: ownSeries, label: t.badukRTrend };
    }
    return { points: player.history, label: t.goRatingsTrend };
  };

  const rankFor = (player: Player) => {
    const own = comparisons.get(player.id)?.own_rating;
    return own?.own_rank ?? (mode === 'overall' ? player.rank : player.regionalRank);
  };

  return (
    <section className="panel ratings-panel" id="ratings">
      <div className="panel-heading">
        <div>
          <h1>{t.ratingList}</h1>
          <p>{t.snapshot}</p>
        </div>
        <div className="toolbar-label">
          <Filter size={16} />
          <span>{players.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="segmented-row">
        <div className="segmented" role="tablist" aria-label="Country filter">
          {countryTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={country === tab.key ? 'active' : ''}
              onClick={() => onCountryChange(tab.key)}
            >
              {t[tab.labelKey]}
            </button>
          ))}
        </div>

        <div className="segmented compact" role="tablist" aria-label="Ranking mode">
          {modeTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={mode === tab.key ? 'active' : ''}
              onClick={() => onModeChange(tab.key)}
            >
              {t[tab.labelKey]}
            </button>
          ))}
        </div>
      </div>

      <div className="metric-row">
        <label>
          <span>{t.sortMetric}</span>
          <select value={sortMetric} onChange={(event) => onSortMetricChange(event.target.value as RatingMetric)}>
            {ratingMetricTabs.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {t[metric.labelKey]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isMobile ? (
        <div className="ranking-cards">
          {tableRows.map((player) => {
            const name = getPlayerDisplayName(player, nameKey);
            const comparison = comparisons.get(player.id);
            const own = comparison?.own_rating;
            return (
              <button
                key={player.id}
                type="button"
                className={player.id === selectedId ? 'ranking-card selected' : 'ranking-card'}
                onClick={() => onSelect(player.id)}
              >
                <span className="ranking-card-rank">{rankFor(player)}</span>
                <span className="ranking-card-main">
                  <span className="ranking-card-name">
                    <RegionBadge region={player.country} label={regionLabel(player.country, t)} compact />
                    <strong>{name}</strong>
                  </span>
                  <small>{player.names.en}</small>
                </span>
                <span className="ranking-card-rating">
                  <strong>{formatRating(own?.own_rating ?? player.rating)}</strong>
                  <small>{t.ownRating}</small>
                </span>
                <span className="ranking-card-form">
                  <FormDots form={player.form} />
                </span>
              </button>
            );
          })}
          {!tableRows.length ? <div className="empty-state">{t.noRows}</div> : null}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="ratings-table">
            <thead>
              <tr>
                <th className="col-rank">{t.rank}</th>
                <th className="col-player">{t.player}</th>
                <SortableHeader
                  t={t}
                  metric="own"
                  activeMetric={sortMetric}
                  label={t.ownRating}
                  className="numeric col-rating"
                  onSort={onSortMetricChange}
                />
                <SortableHeader
                  t={t}
                  metric="goratings"
                  activeMetric={sortMetric}
                  label={t.goRatingsScore}
                  className="numeric col-rating hide-tablet"
                  onSort={onSortMetricChange}
                />
                <SortableHeader
                  t={t}
                  metric="chinese_qiyuan"
                  activeMetric={sortMetric}
                  label={t.chineseQiyuanScore}
                  className="numeric col-rating hide-tablet"
                  onSort={onSortMetricChange}
                />
                <SortableHeader
                  t={t}
                  metric="korean_baduk"
                  activeMetric={sortMetric}
                  label={t.koreanBadukScore}
                  className="numeric col-rating hide-tablet"
                  onSort={onSortMetricChange}
                />
                <th className="col-form hide-mobile">{t.form}</th>
                <th className="col-trend hide-mobile">{t.trend}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((player) => {
                const name = getPlayerDisplayName(player, nameKey);
                const comparison = comparisons.get(player.id);
                const own = comparison?.own_rating;
                const trend = trendFor(player);
                return (
                  <tr
                    key={player.id}
                    className={player.id === selectedId ? 'selected' : ''}
                    onClick={() => onSelect(player.id)}
                  >
                    <td className="rank-cell">
                      <span>{rankFor(player)}</span>
                    </td>
                    <td>
                      <button type="button" className="player-button">
                        <RegionBadge region={player.country} label={regionLabel(player.country, t)} compact />
                        <span>
                          <strong>{name}</strong>
                          <small>{player.names.en}</small>
                        </span>
                      </button>
                    </td>
                    <td className="numeric rating-number">
                      <RatingValueCell
                        label={t.ownRating}
                        value={own?.own_rating ?? player.rating}
                        meta={`${t.uncertainty} ±${own?.own_rating_uncertainty ?? 90}`}
                        t={t}
                        primary
                      />
                    </td>
                    <td className="numeric hide-tablet">
                      <ExternalRatingCell value={getExternalComparison(comparison, 'goratings')} t={t} />
                    </td>
                    <td className="numeric hide-tablet">
                      <ExternalRatingCell value={getExternalComparison(comparison, 'chinese_qiyuan')} t={t} />
                    </td>
                    <td className="numeric hide-tablet">
                      <ExternalRatingCell value={getExternalComparison(comparison, 'korean_baduk')} t={t} />
                    </td>
                    <td className="hide-mobile form-cell">
                      <FormDots form={player.form} />
                    </td>
                    <td className="hide-mobile trend-cell">
                      <span className="trend-with-label" title={trend.label}>
                        <MiniTrend points={trend.points} />
                        <small className="trend-source">{trend.label}</small>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!tableRows.length ? <div className="empty-state">{t.noRows}</div> : null}
        </div>
      )}

      <div className="load-more-row">
        <span className="load-more-count">
          {tableRows.length.toLocaleString()} / {players.length.toLocaleString()}
        </span>
        {hasMore ? (
          <button type="button" className="load-more-button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            {t.loadMore} (+{Math.min(PAGE_SIZE, players.length - tableRows.length)})
          </button>
        ) : null}
      </div>
    </section>
  );
}
