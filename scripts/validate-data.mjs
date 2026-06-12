import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(rootDir, 'public', 'data');
const dataFile = path.join(dataDir, 'baduk-data.json');
const ratingsDir = path.join(dataDir, 'ratings');
const coreFile = path.join(dataDir, 'baduk-data-core.json');
const playersDir = path.join(dataDir, 'players');
const feedFile = path.join(dataDir, '..', 'feed.xml');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

const data = await readJson(dataFile);
const countries = new Set(data.players.map((player) => player.country));
const scheduleRegions = new Set(data.schedule.map((event) => event.region));
const externalSources = new Set(data.externalRatings.map((rating) => rating.rating_source_id));
const newsRegions = new Set(data.news.map((item) => item.region));
const newsContentTypes = new Set(data.news.map((item) => item.content_type));
const embeddedSourceStatuses = data.sourceStatus?.sources ?? [];

function sourceStatusById(sourceId) {
  return embeddedSourceStatuses.find((source) => source.source_id === sourceId);
}

function assertScheduleRegionOrDocumented(region, sourceIds, label) {
  if (scheduleRegions.has(region)) {
    return;
  }

  const documented = sourceIds
    .map(sourceStatusById)
    .filter(Boolean)
    .some((source) => ['available_empty', 'unavailable', 'parse_failed'].includes(source.status));

  assert(documented, `Missing ${label} schedule items and no documented source limitation`);
}

assert(data.schemaVersion === 2, 'Unexpected schema version');
assert(data.modelVersion?.includes('game-graph'), 'Baduk-R must be the game-graph own rating model');
assert(data.players.length > 500, 'Expected at least 500 Korea/China/Japan/Taiwan players');
assert(countries.has('kr'), 'Missing Korea players');
assert(countries.has('cn'), 'Missing China players');
assert(countries.has('jp'), 'Missing Japan players');
assert(countries.has('tw'), 'Missing Taiwan players');
assert(data.players[0]?.rating > 3600, 'Top rating looks too low');
assert(Object.keys(data.playerDetails).length >= 50, 'Expected at least 50 enriched profiles');
assert(data.schedule.length >= 80, 'Expected expanded multi-country schedule events');
assert(scheduleRegions.has('kr'), 'Missing Korean schedule items');
assertScheduleRegionOrDocumented('jp', ['nihon_schedule'], 'Japanese');
assertScheduleRegionOrDocumented('cn', ['cwa_calendar', 'cwa_tournament_regulations'], 'Chinese');
assert(data.news.length >= 5, 'Expected latest news items');
assert(newsRegions.has('jp'), 'Missing Japanese column/news items');
assert(newsRegions.has('cn'), 'Missing Chinese editorial news items');
assert(newsContentTypes.has('column'), 'Missing curated column news items');
assert(newsContentTypes.has('media_report'), 'Missing curated media report news items');
assert(data.sourceHub.length >= 5, 'Expected source hub links');
assert(data.ownRatings.length === data.players.length, 'Expected own rating for each tracked player');
assert(data.ratingComparisons.length === data.players.length, 'Expected rating comparison for each tracked player');
assert(externalSources.has('goratings'), 'Missing GoRatings external score rows');
assert(externalSources.has('chinese_qiyuan'), 'Missing Chinese Qiyuan score rows');
assert(externalSources.has('korean_baduk'), 'Missing Korean Baduk Association score rows');

for (const player of data.players.slice(0, 25)) {
  assert(player.names.en, `Missing English name for ${player.id}`);
  assert(player.names.ko, `Missing Korean name for ${player.id}`);
  assert(player.names.ja, `Missing Japanese name for ${player.id}`);
  assert(player.names.zh, `Missing Chinese name for ${player.id}`);
}

for (const event of data.schedule) {
  assert(event.source_name || event.source, `Missing schedule source for ${event.id}`);
  assert(event.source_url || event.sourceUrl, `Missing schedule source URL for ${event.id}`);
  assert(event.fetched_at, `Missing schedule fetched_at for ${event.id}`);
  assert(typeof event.source_confidence === 'number', `Missing schedule confidence for ${event.id}`);
  assert(['high', 'medium', 'low'].includes(event.importance_level), `Missing importance level for ${event.id}`);
  assert(typeof event.importance_score === 'number', `Missing importance score for ${event.id}`);
  assert(Array.isArray(event.importance_reasons), `Missing importance reasons for ${event.id}`);
}

for (const item of data.news) {
  assert(item.source, `Missing news source for ${item.id}`);
  assert(item.url, `Missing news source URL for ${item.id}`);
  assert(['news', 'column', 'media_report'].includes(item.content_type), `Missing news content type for ${item.id}`);
  assert(typeof item.curation_score === 'number', `Missing news curation score for ${item.id}`);
  assert(Array.isArray(item.curation_reason), `Missing news curation reasons for ${item.id}`);
}

for (const rating of data.externalRatings) {
  assert(rating.source_name, `Missing external rating source name for ${rating.player_id}`);
  assert(rating.fetched_at || rating.rating_date, `Missing external rating date/fetched_at for ${rating.player_id}`);
  assert(['allowed', 'unknown', 'restricted', 'unavailable'].includes(rating.terms_status), `Bad terms_status for ${rating.player_id}`);
  assert(rating.rating_value !== 0, `External missing values must not be represented as zero for ${rating.player_id}`);
}

for (const comparison of data.ratingComparisons) {
  assert(comparison.own_rating?.own_rating > 0, `Missing own rating for ${comparison.player_id}`);
  for (const value of Object.values(comparison.external_ratings)) {
    assert(value.rating_value !== 0, `Comparison missing values must be null, not zero for ${comparison.player_id}`);
    if (value.rating_value === null) {
      assert(['missing', 'unavailable', 'terms_unknown'].includes(value.status), `Missing source should carry a missing/unavailable status for ${comparison.player_id}`);
    }
  }
}

const topComparisons = data.ratingComparisons.slice(0, 50);
const averageTopDifference =
  topComparisons.reduce(
    (total, comparison) =>
      total + Math.abs(comparison.own_rating.own_rating - comparison.external_ratings.goratings.rating_value),
    0,
  ) / topComparisons.length;
assert(averageTopDifference > 300, 'Baduk-R top ranking should not mirror GoRatings score scale');

const ownLatest = await readJson(path.join(ratingsDir, 'own_latest.json'));
const externalLatest = await readJson(path.join(ratingsDir, 'external_latest.json'));
const sourceStatus = await readJson(path.join(ratingsDir, 'source_status.json'));
const comparisonLatest = await readJson(path.join(ratingsDir, 'comparison_latest.json'));

assert(ownLatest.own_ratings.length === data.ownRatings.length, 'own_latest.json is out of sync');
assert(externalLatest.external_ratings.length === data.externalRatings.length, 'external_latest.json is out of sync');
assert(sourceStatus.sources.length >= 6, 'source_status.json missing source rows');

// News sources may be temporarily down; the pipeline then carries items over
// from the previous snapshot and documents the outage in source_status.json.
// Fail only when the source is unhealthy AND no items for its region survived.
function assertNewsSourceOrFallback(sourceId, region, label) {
  const row = sourceStatus.sources.find((source) => source.source_id === sourceId);
  assert(row, `source_status.json missing ${label} source row`);
  const documentedOutage = ['available_empty', 'unavailable', 'parse_failed'].includes(row.status);
  assert(
    row.status === 'available' || (documentedOutage && newsRegions.has(region)),
    `${label} source is '${row.status}' and no ${region} news items were carried over`,
  );
}
assertNewsSourceOrFallback('nihon_columns', 'jp', 'Nihon Ki-in column');
assertNewsSourceOrFallback('cwa_editorial_news', 'cn', 'Chinese editorial news');
assert(comparisonLatest.comparisons.length === data.ratingComparisons.length, 'comparison_latest.json is out of sync');

const core = await readJson(coreFile);
assert(core.schemaVersion === data.schemaVersion, 'Core file schema version mismatch');
assert(core.players.length === data.players.length, 'Core file player count mismatch');
assert(
  core.playerDetails && typeof core.playerDetails === 'object' && Object.keys(core.playerDetails).length === 0,
  'Core file must carry empty playerDetails',
);

const detailIds = Object.keys(data.playerDetails);
const playerFiles = new Set((await readdir(playersDir)).filter((file) => file.endsWith('.json')));
assert(playerFiles.size === detailIds.length, 'players/ directory must have one file per playerDetail');
for (const id of detailIds) {
  assert(playerFiles.has(`${id}.json`), `Missing per-player export players/${id}.json`);
}

const ownHistory = await readJson(path.join(ratingsDir, 'own_history.json'));
assert(ownHistory.schema_version === 1, 'own_history.json schema_version must be 1');
assert(typeof ownHistory.updated_at === 'string' && ownHistory.updated_at.length > 0, 'own_history.json missing updated_at');
assert(ownHistory.players && typeof ownHistory.players === 'object', 'own_history.json missing players map');
assert(Object.keys(ownHistory.players).length > 0, 'own_history.json has no player history');
for (const [playerId, points] of Object.entries(ownHistory.players)) {
  assert(Array.isArray(points) && points.length > 0, `own_history.json empty series for ${playerId}`);
  assert(points.length <= 400, `own_history.json series too long for ${playerId}`);
  for (const point of points) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(point.date), `own_history.json bad date for ${playerId}`);
    assert(Number.isFinite(point.rating), `own_history.json bad rating for ${playerId}`);
    assert(Number.isFinite(point.rank), `own_history.json bad rank for ${playerId}`);
  }
}

// Tournament registry export (required).
const tournamentsExport = await readJson(path.join(dataDir, 'tournaments.json'));
assert(tournamentsExport.schema_version === 1, 'tournaments.json schema_version must be 1');
assert(
  typeof tournamentsExport.curation_note === 'string' && tournamentsExport.curation_note.length > 0,
  'tournaments.json missing curation_note',
);
assert(
  Array.isArray(tournamentsExport.tournaments) && tournamentsExport.tournaments.length >= 5,
  'tournaments.json must list at least 5 tournaments',
);
const scheduleEventIds = new Set(data.schedule.map((event) => event.id));
for (const tournament of tournamentsExport.tournaments) {
  for (const lang of ['en', 'ko', 'ja', 'zhHans', 'zhHant']) {
    assert(tournament.names?.[lang], `tournaments.json missing ${lang} name for ${tournament.id}`);
  }
  assert(tournament.web_url, `tournaments.json missing web_url for ${tournament.id}`);
  assert(Array.isArray(tournament.winners), `tournaments.json missing winners array for ${tournament.id}`);
  for (const winner of tournament.winners) {
    assert(
      typeof winner.winner_name === 'string' && winner.winner_name.trim().length > 0,
      `tournaments.json winner row without winner_name in ${tournament.id}`,
    );
    assert(winner.source_url, `tournaments.json winner row without source_url in ${tournament.id}`);
  }
  assert(Array.isArray(tournament.event_ids), `tournaments.json missing event_ids for ${tournament.id}`);
  for (const eventId of tournament.event_ids) {
    assert(
      scheduleEventIds.has(eventId),
      `tournaments.json ${tournament.id} references unknown schedule event ${eventId}`,
    );
  }
}

// Kifu exports are OPTIONAL: collection is network-only and absence is a
// first-class outcome. When present they must be internally consistent.
const kifuDir = path.join(dataDir, 'kifu');
let kifuIndex = null;
try {
  kifuIndex = await readJson(path.join(kifuDir, 'index.json'));
} catch {
  kifuIndex = null;
}
if (kifuIndex) {
  assert(kifuIndex.schema_version === 1, 'kifu/index.json schema_version must be 1');
  assert(typeof kifuIndex.source_note === 'string' && kifuIndex.source_note.length > 0, 'kifu/index.json missing source_note');
  assert(Array.isArray(kifuIndex.games), 'kifu/index.json missing games array');
  for (const game of kifuIndex.games) {
    assert(game.key, 'kifu/index.json game without key');
    assert(game.source_url, `kifu/index.json game ${game.key} missing source_url`);
    assert(game.terms_status, `kifu/index.json game ${game.key} missing terms_status`);
    assert(
      typeof game.file === 'string' && game.file.startsWith('data/kifu/'),
      `kifu/index.json game ${game.key} has a bad file path`,
    );
    const kifu = await readJson(path.join(dataDir, game.file.replace(/^data\//, '')));
    assert(Array.isArray(kifu.moves) && kifu.moves.length >= 30, `kifu game ${game.key} must carry at least 30 moves`);
    assert(kifu.source_url, `kifu game ${game.key} missing source_url`);
    assert(kifu.terms_status, `kifu game ${game.key} missing terms_status`);
    assert(game.move_count === kifu.moves.length, `kifu game ${game.key} move_count out of sync`);
  }
}

const feedXml = await readFile(feedFile, 'utf8');
assert(feedXml.trim().length > 0, 'feed.xml must not be empty');
assert(feedXml.includes('<rss'), 'feed.xml must be an RSS document');
assert(feedXml.includes('<item>'), 'feed.xml must contain items');

console.log(
  `Data OK: ${data.players.length} players, ${Object.keys(data.playerDetails).length} profiles, ${data.schedule.length} schedule events, ${data.externalRatings.length} external ratings, ${tournamentsExport.tournaments.length} tournaments, ${kifuIndex ? kifuIndex.games.length : 'no'} kifu.`,
);
