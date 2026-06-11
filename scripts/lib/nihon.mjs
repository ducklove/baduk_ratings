import { sourceUrls } from './config.mjs';
import { fetchText } from './http.mjs';
import { applyNewsCuration, sortNewsItems } from './news.mjs';
import { cleanText, decodeHtml, normalizeDate, toIsoDate, weekdayFromDate } from './text.mjs';

export function cleanSchedulePlayerName(value) {
  return cleanText(value)
    .replace(/[△▲]/g, '')
    .replace(/\s*(九段|八段|七段|六段|五段|四段|三段|二段|初段|名誉.*|女流.*|本因坊|棋聖|名人|王座|天元|十段|碁聖|扇興杯|快棋王|龍星|女流本|テケ女)$/u, '')
    .trim();
}

export function inferYearForMonthDay(month, day, snapshotDate) {
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

export function parseNihonSchedule(html, snapshotDate, fetchedAt) {
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

export function parseNihonColumnFeed(xml) {
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

export async function fetchNihonColumns() {
  const xml = await fetchText(sourceUrls.nihonColumnAtom);
  return parseNihonColumnFeed(xml);
}
