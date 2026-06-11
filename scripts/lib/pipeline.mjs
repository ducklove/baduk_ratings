import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEPLOYED_DATA_URL,
  MODEL_VERSION,
  TARGET_COUNTRIES,
  defaultDataDir,
  sourceUrls,
} from './config.mjs';
import { buildRatingComparisons, buildRatingSources, buildSourceHub, sourceStatus } from './comparisons.mjs';
import {
  buildCwaExternalRatings,
  fetchCwaCalendarEvents,
  fetchCwaEditorialNews,
  fetchCwaRankings,
  fetchCwaTournamentRegulationEvents,
  fetchTaiwanScheduleStatus,
} from './cwa.mjs';
import { buildRssFeed, loadOwnHistory, mergeOwnHistory, writeSnapshotOutputs } from './exports.mjs';
import {
  addRegionalRanks,
  buildGoRatingsExternalRatings,
  loadLocalizedNames,
  loadPlayerDetail,
  parseRatingRows,
  parseStats,
  selectDetailIds,
} from './goratings.mjs';
import { fetchJson, fetchText, withConcurrency } from './http.mjs';
import { buildKbaExternalRatings, parseKbaRankingRows, parseKbaSchedule, parseNews } from './kba.mjs';
import { collectKifuRecords } from './kifu.mjs';
import { buildOwnRatings } from './model.mjs';
import { fallbackNewsItems, sortNewsItems } from './news.mjs';
import { fetchNihonColumns, parseNihonSchedule } from './nihon.mjs';
import { enrichScheduleEvents, loadTournamentPrestige } from './schedule.mjs';
import { buildTournamentsExport, loadTournamentRegistry } from './tournaments.mjs';
import { buildPlayerNameIndex, kstDateString } from './text.mjs';
import { translatePublicContent } from './translate.mjs';

const MIN_TARGET_COUNTRY_PLAYERS = 500;

function resolveOutputPaths({ dataDir, feedFile } = {}) {
  const resolvedDataDir = path.resolve(dataDir ?? defaultDataDir);
  return {
    dataDir: resolvedDataDir,
    feedFile: feedFile ? path.resolve(feedFile) : path.join(resolvedDataDir, '..', 'feed.xml'),
    outFile: path.join(resolvedDataDir, 'baduk-data.json'),
    historyFile: path.join(resolvedDataDir, 'ratings', 'own_history.json'),
  };
}

async function loadGoRatingsUniverse(generatedAt) {
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

  if (players.length < MIN_TARGET_COUNTRY_PLAYERS) {
    throw new Error(`GoRatings list yielded only ${players.length} target-country players`);
  }

  return { players, stats, generatedAt };
}

async function loadFallbackSnapshot(previousSnapshot) {
  try {
    const deployed = await fetchJson(DEPLOYED_DATA_URL);
    if (deployed?.players?.length) {
      return { snapshot: deployed, origin: 'deployed snapshot' };
    }
  } catch {
    // fall through to the local committed snapshot
  }

  if (previousSnapshot?.players?.length) {
    return { snapshot: previousSnapshot, origin: 'local committed snapshot' };
  }

  return null;
}

export async function runPipeline(options = {}) {
  const paths = resolveOutputPaths(options);
  const generatedAt = new Date().toISOString();
  const snapshotDate = kstDateString(new Date(generatedAt));
  const sourceStatuses = [];
  const unresolvedExternalRatings = [];
  let previousSnapshot = null;

  try {
    previousSnapshot = JSON.parse(await readFile(paths.outFile, 'utf8'));
  } catch {
    previousSnapshot = null;
  }

  console.log('Fetching GoRatings rating list...');
  let players;
  let stats;
  let playerDetails;
  let ownRatings;
  let staleRatingList = false;

  try {
    ({ players, stats } = await loadGoRatingsUniverse(generatedAt));
  } catch (error) {
    console.warn(`GoRatings rating list unavailable (${error.message}); falling back to previous snapshot.`);
    const fallback = await loadFallbackSnapshot(previousSnapshot);
    if (!fallback) {
      throw error;
    }

    players = fallback.snapshot.players;
    playerDetails = fallback.snapshot.playerDetails ?? {};
    stats = fallback.snapshot.ratingStats;
    ownRatings = fallback.snapshot.ownRatings ?? [];
    staleRatingList = true;
    sourceStatuses.push(
      sourceStatus({
        source_id: 'goratings_rating_list',
        source_name: 'GoRatings',
        country_or_region: 'global',
        data_type: 'ratings',
        status: 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.goratings,
        fetched_at: generatedAt,
        confidence: 0.4,
        item_count: players.length,
        notes: `GoRatings rating list fetch/parse failed (${error.message}). Serving stale player/rating data from the ${fallback.origin} generated at ${fallback.snapshot.generatedAt}. Schedule, news, and federation ratings are still refreshed.`,
        stale: true,
      }),
    );
  }

  if (!staleRatingList) {
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
    playerDetails = Object.fromEntries(details.filter(Boolean));

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

    ownRatings = buildOwnRatings(players, playerDetails, snapshotDate);
  }

  const playersByName = buildPlayerNameIndex(players);
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

  if (!news.length) {
    news = fallbackNewsItems(previousSnapshot, {
      region: 'kr',
      contentTypes: ['news'],
      limit: 8,
      reason: 'previous_snapshot_korean_news_fallback',
    });
  }

  if (!nihonColumnNews.length) {
    nihonColumnNews = fallbackNewsItems(previousSnapshot, {
      region: 'jp',
      contentTypes: ['column'],
      limit: 6,
      reason: 'previous_snapshot_nihon_column_fallback',
    });
  }

  if (!cwaEditorialNews.length) {
    cwaEditorialNews = fallbackNewsItems(previousSnapshot, {
      region: 'cn',
      contentTypes: ['media_report', 'news'],
      limit: 8,
      reason: 'previous_snapshot_cwa_editorial_fallback',
    });
  }

  news = sortNewsItems([...news, ...nihonColumnNews, ...cwaEditorialNews]).slice(0, 36);

  console.log('Localizing schedule and news text if OpenRouter is configured...');
  const translationResult = await translatePublicContent(schedule, news, generatedAt, previousSnapshot);
  schedule = translationResult.schedule;
  news = translationResult.news;
  sourceStatuses.push(translationResult.status);

  console.log('Collecting kifu from linked viewer pages...');
  const kifuStatus = await collectKifuRecords({
    players,
    ownRatings,
    playerDetails,
    dataDir: paths.dataDir,
    generatedAt,
  });
  sourceStatuses.push(kifuStatus);

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

  const previousHistory = await loadOwnHistory(paths.historyFile);
  const ownHistory = {
    schema_version: 1,
    updated_at: generatedAt,
    players: mergeOwnHistory(previousHistory, ownRatings, snapshotDate),
  };
  const feedXml = buildRssFeed({ players, ownRatings, generatedAt });
  const tournamentRegistry = await loadTournamentRegistry();
  const tournamentsExport = buildTournamentsExport(tournamentRegistry, schedule, players, generatedAt);

  await writeSnapshotOutputs({
    dataDir: paths.dataDir,
    feedFile: paths.feedFile,
    data,
    unresolvedExternalRatings,
    ownHistory,
    feedXml,
    tournamentsExport,
  });

  console.log(
    `Wrote ${players.length} players, ${Object.keys(playerDetails).length} profiles, ${schedule.length} schedule events, ${news.length} news items, ${ownRatings.length} own ratings, ${externalRatings.length} external ratings.`,
  );

  return data;
}

export async function runFromSnapshot(options = {}) {
  const paths = resolveOutputPaths(options);
  const data = JSON.parse(await readFile(paths.outFile, 'utf8'));
  const snapshotDate = data.ownRatings?.[0]?.rating_date ?? kstDateString(new Date(data.generatedAt));

  let unresolvedExternalRatings = [];
  try {
    const externalLatest = JSON.parse(
      await readFile(path.join(paths.dataDir, 'ratings', 'external_latest.json'), 'utf8'),
    );
    unresolvedExternalRatings = externalLatest.unresolved ?? [];
  } catch {
    unresolvedExternalRatings = [];
  }

  const previousHistory = await loadOwnHistory(paths.historyFile, { offline: true });
  const ownHistory = {
    schema_version: 1,
    updated_at: data.generatedAt,
    players: mergeOwnHistory(previousHistory, data.ownRatings, snapshotDate),
  };
  const feedXml = buildRssFeed({
    players: data.players,
    ownRatings: data.ownRatings,
    generatedAt: data.generatedAt,
  });
  // Pure derivation from the committed snapshot and the manual registry; kifu
  // collection is network-only and existing kifu exports stay untouched here.
  const tournamentRegistry = await loadTournamentRegistry();
  const tournamentsExport = buildTournamentsExport(
    tournamentRegistry,
    data.schedule,
    data.players,
    data.generatedAt,
  );

  await writeSnapshotOutputs({
    dataDir: paths.dataDir,
    feedFile: paths.feedFile,
    data,
    unresolvedExternalRatings,
    ownHistory,
    feedXml,
    tournamentsExport,
  });

  console.log(
    `Re-exported snapshot from ${data.generatedAt}: ${data.players.length} players, ${Object.keys(data.playerDetails).length} profiles, ${data.schedule.length} schedule events without network access.`,
  );

  return data;
}
