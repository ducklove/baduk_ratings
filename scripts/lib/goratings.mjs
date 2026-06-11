import { TARGET_COUNTRIES } from './config.mjs';
import { fetchText } from './http.mjs';
import { cleanText, decodeHtml, normalizeDate } from './text.mjs';

export function parseRatingRows(html) {
  const rows = [];
  const rowPattern =
    /<tr><td class="r">(\d+)<\/td><td><a href="\.\.\/[a-z]+\/players\/(\d+)\.html">([\s\S]*?)<\/a><\/td><td class="c"><span style="color:#([0-9A-Fa-f]+)">[\s\S]*?<\/span><\/td><td class="c"><img alt="([a-z]+) flag"[^>]*\/><\/td><td>(\d+)<\/td>/g;

  for (const match of html.matchAll(rowPattern)) {
    rows.push({
      rank: Number(match[1]),
      id: match[2],
      name: cleanText(match[3]),
      gender: match[4].toUpperCase() === 'FE0097' ? 'female' : 'male',
      country: match[5],
      rating: Number(match[6]),
    });
  }

  return rows;
}

export function parseStats(html) {
  const find = (label) => {
    const pattern = new RegExp(
      `<th[^>]*>${label}</th><td[^>]*>([\\s\\S]*?)<\\/td>`,
      'i',
    );
    return cleanText(html.match(pattern)?.[1] ?? '');
  };

  return {
    games: Number(find('Games').replace(/,/g, '')),
    players: Number(find('Players').replace(/,/g, '')),
    mostRecentGame: find('Most Recent Game'),
  };
}

export async function loadLocalizedNames() {
  const locales = ['en', 'ko', 'ja', 'zh'];
  const names = {};

  await Promise.all(
    locales.map(async (locale) => {
      const html = await fetchText(`https://www.goratings.org/${locale}/`);
      names[locale] = Object.fromEntries(
        parseRatingRows(html).map((row) => [row.id, row.name]),
      );
    }),
  );

  return names;
}

export function sampleHistory(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const recent = values.slice(-240);
  const stride = Math.max(1, Math.ceil(recent.length / 90));
  const sampled = recent.filter((_, index) => index % stride === 0);
  const last = recent[recent.length - 1];

  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }

  return sampled
    .map(([date, rating]) => ({
      date: normalizeDate(String(date)),
      rating: Math.round(Number(rating)),
    }))
    .filter((point) => Number.isFinite(point.rating));
}

export function ratingDelta(history, days = 30) {
  if (!history.length) {
    return null;
  }

  const latest = history[history.length - 1];
  const target = new Date(latest.date);
  target.setDate(target.getDate() - days);

  const previous =
    [...history].reverse().find((point) => new Date(point.date) <= target) ??
    history[0];

  return latest.rating - previous.rating;
}

export function parsePlayerDataTable(html) {
  const table = html.match(/<h2>Data<\/h2><table>([\s\S]*?)<\/table>/)?.[1] ?? '';
  const getCell = (label) => {
    const pattern = new RegExp(
      `<th[^>]*>${label}</th><td[^>]*>([\\s\\S]*?)<\\/td>`,
      'i',
    );
    return cleanText(table.match(pattern)?.[1] ?? '');
  };

  const links = [...table.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)].map(
    (match) => ({
      url: decodeHtml(match[1]),
      label: cleanText(match[2]).replace(/\.\.\.$/, ''),
    }),
  );

  return {
    wins: Number(getCell('Wins')) || 0,
    losses: Number(getCell('Losses')) || 0,
    totalGames: Number(getCell('Total')) || 0,
    birthDate: getCell('Date of Birth') || null,
    links,
  };
}

export function parseRecentGames(html) {
  const table =
    html.match(/<h2>Game List<\/h2><table>([\s\S]*?)<\/table>/)?.[1] ?? '';
  const games = [];
  const rowPattern =
    /<tr><td>([^<]+)<\/td><td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td><a href="(\d+)\.html">([\s\S]*?)<\/a><\/td>\s*<td>(\d+)<\/td>[\s\S]*?<img alt="([a-z]+) flag"[\s\S]*?<td><a href="([^"]+)">View game<\/a><\/td>\s*<\/tr>/g;

  for (const match of table.matchAll(rowPattern)) {
    games.push({
      date: normalizeDate(match[1]),
      rating: Number(match[2]),
      color: match[3].toLowerCase(),
      result: match[4].toLowerCase(),
      opponentId: match[5],
      opponentName: cleanText(match[6]),
      opponentRating: Number(match[7]),
      opponentCountry: match[8],
      kifuUrl: decodeHtml(match[9]),
    });
  }

  return games.sort((left, right) => right.date.localeCompare(left.date));
}

export async function loadPlayerDetail(id) {
  const [html, historyText] = await Promise.all([
    fetchText(`https://www.goratings.org/en/players/${id}.html`),
    fetchText(`https://www.goratings.org/players-json/data-${id}.json`),
  ]);
  const json = JSON.parse(historyText);
  const history = sampleHistory(json?.[0]?.values ?? []);
  const games = parseRecentGames(html);

  return {
    ...parsePlayerDataTable(html),
    recentGames: games.slice(0, 24),
    modelGames: games,
    history,
    ratingDelta30: ratingDelta(history, 30),
    ratingDelta180: ratingDelta(history, 180),
  };
}

export function selectDetailIds(players) {
  const selected = new Set();

  for (const player of players.slice(0, 100)) {
    selected.add(player.id);
  }

  for (const country of TARGET_COUNTRIES) {
    for (const player of players.filter((item) => item.country === country).slice(0, 20)) {
      selected.add(player.id);
    }
  }

  for (const player of players.filter((item) => item.gender === 'female').slice(0, 30)) {
    selected.add(player.id);
  }

  return [...selected].slice(0, 180);
}

export function addRegionalRanks(players) {
  const counters = new Map();

  return players.map((player) => {
    const rank = (counters.get(player.country) ?? 0) + 1;
    counters.set(player.country, rank);
    return { ...player, regionalRank: rank };
  });
}

export function buildGoRatingsExternalRatings(players, stats, fetchedAt) {
  return players.map((player) => ({
    rating_source_id: 'goratings',
    source_name: 'GoRatings',
    player_id: player.id,
    source_player_name: player.names.en || player.name,
    rating_value: player.rating,
    rank_value: player.rank,
    rating_date: normalizeDate(stats.mostRecentGame) || fetchedAt.slice(0, 10),
    country_or_region: player.country,
    source_url: player.profileUrl,
    source_confidence: 0.82,
    fetched_at: fetchedAt,
    notes: 'Existing public GoRatings score retained as an external score, not as Baduk-R.',
    terms_status: 'unknown',
    parser_version: 'goratings-list-v1',
  }));
}
