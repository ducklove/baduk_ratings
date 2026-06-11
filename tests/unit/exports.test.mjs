import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRssFeed, escapeXml, mergeOwnHistory } from '../../scripts/lib/exports.mjs';
import { reusePreviousTranslations } from '../../scripts/lib/translate.mjs';

test('escapeXml escapes all five XML special characters', () => {
  assert.equal(
    escapeXml(`<Kim & Lee> said "it's won"`),
    '&lt;Kim &amp; Lee&gt; said &quot;it&apos;s won&quot;',
  );
  assert.equal(escapeXml(null), '');
});

test('buildRssFeed emits a top-10 item and escaped mover items with date-scoped guids', () => {
  const players = [
    { id: 'p1', name: 'A & B', names: { en: 'A & B' } },
    { id: 'p2', name: 'C <Strong>', names: { en: 'C <Strong>' } },
  ];
  const ownRatings = [
    {
      player_id: 'p1',
      own_rank: 1,
      own_rating: 3100,
      own_rating_delta_7d: 24,
      own_rating_delta_30d: 40,
    },
    {
      player_id: 'p2',
      own_rank: 2,
      own_rating: 3050,
      own_rating_delta_7d: 0,
      own_rating_delta_30d: -31,
    },
  ];

  const xml = buildRssFeed({ players, ownRatings, generatedAt: '2026-06-11T09:00:00.000Z' });

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<title>Baduk-R daily ratings update</title>'));
  assert.ok(xml.includes('baduk-r-2026-06-11-top10'));
  assert.ok(xml.includes('baduk-r-2026-06-11-mover-p1'));
  assert.ok(xml.includes('A &amp; B +24 (7d)'));
  assert.ok(xml.includes('C &lt;Strong&gt; -31 (30d)'));
  assert.ok(!xml.includes('C <Strong>'));
  assert.ok(xml.includes('<link>https://ducklove.github.io/baduk_ratings/</link>'));
  assert.ok(xml.includes('<pubDate>Thu, 11 Jun 2026 09:00:00 GMT</pubDate>'));
});

test('mergeOwnHistory appends, replaces same-date points, sorts, and caps length', () => {
  const history = {
    players: {
      p1: [
        { date: '2026-06-01', rating: 3000, rank: 2 },
        { date: '2026-06-10', rating: 3010, rank: 2 },
      ],
    },
  };
  const ownRatings = [
    { player_id: 'p1', own_rank: 1, own_rating: 3050 },
    { player_id: 'p2', own_rank: 2, own_rating: 3020 },
    { player_id: 'p-low', own_rank: 301, own_rating: 2500 },
  ];

  const merged = mergeOwnHistory(history, ownRatings, '2026-06-10');
  assert.deepEqual(merged.p1, [
    { date: '2026-06-01', rating: 3000, rank: 2 },
    { date: '2026-06-10', rating: 3050, rank: 1 },
  ]);
  assert.deepEqual(merged.p2, [{ date: '2026-06-10', rating: 3020, rank: 2 }]);
  assert.ok(!('p-low' in merged));

  const long = {
    players: {
      p1: Array.from({ length: 400 }, (_, i) => ({
        date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
        rating: 2900,
        rank: 5,
      })),
    },
  };
  const capped = mergeOwnHistory(long, [{ player_id: 'p1', own_rank: 1, own_rating: 3000 }], '2026-06-11');
  assert.equal(capped.p1.length, 400);
  assert.equal(capped.p1[399].date, '2026-06-11');
  assert.equal(capped.p1[399].rating, 3000);
});

test('reusePreviousTranslations copies localized text only when source text is unchanged', () => {
  const localized = { en: 'x', ko: 'x', ja: 'x', zhHans: 'x', zhHant: 'x' };
  const previousSnapshot = {
    schedule: [
      { id: 's1', title: 'same title', tournament: 't', localized_title: localized, localized_tournament: localized },
      { id: 's2', title: 'old title', tournament: 't', localized_title: localized },
    ],
    news: [
      { id: 'n1', title: 'news title', summary: 'sum', localized_title: localized, localized_summary: localized },
    ],
  };
  const schedule = [
    { id: 's1', title: 'same title', tournament: 't' },
    { id: 's2', title: 'changed title', tournament: 't' },
    { id: 's3', title: 'brand new', tournament: 't' },
  ];
  const news = [
    { id: 'n1', title: 'news title', summary: 'sum' },
    { id: 'n2', title: 'fresh news', summary: 'sum' },
  ];

  const result = reusePreviousTranslations(schedule, news, previousSnapshot);
  assert.equal(result.reused, 2);
  assert.deepEqual(result.schedule[0].localized_title, localized);
  assert.deepEqual(result.schedule[0].localized_tournament, localized);
  assert.ok(!result.schedule[1].localized_title);
  assert.ok(!result.schedule[2].localized_title);
  assert.deepEqual(result.news[0].localized_title, localized);
  assert.deepEqual(result.news[0].localized_summary, localized);
  assert.ok(!result.news[1].localized_title);
});
