import { ArrowLeft, CalendarDays, ExternalLink, FileText, Medal, Target, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import {
  formatDate,
  importanceLabel,
  localizedText,
  regionLabel,
} from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { getPlayerDisplayName, seriesWinProbability, winProbability } from '../lib/rating';
import {
  cycleLabel,
  isUpcomingEvent,
  linkedEvents,
  looksLikeFinal,
  winnerDisplayName,
} from '../lib/tournament';
import type {
  KifuGameFile,
  KifuIndexEntry,
  Player,
  RatingComparison,
  ScheduleEvent,
  Tournament,
} from '../types';
import { KifuGameList } from './KifuPanel';
import { RegionBadge } from './RegionBadge';
import { SimulatorPanel } from './SimulatorPanel';

const scheduleCategoryLabels: Record<string, string> = {
  world: 'World',
  prd: 'Pro',
  dev: 'Qual',
  etc: 'Etc',
  online: 'Online',
};

function PlayerLink({
  playerId,
  fallbackName,
  players,
  nameKey,
}: {
  playerId: string | null;
  fallbackName: string;
  players: Player[];
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
}) {
  const name = winnerDisplayName({ name: fallbackName, playerId }, players, nameKey);
  if (playerId) {
    return (
      <a className="tp-player-link" href={`#/player/${encodeURIComponent(playerId)}`}>
        {name}
      </a>
    );
  }
  return <span>{name}</span>;
}

function EventRow({
  event,
  t,
  language,
}: {
  event: ScheduleEvent;
  t: Translation;
  language: Language;
}) {
  const region = event.country_or_region ?? event.region;
  const level = event.importance_level ?? 'low';
  const sourceName = event.source_name ?? event.source;
  const sourceUrl = event.source_url ?? event.sourceUrl;
  const title = localizedText(event.localized_title, event.title, language);

  return (
    <article className={`schedule-row importance-${level}`}>
      <span className={`category-dot category-${event.category}`}>
        {scheduleCategoryLabels[event.category] ?? 'Etc'}
      </span>
      <span className="schedule-date">
        {formatDate(event.date, language)}
        <small>{event.timeKst ? `${event.timeKst} KST` : event.weekday}</small>
      </span>
      <RegionBadge region={region} label={regionLabel(region, t)} compact />
      <div className="schedule-main">
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          <strong>{title}</strong>
          <ExternalLink size={14} />
        </a>
        <small>
          {t.sourceProvenance}: {sourceName}
        </small>
      </div>
      <span className={`importance-pill importance-pill-${level}`}>{importanceLabel(level, t)}</span>
    </article>
  );
}

export function TournamentPage({
  t,
  language,
  nameKey,
  tournament,
  curationNote,
  players,
  schedule,
  comparisons,
  optionPlayers,
  snapshotDate,
  kifuEntries,
  getKifuGame,
  requestKifuGame,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  tournament: Tournament;
  curationNote: string;
  players: Player[];
  schedule: ScheduleEvent[];
  comparisons: Map<string, RatingComparison>;
  optionPlayers: Player[];
  snapshotDate: string;
  kifuEntries: KifuIndexEntry[];
  getKifuGame: (key: string | null | undefined) => KifuGameFile | undefined;
  requestKifuGame: (entry: KifuIndexEntry | null | undefined) => void;
}) {
  const name = localizedText(tournament.names, tournament.id, language);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const events = useMemo(() => linkedEvents(tournament, schedule), [schedule, tournament]);
  const upcoming = events.filter((event) => isUpcomingEvent(event, snapshotDate));
  const past = events.filter((event) => !isUpcomingEvent(event, snapshotDate)).reverse();

  const ratingOf = (player: Player) =>
    comparisons.get(player.id)?.own_rating?.own_rating ?? player.rating;

  const participants = useMemo(() => {
    const byRating = (player: Player) =>
      comparisons.get(player.id)?.own_rating?.own_rating ?? player.rating;
    const ids = new Set<string>();
    for (const event of events) {
      for (const id of event.resolved_players ?? []) {
        ids.add(id);
      }
    }
    return [...ids]
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player))
      .sort((left, right) => byRating(right) - byRating(left));
  }, [comparisons, events, playerById]);

  const seedInfo = useMemo(() => {
    if (participants.length < 2) {
      return null;
    }
    const targetSize = participants.length <= 4 ? 4 : 8;
    const seeded = participants.slice(0, targetSize);
    const seededIds = new Set(seeded.map((player) => player.id));
    const padded = new Set<string>();
    for (const player of optionPlayers) {
      if (seeded.length >= targetSize) {
        break;
      }
      if (!seededIds.has(player.id)) {
        seeded.push(player);
        seededIds.add(player.id);
        padded.add(player.id);
      }
    }
    if (seeded.length < targetSize) {
      return null;
    }
    return { seeds: seeded.map((player) => player.id), padded };
  }, [optionPlayers, participants]);

  const simulatorOptions = useMemo(() => {
    const known = new Set(optionPlayers.map((player) => player.id));
    return [...optionPlayers, ...participants.filter((player) => !known.has(player.id))];
  }, [optionPlayers, participants]);

  const predictions = upcoming
    .map((event) => {
      const resolved = (event.resolved_players ?? [])
        .map((id) => playerById.get(id))
        .filter((player): player is Player => Boolean(player));
      if (resolved.length < 2) {
        return null;
      }
      const [playerA, playerB] = resolved;
      const probability = winProbability({ ratingA: ratingOf(playerA), ratingB: ratingOf(playerB) });
      return { event, playerA, playerB, probability, final: looksLikeFinal(event) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const participantIds = new Set(participants.map((player) => player.id));
  const relatedKifu = kifuEntries.filter(
    (entry) =>
      (entry.black.player_id && participantIds.has(entry.black.player_id)) ||
      (entry.white.player_id && participantIds.has(entry.white.player_id)),
  );

  return (
    <div className="tournament-page">
      <a className="back-link" href="#tournaments">
        <ArrowLeft size={15} />
        {t.backToDashboard}
      </a>

      <section className="panel tournament-header-panel">
        <div className="panel-title-row">
          <h2>
            <Medal size={18} />
            {name}
          </h2>
          <RegionBadge
            region={tournament.host_country}
            label={regionLabel(tournament.host_country, t)}
          />
        </div>
        <div className="tournament-facts">
          <div>
            <span>{t.organizer}</span>
            <strong>{tournament.organizer || '—'}</strong>
          </div>
          <div>
            <span>
              {t.founded} / {t.cycle}
            </span>
            <strong>
              {tournament.founded} · {cycleLabel(tournament.cycle, t)}
            </strong>
          </div>
          <div>
            <span>{t.formatLabel}</span>
            <strong>{tournament.format_note || '—'}</strong>
          </div>
        </div>
        <div className="tournament-header-links">
          {tournament.web_url ? (
            <a href={tournament.web_url} target="_blank" rel="noreferrer">
              {t.officialSite}
              <ExternalLink size={13} />
            </a>
          ) : null}
          {curationNote ? (
            <span className="provenance-chip" title={curationNote}>
              {t.curationNoteLabel}: {curationNote}
            </span>
          ) : null}
        </div>
      </section>

      <section className="panel tournament-section">
        <div className="panel-title-row">
          <h2>
            <Trophy size={18} />
            {t.pastWinners}
          </h2>
        </div>
        {(tournament.winners ?? []).length ? (
          <div className="table-wrap">
            <table className="winners-table">
              <thead>
                <tr>
                  <th>{t.edition}</th>
                  <th>{t.year}</th>
                  <th>{t.winner}</th>
                  <th>{t.runnerUp}</th>
                  <th>{t.sourceLink}</th>
                </tr>
              </thead>
              <tbody>
                {[...tournament.winners]
                  .sort((left, right) => (right.year ?? 0) - (left.year ?? 0) || (right.edition ?? 0) - (left.edition ?? 0))
                  .map((winner) => (
                    <tr key={`${winner.edition}-${winner.year}`}>
                      <td>{winner.edition}</td>
                      <td>{winner.year}</td>
                      <td>
                        <PlayerLink
                          playerId={winner.winner_player_id}
                          fallbackName={winner.winner_name}
                          players={players}
                          nameKey={nameKey}
                        />
                      </td>
                      <td>
                        <PlayerLink
                          playerId={winner.runner_up_player_id}
                          fallbackName={winner.runner_up_name}
                          players={players}
                          nameKey={nameKey}
                        />
                      </td>
                      <td>
                        {winner.source_url ? (
                          <a
                            className="tp-source-link"
                            href={winner.source_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t.sourceLink}
                          >
                            <ExternalLink size={13} />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            {t.winnersEmpty}
            {tournament.web_url ? (
              <>
                {' '}
                <a className="tp-inline-link" href={tournament.web_url} target="_blank" rel="noreferrer">
                  {t.officialSite}
                  <ExternalLink size={12} />
                </a>
              </>
            ) : null}
          </div>
        )}
      </section>

      <section className="panel tournament-section">
        <div className="panel-title-row">
          <h2>
            <CalendarDays size={18} />
            {t.scheduleProgress}
          </h2>
          <span>{t.upcoming}</span>
        </div>
        {events.length ? (
          <div className="tournament-events">
            {upcoming.length ? (
              <>
                <h3>{t.upcomingEvents}</h3>
                <div className="schedule-list">
                  {upcoming.map((event) => (
                    <EventRow key={event.id} event={event} t={t} language={language} />
                  ))}
                </div>
              </>
            ) : null}
            {past.length ? (
              <>
                <h3>{t.pastEvents}</h3>
                <div className="schedule-list">
                  {past.slice(0, 10).map((event) => (
                    <EventRow key={event.id} event={event} t={t} language={language} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">{t.noLinkedEvents}</div>
        )}
      </section>

      {predictions.length ? (
        <section className="panel tournament-section">
          <div className="panel-title-row">
            <h2>
              <Target size={18} />
              {t.matchPredictor}
            </h2>
            <span>{t.badukR}</span>
          </div>
          <div className="tp-predictions">
            {predictions.map(({ event, playerA, playerB, probability, final }) => (
              <div key={event.id} className="tp-prediction">
                <small className="tp-prediction-event">
                  {formatDate(event.date, language)} ·{' '}
                  {localizedText(event.localized_title, event.title, language)}
                </small>
                <div className="tp-prediction-row">
                  <span className="tp-prediction-name">
                    {getPlayerDisplayName(playerA, nameKey)}
                    <strong>{(probability * 100).toFixed(1)}%</strong>
                  </span>
                  <span className="probability-track tp-probability-track">
                    <span style={{ width: `${probability * 100}%` }} />
                  </span>
                  <span className="tp-prediction-name tp-prediction-name-b">
                    {getPlayerDisplayName(playerB, nameKey)}
                    <strong>{((1 - probability) * 100).toFixed(1)}%</strong>
                  </span>
                </div>
                {final ? (
                  <small className="tp-prediction-final">
                    {t.finalSeries}: {(seriesWinProbability(probability, 3) * 100).toFixed(1)}% /{' '}
                    {((1 - seriesWinProbability(probability, 3)) * 100).toFixed(1)}%
                  </small>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {seedInfo ? (
        <SimulatorPanel
          t={t}
          language={language}
          nameKey={nameKey}
          optionPlayers={simulatorOptions}
          comparisons={comparisons}
          seeds={seedInfo.seeds}
          paddedIds={seedInfo.padded}
          subtitle={t.simulatorVirtualNote}
        />
      ) : null}

      {relatedKifu.length ? (
        <section className="panel tournament-section">
          <div className="panel-title-row">
            <h2>
              <FileText size={18} />
              {t.relatedKifu}
            </h2>
          </div>
          <KifuGameList
            t={t}
            language={language}
            nameKey={nameKey}
            entries={relatedKifu.slice(0, 12)}
            players={players}
            getGame={getKifuGame}
            requestGame={requestKifuGame}
          />
        </section>
      ) : null}
    </div>
  );
}
