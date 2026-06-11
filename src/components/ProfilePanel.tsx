import { BarChart3, ExternalLink, Star, Trophy } from 'lucide-react';
import {
  formatBirthBadge,
  formatDate,
  formatRating,
  getExternalComparison,
  regionLabel,
  termsStatusLabel,
} from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { formatSigned, getPlayerDisplayName } from '../lib/rating';
import type {
  ExternalRating,
  OwnHistoryPoint,
  Player,
  PlayerDetail,
  RatingComparison,
  RatingComparisonValue,
  RatingSourceId,
} from '../types';
import { MiniTrend } from './MiniTrend';
import { OverlayChart, type ChartSeries } from './OverlayChart';
import { RegionBadge } from './RegionBadge';

const externalRatingSources: RatingSourceId[] = ['goratings', 'chinese_qiyuan', 'korean_baduk'];

function RatingComparisonCard({
  label,
  value,
  meta,
  href,
}: {
  label: string;
  value: string;
  meta: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </>
  );

  if (href) {
    return (
      <a className="rating-card" href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return <div className="rating-card">{content}</div>;
}

function ProfileHistoryCard({
  t,
  player,
  detail,
  ownHistory,
}: {
  t: Translation;
  player: Player;
  detail: PlayerDetail | undefined;
  ownHistory: Record<string, OwnHistoryPoint[]> | null;
}) {
  const ownSeries = ownHistory?.[player.id];
  const goSeries = detail?.history ?? player.history;
  const hasOwn = Boolean(ownSeries && ownSeries.length >= 2);
  const hasGo = goSeries.length >= 2;

  if (hasOwn && hasGo) {
    const series: ChartSeries[] = [
      { id: 'own', name: t.badukRTrend, points: ownSeries as OwnHistoryPoint[], variant: 'primary' },
      { id: 'goratings', name: t.goRatingsTrend, points: goSeries, variant: 'secondary' },
    ];
    return (
      <div className="history-card">
        <OverlayChart series={series} t={t} width={300} height={140} />
      </div>
    );
  }

  const points = hasOwn ? (ownSeries as OwnHistoryPoint[]) : goSeries;
  const label = hasOwn ? t.badukRTrend : t.goRatingsTrend;

  return (
    <div className="history-card">
      <MiniTrend points={points} width={260} height={118} strong />
      <small className="trend-source">{label}</small>
    </div>
  );
}

export function ProfilePanel({
  t,
  language,
  nameKey,
  player,
  detail,
  comparison,
  players,
  snapshotDate,
  generatedAt,
  ownHistory,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  player: Player;
  detail: PlayerDetail | undefined;
  comparison: RatingComparison | undefined;
  players: Player[];
  snapshotDate: string;
  generatedAt: string;
  ownHistory: Record<string, OwnHistoryPoint[]> | null;
}) {
  const ownRating = comparison?.own_rating ?? detail?.ownRating;
  const name = getPlayerDisplayName(player, nameKey);
  const birthBadge = formatBirthBadge(detail?.birthDate, generatedAt, language);
  const externalRatings = detail?.externalRatings ?? [];

  const sourceValueForProfile = (source: RatingSourceId) =>
    getExternalComparison(comparison, source) ??
    externalRatings.find((item): item is ExternalRating & RatingComparisonValue => item.rating_source_id === source);

  return (
    <section className="panel profile-panel" id="profile">
      <div className="profile-header">
        <div className="board-chip" aria-hidden="true">
          <span className="stone black-stone s1" />
          <span className="stone white-stone s2" />
          <span className="stone black-stone s3" />
          <span className="stone white-stone s4" />
        </div>
        <div>
          <h2>
            {name}
            <Star size={17} />
          </h2>
          <p>
            <RegionBadge region={player.country} label={regionLabel(player.country, t)} />
            {birthBadge ? <span className="birth-chip">{birthBadge}</span> : null}
          </p>
        </div>
        <div className="profile-rank">
          <span>{t.ownRating}</span>
          <strong>{formatRating(ownRating?.own_rating ?? player.rating)}</strong>
        </div>
      </div>

      <div className="profile-stats">
        <div>
          <span>{t.rank}</span>
          <strong>{ownRating?.own_rank ?? player.rank}</strong>
        </div>
        <div>
          <span>W-L</span>
          <strong>{detail ? `${detail.wins}-${detail.losses}` : '—'}</strong>
        </div>
        <div>
          <span>{t.delta}</span>
          <strong className={(player.ratingDelta30 ?? 0) >= 0 ? 'delta-positive' : 'delta-negative'}>
            {formatSigned(player.ratingDelta30)}
          </strong>
        </div>
      </div>

      <div className="rating-comparison-grid">
        <RatingComparisonCard
          label={t.ownRating}
          value={formatRating(ownRating?.own_rating ?? player.rating)}
          meta={`${t.badukR} · ${ownRating?.rating_date ?? snapshotDate} · ±${ownRating?.own_rating_uncertainty ?? 90}`}
        />
        {externalRatingSources.map((source) => {
          const value = sourceValueForProfile(source);
          const labelKey =
            source === 'goratings'
              ? 'goRatingsScore'
              : source === 'chinese_qiyuan'
                ? 'chineseQiyuanScore'
                : 'koreanBadukScore';
          return (
            <RatingComparisonCard
              key={source}
              label={t[labelKey]}
              value={formatRating(value?.rating_value)}
              meta={
                value
                  ? `${value.rating_date ?? value.fetched_at?.slice(0, 10) ?? t.unknown} · ${termsStatusLabel(
                      value.terms_status,
                      t,
                    )}`
                  : t.missing
              }
              href={value?.source_url}
            />
          );
        })}
      </div>

      <div className="profile-columns">
        <div>
          <h3>
            <BarChart3 size={16} />
            {t.history}
          </h3>
          <ProfileHistoryCard t={t} player={player} detail={detail} ownHistory={ownHistory} />
        </div>

        <div>
          <h3>
            <Trophy size={16} />
            {t.recentGames}
          </h3>
          <ul className="recent-list">
            {(detail?.recentGames ?? []).slice(0, 5).map((game) => {
              const opponent = players.find((item) => item.id === game.opponentId);
              const opponentName = opponent ? getPlayerDisplayName(opponent, nameKey) : game.opponentName;
              return (
                <li key={`${game.date}-${game.opponentId}-${game.result}`}>
                  <span>
                    {formatDate(game.date, language)}
                    <small>
                      <RegionBadge
                        region={game.opponentCountry}
                        label={regionLabel(game.opponentCountry, t)}
                        compact
                      />
                      vs {opponentName}
                    </small>
                  </span>
                  <strong className={game.result === 'win' ? 'form-win-text' : 'form-loss-text'}>
                    {game.result === 'win' ? 'W' : 'L'}
                  </strong>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="link-row">
        <a href={player.profileUrl} target="_blank" rel="noreferrer">
          {t.viewSource}
          <ExternalLink size={14} />
        </a>
        {(detail?.links ?? []).slice(0, 2).map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {t.links}
            <ExternalLink size={14} />
          </a>
        ))}
      </div>
    </section>
  );
}
