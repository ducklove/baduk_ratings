import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractSgf,
  kifuKeyFromUrl,
  kifuSourceName,
  parseKifuFromBody,
  parseSgf,
  selectKifuCandidates,
} from '../../scripts/lib/kifu.mjs';

const LETTERS = 'abcdefghijklmnopqrs';

function movesSgf(count) {
  const moves = [];
  for (let i = 0; i < count; i += 1) {
    const color = i % 2 === 0 ? 'B' : 'W';
    moves.push(`;${color}[${LETTERS[(i * 5 + 3) % 19]}${LETTERS[Math.floor(i / 19) % 19]}]`);
  }
  return moves.join('');
}

test('parseSgf reads metadata and 0-indexed moves from a realistic game record', () => {
  const sgf =
    '(;GM[1]FF[4]SZ[19]PB[Shin Jinseo]PW[Ke Jie]RE[B+R]DT[2026-05-21]' +
    `EV[Fixture Cup Final]KM[6.5];B[pd];W[dp]${movesSgf(38).replace(/^;B\[[a-s]{2}\];W\[[a-s]{2}\]/, '')})`;
  const parsed = parseSgf(sgf);

  assert.equal(parsed.size, 19);
  assert.equal(parsed.black, 'Shin Jinseo');
  assert.equal(parsed.white, 'Ke Jie');
  assert.equal(parsed.result, 'B+R');
  assert.equal(parsed.date, '2026-05-21');
  assert.equal(parsed.event, 'Fixture Cup Final');
  assert.equal(parsed.komi, 6.5);
  assert.equal(parsed.handicap, false);
  assert.deepEqual(parsed.setup, []);
  assert.deepEqual(parsed.moves[0], { c: 'b', x: 15, y: 3 });
  assert.deepEqual(parsed.moves[1], { c: 'w', x: 3, y: 15 });
  assert.ok(parsed.moves.length >= 30);
  for (const move of parsed.moves) {
    assert.ok(move.pass === true || (move.x >= 0 && move.x <= 18 && move.y >= 0 && move.y <= 18));
  }
});

test('parseSgf records pass moves (empty value and tt on 19x19)', () => {
  const sgf = `(;GM[1]SZ[19]${movesSgf(32)};B[];W[tt])`;
  const parsed = parseSgf(sgf);

  assert.deepEqual(parsed.moves.at(-2), { pass: true });
  assert.deepEqual(parsed.moves.at(-1), { pass: true });
});

test('parseSgf marks handicap games and stores setup stones', () => {
  const sgf = `(;GM[1]SZ[19]HA[2]AB[pd][dp]${movesSgf(34)})`;
  const parsed = parseSgf(sgf);

  assert.equal(parsed.handicap, true);
  assert.deepEqual(parsed.setup, [
    { c: 'b', x: 15, y: 3 },
    { c: 'b', x: 3, y: 15 },
  ]);
});

test('parseSgf follows the main line only when variations exist', () => {
  const sgf = `(;GM[1]SZ[19]${movesSgf(30)}(;B[aa];W[ab];B[ac])(;B[sa];W[sb]))`;
  const parsed = parseSgf(sgf);

  assert.equal(parsed.moves.length, 33);
  assert.deepEqual(parsed.moves.at(-1), { c: 'b', x: 0, y: 2 });
});

test('truncated and garbage inputs are rejected, never fabricated', () => {
  assert.throws(() => parseSgf('(;GM[1]SZ[19];B[pd];W[dp'));
  assert.throws(() => parseSgf('(;GM[1]SZ[19];B[pd];W[dp]'));
  assert.throws(() => parseSgf('not an sgf at all'));
  assert.throws(() => parseSgf('(;GM[2]SZ[19];B[pd])'));
  assert.equal(parseKifuFromBody('<html><body>HTTP 403 blocked</body></html>'), null);
  assert.equal(parseKifuFromBody(''), null);
  // Parseable but too short (<30 moves) counts as failed.
  assert.equal(parseKifuFromBody(`(;GM[1]SZ[19]${movesSgf(10)})`), null);
});

test('extractSgf finds the longest balanced SGF block embedded in HTML/JS', () => {
  const sgf = `(;GM[1]FF[4]SZ[19]PB[Black Pro]PW[White Pro]RE[W+0.5]C[paren (inside) comment]${movesSgf(40)})`;
  const escaped = sgf.replaceAll(';B', '\\n;B').replaceAll(';W', '\\n;W');
  const html = `<html><body><script>var tiny = "(;GM[1]SZ[9])"; var sgf = "${escaped}"; load(sgf);</script></body></html>`;

  const extracted = extractSgf(html);
  assert.ok(extracted.includes('PB[Black Pro]'));

  const parsed = parseKifuFromBody(html);
  assert.ok(parsed, 'embedded SGF must parse');
  assert.equal(parsed.black, 'Black Pro');
  assert.equal(parsed.moves.length, 40);
});

test('extractSgf accepts a raw SGF response body', () => {
  const sgf = `  (;GM[1]SZ[19]${movesSgf(36)})\n`;
  assert.ok(extractSgf(sgf).startsWith('(;GM[1]'));
  assert.equal(parseKifuFromBody(sgf).moves.length, 36);
});

test('kifuKeyFromUrl derives stable keys and kifuSourceName labels go4go', () => {
  assert.equal(kifuKeyFromUrl('http://www.go4go.net/go/games/sgfview/127070'), 'g127070');
  assert.equal(kifuKeyFromUrl('http://www.go4go.net/go/games/sgfview/127070?lang=en'), 'g127070');
  assert.equal(kifuKeyFromUrl(''), null);
  assert.equal(kifuSourceName('http://www.go4go.net/go/games/sgfview/127070'), 'Go4Go');
});

test('selectKifuCandidates walks top players, dedupes by kifuUrl, newest first, capped', () => {
  const ownRatings = [
    { player_id: 'p1', own_rating: 3200 },
    { player_id: 'p2', own_rating: 3100 },
    { player_id: 'p3', own_rating: 3000 },
  ];
  const playerDetails = {
    p1: {
      recentGames: [
        { date: '2026-06-01', kifuUrl: 'http://www.go4go.net/go/games/sgfview/3', opponentId: 'p2', color: 'black', opponentName: 'P Two' },
        { date: '2026-05-01', kifuUrl: 'http://www.go4go.net/go/games/sgfview/1', opponentId: 'p3', color: 'white', opponentName: 'P Three' },
      ],
    },
    p2: {
      recentGames: [
        // Same game listed from the opponent side: must dedupe by kifuUrl.
        { date: '2026-06-01', kifuUrl: 'http://www.go4go.net/go/games/sgfview/3', opponentId: 'p1', color: 'white', opponentName: 'P One' },
        { date: '2026-05-20', kifuUrl: 'http://www.go4go.net/go/games/sgfview/2', opponentId: 'p3', color: 'black', opponentName: 'P Three' },
        { date: '2026-04-01', kifuUrl: null, opponentId: 'p3', color: 'black', opponentName: 'P Three' },
      ],
    },
    p3: { recentGames: [{ date: '2026-03-01', kifuUrl: 'http://www.go4go.net/go/games/sgfview/0', opponentId: 'p1', color: 'black', opponentName: 'P One' }] },
  };

  const candidates = selectKifuCandidates(ownRatings, playerDetails, { topPlayers: 2, maxGames: 2 });
  assert.deepEqual(
    candidates.map((candidate) => candidate.kifuUrl),
    ['http://www.go4go.net/go/games/sgfview/3', 'http://www.go4go.net/go/games/sgfview/2'],
  );
  // Dedupe kept the first (owner p1) row for the shared game.
  assert.equal(candidates[0].ownerId, 'p1');
  assert.equal(candidates[0].color, 'black');
});
