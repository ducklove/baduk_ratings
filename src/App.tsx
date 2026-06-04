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
import { copy, languages, type Language } from './lib/i18n';
import {
  compactNumber,
  countryFlag,
  filterPlayers,
  formatSigned,
  getHistoryPath,
  getPlayerDisplayName,
  resultScore,
  winProbability,
  type RankingMode,
} from './lib/rating';
import type { CountryCode, HistoryPoint, NewsItem, Player, RatingData, ScheduleEvent, SourceHubItem } from './types';

const localeForLanguage: Record<Language, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zhHans: 'zh-CN',
  zhHant: 'zh-TW',
};

const countryTabs: Array<{ key: CountryCode | 'all'; labelKey: keyof typeof copy.en }> = [
  { key: 'all', labelKey: 'all' },
  { key: 'kr', labelKey: 'korea' },
  { key: 'cn', labelKey: 'china' },
  { key: 'jp', labelKey: 'japan' },
  { key: 'tw', labelKey: 'taiwan' },
];

const modeTabs: Array<{ key: RankingMode; labelKey: keyof typeof copy.en }> = [
  { key: 'overall', labelKey: 'overall' },
  { key: 'women', labelKey: 'women' },
  { key: 'rising', labelKey: 'rising' },
];

const scheduleCategoryLabels: Record<string, string> = {
  world: 'World',
  prd: 'Pro',
  dev: 'Qual',
  etc: 'Etc',
  online: 'Online',
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

  if (!path) {
    return <span className="muted">—</span>;
  }

  return (
    <svg className={strong ? 'trend trend-strong' : 'trend'} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} />
    </svg>
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

function CountryMark({ country }: { country: CountryCode }) {
  return (
    <span className={`country-mark country-${country}`} title={country.toUpperCase()}>
      {countryFlag(country)}
    </span>
  );
}

function getPlayerOptionLabel(player: Player, language: Language) {
  const nameKey = languages.find((item) => item.key === language)?.nameKey ?? 'en';
  return `#${player.rank} ${getPlayerDisplayName(player, nameKey)} (${player.country.toUpperCase()}) · ${
    player.rating
  }`;
}

function FeedPanels({
  t,
  language,
  schedule,
  news,
  sources,
}: {
  t: Record<string, string>;
  language: Language;
  schedule: ScheduleEvent[];
  news: NewsItem[];
  sources: SourceHubItem[];
}) {
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

        <div className="schedule-list">
          {schedule.map((event) => (
            <a key={event.id} className="schedule-row" href={event.sourceUrl} target="_blank" rel="noreferrer">
              <span className={`category-dot category-${event.category}`}>
                {scheduleCategoryLabels[event.category]}
              </span>
              <span className="schedule-date">
                {formatDate(event.date, language)}
                <small>{event.timeKst ? `${event.timeKst} KST` : event.weekday}</small>
              </span>
              <strong>{event.title}</strong>
              <ExternalLink size={14} />
            </a>
          ))}
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
          {news.map((item) => (
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
          {sources.map((source) => (
            <a key={`${source.region}-${source.name}`} href={source.url} target="_blank" rel="noreferrer">
              <span>{source.region.toUpperCase()}</span>
              <strong>{source.name}</strong>
              <small>{source.note}</small>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
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
        <strong>baduk_ratings</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="load-state">
        <strong>baduk_ratings</strong>
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
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(data.players[0].id);
  const [blackId, setBlackId] = useState(data.players[0].id);
  const [whiteId, setWhiteId] = useState(
    data.players.find((player) => player.names.en === 'Ke Jie')?.id ?? data.players[1].id,
  );
  const [komi, setKomi] = useState(7.5);
  const [rules, setRules] = useState<'chinese' | 'japanese' | 'korean'>('chinese');

  const t = copy[language];
  const languageMeta = languages.find((item) => item.key === language) ?? languages[0];

  useEffect(() => {
    document.documentElement.lang =
      language === 'zhHans' ? 'zh-CN' : language === 'zhHant' ? 'zh-TW' : language;
  }, [language]);

  const filteredPlayers = useMemo(
    () => filterPlayers(data.players, { country, mode, query }),
    [country, data.players, mode, query],
  );

  const tableRows = filteredPlayers.slice(0, 10);
  const selectedPlayer =
    data.players.find((player) => player.id === selectedId) ?? filteredPlayers[0] ?? data.players[0];
  const selectedDetail = data.playerDetails[selectedPlayer.id];
  const blackPlayer = data.players.find((player) => player.id === blackId) ?? data.players[0];
  const whitePlayer = data.players.find((player) => player.id === whiteId) ?? data.players[1];
  const prediction = winProbability(blackPlayer.rating, whitePlayer.rating, komi, rules);
  const optionPlayers = data.players.slice(0, 220);
  const snapshotDate = data.generatedAt.slice(0, 10);

  const visibleSchedule = data.schedule
    .filter((event) => event.date >= snapshotDate)
    .filter((event) => {
      if (!query.trim()) {
        return true;
      }
      return event.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    })
    .slice(0, 12);

  const visibleNews = data.news
    .filter((item) => {
      if (!query.trim()) {
        return true;
      }
      const needle = query.trim().toLocaleLowerCase();
      return `${item.title} ${item.summary}`.toLocaleLowerCase().includes(needle);
    })
    .slice(0, 6);

  const setBlack = (id: string) => {
    setBlackId(id);
    if (id === whiteId) {
      setWhiteId(data.players.find((player) => player.id !== id)?.id ?? id);
    }
  };

  const setWhite = (id: string) => {
    setWhiteId(id);
    if (id === blackId) {
      setBlackId(data.players.find((player) => player.id !== id)?.id ?? id);
    }
  };

  const selectedName = getPlayerDisplayName(selectedPlayer, languageMeta.nameKey);
  const age = ageFromBirthDate(selectedDetail?.birthDate ?? null, data.generatedAt);
  const sourceGameCount = compactNumber(data.ratingStats.games);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#ratings" aria-label="baduk_ratings home">
          <span>baduk</span>
          <span className="brand-accent">_</span>
          <span>ratings</span>
        </a>

        <nav className="topnav" aria-label="Primary">
          <a href="#ratings">{t.ratings}</a>
          <a href="#profile">{t.players}</a>
          <a href="#schedule">{t.events}</a>
          <a href="#news">{t.news}</a>
          <a href="#predictor">{t.compare}</a>
        </nav>

        <div className="top-actions">
          <label className="searchbox">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
            />
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
            <span>{t.totalPlayers}</span>
            <strong>{data.ratingStats.players.toLocaleString()}</strong>
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

            <div className="table-wrap">
              <table className="ratings-table">
                <thead>
                  <tr>
                    <th>{t.rank}</th>
                    <th>{t.player}</th>
                    <th>{t.country}</th>
                    <th className="numeric">{t.rating}</th>
                    <th className="numeric">
                      <span className="th-with-icon">
                        {t.delta}
                        <ArrowUpDown size={13} />
                      </span>
                    </th>
                    <th className="hide-mobile">{t.form}</th>
                    <th className="hide-mobile">{t.trend}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((player) => {
                    const name = getPlayerDisplayName(player, languageMeta.nameKey);
                    const score = resultScore(player.form);
                    return (
                      <tr
                        key={player.id}
                        className={player.id === selectedPlayer.id ? 'selected' : ''}
                        onClick={() => setSelectedId(player.id)}
                      >
                        <td className="rank-cell">
                          <span>{mode === 'overall' ? player.rank : player.regionalRank}</span>
                        </td>
                        <td>
                          <button type="button" className="player-button">
                            <CountryMark country={player.country} />
                            <span>
                              <strong>{name}</strong>
                              <small>{player.names.en}</small>
                            </span>
                          </button>
                        </td>
                        <td>{player.country.toUpperCase()}</td>
                        <td className="numeric rating-number">{player.rating}</td>
                        <td
                          className={
                            (player.ratingDelta30 ?? 0) >= 0 ? 'numeric delta-positive' : 'numeric delta-negative'
                          }
                        >
                          {formatSigned(player.ratingDelta30)}
                        </td>
                        <td className="hide-mobile">
                          <FormDots form={player.form} />
                          {score !== null ? <span className="form-score">{Math.round(score * 100)}%</span> : null}
                        </td>
                        <td className="hide-mobile">
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
              schedule={visibleSchedule}
              news={visibleNews}
              sources={data.sourceHub}
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
                  <span>{t.black}</span>
                  <select value={blackId} onChange={(event) => setBlack(event.target.value)}>
                    {optionPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player, language)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t.white}</span>
                  <select value={whiteId} onChange={(event) => setWhite(event.target.value)}>
                    {optionPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {getPlayerOptionLabel(player, language)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t.rules}</span>
                  <select value={rules} onChange={(event) => setRules(event.target.value as typeof rules)}>
                    <option value="chinese">{t.chineseRules}</option>
                    <option value="japanese">{t.japaneseRules}</option>
                    <option value="korean">{t.koreanRules}</option>
                  </select>
                </label>

                <label>
                  <span>{t.komi}</span>
                  <select value={komi} onChange={(event) => setKomi(Number(event.target.value))}>
                    <option value={5.5}>5.5</option>
                    <option value={6.5}>6.5</option>
                    <option value={7.5}>7.5</option>
                  </select>
                </label>
              </div>

              <div className="probability-box">
                <div>
                  <strong>{(prediction * 100).toFixed(1)}%</strong>
                  <span>{getPlayerDisplayName(blackPlayer, languageMeta.nameKey)}</span>
                </div>
                <div className="probability-track">
                  <span style={{ width: `${prediction * 100}%` }} />
                </div>
                <div>
                  <strong>{((1 - prediction) * 100).toFixed(1)}%</strong>
                  <span>{getPlayerDisplayName(whitePlayer, languageMeta.nameKey)}</span>
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
                    <CountryMark country={selectedPlayer.country} />
                    {selectedPlayer.country.toUpperCase()}
                    {age !== null ? ` · ${age}` : ''}
                  </p>
                </div>
                <div className="profile-rank">
                  <span>{t.rating}</span>
                  <strong>{selectedPlayer.rating}</strong>
                </div>
              </div>

              <div className="profile-stats">
                <div>
                  <span>{t.rank}</span>
                  <strong>{selectedPlayer.rank}</strong>
                </div>
                <div>
                  <span>W-L</span>
                  <strong>
                    {selectedDetail ? `${selectedDetail.wins}-${selectedDetail.losses}` : '—'}
                  </strong>
                </div>
                <div>
                  <span>{t.delta}</span>
                  <strong className={(selectedPlayer.ratingDelta180 ?? 0) >= 0 ? 'delta-positive' : 'delta-negative'}>
                    {formatSigned(selectedPlayer.ratingDelta180)}
                  </strong>
                </div>
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
                    {(selectedDetail?.recentGames ?? []).slice(0, 5).map((game) => (
                      <li key={`${game.date}-${game.opponentId}-${game.result}`}>
                        <span>
                          {formatDate(game.date, language)}
                          <small>vs {game.opponentName}</small>
                        </span>
                        <strong className={game.result === 'win' ? 'form-win-text' : 'form-loss-text'}>
                          {game.result === 'win' ? 'W' : 'L'}
                        </strong>
                      </li>
                    ))}
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

      </main>
    </div>
  );
}

export default App;
