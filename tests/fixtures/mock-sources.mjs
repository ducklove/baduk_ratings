// Synthetic upstream fixtures for the mocked end-to-end pipeline test.
// The markup is intentionally shaped to match the real pages the parsers target.

const COUNTRIES = ['kr', 'cn', 'jp', 'tw'];
const PLAYER_COUNT = 600;

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000 + 9 * 3600000);
  return date.toISOString().slice(0, 10);
}

function isoDaysAhead(days) {
  return isoDaysAgo(-days);
}

function kstToday() {
  return isoDaysAgo(0);
}

export function fixturePlayers() {
  const players = [];
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const country = COUNTRIES[i % COUNTRIES.length];
    players.push({
      rank: i + 1,
      id: String(1000 + i),
      name: `${country[0].toUpperCase()}${country[1]} Player ${i + 1}`,
      country,
      gender: i % 6 === 5 ? 'female' : 'male',
      rating: 3850 - i * 2,
    });
  }
  return players;
}

const PLAYERS = fixturePlayers();
const PLAYER_BY_ID = new Map(PLAYERS.map((player) => [player.id, player]));

export function goratingsListPage() {
  const rows = PLAYERS.map((player) => {
    const color = player.gender === 'female' ? 'FE0097' : '000000';
    return (
      `<tr><td class="r">${player.rank}</td>` +
      `<td><a href="../en/players/${player.id}.html">${player.name}</a></td>` +
      `<td class="c"><span style="color:#${color}">●</span></td>` +
      `<td class="c"><img alt="${player.country} flag" src="flag.png"/></td>` +
      `<td>${player.rating}</td></tr>`
    );
  }).join('\n');

  return `<html><body>
<table><tr><th>Games</th><td>1,234,567</td></tr><tr><th>Players</th><td>3,210</td></tr><tr><th>Most Recent Game</th><td>${isoDaysAgo(1)}</td></tr></table>
<table>${rows}</table>
</body></html>`;
}

// Deterministic shared games between adjacent ranks so both player pages
// describe the same game and the graph dedupe can be exercised.
function gamesForPairIndex(index) {
  const a = PLAYERS[index];
  const b = PLAYERS[index + 1];
  if (!a || !b) {
    return [];
  }
  return [
    { date: isoDaysAgo(2), black: a, white: b, winner: a, sgfId: 100000 + index * 10 + 1 },
    { date: isoDaysAgo(12), black: b, white: a, winner: b, sgfId: 100000 + index * 10 + 2 },
    { date: isoDaysAgo(40), black: a, white: b, winner: a, sgfId: 100000 + index * 10 + 3 },
    { date: isoDaysAgo(80), black: b, white: a, winner: a, sgfId: 100000 + index * 10 + 4 },
  ];
}

const GAME_BY_SGF_ID = new Map();
for (let index = 0; index < PLAYER_COUNT; index += 1) {
  for (const game of gamesForPairIndex(index)) {
    GAME_BY_SGF_ID.set(String(game.sgfId), game);
  }
}

export function goratingsPlayerPage(id) {
  const player = PLAYER_BY_ID.get(id);
  if (!player) {
    return '<html><body>not found</body></html>';
  }

  const index = player.rank - 1;
  const games = [...gamesForPairIndex(index - 1), ...gamesForPairIndex(index)];
  const rows = games
    .map((game) => {
      const opponent = game.black.id === id ? game.white : game.black;
      const self = game.black.id === id ? game.black : game.white;
      const color = game.black.id === id ? 'Black' : 'White';
      const result = game.winner.id === id ? 'Win' : 'Loss';
      return (
        `<tr><td>${game.date}</td><td>${self.rating}</td>` +
        `<td>${color}</td>` +
        `<td>${result}</td>` +
        `<td><a href="${opponent.id}.html">${opponent.name}</a></td>` +
        `<td>${opponent.rating}</td>` +
        `<td class="c"><img alt="${opponent.country} flag" src="flag.png"/></td>` +
        `<td><a href="http://www.go4go.net/go/games/sgfview/${game.sgfId}">View game</a></td>` +
        `</tr>`
      );
    })
    .join('\n');

  return `<html><body>
<h2>Data</h2><table><tr><th>Wins</th><td>40</td></tr><tr><th>Losses</th><td>20</td></tr><tr><th>Total</th><td>60</td></tr><tr><th>Date of Birth</th><td>2000-03-17</td></tr><tr><td><a href="https://example.org/profile/${id}">Profile...</a></td></tr></table>
<h2>Game List</h2><table>${rows}</table>
</body></html>`;
}

export function goratingsHistoryJson() {
  return JSON.stringify([
    {
      values: [
        [isoDaysAgo(300), 3500],
        [isoDaysAgo(180), 3520],
        [isoDaysAgo(90), 3540],
        [isoDaysAgo(30), 3560],
        [isoDaysAgo(5), 3580],
      ],
    },
  ]);
}

export function kbaSchedulePage() {
  const today = kstToday();
  const [year, month] = today.split('-');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const days = [];
  for (let day = 1; day <= 28; day += 1) {
    days.push(
      `<li class="realLine"><span class="dateNum">${day}</span><span class="days">${weekdays[day % 7]}</span>` +
        `<span class="prd">10:00 맥심커피배 입신최강전 본선<br/>13:00 여자기성전 결승 ${day}국</span>` +
        `<span class="world">LG배 세계기왕전 본선</span></li>`,
    );
  }

  return `<html><body>
<span class="year">${year}년</span>
<button type="button" class="on" onclick="pageMove_search3('${year}', '${Number(month)}', '1')">${Number(month)}월</button>
<div class="listType"><ul class="dates">${days.join('\n')}</ul></div>
</body></html>`;
}

export function kbaNewsPage() {
  const items = [];
  for (let i = 0; i < 6; i += 1) {
    items.push(
      `<a href="/news/report_view.asp?news_no=${9100 + i}" class="news"><dl>` +
        `<dt>한국 바둑 인터뷰 ${i + 1}</dt><dd>국내 프로 바둑 소식 요약 ${i + 1}</dd>` +
        `<span class="date">${isoDaysAgo(i + 1)}</span></dl></a>`,
    );
  }
  return `<html><body>${items.join('\n')}</body></html>`;
}

export function kbaRankingPage() {
  const today = kstToday();
  const [year, month] = today.split('-');
  const koreanPlayers = PLAYERS.filter((player) => player.country === 'kr').slice(0, 30);
  const rows = koreanPlayers
    .map(
      (player, index) =>
        `<tr><td>${index + 1}</td><td>${player.name}</td><td>${(10500 - index * 30).toLocaleString('en-US')}</td></tr>`,
    )
    .join('\n');

  return `<html><body>
<span class="year">${year}년</span>
<button type="button" class="on" onclick="pageMove_search3('${year}', '${Number(month)}', '1')">${Number(month)}월</button>
<table><tr><th>순위</th><th>이름</th><th>점수</th></tr>${rows}</table>
</body></html>`;
}

export function nihonSchedulePage() {
  const japanese = PLAYERS.filter((player) => player.country === 'jp');
  const rows = [];
  for (let day = 0; day < 4; day += 1) {
    const date = isoDaysAhead(day + 2);
    const [, month, dayOfMonth] = date.split('-').map(Number);
    rows.push(`<tr><td>${month}月${dayOfMonth}日</td></tr>`);
    for (let game = 0; game < 2; game += 1) {
      const left = japanese[day * 4 + game * 2];
      const right = japanese[day * 4 + game * 2 + 1];
      rows.push(
        `<tr><td>棋聖戦Aリーグ</td><td>${left.name}</td><td>vs</td><td>${right.name}</td></tr>`,
      );
    }
  }

  return `<html><body>
<table><tr><td>結果ヘッダ</td></tr></table>
<table>${rows.join('\n')}</table>
</body></html>`;
}

export function nihonColumnAtomFeed() {
  const entries = [];
  for (let i = 0; i < 4; i += 1) {
    entries.push(`<entry>
<title>囲碁コラム 第${i + 1}回 棋士の物語</title>
<summary>囲碁ライターによる連載コラム ${i + 1}</summary>
<published>${isoDaysAgo(i + 1)}</published>
<updated>${isoDaysAgo(i + 1)}T09:00:00+09:00</updated>
<category term="コラム"/>
<link rel="alternate" href="https://www.nihonkiin.or.jp/etc/column/post${500 + i}.html"/>
</entry>`);
  }
  return `<?xml version="1.0" encoding="utf-8"?><feed>${entries.join('\n')}</feed>`;
}

export function cwaUpdateCycleJson() {
  const today = kstToday();
  return JSON.stringify({ data: Number(`${today.slice(0, 4)}${today.slice(5, 7)}`) });
}

export function cwaRankListJson(gender) {
  if (gender !== '1') {
    return JSON.stringify({ data: { records: [] } });
  }
  const chinese = PLAYERS.filter((player) => player.country === 'cn').slice(0, 30);
  const records = chinese.map((player, index) => ({
    playerName: player.name,
    playerNameEn: player.name,
    playerRating: 2750 - index * 10,
    playerRanking: index + 1,
    updateCycle: Number(kstToday().slice(0, 7).replace('-', '')),
  }));
  return JSON.stringify({ data: { records } });
}

export function cwaCalendarJson(queryValue) {
  const currentMonth = kstToday().slice(0, 7);
  if (queryValue !== currentMonth) {
    return JSON.stringify({ data: [] });
  }
  const data = [];
  for (let i = 0; i < 4; i += 1) {
    data.push({
      gameDate: isoDaysAhead(i + 1),
      gameName: `围甲联赛 第${i + 1}轮`,
      roundName: `第${i + 1}轮`,
    });
  }
  return JSON.stringify({ data });
}

export function cwaTournamentListJson() {
  const start = isoDaysAhead(20).split('-').map(Number);
  const end = isoDaysAhead(24).split('-').map(Number);
  return JSON.stringify({
    data: {
      records: [
        {
          id: 9,
          gradeRating: 1,
          gameFullName: '梦百合杯世界围棋公开赛',
          gameRegulation: `比赛时间：${start[0]}年${start[1]}月${start[2]}日至${end[1]}月${end[2]}日，地点：北京。`,
        },
        {
          id: 10,
          gradeRating: 2,
          gameFullName: '业余围棋赛',
          gameRegulation: `比赛时间：${start[0]}年${start[1]}月${start[2]}日。`,
        },
      ],
    },
  });
}

export function cwaNewsClassifyJson() {
  return JSON.stringify({
    data: [
      { classifyName: '媒体报道', classifyNo: 'm1' },
      { classifyName: '官网资讯', classifyNo: 'o1' },
      { classifyName: '职业新闻', classifyNo: 'p1' },
    ],
  });
}

export function cwaNewsListJson() {
  const records = [
    {
      newsPublishNo: 5001,
      newsTitle: '专访柯洁：世界赛备战观察',
      newsAbstract: '媒体对国家队主力棋手的专访与分析。',
      newsDate: isoDaysAgo(1),
      newsClassify1Name: '媒体报道',
    },
    {
      newsPublishNo: 5002,
      newsTitle: '围棋文化故事：棋手的成长之路',
      newsAbstract: '人物特写与历史回顾。',
      newsDate: isoDaysAgo(2),
      newsClassify1Name: '媒体报道',
    },
    {
      newsPublishNo: 5003,
      newsTitle: '职业棋手访谈：女子围棋的未来',
      newsAbstract: '对话职业棋手，观察女子围棋发展。',
      newsDate: isoDaysAgo(3),
      newsClassify1Name: '职业新闻',
    },
    {
      newsPublishNo: 5004,
      newsTitle: '官网资讯：围甲联赛评论',
      newsAbstract: '联赛阶段性评论与分析。',
      newsDate: isoDaysAgo(4),
      newsClassify1Name: '官网资讯',
    },
  ];
  return JSON.stringify({ data: { records } });
}

export function fixtureSgf(sgfId) {
  const game = GAME_BY_SGF_ID.get(String(sgfId));
  if (!game) {
    return null;
  }
  const letters = 'abcdefghijklmnopqrs';
  const moves = [];
  for (let i = 0; i < 60; i += 1) {
    const color = i % 2 === 0 ? 'B' : 'W';
    const x = letters[(i * 7 + 3) % 19];
    const y = letters[Math.floor(i / 19) * 5 % 19];
    moves.push(`;${color}[${x}${y}]`);
  }
  const result = game.winner.id === game.black.id ? 'B+R' : 'W+R';
  return (
    `(;GM[1]FF[4]SZ[19]PB[${game.black.name}]PW[${game.white.name}]` +
    `RE[${result}]DT[${game.date}]EV[Fixture Cup]KM[6.5]${moves.join('')})`
  );
}

export function go4goViewerPage(sgfId) {
  const sgf = fixtureSgf(sgfId);
  if (!sgf) {
    return '<html><body>game not found</body></html>';
  }
  // SGF is embedded in a JS string with escaped newlines and quotes, like a
  // real viewer page, so the collector must unescape before extraction.
  const escaped = sgf.replaceAll(';B', '\\n;B').replaceAll(';W', '\\n;W');
  return `<html><head><title>Game ${sgfId} (viewer)</title></head><body>
<div id="board"></div>
<script>var moveTree = (function () { return null; })();
var sgfData = "${escaped}";
loadViewer(sgfData);</script>
</body></html>`;
}

export function haifongCalendarPage() {
  return '<html><body><h1>海峰棋院</h1><p>近期活動公告。</p></body></html>';
}

export function createMockFetch() {
  return async function mockFetch(input, init = {}) {
    const url = String(input);
    const respond = (body, contentType = 'text/html') =>
      new Response(body, { status: 200, headers: { 'Content-Type': contentType } });

    if (/^https:\/\/www\.goratings\.org\/(en|ko|ja|zh)\/$/.test(url)) {
      return respond(goratingsListPage());
    }

    const playerMatch = url.match(/^https:\/\/www\.goratings\.org\/en\/players\/(\d+)\.html$/);
    if (playerMatch) {
      return respond(goratingsPlayerPage(playerMatch[1]));
    }

    if (/^https:\/\/www\.goratings\.org\/players-json\/data-\d+\.json$/.test(url)) {
      return respond(goratingsHistoryJson(), 'application/json');
    }

    if (url === 'https://baduk.or.kr/record/schedule_in.asp') {
      return respond(kbaSchedulePage());
    }
    if (url === 'https://baduk.or.kr/news/report_in.asp') {
      return respond(kbaNewsPage());
    }
    if (url === 'https://baduk.or.kr/record/rankingPlayer_in.asp') {
      return respond(kbaRankingPage());
    }

    if (url === 'https://www.nihonkiin.or.jp/match/2week.html') {
      return respond(nihonSchedulePage());
    }
    if (url === 'https://www.nihonkiin.or.jp/etc/atom.xml') {
      return respond(nihonColumnAtomFeed(), 'application/xml');
    }

    if (url === 'https://wqapi.cwql.org.cn/playerInfo/latest/update/cycle') {
      return respond(cwaUpdateCycleJson(), 'application/json');
    }
    if (url.startsWith('https://wqapi.cwql.org.cn/playerInfo/rank/list')) {
      const gender = new URL(url).searchParams.get('playerGender');
      return respond(cwaRankListJson(gender), 'application/json');
    }
    if (url === 'https://wqapi.cwql.org.cn/calendar/game/query') {
      const payload = JSON.parse(init.body ?? '{}');
      return respond(cwaCalendarJson(payload.queryValue), 'application/json');
    }
    if (url === 'https://wqapi.cwql.org.cn/game/name/list/page') {
      return respond(cwaTournamentListJson(), 'application/json');
    }
    if (url === 'https://wqapi.cwql.org.cn/news/classify/channel/list?newsChannel=web') {
      return respond(cwaNewsClassifyJson(), 'application/json');
    }
    if (url === 'https://wqapi.cwql.org.cn/news/publish/list') {
      return respond(cwaNewsListJson(), 'application/json');
    }

    if (url === 'https://www.haifong.org/about/calendar') {
      return respond(haifongCalendarPage());
    }

    const kifuMatch = url.match(/^http:\/\/www\.go4go\.net\/go\/games\/sgfview\/(\d+)$/);
    if (kifuMatch) {
      return respond(go4goViewerPage(kifuMatch[1]));
    }

    if (url === 'https://ducklove.github.io/baduk_ratings/data/ratings/own_history.json') {
      return new Response('not found', { status: 404 });
    }
    if (url === 'https://ducklove.github.io/baduk_ratings/data/baduk-data.json') {
      return new Response('not found', { status: 404 });
    }

    throw new Error(`Unmocked URL in test fetch: ${url}`);
  };
}
