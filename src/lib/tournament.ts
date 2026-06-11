import type { Translation } from './i18n';
import { getPlayerDisplayName } from './rating';
import type { Player, ScheduleEvent, Tournament, TournamentWinner } from '../types';

export function cycleLabel(cycle: string | undefined, t: Translation) {
  if (cycle === 'annual') {
    return t.cycleAnnual;
  }
  if (cycle === 'biennial') {
    return t.cycleBiennial;
  }
  return cycle ?? '';
}

export function latestWinner(tournament: Tournament): TournamentWinner | null {
  const winners = tournament.winners ?? [];
  if (!winners.length) {
    return null;
  }
  return [...winners].sort(
    (left, right) => (right.year ?? 0) - (left.year ?? 0) || (right.edition ?? 0) - (left.edition ?? 0),
  )[0];
}

export function winnerDisplayName(
  winner: { name: string; playerId: string | null },
  players: Player[],
  nameKey: 'en' | 'ko' | 'ja' | 'zh',
) {
  const player = winner.playerId ? players.find((item) => item.id === winner.playerId) : undefined;
  return player ? getPlayerDisplayName(player, nameKey) : winner.name;
}

/** Joins a tournament's event_ids against the loaded schedule, keeping order by date. */
export function linkedEvents(tournament: Tournament, schedule: ScheduleEvent[]): ScheduleEvent[] {
  const wanted = new Set(tournament.event_ids ?? []);
  return schedule
    .filter((event) => wanted.has(event.id))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function isUpcomingEvent(event: ScheduleEvent, snapshotDate: string) {
  return event.date >= snapshotDate || (event.dateEnd ?? '') >= snapshotDate;
}

const FINAL_PATTERNS = ['final', '결승', '決勝', '决赛', '決賽'];
const NON_FINAL_PATTERNS = [
  'semifinal',
  'semi-final',
  'semi final',
  'quarterfinal',
  'quarter-final',
  'quarter final',
  '준결승',
  '準決勝',
  '半决赛',
  '半決賽',
  '준준결승',
  '8강',
  '4강',
];

/** Simple heuristic: the event looks like a title final (not a semi/quarter). */
export function looksLikeFinal(event: ScheduleEvent) {
  const haystack = `${event.title} ${event.round ?? ''}`.toLocaleLowerCase();
  if (NON_FINAL_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return false;
  }
  return FINAL_PATTERNS.some((pattern) => haystack.includes(pattern));
}
