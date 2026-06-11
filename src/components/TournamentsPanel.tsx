import { Medal } from 'lucide-react';
import { tournamentHash } from '../hooks/useHashState';
import { localizedText, regionLabel } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { cycleLabel, isUpcomingEvent, latestWinner, winnerDisplayName } from '../lib/tournament';
import type { Player, ScheduleEvent, Tournament } from '../types';
import { RegionBadge } from './RegionBadge';

export function TournamentsPanel({
  t,
  language,
  nameKey,
  tournaments,
  schedule,
  snapshotDate,
  players,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  tournaments: Tournament[];
  schedule: ScheduleEvent[];
  snapshotDate: string;
  players: Player[];
}) {
  const scheduleById = new Map(schedule.map((event) => [event.id, event]));

  return (
    <div className="panel tournaments-panel" id="tournaments">
      <div className="panel-title-row">
        <h2>
          <Medal size={18} />
          {t.majorTournaments}
        </h2>
        <span>{t.snapshot}</span>
      </div>

      <div className="tournament-grid">
        {tournaments.map((tournament) => {
          const name = localizedText(tournament.names, tournament.id, language);
          const upcoming = (tournament.event_ids ?? []).filter((id) => {
            const event = scheduleById.get(id);
            return Boolean(event && isUpcomingEvent(event, snapshotDate));
          }).length;
          const winner = latestWinner(tournament);

          return (
            <a key={tournament.id} className="tournament-card" href={tournamentHash(tournament.id)}>
              <span className="tournament-card-head">
                <RegionBadge
                  region={tournament.host_country}
                  label={regionLabel(tournament.host_country, t)}
                  compact
                />
                <strong>{name}</strong>
              </span>
              <small>
                {cycleLabel(tournament.cycle, t)} · {t.founded} {tournament.founded}
              </small>
              <small>
                {t.upcomingCount}: {upcoming}
              </small>
              {winner ? (
                <small className="tournament-card-winner">
                  {t.latestWinner}:{' '}
                  {winnerDisplayName(
                    { name: winner.winner_name, playerId: winner.winner_player_id },
                    players,
                    nameKey,
                  )}{' '}
                  ({winner.year})
                </small>
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}
