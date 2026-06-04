import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataFile = path.join(rootDir, 'public', 'data', 'baduk-data.json');
const ratingsDir = path.join(rootDir, 'public', 'data', 'ratings');

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
assert(scheduleRegions.has('jp'), 'Missing Japanese schedule items');
assert(scheduleRegions.has('cn'), 'Missing Chinese schedule items');
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
assert(
  sourceStatus.sources.some((source) => source.source_id === 'nihon_columns' && source.status === 'available'),
  'source_status.json missing available Nihon Ki-in column source',
);
assert(
  sourceStatus.sources.some((source) => source.source_id === 'cwa_editorial_news' && source.status === 'available'),
  'source_status.json missing available Chinese editorial news source',
);
assert(comparisonLatest.comparisons.length === data.ratingComparisons.length, 'comparison_latest.json is out of sync');

console.log(
  `Data OK: ${data.players.length} players, ${Object.keys(data.playerDetails).length} profiles, ${data.schedule.length} schedule events, ${data.externalRatings.length} external ratings.`,
);
