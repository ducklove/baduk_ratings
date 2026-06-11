import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPlayerNameIndex, matchPlayerByName, normalizeDate, normalizeName } from '../../scripts/lib/text.mjs';

test('normalizeName strips rank suffixes, gender markers, and punctuation', () => {
  assert.equal(normalizeName('신진서(남)'), '신진서');
  assert.equal(normalizeName('一力遼九段'), '一力遼');
  assert.equal(normalizeName('Shin Jinseo 9p'), 'shinjinseo');
  assert.equal(normalizeName('Park, Junghwan'), 'parkjunghwan');
  assert.equal(normalizeName('上野愛咲美女流棋聖'), '上野愛咲美');
  assert.equal(normalizeName('△柯洁'), '柯洁');
});

test('normalizeName applies NFKC so full-width forms match', () => {
  assert.equal(normalizeName('Ｓｈｉｎ Ｊｉｎｓｅｏ'), 'shinjinseo');
  assert.equal(normalizeName('柯洁（中国）'), normalizeName('柯洁(中国)'));
});

test('normalizeDate handles east-asian and slash forms', () => {
  assert.equal(normalizeDate('2026年6月3日'), '2026-06-03');
  assert.equal(normalizeDate('2026.6.3'), '2026-06-03');
  assert.equal(normalizeDate('2026-6-3'), '2026-06-03');
  assert.equal(normalizeDate('not a date'), 'not a date');
});

test('buildPlayerNameIndex and matchPlayerByName resolve localized aliases', () => {
  const players = [
    {
      id: '1313',
      name: 'Shin Jinseo',
      names: { en: 'Shin Jinseo', ko: '신진서', ja: '申眞諝', zh: '申真谞' },
    },
    {
      id: '1657',
      name: 'Ke Jie',
      names: { en: 'Ke Jie', ko: '커제', ja: '柯潔', zh: '柯洁' },
    },
  ];
  const index = buildPlayerNameIndex(players);

  assert.equal(matchPlayerByName('신진서(남)', index)?.id, '1313');
  assert.equal(matchPlayerByName('Shin Jinseo', index)?.id, '1313');
  assert.equal(matchPlayerByName('柯洁', index)?.id, '1657');
  assert.equal(matchPlayerByName('柯潔九段', index)?.id, '1657');
  assert.equal(matchPlayerByName('Unknown Player', index), null);
  assert.equal(matchPlayerByName('', index), null);
});
