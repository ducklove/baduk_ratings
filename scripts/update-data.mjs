import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDataDir = path.join(rootDir, 'public', 'data');
const ratingsOutDir = path.join(publicDataDir, 'ratings');
const outFile = path.join(publicDataDir, 'baduk-data.json');
const prestigeFile = path.join(rootDir, 'data', 'manual', 'tournament_prestige.yml');

const TARGET_COUNTRIES = ['kr', 'cn', 'jp', 'tw'];
const MODEL_VERSION = 'baduk-r-0.4.0-game-graph';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3.7-plus';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_TRANSLATION_BATCH_SIZE = readPositiveIntEnv('OPENROUTER_TRANSLATION_BATCH_SIZE', 4);
const OPENROUTER_TRANSLATION_TIMEOUT_MS = readPositiveIntEnv('OPENROUTER_TRANSLATION_TIMEOUT_MS', 45000);
const OPENROUTER_NEWS_TRANSLATION_LIMIT = readPositiveIntEnv('OPENROUTER_NEWS_TRANSLATION_LIMIT', 36);
const OPENROUTER_SCHEDULE_TRANSLATION_LIMIT = readNonNegativeIntEnv('OPENROUTER_SCHEDULE_TRANSLATION_LIMIT', 48);
const USER_AGENT =
  'baduk_ratings/1.0 (+https://ducklove.github.io/baduk_ratings/; static data snapshot)';

const sourceUrls = {
  goratings: 'https://www.goratings.org/en/',
  kbaSchedule: 'https://baduk.or.kr/record/schedule_in.asp',
  kbaSchedulePublic: 'https://baduk.or.kr/record/schedule.asp',
  kbaNews: 'https://baduk.or.kr/news/report_in.asp',
  kbaNewsPublic: 'https://baduk.or.kr/news/report.asp',
  kbaRanking: 'https://baduk.or.kr/record/rankingPlayer_in.asp',
  kbaRankingPublic: 'https://baduk.or.kr/record/rankingPlayer.asp',
  nihonSchedule: 'https://www.nihonkiin.or.jp/match/2week.html',
  nihonColumns: 'https://www.nihonkiin.or.jp/etc/',
  nihonColumnAtom: 'https://www.nihonkiin.or.jp/etc/atom.xml',
  cwaPlayer: 'https://www.weiqi.org.cn/player',
  cwaNews: 'https://www.weiqi.org.cn/news',
  cwaApi: 'https://wqapi.cwql.org.cn/',
  cwaCalendar: 'https://wqapi.cwql.org.cn/calendar/game/query',
  cwaTournamentList: 'https://wqapi.cwql.org.cn/game/name/list/page',
  cwaNewsClassify: 'https://wqapi.cwql.org.cn/news/classify/channel/list?newsChannel=web',
  cwaNewsList: 'https://wqapi.cwql.org.cn/news/publish/list',
  haifong: 'https://www.haifong.org/',
  haifongCalendar: 'https://www.haifong.org/about/calendar',
  openRouter: 'https://openrouter.ai/',
};

function readPositiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readNonNegativeIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/json,text/plain,*/*',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder('utf-8').decode(buffer);
}

async function fetchJson(url, init = {}) {
  const text = await fetchText(url, init);
  return JSON.parse(text);
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*><\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .trim();
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function cleanText(value) {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .trim();
}

function normalizeDate(value) {
  const text = String(value ?? '').trim();
  const eastAsianMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (eastAsianMatch) {
    return toIsoDate(Number(eastAsianMatch[1]), Number(eastAsianMatch[2]), Number(eastAsianMatch[3]));
  }

  const slashMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (slashMatch) {
    return toIsoDate(Number(slashMatch[1]), Number(slashMatch[2]), Number(slashMatch[3]));
  }

  const [year, month, day] = text.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return text;
  }
  return toIsoDate(year, month, day);
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function kstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function weekdayFromDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${date}T00:00:00+09:00`));
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

  return games.sort((left, right) => right.date.localeCompare(left.date));
}

async function loadPlayerDetail(id) {
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

function parseKbaSchedule(html, fetchedAt) {
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
            dateEnd: null,
            timeKst: time,
            weekday,
            title,
            tournament: title.split(/\s{2,}|:/)[0],
            round: null,
            category,
            region: 'kr',
            country_or_region: 'kr',
            source: 'Korea Baduk Association',
            sourceUrl: sourceUrls.kbaSchedulePublic,
            source_name: 'Korea Baduk Association',
            source_url: sourceUrls.kbaSchedulePublic,
            fetched_at: fetchedAt,
            source_confidence: 0.92,
            event_type: 'game',
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
      content_type: 'news',
      curation_score: 8,
      curation_reason: ['official_korean_news'],
    });
  }

  return items.slice(0, 12);
}

function newsCurationReasons({ title, summary = '', category = '', source = '' }) {
  const text = `${title} ${summary} ${category} ${source}`;
  const reasons = [];
  let score = 0;

  if (/コラム|囲碁ライター|칼럼|column/i.test(text)) {
    score += 55;
    reasons.push('column_source');
  }
  if (/媒体报道|メディア|media/i.test(text)) {
    score += 30;
    reasons.push('media_report');
  }
  if (/专访|專訪|访谈|訪談|対談|인터뷰|interview|评论|評論|評|観る碁|探訪|观察|觀察|分析|해설|review|analysis/i.test(text)) {
    score += 24;
    reasons.push('analysis_or_interview');
  }
  if (/柯洁|丁浩|辜梓豪|申真谞|一力遼|一力辽|井山|芝野|藤沢|藤泽|上野|国家队|世界戦|世界赛|女流|女子/i.test(text)) {
    score += 12;
    reasons.push('notable_players_or_events');
  }
  if (/文化|歴史|史|棋士|프로기사|棋手|物語|故事|人物|未来|미래|普及/i.test(text)) {
    score += 8;
    reasons.push('feature_context');
  }
  if (/竞赛规程|競賽規程|规程|規程|报名|報名|通知|公示|名单|名單|赛果|賽果|成绩|成績|日程|補足|补充/i.test(text)) {
    score -= 28;
    reasons.push('routine_notice_penalty');
  }

  return { score, reasons };
}

function applyNewsCuration(item, baseScore = 0) {
  const result = newsCurationReasons({
    title: item.title,
    summary: item.summary,
    category: item.category,
    source: item.source,
  });

  return {
    ...item,
    curation_score: baseScore + result.score,
    curation_reason: [...new Set([...(item.curation_reason ?? []), ...result.reasons])],
  };
}

function sortNewsItems(items) {
  return [...items].sort((left, right) => {
    const leftScore = left.curation_score ?? 0;
    const rightScore = right.curation_score ?? 0;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return String(right.date).localeCompare(String(left.date));
  });
}

function parseNihonColumnFeed(xml) {
  const items = [];

  for (const entryMatch of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = entryMatch[1];
    const title = cleanText(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const summary = cleanText(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '');
    const published = cleanText(entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '');
    const updated = cleanText(entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ?? '');
    const category =
      cleanText(entry.match(/<primary>([\s\S]*?)<\/primary>/)?.[1] ?? '') ||
      cleanText(entry.match(/<category[^>]*term="([^"]+)"/)?.[1] ?? '');
    const url = decodeHtml(entry.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)?.[1] ?? '');

    if (!title || !url) {
      continue;
    }

    const slug = url.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '') ?? String(items.length + 1);
    items.push(
      applyNewsCuration(
        {
          id: `nihon-column-${slug}`,
          title,
          summary,
          date: normalizeDate(published) || updated.slice(0, 10),
          region: 'jp',
          source: 'Nihon Ki-in Column',
          url,
          category,
          content_type: 'column',
          curation_reason: ['nihon_official_column_feed'],
        },
        45,
      ),
    );
  }

  return sortNewsItems(items).slice(0, 10);
}

async function fetchNihonColumns() {
  const xml = await fetchText(sourceUrls.nihonColumnAtom);
  return parseNihonColumnFeed(xml);
}

async function fetchCwaNewsPage(params) {
  const json = await fetchJson(sourceUrls.cwaNewsList, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  return json?.data?.records ?? json?.records ?? [];
}

async function fetchCwaEditorialNews() {
  const classifyJson = await fetchJson(sourceUrls.cwaNewsClassify);
  const classifications = classifyJson?.data ?? [];
  const mediaClassifyNo = classifications.find((item) => item.classifyName === '媒体报道')?.classifyNo;
  const officialInfoNo = classifications.find((item) => item.classifyName === '官网资讯')?.classifyNo;
  const professionalNo = classifications.find((item) => item.classifyName === '职业新闻')?.classifyNo;
  const records = [];

  if (mediaClassifyNo) {
    records.push(...(await fetchCwaNewsPage({ pageNo: '1', pageSize: '12', classifyNo: mediaClassifyNo })));
  }

  for (const classifyNo of [officialInfoNo, professionalNo].filter(Boolean)) {
    records.push(...(await fetchCwaNewsPage({ pageNo: '1', pageSize: '12', classifyNo })));
  }

  records.push(...(await fetchCwaNewsPage({ pageNo: '1', pageSize: '36' })));

  const seen = new Set();
  const items = [];

  for (const record of records) {
    const publishNo = record.newsPublishNo ?? record.newsNo;
    const title = cleanText(record.newsTitle ?? '');
    if (!publishNo || !title || seen.has(publishNo)) {
      continue;
    }
    seen.add(publishNo);

    const category = cleanText(record.newsClassify1Name ?? '');
    const baseScore = category === '媒体报道' ? 34 : category === '官网资讯' ? 10 : category === '职业新闻' ? 8 : 0;
    const item = applyNewsCuration(
      {
        id: `cwa-news-${publishNo}`,
        title,
        summary: cleanText(record.newsAbstract ?? ''),
        date: normalizeDate(record.newsDate ?? ''),
        region: 'cn',
        source: category === '媒体报道' ? 'Chinese Weiqi Association Media' : 'Chinese Weiqi Association',
        url: `https://www.weiqi.org.cn/news/details/${publishNo}`,
        category,
        content_type: category === '媒体报道' ? 'media_report' : 'news',
        curation_reason: [`cwa_${category || 'news'}`],
      },
      baseScore,
    );

    if ((item.curation_score ?? 0) > 0) {
      items.push(item);
    }
  }

  return sortNewsItems(items).slice(0, 10);
}

function cleanSchedulePlayerName(value) {
  return cleanText(value)
    .replace(/[△▲]/g, '')
    .replace(/\s*(九段|八段|七段|六段|五段|四段|三段|二段|初段|名誉.*|女流.*|本因坊|棋聖|名人|王座|天元|十段|碁聖|扇興杯|快棋王|龍星|女流本|テケ女)$/u, '')
    .trim();
}

function inferYearForMonthDay(month, day, snapshotDate) {
  const [currentYear, currentMonth] = snapshotDate.split('-').map(Number);
  let year = currentYear;
  const candidate = new Date(`${toIsoDate(year, month, day)}T00:00:00+09:00`);
  const snapshot = new Date(`${snapshotDate}T00:00:00+09:00`);
  const diffDays = (candidate.getTime() - snapshot.getTime()) / 86400000;

  if (currentMonth >= 11 && month <= 2) {
    year += 1;
  } else if (currentMonth <= 2 && month >= 11) {
    year -= 1;
  } else if (diffDays < -60) {
    year += 1;
  }

  return year;
}

function parseNihonSchedule(html, snapshotDate, fetchedAt) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const table = tables[1] ?? tables[0] ?? '';
  const events = [];
  let currentDate = null;

  for (const rowMatch of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const row = rowMatch[0];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanText(cell[1]));
    const dateMatch = cells[0]?.match(/^(\d{1,2})月(\d{1,2})日$/);

    if (dateMatch) {
      const month = Number(dateMatch[1]);
      const day = Number(dateMatch[2]);
      const year = inferYearForMonthDay(month, day, snapshotDate);
      currentDate = toIsoDate(year, month, day);
      continue;
    }

    if (!currentDate || cells.length < 4) {
      continue;
    }

    const tournament = cells[0];
    const left = cleanSchedulePlayerName(cells[1]);
    const right = cleanSchedulePlayerName(cells[3]);

    if (!tournament || !left || !right) {
      continue;
    }

    events.push({
      id: `nihon-${currentDate}-${events.length + 1}`,
      date: currentDate,
      dateEnd: null,
      timeKst: null,
      weekday: weekdayFromDate(currentDate),
      title: `${tournament}: ${left} vs ${right}`,
      tournament,
      round: tournament.split(/\s+/).slice(1).join(' ') || null,
      category: /予選|豫選/u.test(tournament) ? 'dev' : /本戦|決勝|リーグ|タイトル/u.test(tournament) ? 'prd' : 'etc',
      region: 'jp',
      country_or_region: 'jp',
      source: 'Nihon Ki-in',
      sourceUrl: sourceUrls.nihonSchedule,
      source_name: 'Nihon Ki-in',
      source_url: sourceUrls.nihonSchedule,
      fetched_at: fetchedAt,
      source_confidence: 0.82,
      event_type: 'game',
      player_names: [left, right],
    });
  }

  return events;
}

function parseKbaRankingRows(html) {
  const yearText = cleanText(html.match(/<span class="year">([\s\S]*?)<\/span>/)?.[1] ?? '');
  const year = Number(yearText.match(/\d{4}/)?.[0] ?? new Date().getFullYear());
  const month =
    Number(html.match(/<button type="button" class="on" onclick="pageMove_search3\('\d+', '(\d+)'/)?.[1]) ||
    Number(kstDateString().slice(5, 7));
  const ratingDate = `${year}-${String(month).padStart(2, '0')}`;
  const rows = [];

  for (const rowMatch of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanText(cell[1]));
    const rank = Number(cells[0]);
    const ratingValue = Number(String(cells[2] ?? '').replace(/,/g, ''));

    if (!rank || !cells[1] || !Number.isFinite(ratingValue)) {
      continue;
    }

    rows.push({
      rank_value: rank,
      source_player_name: cells[1].replace(/\((남|여)\)/g, '').trim(),
      rating_value: ratingValue,
      rating_date: ratingDate,
    });
  }

  return rows;
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\((남|여|male|female)\)/gi, '')
    .replace(/[△▲]/g, '')
    .replace(/\b(9p|8p|7p|6p|5p|4p|3p|2p|1p)\b/gi, '')
    .replace(/(九段|八段|七段|六段|五段|四段|三段|二段|初段|단|段|名誉.*|女流.*|本因坊|棋聖|名人|王座|天元|十段|碁聖|扇興杯|快棋王|龍星)$/u, '')
    .replace(/[\s.,·・'"’()（）[\]{}_\-\\/]/g, '')
    .trim();
}

function buildPlayerNameIndex(players) {
  const index = new Map();

  for (const player of players) {
    for (const name of [player.name, player.names.en, player.names.ko, player.names.ja, player.names.zh]) {
      const normalized = normalizeName(name);
      if (normalized.length >= 2 && !index.has(normalized)) {
        index.set(normalized, player);
      }
    }
  }

  return index;
}

function matchPlayerByName(name, index) {
  const normalized = normalizeName(name);
  if (!normalized) {
    return null;
  }

  return index.get(normalized) ?? null;
}

function findPlayersInText(text, players) {
  const matches = new Map();
  const normalizedText = normalizeName(text);

  for (const player of players) {
    const names = [player.names.ko, player.names.ja, player.names.zh, player.names.en, player.name]
      .map((name) => normalizeName(name))
      .filter((name) => name.length >= 2);

    if (names.some((name) => normalizedText.includes(name))) {
      matches.set(player.id, player);
    }
  }

  return [...matches.values()];
}

async function fetchCwaRankings(fetchedAt) {
  const cycleJson = await fetchJson(`${sourceUrls.cwaApi}playerInfo/latest/update/cycle`);
  const updateCycle = cycleJson?.data;
  const records = [];

  for (const gender of [1, 2]) {
    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`${sourceUrls.cwaApi}playerInfo/rank/list`);
      url.searchParams.set('pageSize', '200');
      url.searchParams.set('page', String(page));
      url.searchParams.set('playerGender', String(gender));
      url.searchParams.set('playerStatus', '1');
      if (updateCycle) {
        url.searchParams.set('updateCycle', String(updateCycle));
      }

      const json = await fetchJson(url.href);
      const pageRecords = json?.data?.records ?? [];
      records.push(...pageRecords);
      if (pageRecords.length < 200) {
        break;
      }
    }
  }

  return {
    records,
    updateCycle,
    fetchedAt,
  };
}

function buildCwaExternalRatings(cwaRankings, playersByName) {
  const external = [];
  const unresolved = [];
  const ratingDate = cwaRankings.updateCycle
    ? `${String(cwaRankings.updateCycle).slice(0, 4)}-${String(cwaRankings.updateCycle).slice(4, 6)}`
    : null;

  for (const record of cwaRankings.records) {
    const player =
      matchPlayerByName(record.playerNameEn, playersByName) ??
      matchPlayerByName(record.playerName, playersByName);

    if (!player) {
      unresolved.push({
        source_name: 'Chinese Weiqi Association',
        source_player_name: record.playerNameEn || record.playerName,
        rating_value: Number(record.playerRating) || null,
        rank_value: Number(record.playerRanking) || null,
        notes: 'No exact player_id match in current GoRatings-derived player universe.',
      });
      continue;
    }

    external.push({
      rating_source_id: 'chinese_qiyuan',
      source_name: 'Chinese Weiqi Association',
      player_id: player.id,
      source_player_name: record.playerNameEn || record.playerName,
      rating_value: Number(record.playerRating) || null,
      rank_value: Number(record.playerRanking) || null,
      rating_date: ratingDate,
      country_or_region: 'cn',
      source_url: sourceUrls.cwaPlayer,
      source_confidence: record.playerNameEn ? 0.9 : 0.82,
      fetched_at: cwaRankings.fetchedAt,
      notes: `Official CWA update cycle ${record.updateCycle ?? cwaRankings.updateCycle ?? 'unknown'}.`,
      terms_status: 'unknown',
      parser_version: 'cwa-rank-v1',
    });
  }

  return { external, unresolved };
}

function buildKbaExternalRatings(kbaRows, playersByName, fetchedAt) {
  const external = [];
  const unresolved = [];

  for (const row of kbaRows) {
    const player = matchPlayerByName(row.source_player_name, playersByName);

    if (!player) {
      unresolved.push({
        source_name: 'Korea Baduk Association',
        source_player_name: row.source_player_name,
        rating_value: row.rating_value,
        rank_value: row.rank_value,
        notes: 'No exact Korean-name player_id match in current player universe.',
      });
      continue;
    }

    external.push({
      rating_source_id: 'korean_baduk',
      source_name: 'Korea Baduk Association',
      player_id: player.id,
      source_player_name: row.source_player_name,
      rating_value: row.rating_value,
      rank_value: row.rank_value,
      rating_date: row.rating_date,
      country_or_region: 'kr',
      source_url: sourceUrls.kbaRankingPublic,
      source_confidence: 0.9,
      fetched_at: fetchedAt,
      notes: 'Official Korean monthly ranking point table.',
      terms_status: 'unknown',
      parser_version: 'kba-ranking-v1',
    });
  }

  return { external, unresolved };
}

function buildGoRatingsExternalRatings(players, stats, fetchedAt) {
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

function collectGameGraph(players, playerDetails) {
  const playerIds = new Set(players.map((player) => player.id));
  const gamesByKey = new Map();

  for (const [playerId, detail] of Object.entries(playerDetails)) {
    if (!playerIds.has(playerId)) {
      continue;
    }

    for (const game of detail.modelGames ?? detail.recentGames ?? []) {
      if (!playerIds.has(game.opponentId) || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) {
        continue;
      }

      const blackId = game.color === 'black' ? playerId : game.opponentId;
      const whiteId = game.color === 'white' ? playerId : game.opponentId;
      const winnerId = game.result === 'win' ? playerId : game.opponentId;
      const loserId = game.result === 'win' ? game.opponentId : playerId;
      const sortedPlayers = [playerId, game.opponentId].sort().join('-');
      const key = `${game.date}-${sortedPlayers}-${blackId}-${winnerId}`;

      if (!gamesByKey.has(key)) {
        gamesByKey.set(key, {
          date: game.date,
          blackId,
          whiteId,
          winnerId,
          loserId,
        });
      }
    }
  }

  return [...gamesByKey.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function runBadukRModel(players, games, cutoffDate = null) {
  const ratings = new Map(players.map((player) => [player.id, 2500]));
  const counts = new Map(players.map((player) => [player.id, 0]));
  const recentCounts = new Map(players.map((player) => [player.id, 0]));
  const lastPlayed = new Map();
  const cutoff = cutoffDate ? new Date(`${cutoffDate}T00:00:00+09:00`) : null;
  const recentCutoff = cutoff
    ? new Date(cutoff.getTime() - 90 * 86400000)
    : null;

  for (const game of games) {
    if (cutoff && new Date(`${game.date}T00:00:00+09:00`) > cutoff) {
      continue;
    }

    const winnerRating = ratings.get(game.winnerId);
    const loserRating = ratings.get(game.loserId);
    if (winnerRating === undefined || loserRating === undefined) {
      continue;
    }

    const winnerGames = counts.get(game.winnerId) ?? 0;
    const loserGames = counts.get(game.loserId) ?? 0;
    const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
    const experienceFactor = 1 + Math.max(0, 24 - Math.min(winnerGames, loserGames)) / 48;
    const kFactor = 28 * experienceFactor;
    const delta = kFactor * (1 - expectedWinner);

    ratings.set(game.winnerId, winnerRating + delta);
    ratings.set(game.loserId, loserRating - delta);
    counts.set(game.winnerId, winnerGames + 1);
    counts.set(game.loserId, loserGames + 1);
    lastPlayed.set(game.winnerId, game.date);
    lastPlayed.set(game.loserId, game.date);

    if (recentCutoff && new Date(`${game.date}T00:00:00+09:00`) >= recentCutoff) {
      recentCounts.set(game.winnerId, (recentCounts.get(game.winnerId) ?? 0) + 1);
      recentCounts.set(game.loserId, (recentCounts.get(game.loserId) ?? 0) + 1);
    }
  }

  return { ratings, counts, recentCounts, lastPlayed };
}

function dateMinusDays(date, days) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setDate(value.getDate() - days);
  return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function buildOwnRatings(players, playerDetails, ratingDate) {
  const games = collectGameGraph(players, playerDetails);
  const current = runBadukRModel(players, games, ratingDate);
  const priorModels = new Map(
    [1, 7, 30, 90, 365].map((days) => [days, runBadukRModel(players, games, dateMinusDays(ratingDate, days))]),
  );
  const latestGameDate = games[games.length - 1]?.date ?? ratingDate;

  const ownRows = players.map((player) => {
    const currentRating = current.ratings.get(player.id) ?? 2500;
    const gamesTotal = current.counts.get(player.id) ?? 0;
    const gamesRecent = current.recentCounts.get(player.id) ?? 0;
    const lastPlayed = current.lastPlayed.get(player.id);
    const inactiveDays = lastPlayed
      ? Math.max(0, Math.round((new Date(`${latestGameDate}T00:00:00+09:00`) - new Date(`${lastPlayed}T00:00:00+09:00`)) / 86400000))
      : 999;
    const uncertainty = Math.max(
      55,
      Math.min(360, Math.round(330 / Math.sqrt(1 + gamesTotal / 5) + Math.min(120, inactiveDays * 0.18))),
    );
    const deltaFor = (days) => {
      const prior = priorModels.get(days);
      const priorCount = prior?.counts.get(player.id) ?? 0;
      if (!prior || gamesTotal === 0 || priorCount === 0) {
        return null;
      }
      return Math.round(currentRating - (prior.ratings.get(player.id) ?? 2500));
    };

    return {
      rating_date: ratingDate,
      player_id: player.id,
      own_rating: Math.round(currentRating),
      own_rating_uncertainty: uncertainty,
      own_rank: 0,
      own_rank_delta: null,
      own_rating_delta_1d: deltaFor(1),
      own_rating_delta_7d: deltaFor(7),
      own_rating_delta_30d: deltaFor(30),
      own_rating_delta_90d: deltaFor(90),
      own_rating_delta_365d: deltaFor(365),
      games_total: gamesTotal,
      games_recent: gamesRecent,
      active_flag: gamesRecent > 0,
      model_version: MODEL_VERSION,
      source_rank: player.rank,
    };
  });

  ownRows.sort((left, right) => {
    if (left.own_rating !== right.own_rating) {
      return right.own_rating - left.own_rating;
    }
    return left.own_rating_uncertainty - right.own_rating_uncertainty;
  });

  return ownRows.map((row, index) => {
    const ownRank = index + 1;
    const { source_rank: sourceRank, ...publicRow } = row;
    return {
      ...publicRow,
      own_rank: ownRank,
      own_rank_delta: sourceRank ? sourceRank - ownRank : null,
    };
  });
}

function parseSimpleYamlValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

async function loadTournamentPrestige() {
  try {
    const text = await readFile(prestigeFile, 'utf8');
    const entries = [];
    let current = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const start = line.match(/^-\s+id:\s*(.+)$/);
      if (start) {
        current = { id: parseSimpleYamlValue(start[1]) };
        entries.push(current);
        continue;
      }

      const field = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
      if (field && current) {
        current[field[1]] = parseSimpleYamlValue(field[2]);
      }
    }

    return entries;
  } catch (error) {
    console.warn(`Unable to load tournament prestige config: ${error.message}`);
    return [];
  }
}

function findPrestige(title, prestigeEntries) {
  const normalizedTitle = normalizeName(title);
  return prestigeEntries.find((entry) =>
    (entry.aliases ?? []).some((alias) => {
      const normalizedAlias = normalizeName(alias);
      return normalizedAlias && normalizedTitle.includes(normalizedAlias);
    }),
  );
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isInternationalEvent(event, prestige) {
  if (prestige?.international) {
    return true;
  }

  return includesAny(event.title, [
    /세계|国際|國際|国际|世界|World|LG|Samsung|春蘭|春兰|夢百合|梦百合|烂柯|爛柯|Chunlan|Lanke|MLILY/i,
  ]);
}

function enrichScheduleEvents(events, players, ownRatings, prestigeEntries) {
  const ownRankByPlayer = new Map(ownRatings.map((row) => [row.player_id, row.own_rank]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const playerNameIndex = buildPlayerNameIndex(players);

  return events.map((event) => {
    const explicitNames = event.player_names ?? [];
    const matchedFromNames = explicitNames
      .map((name) => matchPlayerByName(name, playerNameIndex))
      .filter(Boolean);
    const matchedFromText = findPlayersInText(event.title, players);
    const matchedPlayers = new Map();

    for (const player of [...matchedFromNames, ...matchedFromText]) {
      matchedPlayers.set(player.id, player);
    }

    const unresolvedPlayers = explicitNames.filter((name) => !matchPlayerByName(name, playerNameIndex));
    const resolvedPlayerIds = [...matchedPlayers.keys()];
    const prestige = findPrestige(event.title, prestigeEntries);
    let score = 0;
    const reasons = [];

    if (isInternationalEvent(event, prestige)) {
      score += 25;
      reasons.push('international_event');
    }

    if (prestige?.title_event || includesAny(event.title, [/결승|決勝|决赛|決賽|Final|final|챔피언|冠军|冠軍|타이틀|タイトル|title/i])) {
      score += 30;
      reasons.push('title_match_or_final');
    }

    if (includesAny(event.title, [/준결승|準決勝|半决赛|半決賽|semifinal|도전자|挑戦者|league-deciding|결정/i])) {
      score += 20;
      reasons.push('semifinal_or_deciding_round');
    }

    if (includesAny(event.title, [/본선|本戦|本赛|本賽|main/i])) {
      score += 15;
      reasons.push('main_tournament');
    }

    if (includesAny(event.title, [/예선|予選|预选|預選|prelim/i])) {
      score -= 10;
      reasons.push('preliminary');
    }

    const ranks = resolvedPlayerIds
      .map((id) => ownRankByPlayer.get(id) ?? playerById.get(id)?.rank)
      .filter((rank) => Number.isFinite(rank));
    if (ranks.some((rank) => rank <= 10)) {
      score += 25;
      reasons.push('top10_player');
    } else if (ranks.some((rank) => rank <= 30)) {
      score += 15;
      reasons.push('top30_player');
    }
    if (ranks.length >= 2 && ranks.every((rank) => rank <= 100)) {
      score += 10;
      reasons.push('both_top100');
    }

    if (prestige?.prestige_score) {
      score += Number(prestige.prestige_score);
      reasons.push('tournament_prestige');
    }

    if ((event.source_confidence ?? 1) < 0.75) {
      score -= 5;
      reasons.push('low_source_confidence');
    }

    if (unresolvedPlayers.length) {
      score -= Math.min(20, 5 * unresolvedPlayers.length);
      reasons.push('unresolved_players');
    } else if (event.event_type === 'tournament' && !resolvedPlayerIds.length) {
      score -= 5;
    }

    const importanceLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
    const { player_names: _playerNames, ...publicEvent } = event;

    return {
      ...publicEvent,
      importance_score: score,
      importance_level: importanceLevel,
      importance_reasons: [...new Set(reasons)],
      resolved_players: resolvedPlayerIds,
      unresolved_players: unresolvedPlayers,
    };
  });
}

function parseChineseDateRanges(text) {
  const normalized = text.replace(/\s+/g, '');
  const ranges = [];
  const seen = new Set();

  const add = (start, end = start, label = '') => {
    if (!start || !end) {
      return;
    }
    const key = `${start}-${end}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    ranges.push({ start, end, label: label || (start === end ? start : `${start}~${end}`) });
  };

  const rangePattern = /(20\d{2})年(\d{1,2})月(\d{1,2})日?\s*(?:至|到|-|—|－|~|～)\s*(?:(\d{1,2})月)?(\d{1,2})日/g;
  for (const match of normalized.matchAll(rangePattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const startDay = Number(match[3]);
    const endMonth = Number(match[4] ?? match[2]);
    const endDay = Number(match[5]);
    add(toIsoDate(year, month, startDay), toIsoDate(year, endMonth, endDay), match[0]);
  }

  const listedDaysPattern = /(20\d{2})年(\d{1,2})月(\d{1,2})、(\d{1,2})(?:、(\d{1,2}))?日/g;
  for (const match of normalized.matchAll(listedDaysPattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    for (const day of [match[3], match[4], match[5]].filter(Boolean)) {
      add(toIsoDate(year, month, Number(day)), toIsoDate(year, month, Number(day)), match[0]);
    }
  }

  const singlePattern = /(20\d{2})年(\d{1,2})月(\d{1,2})日/g;
  for (const match of normalized.matchAll(singlePattern)) {
    add(toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])), undefined, match[0]);
  }

  return ranges;
}

async function fetchCwaCalendarEvents(snapshotDate, fetchedAt) {
  const months = [];
  const [year, month] = snapshotDate.split('-').map(Number);
  for (let offset = 0; offset < 4; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const events = [];

  for (const queryValue of months) {
    const json = await fetchJson(sourceUrls.cwaCalendar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryType: 'month', queryValue, gameTypes: [], returnType: 1 }),
    });

    for (const item of json?.data ?? []) {
      const date = normalizeDate(item.gameDate ?? item.date ?? item.startDate ?? item.battleDate ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        continue;
      }
      const title = cleanText(item.gameName ?? item.gameFullName ?? item.title ?? item.name ?? 'Chinese Weiqi Association event');
      events.push({
        id: `cwa-calendar-${date}-${events.length + 1}`,
        date,
        dateEnd: normalizeDate(item.endDate ?? '') || null,
        timeKst: null,
        weekday: weekdayFromDate(date),
        title,
        tournament: title,
        round: cleanText(item.roundName ?? item.round ?? '') || null,
        category: 'prd',
        region: 'cn',
        country_or_region: 'cn',
        source: 'Chinese Weiqi Association',
        sourceUrl: sourceUrls.cwaPlayer,
        source_name: 'Chinese Weiqi Association',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: fetchedAt,
        source_confidence: 0.82,
        event_type: 'game',
      });
    }
  }

  return events;
}

async function fetchCwaTournamentRegulationEvents(snapshotDate, fetchedAt) {
  const json = await fetchJson(sourceUrls.cwaTournamentList, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pageNo: '1', pageSize: '60' }),
  });
  const records = json.records ?? json.data?.records ?? [];
  const events = [];

  for (const record of records) {
    if (record.gradeRating !== 1) {
      continue;
    }

    const title = cleanText(record.gameFullName ?? record.gameName ?? '');
    const regulation = cleanText(record.gameRegulation ?? '');
    const ranges = parseChineseDateRanges(regulation)
      .filter((range) => range.end >= snapshotDate)
      .slice(0, 2);

    for (const range of ranges) {
      const eventDate = range.start <= snapshotDate && range.end >= snapshotDate ? snapshotDate : range.start;
      if (eventDate < snapshotDate) {
        continue;
      }

      events.push({
        id: `cwa-reg-${record.id}-${eventDate}-${events.length + 1}`,
        date: eventDate,
        dateEnd: range.end,
        timeKst: null,
        weekday: weekdayFromDate(eventDate),
        title: `${title} (${range.label})`,
        tournament: title,
        round: null,
        category: isInternationalEvent({ title }, null) ? 'world' : 'prd',
        region: 'cn',
        country_or_region: 'cn',
        source: 'Chinese Weiqi Association',
        sourceUrl: sourceUrls.cwaPlayer,
        source_name: 'Chinese Weiqi Association',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: fetchedAt,
        source_confidence: 0.68,
        event_type: 'tournament',
      });
    }
  }

  return events;
}

async function fetchTaiwanScheduleStatus() {
  const html = await fetchText(sourceUrls.haifongCalendar);
  const text = cleanText(html);
  const hasStructuredCalendar = /20\d{2}[./-]\d{1,2}[./-]\d{1,2}.*(賽|棋|戰|赛|日程|行事曆)/u.test(text);
  return {
    itemCount: hasStructuredCalendar ? 1 : 0,
    notes: hasStructuredCalendar
      ? 'Calendar page responded, but parser has not promoted Taiwan items to public schedule yet.'
      : 'Calendar page responded but no structured upcoming professional schedule rows were found.',
  };
}

function buildRatingSources() {
  return [
    {
      rating_source_id: 'own',
      source_name: 'Baduk-R',
      display_name: 'Baduk-R',
      source_url: null,
      terms_status: 'allowed',
      notes: 'Internally computed own rating from normalized professional game history.',
    },
    {
      rating_source_id: 'goratings',
      source_name: 'GoRatings',
      display_name: 'GoRatings Score',
      source_url: sourceUrls.goratings,
      terms_status: 'unknown',
      notes: 'External public score retained separately from Baduk-R.',
    },
    {
      rating_source_id: 'chinese_qiyuan',
      source_name: 'Chinese Weiqi Association',
      display_name: 'Chinese Qiyuan Score',
      source_url: sourceUrls.cwaPlayer,
      terms_status: 'unknown',
      notes: 'Official CWA ranking points when matched to player_id.',
    },
    {
      rating_source_id: 'korean_baduk',
      source_name: 'Korea Baduk Association',
      display_name: 'Korean Baduk Association Score',
      source_url: sourceUrls.kbaRankingPublic,
      terms_status: 'unknown',
      notes: 'Official Korean ranking points when matched to player_id.',
    },
  ];
}

function missingComparison(sourceName, sourceUrl, region, termsStatus = 'unknown') {
  return {
    source_name: sourceName,
    rating_value: null,
    rank_value: null,
    rating_date: null,
    country_or_region: region,
    source_url: sourceUrl,
    source_confidence: null,
    fetched_at: null,
    notes: 'No matched rating value in this snapshot.',
    terms_status: termsStatus,
    status: termsStatus === 'unavailable' ? 'unavailable' : 'missing',
  };
}

function buildRatingComparisons(players, ownRatings, externalRatings) {
  const ownByPlayer = new Map(ownRatings.map((row) => [row.player_id, row]));
  const externalByPlayer = new Map();

  for (const rating of externalRatings) {
    const bucket = externalByPlayer.get(rating.player_id) ?? {};
    bucket[rating.rating_source_id] = {
      source_name: rating.source_name,
      rating_value: rating.rating_value,
      rank_value: rating.rank_value,
      rating_date: rating.rating_date,
      country_or_region: rating.country_or_region,
      source_url: rating.source_url,
      source_confidence: rating.source_confidence,
      fetched_at: rating.fetched_at,
      notes: rating.notes,
      terms_status: rating.terms_status,
      status: rating.terms_status === 'unknown' ? 'terms_unknown' : 'available',
    };
    externalByPlayer.set(rating.player_id, bucket);
  }

  return players.map((player) => {
    const external = externalByPlayer.get(player.id) ?? {};
    return {
      player_id: player.id,
      own_rating: ownByPlayer.get(player.id) ?? null,
      external_ratings: {
        goratings:
          external.goratings ??
          missingComparison('GoRatings', player.profileUrl, player.country, 'unknown'),
        chinese_qiyuan:
          external.chinese_qiyuan ??
          missingComparison('Chinese Weiqi Association', sourceUrls.cwaPlayer, 'cn', 'unknown'),
        korean_baduk:
          external.korean_baduk ??
          missingComparison('Korea Baduk Association', sourceUrls.kbaRankingPublic, 'kr', 'unknown'),
      },
    };
  });
}

function buildSourceHub() {
  return [
    {
      region: 'global',
      name: 'GoRatings',
      url: sourceUrls.goratings,
      kind: 'ratings',
      note: 'WHR-style professional rating list with game records and player histories.',
    },
    {
      region: 'kr',
      name: 'Korea Baduk Association',
      url: 'https://www.baduk.or.kr/',
      kind: 'schedule-news-ratings',
      note: 'Official Korean professional schedule, news, rankings, and player records.',
    },
    {
      region: 'cn',
      name: 'Chinese Weiqi Association',
      url: 'https://www.weiqi.org.cn/',
      kind: 'schedule-ratings',
      note: 'Official Chinese weiqi federation portal and ranking API.',
    },
    {
      region: 'jp',
      name: 'Nihon Ki-in',
      url: 'https://www.nihonkiin.or.jp/',
      kind: 'schedule-federation',
      note: 'Official Japan Go association portal for tournaments and match schedules.',
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
      url: sourceUrls.haifong,
      kind: 'federation-news',
      note: 'Taiwan professional Go operations reference source.',
    },
  ];
}

function sourceStatus({
  source_id,
  source_name,
  country_or_region,
  data_type,
  status,
  terms_status = 'unknown',
  source_url,
  fetched_at,
  confidence,
  item_count,
  notes,
}) {
  return {
    source_id,
    source_name,
    country_or_region,
    data_type,
    status,
    terms_status,
    source_url,
    fetched_at,
    confidence,
    item_count,
    notes,
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchTextResponseWithTimeout(url, init = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    return { response, bodyText };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonFromModelText(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('empty model response');
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('model response was not JSON');
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function normalizeLocalizedText(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const clean = (text) => cleanText(String(text ?? ''));
  return {
    en: clean(source.en) || fallback,
    ko: clean(source.ko) || fallback,
    ja: clean(source.ja) || fallback,
    zhHans: clean(source.zhHans) || clean(source.zh) || fallback,
    zhHant: clean(source.zhHant) || clean(source.zh) || fallback,
  };
}

function buildTranslationItems(schedule, news, snapshotDate) {
  const newsItems = news.slice(0, OPENROUTER_NEWS_TRANSLATION_LIMIT);
  const scheduleItems = schedule
    .filter((event) => event.date >= snapshotDate || (event.dateEnd ?? '') >= snapshotDate)
    .slice(0, OPENROUTER_SCHEDULE_TRANSLATION_LIMIT);

  return [
    ...newsItems.map((item) => ({
      id: `news:${item.id}`,
      type: 'news',
      title: item.title,
      summary: item.summary,
      source_region: item.region,
      source_name: item.source,
    })),
    ...scheduleItems.map((event) => ({
      id: `schedule:${event.id}`,
      type: 'schedule',
      title: event.title,
      tournament: event.tournament ?? '',
      source_region: event.region,
      source_name: event.source_name ?? event.source,
    })),
  ].filter((item) => item.title);
}

async function translateBatchWithOpenRouter(items) {
  const { response, bodyText } = await fetchTextResponseWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ducklove.github.io/baduk_ratings/',
      'X-Title': 'Baduk-R static data translation',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You translate professional baduk/go schedule and news metadata. Return strict JSON only. Preserve player names, tournament names, ranks, dates, times, source names, and factual meaning. Do not invent missing information.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            target_languages: {
              en: 'English',
              ko: 'Korean',
              ja: 'Japanese',
              zhHans: 'Simplified Chinese',
              zhHant: 'Traditional Chinese',
            },
            output_schema:
              'Return {"items":[{"id":"same id","title":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""},"tournament":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""},"summary":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""}}]}. Omit tournament or summary only if the input field is empty.',
            items,
          }),
        },
      ],
    }),
  }, OPENROUTER_TRANSLATION_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
  }

  const payload = JSON.parse(bodyText);
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = parseJsonFromModelText(content);
  if (!Array.isArray(parsed.items)) {
    throw new Error('OpenRouter response missing items array');
  }

  return parsed.items;
}

async function translatePublicContent(schedule, news, generatedAt) {
  if (!OPENROUTER_API_KEY) {
    return {
      schedule,
      news,
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: 'OPENROUTER_API_KEY is not set. Runtime UI uses original source text only.',
      }),
    };
  }

  const snapshotDate = generatedAt.slice(0, 10);
  const items = buildTranslationItems(schedule, news, snapshotDate);
  const translations = new Map();
  let failedBatch = null;

  try {
    for (const batch of chunk(items, OPENROUTER_TRANSLATION_BATCH_SIZE)) {
      try {
        const translatedItems = await translateBatchWithOpenRouter(batch);
        for (const item of translatedItems) {
          if (item?.id) {
            translations.set(item.id, item);
          }
        }
      } catch (error) {
        failedBatch = error;
        console.warn(`OpenRouter translation batch skipped: ${error.message}`);
        break;
      }
    }

    return {
      schedule: schedule.map((event) => {
        const item = translations.get(`schedule:${event.id}`);
        if (!item) {
          return event;
        }

        return {
          ...event,
          localized_title: normalizeLocalizedText(item.title, event.title),
          ...(event.tournament
            ? { localized_tournament: normalizeLocalizedText(item.tournament, event.tournament) }
            : {}),
        };
      }),
      news: news.map((item) => {
        const translation = translations.get(`news:${item.id}`);
        if (!translation) {
          return item;
        }

        return {
          ...item,
          localized_title: normalizeLocalizedText(translation.title, item.title),
          localized_summary: normalizeLocalizedText(translation.summary, item.summary),
        };
      }),
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: translations.size ? 'available' : failedBatch ? 'parse_failed' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: translations.size ? 0.72 : 0.2,
        item_count: translations.size,
        notes: failedBatch
          ? `Partial build-time schedule/news localization via ${OPENROUTER_MODEL}. Last batch failed: ${failedBatch.message}. The frontend never calls OpenRouter.`
          : `Build-time schedule/news localization via ${OPENROUTER_MODEL}. The frontend never calls OpenRouter.`,
      }),
    };
  } catch (error) {
    console.warn(`OpenRouter translation skipped: ${error.message}`);
    return {
      schedule,
      news,
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Build-time translation failed. Runtime UI uses original source text only. Model: ${OPENROUTER_MODEL}.`,
      }),
    };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const snapshotDate = kstDateString(new Date(generatedAt));
  const sourceStatuses = [];
  const unresolvedExternalRatings = [];

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
  sourceStatuses.push(
    sourceStatus({
      source_id: 'goratings_rating_list',
      source_name: 'GoRatings',
      country_or_region: 'global',
      data_type: 'ratings',
      status: 'terms_unknown',
      terms_status: 'unknown',
      source_url: sourceUrls.goratings,
      fetched_at: generatedAt,
      confidence: 0.82,
      item_count: players.length,
      notes: 'Existing public GoRatings score is retained as an external score with terms_status unknown.',
    }),
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

  const playersByName = buildPlayerNameIndex(players);
  const ownRatings = buildOwnRatings(players, playerDetails, snapshotDate);
  const ownByPlayer = new Map(ownRatings.map((row) => [row.player_id, row]));

  console.log('Fetching schedule, news, and federation ratings...');
  const [scheduleHtml, newsHtml, kbaRankingHtml] = await Promise.all([
    fetchText(sourceUrls.kbaSchedule),
    fetchText(sourceUrls.kbaNews),
    fetchText(sourceUrls.kbaRanking),
  ]);

  const kbaSchedule = parseKbaSchedule(scheduleHtml, generatedAt);
  let news = parseNews(newsHtml);
  const kbaRows = parseKbaRankingRows(kbaRankingHtml);
  const kbaRatings = buildKbaExternalRatings(kbaRows, playersByName, generatedAt);
  unresolvedExternalRatings.push(...kbaRatings.unresolved);
  sourceStatuses.push(
    sourceStatus({
      source_id: 'kba_schedule',
      source_name: 'Korea Baduk Association',
      country_or_region: 'kr',
      data_type: 'schedule',
      status: kbaSchedule.length ? 'available' : 'available_empty',
      terms_status: 'unknown',
      source_url: sourceUrls.kbaSchedulePublic,
      fetched_at: generatedAt,
      confidence: 0.92,
      item_count: kbaSchedule.length,
      notes: 'Official KBA monthly schedule page.',
    }),
    sourceStatus({
      source_id: 'kba_ratings',
      source_name: 'Korea Baduk Association',
      country_or_region: 'kr',
      data_type: 'external_ratings',
      status: kbaRatings.external.length ? 'available' : 'available_empty',
      terms_status: 'unknown',
      source_url: sourceUrls.kbaRankingPublic,
      fetched_at: generatedAt,
      confidence: 0.9,
      item_count: kbaRatings.external.length,
      notes: 'Official KBA monthly ranking points; unmatched names are reported separately.',
    }),
    sourceStatus({
      source_id: 'kba_news',
      source_name: 'Korea Baduk Association',
      country_or_region: 'kr',
      data_type: 'news',
      status: news.length ? 'available' : 'available_empty',
      terms_status: 'unknown',
      source_url: sourceUrls.kbaNewsPublic,
      fetched_at: generatedAt,
      confidence: 0.9,
      item_count: news.length,
      notes: 'Official KBA news feed snapshot.',
    }),
  );

  let nihonSchedule = [];
  try {
    const nihonHtml = await fetchText(sourceUrls.nihonSchedule);
    nihonSchedule = parseNihonSchedule(nihonHtml, snapshotDate, generatedAt);
    sourceStatuses.push(
      sourceStatus({
        source_id: 'nihon_schedule',
        source_name: 'Nihon Ki-in',
        country_or_region: 'jp',
        data_type: 'schedule',
        status: nihonSchedule.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.nihonSchedule,
        fetched_at: generatedAt,
        confidence: 0.82,
        item_count: nihonSchedule.length,
        notes: 'Official Nihon Ki-in two-week result/schedule page. Planned games are parsed from the upcoming table.',
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'nihon_schedule',
        source_name: 'Nihon Ki-in',
        country_or_region: 'jp',
        data_type: 'schedule',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.nihonSchedule,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to parse Nihon Ki-in schedule: ${error.message}`,
      }),
    );
  }

  let nihonColumnNews = [];
  try {
    nihonColumnNews = await fetchNihonColumns();
    sourceStatuses.push(
      sourceStatus({
        source_id: 'nihon_columns',
        source_name: 'Nihon Ki-in Column',
        country_or_region: 'jp',
        data_type: 'news',
        status: nihonColumnNews.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.nihonColumns,
        fetched_at: generatedAt,
        confidence: 0.9,
        item_count: nihonColumnNews.length,
        notes: 'Official Nihon Ki-in column Atom feed. Column and feature articles are preferred over routine news.',
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'nihon_columns',
        source_name: 'Nihon Ki-in Column',
        country_or_region: 'jp',
        data_type: 'news',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.nihonColumns,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to parse Nihon Ki-in column feed: ${error.message}`,
      }),
    );
  }

  let cwaRatings = { external: [], unresolved: [] };
  let cwaCalendarSchedule = [];
  let cwaRegulationSchedule = [];
  try {
    const cwaRankingSnapshot = await fetchCwaRankings(generatedAt);
    cwaRatings = buildCwaExternalRatings(cwaRankingSnapshot, playersByName);
    unresolvedExternalRatings.push(...cwaRatings.unresolved);
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_ratings',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'external_ratings',
        status: cwaRatings.external.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: 0.9,
        item_count: cwaRatings.external.length,
        notes: `Official CWA rating API; update cycle ${cwaRankingSnapshot.updateCycle ?? 'unknown'}.`,
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_ratings',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'external_ratings',
        status: 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to fetch CWA ratings: ${error.message}`,
      }),
    );
  }

  let cwaEditorialNews = [];
  try {
    cwaEditorialNews = await fetchCwaEditorialNews();
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_editorial_news',
        source_name: 'Chinese Weiqi Association Editorial News',
        country_or_region: 'cn',
        data_type: 'news',
        status: cwaEditorialNews.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaNews,
        fetched_at: generatedAt,
        confidence: cwaEditorialNews.length ? 0.82 : 0.35,
        item_count: cwaEditorialNews.length,
        notes: 'Official CWA news API. Media reports, interviews, analysis, player-focused, and feature-like articles are preferred over routine notices.',
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_editorial_news',
        source_name: 'Chinese Weiqi Association Editorial News',
        country_or_region: 'cn',
        data_type: 'news',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaNews,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to parse CWA editorial news: ${error.message}`,
      }),
    );
  }

  try {
    cwaCalendarSchedule = await fetchCwaCalendarEvents(snapshotDate, generatedAt);
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_calendar',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'schedule',
        status: cwaCalendarSchedule.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: cwaCalendarSchedule.length ? 0.82 : 0.55,
        item_count: cwaCalendarSchedule.length,
        notes: cwaCalendarSchedule.length
          ? 'Official CWA calendar API returned schedule items.'
          : 'Official CWA calendar API responded but returned no current month schedule rows.',
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_calendar',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'schedule',
        status: 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to fetch CWA calendar API: ${error.message}`,
      }),
    );
  }

  try {
    cwaRegulationSchedule = await fetchCwaTournamentRegulationEvents(snapshotDate, generatedAt);
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_tournament_regulations',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'schedule',
        status: cwaRegulationSchedule.length ? 'available' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: cwaRegulationSchedule.length ? 0.68 : 0.4,
        item_count: cwaRegulationSchedule.length,
        notes: 'Official CWA tournament regulation pages are parsed for dated tournament events when the calendar API is empty.',
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'cwa_tournament_regulations',
        source_name: 'Chinese Weiqi Association',
        country_or_region: 'cn',
        data_type: 'schedule',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.cwaPlayer,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to parse CWA tournament regulations: ${error.message}`,
      }),
    );
  }

  try {
    const taiwanStatus = await fetchTaiwanScheduleStatus();
    sourceStatuses.push(
      sourceStatus({
        source_id: 'haifong_calendar',
        source_name: 'HaiFong Go Association',
        country_or_region: 'tw',
        data_type: 'schedule',
        status: taiwanStatus.itemCount ? 'parse_failed' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.haifongCalendar,
        fetched_at: generatedAt,
        confidence: taiwanStatus.itemCount ? 0.45 : 0.25,
        item_count: 0,
        notes: taiwanStatus.notes,
      }),
    );
  } catch (error) {
    sourceStatuses.push(
      sourceStatus({
        source_id: 'haifong_calendar',
        source_name: 'HaiFong Go Association',
        country_or_region: 'tw',
        data_type: 'schedule',
        status: 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.haifongCalendar,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: 0,
        notes: `Unable to fetch HaiFong calendar: ${error.message}`,
      }),
    );
  }

  const prestigeEntries = await loadTournamentPrestige();
  const rawSchedule = [
    ...kbaSchedule,
    ...nihonSchedule,
    ...cwaCalendarSchedule,
    ...cwaRegulationSchedule,
  ];
  let schedule = enrichScheduleEvents(rawSchedule, players, ownRatings, prestigeEntries).sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return (right.importance_score ?? 0) - (left.importance_score ?? 0);
  });
  news = sortNewsItems([...news, ...nihonColumnNews, ...cwaEditorialNews]).slice(0, 36);

  console.log('Localizing schedule and news text if OpenRouter is configured...');
  const translationResult = await translatePublicContent(schedule, news, generatedAt);
  schedule = translationResult.schedule;
  news = translationResult.news;
  sourceStatuses.push(translationResult.status);

  const externalRatings = [
    ...buildGoRatingsExternalRatings(players, stats, generatedAt),
    ...cwaRatings.external,
    ...kbaRatings.external,
  ];
  const ratingComparisons = buildRatingComparisons(players, ownRatings, externalRatings);
  const comparisonByPlayer = new Map(ratingComparisons.map((row) => [row.player_id, row]));
  const externalByPlayer = new Map();

  for (const rating of externalRatings) {
    const bucket = externalByPlayer.get(rating.player_id) ?? [];
    bucket.push(rating);
    externalByPlayer.set(rating.player_id, bucket);
  }

  for (const [playerId, detail] of Object.entries(playerDetails)) {
    detail.ownRating = ownByPlayer.get(playerId);
    detail.externalRatings = externalByPlayer.get(playerId) ?? [];
    detail.ratingComparison = comparisonByPlayer.get(playerId);
    delete detail.modelGames;
  }

  const ratingSources = buildRatingSources();
  const sourceStatusSnapshot = {
    schema_version: 1,
    generated_at: generatedAt,
    sources: sourceStatuses,
  };

  const data = {
    schemaVersion: 2,
    generatedAt,
    modelVersion: MODEL_VERSION,
    ratingStats: stats,
    players,
    playerDetails,
    schedule,
    news,
    sourceHub: buildSourceHub(),
    ownRatings,
    externalRatings,
    ratingComparisons,
    ratingSources,
    sourceStatus: sourceStatusSnapshot,
  };

  await mkdir(publicDataDir, { recursive: true });
  await mkdir(ratingsOutDir, { recursive: true });
  await Promise.all([
    writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8'),
    writeFile(
      path.join(ratingsOutDir, 'own_latest.json'),
      `${JSON.stringify({ schema_version: 1, generated_at: generatedAt, model_version: MODEL_VERSION, own_ratings: ownRatings }, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(ratingsOutDir, 'external_latest.json'),
      `${JSON.stringify({ schema_version: 1, generated_at: generatedAt, external_ratings: externalRatings, unresolved: unresolvedExternalRatings }, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(ratingsOutDir, 'source_status.json'),
      `${JSON.stringify(sourceStatusSnapshot, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(ratingsOutDir, 'comparison_latest.json'),
      `${JSON.stringify({ schema_version: 1, generated_at: generatedAt, rating_sources: ratingSources, comparisons: ratingComparisons }, null, 2)}\n`,
      'utf8',
    ),
  ]);

  console.log(
    `Wrote ${players.length} players, ${Object.keys(playerDetails).length} profiles, ${schedule.length} schedule events, ${news.length} news items, ${ownRatings.length} own ratings, ${externalRatings.length} external ratings.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
