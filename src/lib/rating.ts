import type { CountryCode, HistoryPoint, Player } from '../types';

export type RankingMode = 'overall' | 'women' | 'rising';

const countryRank: Record<CountryCode, number> = {
  cn: 1,
  kr: 2,
  jp: 3,
  tw: 4,
};

export function countryLabel(country: CountryCode) {
  return country.toUpperCase();
}

export function countryFlag(country: CountryCode) {
  const flags: Record<CountryCode, string> = {
    kr: 'KR',
    cn: 'CN',
    jp: 'JP',
    tw: 'TW',
  };
  return flags[country];
}

export function getPlayerDisplayName(player: Player, nameKey: keyof Player['names']) {
  return player.names[nameKey] || player.names.en || player.name;
}

export function formatSigned(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value > 0 ? `+${value}` : String(value);
}

export function winProbability(
  blackRating: number,
  whiteRating: number,
  komi: number,
  rules: 'chinese' | 'japanese' | 'korean',
) {
  const rulesAdjustment = rules === 'japanese' ? 2 : rules === 'korean' ? 0 : 4;
  const whiteKomiBonus = komi * rulesAdjustment;
  const adjustedDiff = blackRating - whiteRating - whiteKomiBonus;
  return 1 / (1 + 10 ** (-adjustedDiff / 400));
}

export function filterPlayers(
  players: Player[],
  options: {
    country: CountryCode | 'all';
    mode: RankingMode;
    query: string;
  },
) {
  const query = options.query.trim().toLocaleLowerCase();

  return players
    .filter((player) => options.country === 'all' || player.country === options.country)
    .filter((player) => options.mode !== 'women' || player.gender === 'female')
    .filter((player) => {
      if (!query) {
        return true;
      }

      const haystack = [
        player.rank,
        player.rating,
        player.country,
        player.name,
        player.names.en,
        player.names.ko,
        player.names.ja,
        player.names.zh,
      ]
        .join(' ')
        .toLocaleLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (options.mode === 'rising') {
        const leftDelta = left.ratingDelta180 ?? -9999;
        const rightDelta = right.ratingDelta180 ?? -9999;
        if (leftDelta !== rightDelta) {
          return rightDelta - leftDelta;
        }
      }

      if (left.rating !== right.rating) {
        return right.rating - left.rating;
      }

      return countryRank[left.country] - countryRank[right.country];
    });
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function getHistoryPath(points: HistoryPoint[], width = 112, height = 32) {
  if (points.length < 2) {
    return '';
  }

  const min = Math.min(...points.map((point) => point.rating));
  const max = Math.max(...points.map((point) => point.rating));
  const span = Math.max(1, max - min);

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.rating - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function resultScore(form: Player['form']) {
  if (!form.length) {
    return null;
  }

  const wins = form.filter((item) => item === 'W').length;
  return wins / form.length;
}
