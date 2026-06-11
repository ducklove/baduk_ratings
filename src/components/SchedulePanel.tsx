import { CalendarDays, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatDate,
  formatImportanceReasons,
  importanceLabel,
  localizedText,
  regionLabel,
  type ImportanceLevel,
} from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import type { RegionCode, ScheduleEvent } from '../types';
import { RegionBadge } from './RegionBadge';

const scheduleRegionTabs: Array<{ key: RegionCode | 'all'; labelKey: keyof Translation }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'kr', labelKey: 'korea' },
  { key: 'cn', labelKey: 'china' },
  { key: 'jp', labelKey: 'japan' },
  { key: 'tw', labelKey: 'taiwan' },
  { key: 'int', labelKey: 'international' },
];

const scheduleCategoryLabels: Record<string, string> = {
  world: 'World',
  prd: 'Pro',
  dev: 'Qual',
  etc: 'Etc',
  online: 'Online',
};

export function SchedulePanel({
  t,
  language,
  query,
  snapshotDate,
  schedule,
}: {
  t: Translation;
  language: Language;
  query: string;
  snapshotDate: string;
  schedule: ScheduleEvent[];
}) {
  const [scheduleRegion, setScheduleRegion] = useState<RegionCode | 'all'>('all');
  const [importance, setImportance] = useState<ImportanceLevel | 'all'>('all');
  const [tournament, setTournament] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [resolvedState, setResolvedState] = useState<'all' | 'resolved' | 'unresolved'>('all');

  const tournaments = useMemo(
    () =>
      Array.from(
        new Set(
          schedule
            .map((event) =>
              localizedText(event.localized_tournament, event.tournament || event.title.split(':')[0], language),
            )
            .filter(Boolean),
        ),
      )
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 80),
    [language, schedule],
  );

  const visibleSchedule = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const importanceRank: Record<ImportanceLevel, number> = { high: 0, medium: 1, low: 2 };

    return schedule
      .filter((event) => event.date >= snapshotDate || (event.dateEnd ?? '') >= snapshotDate)
      .filter((event) => scheduleRegion === 'all' || (event.country_or_region ?? event.region) === scheduleRegion)
      .filter((event) => importance === 'all' || event.importance_level === importance)
      .filter((event) => {
        if (tournament === 'all') {
          return true;
        }
        const translatedTournament = localizedText(
          event.localized_tournament,
          event.tournament || event.title.split(':')[0],
          language,
        );
        return translatedTournament.includes(tournament) || (event.tournament || event.title).includes(tournament);
      })
      .filter((event) => !startDate || event.date >= startDate || (event.dateEnd ?? '') >= startDate)
      .filter((event) => !endDate || event.date <= endDate)
      .filter((event) => {
        if (resolvedState === 'all') {
          return true;
        }
        const resolved = (event.resolved_players ?? []).length > 0 && !(event.unresolved_players ?? []).length;
        return resolvedState === 'resolved' ? resolved : !resolved;
      })
      .filter((event) => {
        if (!needle) {
          return true;
        }

        const translatedTitle = localizedText(event.localized_title, event.title, language);
        const translatedTournament = localizedText(event.localized_tournament, event.tournament, language);
        return `${translatedTitle} ${translatedTournament} ${event.title} ${event.tournament ?? ''} ${event.source}`
          .toLocaleLowerCase()
          .includes(needle);
      })
      .sort((left, right) => {
        if (left.date !== right.date) {
          return left.date.localeCompare(right.date);
        }

        const leftImportance = importanceRank[left.importance_level ?? 'low'];
        const rightImportance = importanceRank[right.importance_level ?? 'low'];
        if (leftImportance !== rightImportance) {
          return leftImportance - rightImportance;
        }

        return (right.importance_score ?? 0) - (left.importance_score ?? 0);
      })
      .slice(0, 18);
  }, [endDate, importance, language, query, resolvedState, schedule, scheduleRegion, snapshotDate, startDate, tournament]);

  return (
    <div className="panel schedule-panel" id="schedule">
      <div className="panel-title-row">
        <h2>
          <CalendarDays size={18} />
          {t.schedule}
        </h2>
        <span>{t.upcoming}</span>
      </div>

      <div className="schedule-controls" aria-label={t.schedule}>
        <select value={scheduleRegion} onChange={(event) => setScheduleRegion(event.target.value as RegionCode | 'all')}>
          {scheduleRegionTabs.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {t[tab.labelKey]}
            </option>
          ))}
        </select>
        <select value={importance} onChange={(event) => setImportance(event.target.value as ImportanceLevel | 'all')}>
          <option value="all">{t.importanceAll}</option>
          <option value="high">{t.importanceHigh}</option>
          <option value="medium">{t.importanceMedium}</option>
          <option value="low">{t.importanceLow}</option>
        </select>
        <select value={tournament} onChange={(event) => setTournament(event.target.value)}>
          <option value="all">{t.allTournaments}</option>
          {tournaments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input aria-label={t.startDate} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <input aria-label={t.endDate} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <select value={resolvedState} onChange={(event) => setResolvedState(event.target.value as typeof resolvedState)}>
          <option value="all">{t.allResolved}</option>
          <option value="resolved">{t.resolvedOnly}</option>
          <option value="unresolved">{t.unresolvedOnly}</option>
        </select>
      </div>

      <div className="schedule-list">
        {visibleSchedule.map((event) => {
          const region = event.country_or_region ?? event.region;
          const level = event.importance_level ?? 'low';
          const reasons = formatImportanceReasons(event.importance_reasons, t);
          const sourceName = event.source_name ?? event.source;
          const sourceUrl = event.source_url ?? event.sourceUrl;
          const title = localizedText(event.localized_title, event.title, language);
          const tournamentName = localizedText(event.localized_tournament, event.tournament, language);
          return (
            <article key={event.id} className={`schedule-row importance-${level}`} title={reasons}>
              <span className={`category-dot category-${event.category}`}>{scheduleCategoryLabels[event.category]}</span>
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
                  {tournamentName || sourceName} · {t.sourceProvenance}: {sourceName}
                  {event.source_confidence !== undefined ? ` · ${Math.round(event.source_confidence * 100)}%` : ''}
                </small>
                <small className="importance-reasons">{reasons}</small>
              </div>
              <span className={`importance-pill importance-pill-${level}`}>{importanceLabel(level, t)}</span>
            </article>
          );
        })}
        {!visibleSchedule.length ? <div className="empty-state">{t.noSchedule}</div> : null}
      </div>
    </div>
  );
}
