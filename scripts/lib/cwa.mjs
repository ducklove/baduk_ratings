import { sourceUrls } from './config.mjs';
import { fetchJson, fetchText } from './http.mjs';
import { applyNewsCuration, sortNewsItems } from './news.mjs';
import { isInternationalEvent, parseChineseDateRanges } from './schedule.mjs';
import { cleanText, matchPlayerByName, normalizeDate, weekdayFromDate } from './text.mjs';

async function fetchCwaNewsPage(params) {
  const json = await fetchJson(sourceUrls.cwaNewsList, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  return json?.data?.records ?? json?.records ?? [];
}

export async function fetchCwaEditorialNews() {
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

export async function fetchCwaRankings(fetchedAt) {
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

export function buildCwaExternalRatings(cwaRankings, playersByName) {
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

export async function fetchCwaCalendarEvents(snapshotDate, fetchedAt) {
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

export async function fetchCwaTournamentRegulationEvents(snapshotDate, fetchedAt) {
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

export async function fetchTaiwanScheduleStatus() {
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
