import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TOURNAMENT_CURATION_NOTE,
  buildTournamentsExport,
  loadTournamentRegistry,
  matchTournamentEventIds,
} from '../../scripts/lib/tournaments.mjs';

const PLAYERS = [
  { id: '1313', name: 'Shin Jinseo', names: { en: 'Shin Jinseo', ko: '신진서', ja: '申眞諝', zh: '申真谞' } },
  { id: '969', name: 'Byun Sangil', names: { en: 'Byun Sangil', ko: '변상일', ja: '卞相壹', zh: '卞相壹' } },
  { id: '5', name: 'Ke Jie', names: { en: 'Ke Jie', ko: '커제', ja: '柯潔', zh: '柯洁' } },
];

test('matchTournamentEventIds links events by alias inclusion across scripts and sorts by date', () => {
  const lgCup = { id: 'lg_cup', aliases: ['LG배', 'LG杯', 'LG Cup', 'LG盃'] };
  const schedule = [
    { id: 'kba-2', date: '2026-06-09', title: '31기 LG배 조선일보 기왕전 24강', tournament: null },
    { id: 'kba-1', date: '2026-06-08', title: 'LG배 세계기왕전 대진추첨식', tournament: null },
    { id: 'cwa-1', date: '2026-06-10', title: '第31届LG杯世界棋王战 本赛', tournament: 'LG杯' },
    { id: 'nihon-1', date: '2026-06-11', title: '棋聖戦Aリーグ', tournament: '棋聖戦' },
    { id: 'kba-3', date: '2026-06-12', title: '여자기성전 결승', tournament: null },
  ];

  assert.deepEqual(matchTournamentEventIds(lgCup, schedule), ['kba-1', 'kba-2', 'cwa-1']);
});

test('matchTournamentEventIds matches CJK aliases in the tournament field as well as the title', () => {
  const ingCup = { id: 'ing_cup', aliases: ['응씨배', '応氏', '应氏', '應氏', 'Ing Cup'] };
  const schedule = [
    { id: 'cwa-9', date: '2026-07-01', title: '第10届应氏杯世界职业围棋锦标赛 决赛', tournament: null },
    { id: 'nihon-9', date: '2026-07-02', title: '本戦トーナメント', tournament: '応氏杯' },
    { id: 'kba-9', date: '2026-07-03', title: '응씨배 결승 1국', tournament: null },
    { id: 'kba-8', date: '2026-07-03', title: '여자국수전', tournament: null },
  ];

  assert.deepEqual(matchTournamentEventIds(ingCup, schedule), ['cwa-9', 'nihon-9', 'kba-9']);
});

test('winner rows resolve player ids via the name index and stay null when unmatched', async () => {
  const registry = await loadTournamentRegistry();
  const exportData = buildTournamentsExport(registry, [], PLAYERS, '2026-06-11T00:00:00.000Z');

  const lgCup = exportData.tournaments.find((tournament) => tournament.id === 'lg_cup');
  const lgWinner = lgCup.winners.find((winner) => winner.edition === 29);
  assert.equal(lgWinner.winner_name, 'Byun Sang-il');
  assert.equal(lgWinner.winner_player_id, '969');
  assert.equal(lgWinner.runner_up_name, 'Ke Jie');
  assert.equal(lgWinner.runner_up_player_id, '5');

  const ingCup = exportData.tournaments.find((tournament) => tournament.id === 'ing_cup');
  assert.equal(ingCup.winners[0].winner_player_id, '1313');
  // Xie Ke is not in this player universe.
  assert.equal(ingCup.winners[0].runner_up_player_id, null);

  // Team winners like "Korea" must never be force-matched to a player.
  const nongshim = exportData.tournaments.find((tournament) => tournament.id === 'nongshim_cup');
  assert.equal(nongshim.winners[0].winner_name, 'Korea');
  assert.equal(nongshim.winners[0].winner_player_id, null);
  assert.equal(nongshim.winners[0].runner_up_name, null);
  assert.equal(nongshim.winners[0].runner_up_player_id, null);
});

test('export carries the curation note and per-winner source_url verbatim (contract)', async () => {
  const registry = await loadTournamentRegistry();
  const exportData = buildTournamentsExport(registry, [], PLAYERS, '2026-06-11T00:00:00.000Z');

  assert.equal(exportData.schema_version, 1);
  assert.equal(exportData.generated_at, '2026-06-11T00:00:00.000Z');
  assert.equal(
    exportData.curation_note,
    'Manually curated registry; winner rows carry their own source_url. Schedule linkage is automatic.',
  );
  assert.equal(exportData.curation_note, TOURNAMENT_CURATION_NOTE);

  assert.ok(exportData.tournaments.length >= 5, 'registry must keep at least 5 tournaments');
  for (const tournament of exportData.tournaments) {
    for (const lang of ['en', 'ko', 'ja', 'zhHans', 'zhHant']) {
      assert.ok(tournament.names[lang], `missing ${lang} name for ${tournament.id}`);
    }
    assert.match(tournament.web_url, /^https?:\/\//);
    for (const winner of tournament.winners) {
      assert.ok(winner.winner_name.trim().length > 0, `empty winner_name in ${tournament.id}`);
      assert.match(
        String(winner.source_url ?? ''),
        /^https?:\/\//,
        `winner row in ${tournament.id} must carry its own source_url`,
      );
    }
  }

  // Sparse seeding is intentional: winners are passed through verbatim.
  const lgCup = exportData.tournaments.find((tournament) => tournament.id === 'lg_cup');
  assert.equal(lgCup.winners.length, 1);
  assert.equal(lgCup.winners[0].year, 2025);
  assert.equal(lgCup.winners[0].source_url, 'https://en.wikipedia.org/wiki/LG_Cup_(Go)');
  const samsung = exportData.tournaments.find((tournament) => tournament.id === 'samsung_cup');
  assert.deepEqual(samsung.winners, []);
});
