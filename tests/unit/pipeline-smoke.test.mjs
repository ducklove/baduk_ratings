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
