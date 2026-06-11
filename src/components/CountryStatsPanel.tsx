import { Globe2 } from 'lucide-react';
import { useMemo } from 'react';
import { formatRating, regionLabel } from '../lib/format';
import type { Translation } from '../lib/i18n';
import type { CountryCode, Player, RatingComparison } from '../types';
import { RegionBadge } from './RegionBadge';

const COUNTRIES: CountryCode[] = ['kr', 'cn', 'jp', 'tw'];

type CountryStats = {
  country: CountryCode;
  top100: number;
  top10Mean: number | null;
  tracked: number;
  womenTop100: number;
};

export function CountryStatsPanel({
  t,
  players,
  comparisons,
}: {
  t: Translation;
  players: Player[];
  comparisons: Map<string, RatingComparison>;
}) {
  const stats = useMemo<CountryStats[]>(() => {
    return COUNTRIES.map((country) => {
      const list = players.filter((player) => player.country === country);
      const withMeta = list.map((player) => {
        const own = comparisons.get(player.id)?.own_rating;
        return {
          rank: own?.own_rank ?? player.rank,
          rating: own?.own_rating ?? player.rating,
          gender: player.gender,
        };
      });

      const top100 = withMeta.filter((item) => item.rank <= 100);
      const topRatings = withMeta
        .map((item) => item.rating)
        .sort((left, right) => right - left)
        .slice(0, 10);
      const top10Mean = topRatings.length
        ? topRatings.reduce((sum, value) => sum + value, 0) / topRatings.length
        : null;

      return {
        country,
        top100: top100.length,
        top10Mean,
        tracked: list.length,
        womenTop100: top100.filter((item) => item.gender === 'female').length,
      };
    });
  }, [comparisons, players]);

  return (
    <section className="panel country-stats-panel" id="country-stats">
      <div className="panel-title-row">
        <h2>
          <Globe2 size={18} />
          {t.countryStats}
        </h2>
      </div>

      <table className="country-stats-table">
        <thead>
          <tr>
            <th>{t.country}</th>
            <th className="numeric">{t.top100Players}</th>
            <th className="numeric">{t.top10Mean}</th>
            <th className="numeric">{t.trackedPlayers}</th>
            <th className="numeric">{t.womenTop100}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.country}>
              <td>
                <span className="country-stats-name">
                  <RegionBadge region={row.country} label={regionLabel(row.country, t)} compact />
                  {regionLabel(row.country, t)}
                </span>
              </td>
              <td className="numeric">{row.top100}</td>
              <td className="numeric">{formatRating(row.top10Mean)}</td>
              <td className="numeric">{row.tracked}</td>
              <td className="numeric">{row.womenTop100}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
