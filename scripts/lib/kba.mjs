import { sourceUrls } from './config.mjs';
import { cleanText, kstDateString, matchPlayerByName, normalizeDate, stripTags } from './text.mjs';

export function parseKbaSchedule(html, fetchedAt) {
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

export function parseNews(html) {
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

export function parseKbaRankingRows(html) {
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

export function buildKbaExternalRatings(kbaRows, playersByName, fetchedAt) {
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
