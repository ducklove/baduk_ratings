import {
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  ExternalLink,
  Filter,
  Globe2,
  Newspaper,
  Search,
  Star,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { RegionBadge } from './components/RegionBadge';
import { copy, languages, type Language } from './lib/i18n';
import {
  compactNumber,
  filterPlayers,
  formatSigned,
  getHistoryPath,
  getPlayerDisplayName,
  resultScore,
  seriesWinProbability,
  winProbability,
  type RankingMode,
} from './lib/rating';
import type {
  CountryCode,
  ExternalRating,
  HistoryPoint,
  NewsItem,
  Player,
  RatingComparison,
  RatingComparisonValue,
  RatingData,
  RatingMetric,
  RatingSourceId,
  RegionCode,
  ScheduleEvent,
  SourceHubItem,
  SourceStatusItem,
} from './types';

type Translation = typeof copy.en;
type ImportanceLevel = 'high' | 'medium' | 'low';

const localeForLanguage: Record<Language, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zhHans: 'zh-CN',
  zhHant: 'zh-TW',
};

const countryTabs: Array<{ key: CountryCode | 'all'; labelKey: keyof Translation }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'kr', labelKey: 'korea' },
  { key: 'cn', labelKey: 'china' },
  { key: 'jp', labelKey: 'japan' },
  { key: 'tw', labelKey: 'taiwan' },
];

const scheduleRegionTabs: Array<{ key: RegionCode | 'all'; labelKey: keyof Translation }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'kr', labelKey: 'korea' },
  { key: 'cn', labelKey: 'china' },
  { key: 'jp', labelKey: 'japan' },
  { key: 'tw', labelKey: 'taiwan' },
  { key: 'int', labelKey: 'international' },
];

const modeTabs: Array<{ key: RankingMode; labelKey: keyof Translation }> = [
  { key: 'overall', labelKey: 'overall' },
  { key: 'women', labelKey: 'women' },
  { key: 'rising', labelKey: 'rising' },
];

const ratingMetricTabs: Array<{ key: RatingMetric; labelKey: keyof Translation }> = [
  { key: 'own', labelKey: 'ownRating' },
  { key: 'goratings', labelKey: 'goRatingsScore' },
  { key: 'chinese_qiyuan', labelKey: 'chineseQiyuanScore' },
  { key: 'korean_baduk', labelKey: 'koreanBadukScore' },
];

const externalRatingSources: RatingSourceId[] = ['goratings', 'chinese_qiyuan', 'korean_baduk'];

const scheduleCategoryLabels: Record<string, string> = {
  world: 'World',
  prd: 'Pro',
  dev: 'Qual',
  etc: 'Etc',
  online: 'Online',
};

const reasonLabelKeys: Record<string, keyof Translation> = {
  international_event: 'reasonInternational',
  title_match_or_final: 'reasonTitle',
  semifinal_or_deciding_round: 'reasonSemifinal',
  main_tournament: 'reasonMain',
  preliminary: 'reasonPreliminary',
  top10_player: 'reasonTop10',
  top30_player: 'reasonTop30',
  both_top100: 'reasonBothTop100',
  tournament_prestige: 'reasonPrestige',
  low_source_confidence: 'reasonLowConfidence',
  unresolved_players: 'reasonUnresolvedPlayers',
};

function formatDate(value: string, language: Language) {
  const date = new Date(`${value}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeForLanguage[language], {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatFullDate(value: string, language: Language) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeForLanguage[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function ageFromBirthDate(birthDate: string | null, generatedAt: string) {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(`${birthDate}T00:00:00+09:00`);
  const now = new Date(generatedAt);

  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  let age = now.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (now < birthdayThisYear) {
    age -= 1;
  }
  return age;
}

function formatBirthBadge(birthDate: string | null | undefined, generatedAt: string, language: Language) {
  if (!birthDate) {
    return null;
  }

  const year = birthDate.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    return null;
  }

  const age = ageFromBirthDate(birthDate, generatedAt);

  if (language === 'ko') {
    return age === null ? `${year}년생` : `${year}년생 · ${age}세`;
  }
  if (language === 'ja') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}歳`;
  }
  if (language === 'zhHans') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}岁`;
  }
  if (language === 'zhHant') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}歲`;
  }

  return age === null ? `Born ${year}` : `Born ${year} · ${age}`;
}

function regionLabel(region: RegionCode | 'global' | string | null | undefined, t: Translation) {
  switch (region) {
    case 'kr':
      return t.korea;
    case 'cn':
      return t.china;
    case 'jp':
      return t.japan;
    case 'tw':
      return t.taiwan;
    case 'int':
    case 'global':
      return t.international;
    default:
      return t.unknownRegion;
  }
}

function regionShortCode(region: RegionCode | string | null | undefined) {
  switch (region) {
    case 'kr':
      return 'KR';
    case 'cn':
      return 'CN';
    case 'jp':
      return 'JP';
    case 'tw':
      return 'TW';
    case 'int':
      return 'INT';
    default:
      return 'UNKNOWN';
  }
}

function sourceStatusLabel(status: RatingComparisonValue['status'] | SourceStatusItem['status'], t: Translation) {
  if (status === 'available') {
    return t.available;
  }

  if (status === 'terms_unknown') {
    return t.termsUnknown;
  }

  if (status === 'unavailable' || status === 'blocked' || status === 'parse_failed') {
    return t.unavailable;
  }

  return t.missing;
}

function termsStatusLabel(status: RatingComparisonValue['terms_status'], t: Translation) {
  if (status === 'allowed') {
    return t.allowed;
  }
  if (status === 'restricted') {
    return t.restricted;
  }
  if (status === 'unavailable') {
    return t.unavailable;
  }
  return t.termsUnknown;
}

function importanceLabel(level: ImportanceLevel | undefined, t: Translation) {
  if (level === 'high') {
    return t.importanceHigh;
  }
  if (level === 'medium') {
    return t.importanceMedium;
  }
  return t.importanceLow;
}

function formatImportanceReasons(reasons: string[] | undefined, t: Translation) {
  const labels = (reasons ?? [])
    .map((reason) => reasonLabelKeys[reason])
    .filter((key): key is keyof Translation => Boolean(key))
    .map((key) => t[key]);

  return labels.length ? labels.join(' + ') : t.reasonLowConfidence;
}

function formatRating(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return Math.round(value).toLocaleString();
}

function MiniTrend({
  points,
  width = 112,
  height = 32,
  strong = false,
}: {
  points: HistoryPoint[];
  width?: number;
  height?: number;
  strong?: boolean;
}) {
  const path = getHistoryPath(points, width, height);
  const className = strong ? 'trend-box trend-box-strong' : 'trend-box';

  if (!path) {
    return <span className={`${className} muted`}>—</span>;
  }

  return (
    <span className={className}>
      <svg className={strong ? 'trend trend-strong' : 'trend'} viewBox={`0 0 ${width} ${height}`}>
        <path d={path} />
      </svg>
    </span>
  );
}

function FormDots({ form }: { form: Player['form'] }) {
  if (!form.length) {
    return <span className="muted">—</span>;
  }

  return (
    <span className="form-dots" aria-label={`${form.filter((item) => item === 'W').length} wins`}>
      {form.slice(0, 10).map((result, index) => (
        <span key={`${result}-${index}`} className={result === 'W' ? 'form-win' : 'form-loss'}>
          {result}
        </span>
      ))}
    </span>
  );
}

function getPlayerOptionLabel(player: Player, language: Language) {
  const nameKey = languages.find((item) => item.key === language)?.nameKey ?? 'en';
  return `#${player.rank} ${getPlayerDisplayName(player, nameKey)} (${regionShortCode(player.country)}) - ${
    player.rating
  }`;
}

function getExternalComparison(comparison: RatingComparison | undefined, source: RatingSourceId) {
  return comparison?.external_ratings[source];
}

function getMetricValue(player: Player, comparison: RatingComparison | undefined, metric: RatingMetric) {
  if (metric === 'own') {
    return comparison?.own_rating?.own_rating ?? player.rating;
  }

  return getExternalComparison(comparison, metric)?.rating_value ?? null;
}

function comparePlayersByMetric(
  left: Player,
  right: Player,
  comparisons: Map<string, RatingComparison>,
  metric: RatingMetric,
) {
  const leftValue = getMetricValue(left, comparisons.get(left.id), metric);
  const rightValue = getMetricValue(right, comparisons.get(right.id), metric);
  const leftMissing = leftValue === null || leftValue === undefined;
  const rightMissing = rightValue === null || rightValue === undefined;

  if (leftMissing !== rightMissing) {
    return leftMissing ? 1 : -1;
  }

  if (!leftMissing && !rightMissing && leftValue !== rightValue) {
    return rightValue - leftValue;
  }

  return left.rank - right.rank;
}

function RatingValueCell({
  label,
  value,
  meta,
  t,
  primary = false,
}: {
  label: string;
  value: number | null | undefined;
  meta: string;
  t: Translation;
  primary?: boolean;
}) {
  return (
    <span className={primary ? 'rating-stack rating-stack-primary' : 'rating-stack'} title={`${label}: ${meta}`}>
      <strong>{value === null || value === undefined ? t.missing : formatRating(value)}</strong>
      <small>{meta}</small>
    </span>
  );
}

function ExternalRatingCell({
  value,
  t,
}: {
  value: RatingComparisonValue | undefined;
  t: Translation;
}) {
  if (!value || value.rating_value === null) {
    return <RatingValueCell label={t.ratingSources} value={null} meta={t.missing} t={t} />;
  }

  const status = value.terms_status === 'unknown' ? t.termsUnknown : sourceStatusLabel(value.status, t);
  const rankText = value.rank_value ? `#${value.rank_value}` : status;
  return (
    <RatingValueCell
      label={value.source_name}
      value={value.rating_value}
      meta={`${rankText} · ${value.rating_date ?? value.fetched_at?.slice(0, 10) ?? status}`}
      t={t}
    />
  );
}

function FeedPanels({
  t,
  language,
  query,
  snapshotDate,
  schedule,
  news,
  sources,
  sourceStatuses,
}: {
  t: Translation;
  language: Language;
  query: string;
  snapshotDate: string;
  schedule: ScheduleEvent[];
  news: NewsItem[];
  sources: SourceHubItem[];
  sourceStatuses: SourceStatusItem[];
}) {
  const [scheduleRegion, setScheduleRegion] = useState<RegionCode | 'all'>('all');
  const [importance, setImportance] = useState<ImportanceLevel | 'all'>('all');
  const [tournament, setTournament] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [resolvedState, setResolvedState] = useState<'all' | 'resolved' | 'unresolved'>('all');

  const tournaments = useMemo(
    () =>
      Array.from(new Set(schedule.map((event) => event.tournament || event.title.split(':')[0]).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 80),
    [schedule],
  );

  const visibleSchedule = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const importanceRank: Record<ImportanceLevel, number> = { high: 0, medium: 1, low: 2 };

    return schedule
      .filter((event) => event.date >= snapshotDate || (event.dateEnd ?? '') >= snapshotDate)
      .filter((event) => scheduleRegion === 'all' || (event.country_or_region ?? event.region) === scheduleRegion)
      .filter((event) => importance === 'all' || event.importance_level === importance)
      .filter((event) => tournament === 'all' || (event.tournament || event.title).includes(tournament))
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

        return `${event.title} ${event.tournament ?? ''} ${event.source}`.toLocaleLowerCase().includes(needle);
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
  }, [endDate, importance, query, resolvedState, schedule, scheduleRegion, snapshotDate, startDate, tournament]);

  const visibleNews = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return news
      .filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.title} ${item.summary}`.toLocaleLowerCase().includes(needle);
      })
      .slice(0, 6);
  }, [news, query]);

  return (
    <section className="lower-grid">
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
                    <strong>{event.title}</strong>
                    <ExternalLink size={14} />
                  </a>
                  <small>
                    {event.tournament ?? sourceName} · {t.sourceProvenance}: {sourceName}
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

      <div className="panel news-panel" id="news">
        <div className="panel-title-row">
          <h2>
            <Newspaper size={18} />
            {t.news}
          </h2>
          <span>{t.sources}</span>
        </div>

        <div className="news-list">
          {visibleNews.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="news-row">
              <span>{formatDate(item.date, language)}</span>
              <strong>{item.title}</strong>
              <small>{item.source}</small>
            </a>
          ))}
        </div>
      </div>

      <div className="panel source-panel">
        <div className="panel-title-row">
          <h2>
            <Users size={18} />
            {t.sourceHub}
          </h2>
        </div>

        <div className="source-list">
          {sources.map((source) => {
            const status = sourceStatuses.find(
              (item) => item.source_name === source.name || item.source_url === source.url,
            );
            return (
              <a key={`${source.region}-${source.name}`} href={source.url} target="_blank" rel="noreferrer">
                <RegionBadge region={source.region} label={regionLabel(source.region, t)} compact />
                <strong>{source.name}</strong>
                <small>
                  {source.note}
                  {status ? ` · ${t.sourceStatus}: ${sourceStatusLabel(status.status, t)} (${status.item_count})` : ''}
                </small>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RatingComparisonCard({
  label,
  value,
  meta,
  href,
}: {
  label: string;
  value: string;
  meta: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </>
  );

  if (href) {
    return (
      <a className="rating-card" href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return <div className="rating-card">{content}</div>;
}

function App() {
  const [data, setData] = useState<RatingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/baduk-data.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Data request failed: ${response.status}`);
        }
        return response.json() as Promise<RatingData>;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load data');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="load-state">
        <strong>Baduk-R</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="load-state">
        <strong>Baduk-R</strong>
        <span>Loading ratings snapshot...</span>
      </div>
    );
  }

  return <RatingsApp data={data} />;
}

function RatingsApp({ data }: { data: RatingData }) {
  const [language, setLanguage] = useState<Language>('ko');
  const [country, setCountry] = useState<CountryCode | 'all'>('all');
  const [mode, setMode] = useState<RankingMode>('overall');
  const [sortMetric, setSortMetric] = useState<RatingMetric>('own');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(data.players[0].id);
  const [playerAId, setPlayerAId] = useState(data.players[0].id);
  const [playerBId, setPlayerBId] = useState(
    data.players.find((player) => player.names.en === 'Ke Jie')?.id ?? data.players[1].id,
  );

  const t = copy[language];
  const languageMeta = languages.find((item) => item.key === language) ?? languages[0];
  const sourceStatuses = data.sourceStatus?.sources ?? [];

  useEffect(() => {
    document.documentElement.lang =
      language === 'zhHans' ? 'zh-CN' : language === 'zhHant' ? 'zh-TW' : language;
  }, [language]);

  const comparisons = useMemo(
    () => new Map((data.ratingComparisons ?? []).map((item) => [item.player_id, item])),
    [data.ratingComparisons],
  );

  const filteredPlayers = useMemo(() => {
    const filtered = filterPlayers(data.players, { country, mode, query });
    if (mode === 'rising') {
      return filtered;
    }
    return [...filtered].sort((left, right) => comparePlayersByMetric(left, right, comparisons, sortMetric));
  }, [comparisons, country, data.players, mode, query, sortMetric]);

  const tableRows = filteredPlayers.slice(0, 220);
  const selectedPlayer =
    data.players.find((player) => player.id === selectedId) ?? filteredPlayers[0] ?? data.players[0];
  const selectedDetail = data.playerDetails[selectedPlayer.id];
  const selectedComparison = comparisons.get(selectedPlayer.id) ?? selectedDetail?.ratingComparison;
  const selectedOwnRating = selectedComparison?.own_rating ?? selectedDetail?.ownRating;
  const selectedName = getPlayerDisplayName(selectedPlayer, languageMeta.nameKey);
  const playerA = data.players.find((player) => player.id === playerAId) ?? data.players[0];
  const playerB = data.players.find((player) => player.id === playerBId) ?? data.players[1];
  const playerAComparison = comparisons.get(playerA.id);
  const playerBComparison = comparisons.get(playerB.id);
  const playerARating = playerAComparison?.own_rating?.own_rating ?? playerA.rating;
  const playerBRating = playerBComparison?.own_rating?.own_rating ?? playerB.rating;
  const prediction = winProbability({
    ratingA: playerARating,
    ratingB: playerBRating,
  });
  const bestOf3Prediction = seriesWinProbability(prediction, 3);
  const bestOf5Prediction = seriesWinProbability(prediction, 5);
  const ratingDiff = playerARating - playerBRating;
  const predictionUncertainty = Math.round(
    Math.hypot(
      playerAComparison?.own_rating?.own_rating_uncertainty ?? 90,
      playerBComparison?.own_rating?.own_rating_uncertainty ?? 90,
    ),
  );
  const playerADetail = data.playerDetails[playerA.id];
  const headToHeadGames = (playerADetail?.recentGames ?? []).filter((game) => game.opponentId === playerB.id);
  const playerAH2HWins = headToHeadGames.filter((game) => game.result === 'win').length;
  const optionPlayers = data.players.slice(0, 240);
  const snapshotDate = data.generatedAt.slice(0, 10);
  const selectedBirthBadge = formatBirthBadge(selectedDetail?.birthDate, data.generatedAt, language);
  const sourceGameCount = compactNumber(data.ratingStats.games);

  const setPlayerA = (id: string) => {
    setPlayerAId(id);
    if (id === playerBId) {
      setPlayerBId(data.players.find((player) => player.id !== id)?.id ?? id);
    }
  };

  const setPlayerB = (id: string) => {
    setPlayerBId(id);
    if (id === playerAId) {
      setPlayerAId(data.players.find((player) => player.id !== id)?.id ?? id);
    }
  };

  const externalRatings = selectedDetail?.externalRatings ?? [];
  const sourceValueForProfile = (source: RatingSourceId) =>
    getExternalComparison(selectedComparison, source) ??
    externalRatings.find((item): item is ExternalRating & RatingComparisonValue => item.rating_source_id === source);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#ratings" aria-label="Baduk-R home">
          Baduk-R
        </a>

        <nav className="topnav" aria-label="Primary">
          <a href="#ratings">{t.ratings}</a>
          <a href="#profile">{t.players}</a>
          <a href="#schedule">{t.events}</a>
          <a href="#news">{t.news}</a>
          <a href="#predictor">{t.compare}</a>
          <a href="#methodology">{t.methodology}</a>
        </nav>

        <div className="top-actions">
          <label className="searchbox">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            ) : null}
          </label>

          <label className="language-select">
            <Globe2 size={17} aria-hidden="true" />
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              {languages.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main>
        <section className="release-strip" aria-label="Dataset status">
          <div>
            <span>{t.release}</span>
            <strong>{data.ratingStats.mostRecentGame}</strong>
          </div>
          <div>
            <span>{t.dataUpdated}</span>
            <strong>{formatFullDate(data.generatedAt, language)}</strong>
          </div>
          <div>
            <span>{t.games}</span>
            <strong>{sourceGameCount}</strong>
          </div>
          <div>
            <span>{t.modelVersion}</span>
            <strong>{data.modelVersion ?? selectedOwnRating?.model_version ?? 'Baduk-R'}</strong>
          </div>
        </section>

        <div className="dashboard-grid">
          <div className="left-stack">
            <section className="panel ratings-panel" id="ratings">
              <div className="panel-heading">
                <div>
                  <h1>{t.ratingList}</h1>
                  <p>{t.snapshot}</p>
                </div>
                <div className="toolbar-label">
                  <Filter size={16} />
                  <span>{filteredPlayers.length.toLocaleString()}</span>
                </div>
              </div>

              <div className="segmented-row">
                <div className="segmented" role="tablist" aria-label="Country filter">
                  {countryTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={country === tab.key ? 'active' : ''}
                      onClick={() => setCountry(tab.key)}
                    >
                      {t[tab.labelKey]}
                    </button>
                  ))}
                </div>

                <div className="segmented compact" role="tablist" aria-label="Ranking mode">
                  {modeTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={mode === tab.key ? 'active' : ''}
                      onClick={() => setMode(tab.key)}
                    >
                      {t[tab.labelKey]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="metric-row">
                <label>
                  <span>{t.sortMetric}</span>
                  <select value={sortMetric} onChange={(event) => setSortMetric(event.target.value as RatingMetric)}>
                    {ratingMetricTabs.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {t[metric.labelKey]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="table-wrap">
                <table className="ratings-table">
                  <thead>
                    <tr>
                      <th className="col-rank">{t.rank}</th>
                      <th className="col-player">{t.player}</th>
                      <th className="numeric col-rating">{t.ownRating}</th>
                      <th className="numeric col-rating hide-tablet">{t.goRatingsScore}</th>
                      <th className="numeric col-rating hide-tablet">{t.chineseQiyuanScore}</th>
                      <th className="numeric col-rating hide-tablet">{t.koreanBadukScore}</th>
                      <th className="col-form hide-mobile">{t.form}</th>
                      <th className="col-trend hide-mobile">
                        <span className="th-with-icon">
                          {t.trend}
                          <ArrowUpDown size={13} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((player) => {
                      const name = getPlayerDisplayName(player, languageMeta.nameKey);
                      const comparison = comparisons.get(player.id);
                      const own = comparison?.own_rating;
                      return (
                        <tr
                          key={player.id}
                          className={player.id === selectedPlayer.id ? 'selected' : ''}
                          onClick={() => setSelectedId(player.id)}
                        >
                          <td className="rank-cell">
                            <span>{own?.own_rank ?? (mode === 'overall' ? player.rank : player.regionalRank)}</span>
                          </td>
                          <td>
                            <button type="button" className="player-button">
                              <RegionBadge region={player.country} label={regionLabel(player.country, t)} compact />
                              <span>
                                <strong>{name}</strong>
                                <small>{player.names.en}</small>
                              </span>
                            </button>
                          </td>
                          <td className="numeric rating-number">
                            <RatingValueCell
                              label={t.ownRating}
                              value={own?.own_rating ?? player.rating}
                              meta={`${t.uncertainty} ±${own?.own_rating_uncertainty ?? 90}`}
                              t={t}
                              primary
                            />
                          </td>
                          <td className="numeric hide-tablet">
                            <ExternalRatingCell value={getExternalComparison(comparison, 'goratings')} t={t} />
                          </td>
                          <td className="numeric hide-tablet">
                            <ExternalRatingCell value={getExternalComparison(comparison, 'chinese_qiyuan')} t={t} />
                          </td>
                          <td className="numeric hide-tablet">
                            <ExternalRatingCell value={getExternalComparison(comparison, 'korean_baduk')} t={t} />
                          </td>
                          <td className="hide-mobile form-cell">
                            <FormDots form={player.form} />
                          </td>
                          <td className="hide-mobile trend-cell">
                            <MiniTrend points={player.history} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!tableRows.length ? <div className="empty-state">{t.noRows}</div> : null}
              </div>
            </section>

            <FeedPanels
              t={t}
              language={language}
              query={query}
              snapshotDate={snapshotDate}
              schedule={data.schedule}
              news={data.news}
              sources={data.sourceHub}
              sourceStatuses={sourceStatuses}
            />
          </div>

          <aside className="side-stack">
            <section className="panel predictor-panel" id="predictor">
              <div className="panel-title-row">
                <h2>
                  <Target size={18} />
                  {t.matchPredictor}
                </h2>
              </div>

              <div className="predictor-grid">
                <label>
                  <span>{t.playerOne}</span>
                  <select value={playerAId} onChange={(event) => setPlayerA(event.target.value)}>
                    {optionPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player, language)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t.playerTwo}</span>
                  <select value={playerBId} onChange={(event) => setPlayerB(event.target.value)}>
                    {optionPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player, language)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="probability-box">
                <div>
                  <strong>{(prediction * 100).toFixed(1)}%</strong>
                  <span>{getPlayerDisplayName(playerA, languageMeta.nameKey)}</span>
                </div>
                <div className="probability-track">
                  <span style={{ width: `${prediction * 100}%` }} />
                </div>
                <div>
                  <strong>{((1 - prediction) * 100).toFixed(1)}%</strong>
                  <span>{getPlayerDisplayName(playerB, languageMeta.nameKey)}</span>
                </div>
              </div>

              <div className="series-grid" aria-label={t.seriesWinProbability}>
                <div>
                  <span>{t.singleGame}</span>
                  <strong>{(prediction * 100).toFixed(1)}%</strong>
                  <small>{getPlayerDisplayName(playerA, languageMeta.nameKey)}</small>
                </div>
                <div>
                  <span>{t.bestOf3}</span>
                  <strong>{(bestOf3Prediction * 100).toFixed(1)}%</strong>
                  <small>{t.needs2Wins}</small>
                </div>
                <div>
                  <span>{t.bestOf5}</span>
                  <strong>{(bestOf5Prediction * 100).toFixed(1)}%</strong>
                  <small>{t.needs3Wins}</small>
                </div>
              </div>

              <div className="prediction-details">
                <div>
                  <span>{t.ratingDiff}</span>
                  <strong>{formatSigned(ratingDiff)}</strong>
                </div>
                <div>
                  <span>{t.uncertainty}</span>
                  <strong>±{predictionUncertainty}</strong>
                </div>
                <div>
                  <span>{t.recentForm}</span>
                  <strong>
                    {Math.round((resultScore(playerA.form) ?? 0.5) * 100)}% /{' '}
                    {Math.round((resultScore(playerB.form) ?? 0.5) * 100)}%
                  </strong>
                </div>
                <div>
                  <span>{t.headToHead}</span>
                  <strong>
                    {headToHeadGames.length ? `${playerAH2HWins}-${headToHeadGames.length - playerAH2HWins}` : t.noHeadToHead}
                  </strong>
                </div>
              </div>

              <p className="model-note">{t.modelNote}</p>
            </section>

            <section className="panel profile-panel" id="profile">
              <div className="profile-header">
                <div className="board-chip" aria-hidden="true">
                  <span className="stone black-stone s1" />
                  <span className="stone white-stone s2" />
                  <span className="stone black-stone s3" />
                  <span className="stone white-stone s4" />
                </div>
                <div>
                  <h2>
                    {selectedName}
                    <Star size={17} />
                  </h2>
                  <p>
                    <RegionBadge region={selectedPlayer.country} label={regionLabel(selectedPlayer.country, t)} />
                    {selectedBirthBadge ? <span className="birth-chip">{selectedBirthBadge}</span> : null}
                  </p>
                </div>
                <div className="profile-rank">
                  <span>{t.ownRating}</span>
                  <strong>{formatRating(selectedOwnRating?.own_rating ?? selectedPlayer.rating)}</strong>
                </div>
              </div>

              <div className="profile-stats">
                <div>
                  <span>{t.rank}</span>
                  <strong>{selectedOwnRating?.own_rank ?? selectedPlayer.rank}</strong>
                </div>
                <div>
                  <span>W-L</span>
                  <strong>{selectedDetail ? `${selectedDetail.wins}-${selectedDetail.losses}` : '—'}</strong>
                </div>
                <div>
                  <span>{t.delta}</span>
                  <strong className={(selectedPlayer.ratingDelta30 ?? 0) >= 0 ? 'delta-positive' : 'delta-negative'}>
                    {formatSigned(selectedPlayer.ratingDelta30)}
                  </strong>
                </div>
              </div>

              <div className="rating-comparison-grid">
                <RatingComparisonCard
                  label={t.ownRating}
                  value={formatRating(selectedOwnRating?.own_rating ?? selectedPlayer.rating)}
                  meta={`${t.badukR} · ${selectedOwnRating?.rating_date ?? snapshotDate} · ±${
                    selectedOwnRating?.own_rating_uncertainty ?? 90
                  }`}
                />
                {externalRatingSources.map((source) => {
                  const value = sourceValueForProfile(source);
                  const labelKey =
                    source === 'goratings'
                      ? 'goRatingsScore'
                      : source === 'chinese_qiyuan'
                        ? 'chineseQiyuanScore'
                        : 'koreanBadukScore';
                  return (
                    <RatingComparisonCard
                      key={source}
                      label={t[labelKey]}
                      value={formatRating(value?.rating_value)}
                      meta={
                        value
                          ? `${value.rating_date ?? value.fetched_at?.slice(0, 10) ?? t.unknown} · ${termsStatusLabel(
                              value.terms_status,
                              t,
                            )}`
                          : t.missing
                      }
                      href={value?.source_url}
                    />
                  );
                })}
              </div>

              <div className="profile-columns">
                <div>
                  <h3>
                    <BarChart3 size={16} />
                    {t.history}
                  </h3>
                  <div className="history-card">
                    <MiniTrend points={selectedDetail?.history ?? selectedPlayer.history} width={260} height={118} strong />
                  </div>
                </div>

                <div>
                  <h3>
                    <Trophy size={16} />
                    {t.recentGames}
                  </h3>
                  <ul className="recent-list">
                    {(selectedDetail?.recentGames ?? []).slice(0, 5).map((game) => {
                      const opponent = data.players.find((player) => player.id === game.opponentId);
                      const opponentName = opponent
                        ? getPlayerDisplayName(opponent, languageMeta.nameKey)
                        : game.opponentName;
                      return (
                        <li key={`${game.date}-${game.opponentId}-${game.result}`}>
                          <span>
                            {formatDate(game.date, language)}
                            <small>
                              <RegionBadge
                                region={game.opponentCountry}
                                label={regionLabel(game.opponentCountry, t)}
                                compact
                              />
                              vs {opponentName}
                            </small>
                          </span>
                          <strong className={game.result === 'win' ? 'form-win-text' : 'form-loss-text'}>
                            {game.result === 'win' ? 'W' : 'L'}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="link-row">
                <a href={selectedPlayer.profileUrl} target="_blank" rel="noreferrer">
                  {t.viewSource}
                  <ExternalLink size={14} />
                </a>
                {(selectedDetail?.links ?? []).slice(0, 2).map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                    {t.links}
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="panel methodology-panel" id="methodology">
          <div className="panel-title-row">
            <h2>
              <BarChart3 size={18} />
              {t.methodologyTitle}
            </h2>
            <span>{data.modelVersion ?? selectedOwnRating?.model_version ?? 'Baduk-R'}</span>
          </div>
          <div className="methodology-grid">
            <p>{t.methodologyOwn}</p>
            <p>{t.methodologyExternal}</p>
            <p>{t.methodologyMissing}</p>
            <p>{t.methodologyPrediction}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
