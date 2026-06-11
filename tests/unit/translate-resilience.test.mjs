import assert from 'node:assert/strict';
import test from 'node:test';

// Env must be set before import; node:test runs each file in its own process.
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.OPENROUTER_TRANSLATION_BATCH_SIZE = '2';
process.env.OPENROUTER_TRANSLATION_BUDGET_MS = '600000';

const { setFetchImplementation } = await import('../../scripts/lib/http.mjs');
const { translatePublicContent } = await import('../../scripts/lib/translate.mjs');

function localizedFor(text) {
  return { en: text, ko: text, ja: text, zhHans: text, zhHant: text };
}

test('a failed batch does not abort the remaining translation batches', async (t) => {
  t.after(() => {
    setFetchImplementation(null);
  });

  let fetchCalls = 0;
  setFetchImplementation(async (url, init) => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      throw new Error('synthetic upstream failure');
    }
    const request = JSON.parse(init.body);
    const payload = JSON.parse(request.messages[1].content);
    const items = payload.items.map((item) => ({
      id: item.id,
      title: localizedFor(`translated ${item.title}`),
      summary: localizedFor('translated summary'),
    }));
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }] }),
    };
  });

  const generatedAt = '2026-06-11T00:00:00.000Z';
  const news = Array.from({ length: 4 }, (_, index) => ({
    id: `n${index}`,
    title: `News title ${index}`,
    summary: 'summary',
    region: 'kr',
    source: 'Test Source',
  }));

  const result = await translatePublicContent([], news, generatedAt, null);

  assert.equal(fetchCalls, 2, 'second batch should still run after the first fails');
  assert.ok(!result.news[0].localized_title, 'failed batch items keep source text');
  assert.deepEqual(result.news[2].localized_title, localizedFor('translated News title 2'));
  assert.equal(result.status.status, 'available');
  assert.match(result.status.notes, /1 batch\(es\) failed/);
});
