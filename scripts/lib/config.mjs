import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, '..', '..');
export const defaultDataDir = path.join(rootDir, 'public', 'data');
export const prestigeFile = path.join(rootDir, 'data', 'manual', 'tournament_prestige.yml');
export const tournamentsFile = path.join(rootDir, 'data', 'manual', 'tournaments.json');

export const TARGET_COUNTRIES = ['kr', 'cn', 'jp', 'tw'];
export const MODEL_VERSION = 'baduk-r-0.4.0-game-graph';
export const SITE_URL = 'https://ducklove.github.io/baduk_ratings/';
export const DEPLOYED_DATA_URL = `${SITE_URL}data/baduk-data.json`;
export const DEPLOYED_HISTORY_URL = `${SITE_URL}data/ratings/own_history.json`;
export const USER_AGENT =
  'baduk_ratings/1.0 (+https://ducklove.github.io/baduk_ratings/; static data snapshot)';

export const sourceUrls = {
  goratings: 'https://www.goratings.org/en/',
  kbaSchedule: 'https://baduk.or.kr/record/schedule_in.asp',
  kbaSchedulePublic: 'https://baduk.or.kr/record/schedule.asp',
  kbaNews: 'https://baduk.or.kr/news/report_in.asp',
  kbaNewsPublic: 'https://baduk.or.kr/news/report.asp',
  kbaRanking: 'https://baduk.or.kr/record/rankingPlayer_in.asp',
  kbaRankingPublic: 'https://baduk.or.kr/record/rankingPlayer.asp',
  nihonSchedule: 'https://www.nihonkiin.or.jp/match/2week.html',
  nihonColumns: 'https://www.nihonkiin.or.jp/etc/',
  nihonColumnAtom: 'https://www.nihonkiin.or.jp/etc/atom.xml',
  cwaPlayer: 'https://www.weiqi.org.cn/player',
  cwaNews: 'https://www.weiqi.org.cn/news',
  cwaApi: 'https://wqapi.cwql.org.cn/',
  cwaCalendar: 'https://wqapi.cwql.org.cn/calendar/game/query',
  cwaTournamentList: 'https://wqapi.cwql.org.cn/game/name/list/page',
  cwaNewsClassify: 'https://wqapi.cwql.org.cn/news/classify/channel/list?newsChannel=web',
  cwaNewsList: 'https://wqapi.cwql.org.cn/news/publish/list',
  haifong: 'https://www.haifong.org/',
  haifongCalendar: 'https://www.haifong.org/about/calendar',
  openRouter: 'https://openrouter.ai/',
  go4go: 'http://www.go4go.net/',
};

export function readPositiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function readNonNegativeIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
