import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const validatorPath = path.join(rootDir, 'scripts', 'validate-data.mjs');

// The OpenRouter step must stay offline in this test.
delete process.env.OPENROUTER_API_KEY;

const { setFetchImplementation } = await import('../../scripts/lib/http.mjs');
const { runPipeline, runFromSnapshot } = await import('../../scripts/lib/pipeline.mjs');
const { createMockFetch } = await import('../fixtures/mock-sources.mjs');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('full pipeline against mocked sources passes the data validator', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'baduk-smoke-'));
  t.after(async () => {
    setFetchImplementation(null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  setFetchImplementation(createMockFetch());
  const dataDir = path.join(tmpDir, 'data');
  const data = await runPipeline({ dataDir });

  assert.ok(data.players.length > 500);
  assert.ok(Object.keys(data.playerDetails).length >= 100, 'expected expanded game-graph coverage');
  assert.ok(data.schedule.length >= 80);

  const validator = spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  assert.equal(
    validator.status,
    0,
    `validator failed:\n${validator.stdout}\n${validator.stderr}`,
  );

  // Outputs are minified and the split contract holds.
  const fullRaw = await readFile(path.join(dataDir, 'baduk-data.json'), 'utf8');
  assert.ok(!fullRaw.includes('\n  '), 'full snapshot must be minified');
  const core = await readJson(path.join(dataDir, 'baduk-data-core.json'));
  assert.deepEqual(core.playerDetails, {});
  assert.equal(core.players.length, data.players.length);

  const playerFiles = (await readdir(path.join(dataDir, 'players'))).filter((file) =>
    file.endsWith('.json'),
  );
  assert.equal(playerFiles.length, Object.keys(data.playerDetails).length);
  const sampleId = Object.keys(data.playerDetails)[0];
  const sampleDetail = await readJson(path.join(dataDir, 'players', `${sampleId}.json`));
  assert.equal(sampleDetail.ownRating.player_id, sampleId);
  assert.ok(Array.isArray(sampleDetail.recentGames));

  // Tournament registry export: fixture KBA schedule contains "LG배" events,
  // so alias linkage must produce schedule event ids for lg_cup.
  const tournaments = await readJson(path.join(dataDir, 'tournaments.json'));
  assert.equal(tournaments.schema_version, 1);
  assert.ok(tournaments.curation_note.length > 0);
  assert.ok(tournaments.tournaments.length >= 5);
  const lgCup = tournaments.tournaments.find((tournament) => tournament.id === 'lg_cup');
  assert.ok(lgCup.event_ids.length > 0, 'LG배 fixture events must link to lg_cup');
  const scheduleIds = new Set(data.schedule.map((event) => event.id));
  for (const eventId of lgCup.event_ids) {
    assert.ok(scheduleIds.has(eventId), `lg_cup event id ${eventId} must exist in the schedule`);
  }
  const lgWinner = lgCup.winners.find((winner) => winner.edition === 29);
  assert.equal(lgWinner.winner_name, 'Byun Sang-il');
  assert.ok(lgWinner.source_url);
  assert.ok('winner_player_id' in lgWinner && 'runner_up_player_id' in lgWinner);

  // Kifu collection: mocked go4go viewer pages embed SGF, so the collector
  // must write an index plus per-game files that satisfy the validator.
  const kifuIndex = await readJson(path.join(dataDir, 'kifu', 'index.json'));
  assert.equal(kifuIndex.schema_version, 1);
  assert.ok(kifuIndex.source_note.length > 0);
  assert.ok(kifuIndex.games.length > 0, 'expected extracted kifu from mocked viewer pages');
  assert.ok(kifuIndex.games.length <= 24);
  for (const game of kifuIndex.games) {
    assert.match(game.source_url, /go4go\.net/);
    assert.equal(game.terms_status, 'unknown');
    assert.ok(game.move_count >= 30);
  }
  const firstKifu = await readJson(
    path.join(dataDir, kifuIndex.games[0].file.replace(/^data\//, '')),
  );
  assert.equal(firstKifu.size, 19);
  assert.ok(firstKifu.moves.length >= 30);
  assert.equal(firstKifu.handicap, false);
  assert.ok(firstKifu.black.player_id, 'snapshot game rows should resolve player ids');
  const kifuStatus = data.sourceStatus.sources.find(
    (source) => source.source_id === 'kifu_records',
  );
  assert.equal(kifuStatus.status, 'available');
  assert.equal(kifuStatus.item_count, kifuIndex.games.length);

  const history = await readJson(path.join(dataDir, 'ratings', 'own_history.json'));
  assert.equal(history.schema_version, 1);
  assert.equal(Object.keys(history.players).length, 300);
  const feed = await readFile(path.join(tmpDir, 'feed.xml'), 'utf8');
  assert.ok(feed.includes('<rss version="2.0">'));
  assert.ok(feed.includes('<item>'));

  // Offline re-export reproduces all derived outputs and the validator still passes.
  setFetchImplementation(() => {
    throw new Error('network must not be used in --from-snapshot mode');
  });
  const kifuIndexRawBefore = await readFile(path.join(dataDir, 'kifu', 'index.json'), 'utf8');
  await runFromSnapshot({ dataDir });

  const revalidate = spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  assert.equal(
    revalidate.status,
    0,
    `validator failed after re-export:\n${revalidate.stdout}\n${revalidate.stderr}`,
  );

  // tournaments.json is re-derived offline; kifu collection is skipped and the
  // previously collected kifu exports stay byte-for-byte untouched.
  const reExportedTournaments = await readJson(path.join(dataDir, 'tournaments.json'));
  assert.ok(
    reExportedTournaments.tournaments.find((tournament) => tournament.id === 'lg_cup').event_ids.length > 0,
  );
  const kifuIndexRawAfter = await readFile(path.join(dataDir, 'kifu', 'index.json'), 'utf8');
  assert.equal(kifuIndexRawAfter, kifuIndexRawBefore, 'kifu index must be untouched offline');
});

test('kifu collection degrades to available_empty when go4go is down, without files', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'baduk-kifu-down-'));
  t.after(async () => {
    setFetchImplementation(null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  const mockFetch = createMockFetch();
  setFetchImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('go4go.net')) {
      return new Response('not found', { status: 404 });
    }
    return mockFetch(input, init);
  });

  const dataDir = path.join(tmpDir, 'data');
  const data = await runPipeline({ dataDir });

  const kifuStatus = data.sourceStatus.sources.find(
    (source) => source.source_id === 'kifu_records',
  );
  assert.equal(kifuStatus.status, 'available_empty');
  assert.equal(kifuStatus.item_count, 0);

  // Absence is a first-class outcome: no kifu files, validator still passes.
  await assert.rejects(readFile(path.join(dataDir, 'kifu', 'index.json'), 'utf8'));

  const validator = spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  assert.equal(
    validator.status,
    0,
    `validator failed without kifu:\n${validator.stdout}\n${validator.stderr}`,
  );
});

test('news source outage carries previous columns over and still validates', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'baduk-news-fallback-'));
  t.after(async () => {
    setFetchImplementation(null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  // First run primes the local snapshot with healthy sources.
  setFetchImplementation(createMockFetch());
  const dataDir = path.join(tmpDir, 'data');
  await runPipeline({ dataDir });

  // Second run: the Nihon Ki-in column Atom feed fails.
  const mockFetch = createMockFetch();
  setFetchImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('nihonkiin.or.jp/etc/atom.xml')) {
      return new Response('feed down', { status: 503 });
    }
    return mockFetch(input, init);
  });
  const data = await runPipeline({ dataDir });

  const columnStatus = data.sourceStatus.sources.find(
    (source) => source.source_id === 'nihon_columns',
  );
  assert.notEqual(columnStatus.status, 'available');
  assert.ok(
    data.news.some((item) => item.region === 'jp'),
    'previous-snapshot Japanese columns must be carried over',
  );

  const validator = spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  assert.equal(
    validator.status,
    0,
    `validator failed during news source outage:\n${validator.stdout}\n${validator.stderr}`,
  );
});

test('pipeline falls back to the previous snapshot when GoRatings is down', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'baduk-fallback-'));
  t.after(async () => {
    setFetchImplementation(null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  // First run primes the local snapshot.
  setFetchImplementation(createMockFetch());
  const dataDir = path.join(tmpDir, 'data');
  await runPipeline({ dataDir });

  // Second run: every goratings.org request fails.
  const mockFetch = createMockFetch();
  setFetchImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('goratings.org')) {
      return new Response('upstream down', { status: 503 });
    }
    return mockFetch(input, init);
  });
  const data = await runPipeline({ dataDir });

  assert.ok(data.players.length > 500, 'stale players should be served');
  const ratingListStatus = data.sourceStatus.sources.find(
    (source) => source.source_id === 'goratings_rating_list',
  );
  assert.equal(ratingListStatus.status, 'unavailable');
  assert.equal(ratingListStatus.stale, true);
  assert.match(ratingListStatus.notes, /stale/i);

  const validator = spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  assert.equal(
    validator.status,
    0,
    `validator failed in fallback mode:\n${validator.stdout}\n${validator.stderr}`,
  );
});
