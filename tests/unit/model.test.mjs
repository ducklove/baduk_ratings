import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOwnRatings, collectGameGraph, runBadukRModel } from '../../scripts/lib/model.mjs';

const players = [
  { id: 'a', rank: 1 },
  { id: 'b', rank: 2 },
  { id: 'c', rank: 3 },
];

test('collectGameGraph dedupes the same game seen from both players', () => {
  const playerDetails = {
    a: {
      modelGames: [
        { date: '2026-05-01', color: 'black', result: 'win', opponentId: 'b' },
        { date: '2026-05-10', color: 'white', result: 'loss', opponentId: 'c' },
      ],
    },
    b: {
      modelGames: [
        { date: '2026-05-01', color: 'white', result: 'loss', opponentId: 'a' },
      ],
    },
  };

  const games = collectGameGraph(players, playerDetails);
  assert.equal(games.length, 2);
  assert.deepEqual(games[0], {
    date: '2026-05-01',
    blackId: 'a',
    whiteId: 'b',
    winnerId: 'a',
    loserId: 'b',
  });
});

test('collectGameGraph drops games against unknown players or with bad dates', () => {
  const playerDetails = {
    a: {
      modelGames: [
        { date: '2026-05-01', color: 'black', result: 'win', opponentId: 'zz' },
        { date: 'May 2026', color: 'black', result: 'win', opponentId: 'b' },
      ],
    },
  };

  assert.equal(collectGameGraph(players, playerDetails).length, 0);
});

test('runBadukRModel moves rating from loser to winner and respects the cutoff', () => {
  const games = [
    { date: '2026-05-01', blackId: 'a', whiteId: 'b', winnerId: 'a', loserId: 'b' },
    { date: '2026-06-01', blackId: 'a', whiteId: 'b', winnerId: 'a', loserId: 'b' },
  ];

  const full = runBadukRModel(players, games);
  assert.ok(full.ratings.get('a') > 2500);
  assert.ok(full.ratings.get('b') < 2500);
  assert.equal(
    Math.round(full.ratings.get('a') + full.ratings.get('b')),
    5000,
  );
  assert.equal(full.counts.get('a'), 2);

  const cut = runBadukRModel(players, games, '2026-05-15');
  assert.equal(cut.counts.get('a'), 1);
  assert.equal(cut.lastPlayed.get('a'), '2026-05-01');
  assert.ok(cut.ratings.get('a') < full.ratings.get('a'));
});

test('buildOwnRatings orders ranks by rating and bounds uncertainty', () => {
  const playerDetails = {
    a: {
      modelGames: [
        { date: '2026-05-01', color: 'black', result: 'win', opponentId: 'b' },
        { date: '2026-05-08', color: 'white', result: 'win', opponentId: 'b' },
        { date: '2026-05-15', color: 'black', result: 'win', opponentId: 'c' },
      ],
    },
  };

  const rows = buildOwnRatings(players, playerDetails, '2026-06-01');
  assert.equal(rows.length, players.length);
  assert.deepEqual(rows.map((row) => row.own_rank), [1, 2, 3]);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].own_rating >= rows[i].own_rating);
  }
  assert.equal(rows[0].player_id, 'a');
  for (const row of rows) {
    assert.ok(row.own_rating_uncertainty >= 55);
    assert.ok(row.own_rating_uncertainty <= 360);
    assert.equal(row.rating_date, '2026-06-01');
  }
  const winner = rows.find((row) => row.player_id === 'a');
  assert.equal(winner.games_total, 3);
  assert.equal(winner.active_flag, true);
});
