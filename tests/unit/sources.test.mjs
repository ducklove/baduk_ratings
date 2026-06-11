import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseKbaRankingRows, parseKbaSchedule } from '../../scripts/lib/kba.mjs';
import { inferYearForMonthDay, parseNihonColumnFeed, parseNihonSchedule } from '../../scripts/lib/nihon.mjs';
import { parseChineseDateRanges } from '../../scripts/lib/schedule.mjs';

const KBA_SCHEDULE_HTML = `<html><body>
<span class="year">2026년</span>
<button type="button" class="on" onclick="pageMove_search3('2026', '6', '1')">6월</button>
<div class="listType"><ul class="dates">
<li class="realLine"><span class="dateNum">3</span><span class="days">수</span><span class="prd">10:00 명인전 본선<br/>여자기성전 결승</span><span class="world">LG배 세계기왕전</span></li>
<li class="realLine off"><span class="dateNum">4</span><span class="days">목</span><span class="etc">바둑리그 시상식</span></li>
</ul></div>
</body></html>`;

test('parseKbaSchedule reads day blocks, categories, and times', () => {
  const events = parseKbaSchedule(KBA_SCHEDULE_HTML, '2026-06-01T00:00:00.000Z');
  assert.equal(events.length, 4);
  assert.equal(events[0].date, '2026-06-03');
  assert.equal(events[0].timeKst, '10:00');
  assert.equal(events[0].title, '명인전 본선');
  assert.equal(events[0].category, 'prd');
  assert.equal(events[1].timeKst, null);
  assert.equal(events[2].category, 'world');
  assert.equal(events[3].date, '2026-06-04');
  assert.equal(events[3].category, 'etc');
  assert.ok(events.every((event) => event.region === 'kr' && event.source_confidence > 0));
});

test('parseKbaRankingRows extracts rank, name, and comma rating with the page month', () => {
  const html = `<html><body>
<span class="year">2026년</span>
<button type="button" class="on" onclick="pageMove_search3('2026', '5', '1')">5월</button>
<table>
<tr><th>순위</th><th>이름</th><th>점수</th></tr>
<tr><td>1</td><td>신진서(남)</td><td>10,734</td></tr>
<tr><td>2</td><td>박정환</td><td>10,201</td></tr>
</table>
</body></html>`;

  const rows = parseKbaRankingRows(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank_value: 1,
    source_player_name: '신진서',
    rating_value: 10734,
    rating_date: '2026-05',
  });
});

test('inferYearForMonthDay handles December/January boundaries', () => {
  assert.equal(inferYearForMonthDay(1, 5, '2025-12-20'), 2026);
  assert.equal(inferYearForMonthDay(12, 28, '2026-01-05'), 2025);
  assert.equal(inferYearForMonthDay(6, 20, '2026-06-11'), 2026);
});

test('parseNihonSchedule parses dated rows from the second table', () => {
  const html = `<html><body>
<table><tr><td>結果</td></tr></table>
<table>
<tr><td>12月30日</td></tr>
<tr><td>棋聖戦Aリーグ</td><td>一力遼九段</td><td>vs</td><td>井山裕太王座</td></tr>
<tr><td>1月4日</td></tr>
<tr><td>女流名人戦予選</td><td>上野愛咲美女流棋聖</td><td>vs</td><td>藤沢里菜女流本因坊</td></tr>
</table>
</body></html>`;

  const events = parseNihonSchedule(html, '2025-12-28', '2025-12-28T00:00:00.000Z');
  assert.equal(events.length, 2);
  assert.equal(events[0].date, '2025-12-30');
  assert.equal(events[1].date, '2026-01-04');
  assert.equal(events[0].tournament, '棋聖戦Aリーグ');
  assert.deepEqual(events[0].player_names, ['一力遼', '井山裕太']);
  assert.equal(events[0].category, 'prd');
  assert.equal(events[1].category, 'dev');
});

test('parseNihonColumnFeed parses atom entries and ranks columns high', () => {
  const xml = `<?xml version="1.0"?><feed>
<entry>
<title>囲碁コラム 棋士の物語</title>
<summary>囲碁ライターによる連載</summary>
<published>2026-06-08</published>
<updated>2026-06-08T09:00:00+09:00</updated>
<category term="コラム"/>
<link rel="alternate" href="https://www.nihonkiin.or.jp/etc/column/post501.html"/>
</entry>
<entry>
<title>無題</title>
<summary>リンク無し</summary>
<published>2026-06-07</published>
<updated>2026-06-07T09:00:00+09:00</updated>
</entry>
</feed>`;

  const items = parseNihonColumnFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'nihon-column-post501');
  assert.equal(items[0].date, '2026-06-08');
  assert.equal(items[0].content_type, 'column');
  assert.ok(items[0].curation_score >= 45);
  assert.ok(items[0].curation_reason.includes('nihon_official_column_feed'));
});

test('parseChineseDateRanges supports range, listed-day, and single forms', () => {
  const ranges = parseChineseDateRanges('比赛于2026年7月10日至15日举行');
  assert.deepEqual(ranges[0], { start: '2026-07-10', end: '2026-07-15', label: '2026年7月10日至15日' });

  const crossMonth = parseChineseDateRanges('2026年7月28日至8月2日');
  assert.deepEqual(crossMonth[0], { start: '2026-07-28', end: '2026-08-02', label: '2026年7月28日至8月2日' });

  const listed = parseChineseDateRanges('预选赛2026年6月3、4、5日进行');
  assert.deepEqual(
    listed.map((range) => range.start),
    ['2026-06-03', '2026-06-04', '2026-06-05'],
  );
  assert.ok(listed.every((range) => range.start === range.end));

  const single = parseChineseDateRanges('决赛定于2026年9月1日');
  assert.deepEqual(single[0], { start: '2026-09-01', end: '2026-09-01', label: '2026年9月1日' });
});
