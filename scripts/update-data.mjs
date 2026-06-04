import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outFile = path.join(rootDir, 'public', 'data', 'baduk-data.json');

const TARGET_COUNTRIES = ['kr', 'cn', 'jp', 'tw'];
const USER_AGENT =
  'baduk_ratings/1.0 (+https://ducklove.github.io/baduk_ratings/; static data snapshot)';

const sourceUrls = {
  goratings: 'https://www.goratings.org/en/',
  kbaSchedule: 'https://baduk.or.kr/record/schedule_in.asp',
  kbaNews: 'https://baduk.or.kr/news/report_in.asp',
};

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/json,text/plain,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder('utf-8').decode(buffer);
}

function stripTags(value) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*><\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function cleanText(value) {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .trim();
}

function normalizeDate(value) {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return value;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseRatingRows(html) {
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

function parseStats(html) {
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

async function loadLocalizedNames() {
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

function sampleHistory(values) {
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

function ratingDelta(history, days = 30) {
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

function parsePlayerDataTable(html) {
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

function parseRecentGames(html) {
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

  return games.slice(0, 12);
}

async function loadPlayerDetail(id) {
  const [html, historyText] = await Promise.all([
    fetchText(`https://www.goratings.org/en/players/${id}.html`),
    fetchText(`https://www.goratings.org/players-json/data-${id}.json`),
  ]);
  const json = JSON.parse(historyText);
  const history = sampleHistory(json?.[0]?.values ?? []);

  return {
    ...parsePlayerDataTable(html),
    recentGames: parseRecentGames(html),
    history,
    ratingDelta30: ratingDelta(history, 30),
    ratingDelta180: ratingDelta(history, 180),
  };
}

async function withConcurrency(items, limit, mapper) {
  const output = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;

      try {
        output[current] = await mapper(items[current], current);
      } catch (error) {
        console.warn(`Skipping item ${items[current]}: ${error.message}`);
        output[current] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}

function selectDetailIds(players) {
  const selected = new Set();

  for (const player of players.slice(0, 70)) {
    selected.add(player.id);
  }

  for (const country of TARGET_COUNTRIES) {
    for (const player of players.filter((item) => item.country === country).slice(0, 16)) {
      selected.add(player.id);
    }
  }

  for (const player of players.filter((item) => item.gender === 'female').slice(0, 24)) {
    selected.add(player.id);
  }

  return [...selected].slice(0, 120);
}

function addRegionalRanks(players) {
  const counters = new Map();

  return players.map((player) => {
    const rank = (counters.get(player.country) ?? 0) + 1;
    counters.set(player.country, rank);
    return { ...player, regionalRank: rank };
  });
}

function parseSchedule(html) {
  const yearText = cleanText(html.match(/<span class="year">([\s\S]*?)<\/span>/)?.[1] ?? '');
  const year = Number(yearText.match(/\d{4}/)?.[0] ?? new Date().getFullYear());
  const monthButton =
    html.match(/<button type="button" class="on" onclick="pageMove_search3\('\d+', '(\d+)'/)?.[1] ??
    String(new Date().getMonth() + 1);
  const month = Number(monthButton);
  const events = [];
  const list = html.match(/<div class="listType"[\s\S]*?<ul class="dates">([\s\S]*?)<\/ul>/)?.[1] ?? '';

  for (const dayBlock of list.matchAll(/<li class="realLine[^"]*">([\s\S]*?)<\/li>/g)) {
    const block = dayBlock[1];
    const day = Number(cleanText(block.match(/<span class="dateNum[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ''));
    const weekday = cleanText(block.match(/<span class="days[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? '');

    for (const span of block.matchAll(/<span class="(world|prd|dev|etc|online)">([\s\S]*?)<\/span>/g)) {
      const category = span[1];
      const lines = stripTags(span[2])
        .split('\n')
        .map((line) => cleanText(line))
        .filter(Boolean);

      for (const line of lines) {
        const timeMatch = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
        const title = timeMatch ? timeMatch[2] : line;
        const time = timeMatch ? timeMatch[1] : null;

        if (title) {
          events.push({
            id: `kba-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${events.length + 1}`,
            date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            timeKst: time,
            weekday,
            title,
            category,
            region: 'kr',
            source: 'Korea Baduk Association',
            sourceUrl: 'https://baduk.or.kr/record/schedule.asp',
          });
        }
      }
    }
  }

  return events;
}

function parseNews(html) {
  const items = [];
  const pattern =
    /<a href="\/news\/report_view\.asp\?news_no=(\d+)"[\s\S]*?<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>[\s\S]*?<span class="date">([^<]+)<\/span>/g;

  for (const match of html.matchAll(pattern)) {
    items.push({
      id: `kba-news-${match[1]}`,
      title: cleanText(match[2]),
      summary: cleanText(match[3]),
      date: normalizeDate(match[4]),
      region: 'kr',
      source: 'Korea Baduk Association',
      url: `https://baduk.or.kr/news/report_view.asp?news_no=${match[1]}`,
    });
  }

  return items.slice(0, 12);
}

function buildSourceHub() {
  return [
    {
      region: 'global',
      name: 'GoRatings',
      url: 'https://www.goratings.org/en/',
      kind: 'ratings',
      note: 'WHR-based professional rating list with game records and player histories.',
    },
    {
      region: 'kr',
      name: 'Korea Baduk Association',
      url: 'https://www.baduk.or.kr/',
      kind: 'schedule-news',
      note: 'Official Korean professional schedule, results, news, rankings, and player records.',
    },
    {
      region: 'cn',
      name: 'Chinese Weiqi Association',
      url: 'https://www.weiqi.org.cn/en/',
      kind: 'federation',
      note: 'Official Chinese weiqi federation portal.',
    },
    {
      region: 'jp',
      name: 'Nihon Ki-in',
      url: 'https://www.nihonkiin.or.jp/',
      kind: 'federation',
      note: 'Official Japan Go association portal for tournaments, players, and announcements.',
    },
    {
      region: 'jp',
      name: 'Kansai Ki-in',
      url: 'https://kansaikiin.jp/',
      kind: 'federation',
      note: 'Kansai professional Go association portal.',
    },
    {
      region: 'tw',
      name: 'HaiFong Go Association',
      url: 'https://www.haifong.org/',
      kind: 'federation',
      note: 'Taiwan professional Go operations reference source.',
    },
  ];
}

async function main() {
  console.log('Fetching GoRatings rating list...');
  const [ratingHtml, localizedNames] = await Promise.all([
    fetchText(sourceUrls.goratings),
    loadLocalizedNames(),
  ]);
  const stats = parseStats(ratingHtml);
  const allRows = parseRatingRows(ratingHtml);
  const players = addRegionalRanks(
    allRows
      .filter((row) => TARGET_COUNTRIES.includes(row.country))
      .map((row) => ({
        ...row,
        country: row.country,
        names: {
          en: localizedNames.en?.[row.id] ?? row.name,
          ko: localizedNames.ko?.[row.id] ?? row.name,
          ja: localizedNames.ja?.[row.id] ?? row.name,
          zh: localizedNames.zh?.[row.id] ?? row.name,
        },
        profileUrl: `https://www.goratings.org/en/players/${row.id}.html`,
      })),
  );

  const detailIds = selectDetailIds(players);
  console.log(`Fetching ${detailIds.length} player profiles and histories...`);
  const details = await withConcurrency(detailIds, 6, async (id) => [
    id,
    await loadPlayerDetail(id),
  ]);
  const playerDetails = Object.fromEntries(details.filter(Boolean));

  for (const player of players) {
    const detail = playerDetails[player.id];
    if (detail) {
      player.ratingDelta30 = detail.ratingDelta30;
      player.ratingDelta180 = detail.ratingDelta180;
      player.form = detail.recentGames
        .slice(0, 10)
        .map((game) => (game.result === 'win' ? 'W' : 'L'));
      player.history = detail.history.slice(-32);
    } else {
      player.ratingDelta30 = null;
      player.ratingDelta180 = null;
      player.form = [];
      player.history = [];
    }
  }

  console.log('Fetching KBA schedule and news...');
  const [scheduleHtml, newsHtml] = await Promise.all([
    fetchText(sourceUrls.kbaSchedule),
    fetchText(sourceUrls.kbaNews),
  ]);

  const data = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ratingStats: stats,
    players,
    playerDetails,
    schedule: parseSchedule(scheduleHtml),
    news: parseNews(newsHtml),
    sourceHub: buildSourceHub(),
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  console.log(
    `Wrote ${players.length} players, ${Object.keys(playerDetails).length} profiles, ${data.schedule.length} schedule events, ${data.news.length} news items.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
