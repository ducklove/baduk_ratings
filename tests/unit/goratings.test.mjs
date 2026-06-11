import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parsePlayerDataTable,
  parseRatingRows,
  parseRecentGames,
  parseStats,
} from '../../scripts/lib/goratings.mjs';
import { fixturePlayers, goratingsListPage, goratingsPlayerPage } from '../fixtures/mock-sources.mjs';

test('parseRatingRows extracts rank, id, name, gender, country, and rating', () => {
  const html = `
<table>
<tr><td class="r">1</td><td><a href="../en/players/1313.html">Shin Jinseo</a></td><td class="c"><span style="color:#000000">●</span></td><td class="c"><img alt="kr flag" src="flag.png"/></td><td>3853</td></tr>
<tr><td class="r">2</td><td><a href="../en/players/2001.html">Choi Jeong</a></td><td class="c"><span style="color:#FE0097">●</span></td><td class="c"><img alt="kr flag" src="flag.png"/></td><td>3500</td></tr>
</table>`;

  const rows = parseRatingRows(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank: 1,
    id: '1313',
    name: 'Shin Jinseo',
    gender: 'male',
    country: 'kr',
    rating: 3853,
  });
  assert.equal(rows[1].gender, 'female');
  assert.equal(rows[1].rating, 3500);
});

test('parseRatingRows parses the full synthetic list fixture', () => {
  const rows = parseRatingRows(goratingsListPage());
  const players = fixturePlayers();
  assert.equal(rows.length, players.length);
  assert.equal(rows[0].rank, 1);
  assert.ok(rows[0].rating > 3600);
  assert.deepEqual(new Set(rows.map((row) => row.country)), new Set(['kr', 'cn', 'jp', 'tw']));
});

test('parseStats reads games, players, and most recent game', () => {
  const html =
    '<table><tr><th>Games</th><td>1,234,567</td></tr><tr><th>Players</th><td>3,210</td></tr><tr><th>Most Recent Game</th><td>2026-06-10</td></tr></table>';
  assert.deepEqual(parseStats(html), {
    games: 1234567,
    players: 3210,
    mostRecentGame: '2026-06-10',
  });
});

test('parsePlayerDataTable reads record cells and links', () => {
  const html =
    '<h2>Data</h2><table><tr><th>Wins</th><td>500</td></tr><tr><th>Losses</th><td>211</td></tr><tr><th>Total</th><td>711</td></tr><tr><th>Date of Birth</th><td>2000-03-17</td></tr><tr><td><a href="https://example.org/p">Profile...</a></td></tr></table>';
  const parsed = parsePlayerDataTable(html);
  assert.equal(parsed.wins, 500);
  assert.equal(parsed.losses, 211);
  assert.equal(parsed.totalGames, 711);
  assert.equal(parsed.birthDate, '2000-03-17');
  assert.deepEqual(parsed.links, [{ url: 'https://example.org/p', label: 'Profile' }]);
});

test('parseRecentGames extracts games sorted by date descending', () => {
  const html = `<h2>Game List</h2><table>
<tr><td>2026-05-01</td><td>3800</td><td>Black</td><td>Win</td><td><a href="1002.html">Rival One</a></td><td>3700</td><td class="c"><img alt="cn flag" src="f.png"/></td><td><a href="https://example.org/k1">View game</a></td></tr>
<tr><td>2026-06-02</td><td>3810</td><td>White</td><td>Loss</td><td><a href="1003.html">Rival Two</a></td><td>3650</td><td class="c"><img alt="jp flag" src="f.png"/></td><td><a href="https://example.org/k2">View game</a></td></tr>
</table>`;

  const games = parseRecentGames(html);
  assert.equal(games.length, 2);
  assert.equal(games[0].date, '2026-06-02');
  assert.deepEqual(games[1], {
    date: '2026-05-01',
    rating: 3800,
    color: 'black',
    result: 'win',
    opponentId: '1002',
    opponentName: 'Rival One',
    opponentRating: 3700,
    opponentCountry: 'cn',
    kifuUrl: 'https://example.org/k1',
  });
});

test('parseRecentGames and parsePlayerDataTable work on the synthetic detail fixture', () => {
  const html = goratingsPlayerPage('1001');
  const games = parseRecentGames(html);
  assert.ok(games.length >= 4);
  assert.ok(games.every((game) => /^\d{4}-\d{2}-\d{2}$/.test(game.date)));
  assert.ok(games.every((game) => ['win', 'loss'].includes(game.result)));
  const data = parsePlayerDataTable(html);
  assert.equal(data.totalGames, 60);
});
