import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyNewsCuration, newsCurationReasons, sortNewsItems } from '../../scripts/lib/news.mjs';
import { enrichScheduleEvents } from '../../scripts/lib/schedule.mjs';

test('newsCurationReasons rewards columns and interviews, penalizes routine notices', () => {
  const column = newsCurationReasons({ title: '囲碁コラム 棋士の物語' });
  assert.ok(column.score > 0);
  assert.ok(column.reasons.includes('column_source'));

  const interview = newsCurationReasons({ title: '专访柯洁', summary: '世界赛分析' });
  assert.ok(interview.score > 0);
  assert.ok(interview.reasons.includes('analysis_or_interview'));
  assert.ok(interview.reasons.includes('notable_players_or_events'));

  const notice = newsCurationReasons({ title: '竞赛规程公示与报名通知' });
  assert.ok(notice.score < 0);
  assert.ok(notice.reasons.includes('routine_notice_penalty'));
});

test('applyNewsCuration adds base score and merges reasons', () => {
  const item = applyNewsCuration(
    { title: '媒体报道：围棋观察', curation_reason: ['seed_reason'] },
    34,
  );
  assert.ok(item.curation_score >= 34 + 30);
  assert.ok(item.curation_reason.includes('seed_reason'));
  assert.ok(item.curation_reason.includes('media_report'));
});

test('sortNewsItems orders by score then date', () => {
  const sorted = sortNewsItems([
    { id: 'old-high', curation_score: 50, date: '2026-06-01' },
    { id: 'new-low', curation_score: 10, date: '2026-06-10' },
    { id: 'new-high', curation_score: 50, date: '2026-06-09' },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['new-high', 'old-high', 'new-low']);
});

function makeEvent(overrides = {}) {
  return {
    id: 'event-1',
    date: '2026-06-20',
    title: '국내 일반 대국',
    source_confidence: 0.92,
    event_type: 'game',
    ...overrides,
  };
}

const players = [
  {
    id: '1313',
    rank: 1,
    name: 'Shin Jinseo',
    names: { en: 'Shin Jinseo', ko: '신진서', ja: '申眞諝', zh: '申真谞' },
  },
  {
    id: '5000',
    rank: 80,
    name: 'Mid Player',
    names: { en: 'Mid Player', ko: '미드플레이어', ja: 'ミッド', zh: '中坚' },
  },
];
const ownRatings = [
  { player_id: '1313', own_rank: 1 },
  { player_id: '5000', own_rank: 80 },
];

test('enrichScheduleEvents scores finals with top players as high importance', () => {
  const [event] = enrichScheduleEvents(
    [makeEvent({ title: 'LG배 세계기왕전 결승', player_names: ['신진서', 'Mid Player'] })],
    players,
    ownRatings,
    [],
  );

  assert.equal(event.importance_level, 'high');
  assert.ok(event.importance_reasons.includes('international_event'));
  assert.ok(event.importance_reasons.includes('title_match_or_final'));
  assert.ok(event.importance_reasons.includes('top10_player'));
  assert.ok(event.importance_reasons.includes('both_top100'));
  assert.deepEqual(event.resolved_players.sort(), ['1313', '5000']);
  assert.deepEqual(event.unresolved_players, []);
  assert.ok(!('player_names' in event));
});

test('enrichScheduleEvents penalizes preliminaries and unresolved players', () => {
  const [event] = enrichScheduleEvents(
    [makeEvent({ title: '명인전 예선', player_names: ['모르는기사'] })],
    players,
    ownRatings,
    [],
  );

  assert.equal(event.importance_level, 'low');
  assert.ok(event.importance_score < 0);
  assert.ok(event.importance_reasons.includes('preliminary'));
  assert.ok(event.importance_reasons.includes('unresolved_players'));
  assert.deepEqual(event.unresolved_players, ['모르는기사']);
});

test('enrichScheduleEvents applies prestige config bonuses', () => {
  const prestige = [
    { id: 'lg-cup', aliases: ['LG배'], prestige_score: 20, title_event: true, international: true },
  ];
  const [event] = enrichScheduleEvents(
    [makeEvent({ title: 'LG배 16강' })],
    players,
    ownRatings,
    prestige,
  );

  assert.ok(event.importance_reasons.includes('tournament_prestige'));
  assert.ok(event.importance_reasons.includes('international_event'));
  assert.ok(event.importance_score >= 75);
  assert.equal(event.importance_level, 'high');
});
