import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

// Budget must be configured before the module is imported because the limit
// is read at module load time. Each node:test file runs in its own process.
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.OPENROUTER_TRANSLATION_BATCH_SIZE = '2';
process.env.OPENROUTER_TRANSLATION_BUDGET_MS = '50';

const { setFetchImplementation } = await import('../../scripts/lib/http.mjs');
const { translatePublicContent } = await import('../../scripts/lib/translate.mjs');

test('translation stops issuing batches once the time budget is exhausted', async (t) => {
  t.after(() => {
    setFetchImplementation(null);
  });

  let fetchCalls = 0;
  setFetchImplementation(async () => {
    fetchCalls += 1;
    await delay(60);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }] }),
    };
  });

  const generatedAt = '2026-06-11T00:00:00.000Z';
  const news = Array.from({ length: 8 }, (_, index) => ({
    id: `n${index}`,
    title: `News title ${index}`,
    summary: 'summary',
    region: 'kr',
    source: 'Test Source',
  }));

  const result = await translatePublicContent([], news, generatedAt, null);

  assert.equal(fetchCalls, 1, 'only the first batch should run before the budget trips');
  assert.equal(result.news.length, news.length);
  assert.match(result.status.notes, /Time budget exhausted/);
  assert.equal(result.status.status, 'available_empty');
});
