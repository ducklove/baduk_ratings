import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CountryStatsPanel } from './components/CountryStatsPanel';
import { DataApiPanel } from './components/DataApiPanel';
import { KifuPanel } from './components/KifuPanel';
import { MethodologyPanel } from './components/MethodologyPanel';
import { NewsPanel } from './components/NewsPanel';
import { PredictorPanel } from './components/PredictorPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { RankingTable } from './components/RankingTable';
import { ReleaseStrip } from './components/ReleaseStrip';
import { SchedulePanel } from './components/SchedulePanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { SourceHubPanel } from './components/SourceHubPanel';
import { TopBar } from './components/TopBar';
import { TournamentPage } from './components/TournamentPage';
import { TournamentsPanel } from './components/TournamentsPanel';
import { useBadukData, useOwnHistory, usePlayerDetails } from './hooks/useBadukData';
import { useKifu } from './hooks/useKifu';
import { useTournaments } from './hooks/useTournaments';
import {
  readHash,
  scrollToProfile,
  useFiltersInHash,
  usePlayerHashListener,
  useTournamentHashListener,
  writePlayerHash,
} from './hooks/useHashState';
import { comparePlayersByMetric } from './lib/format';
import { copy, detectInitialLanguage, languages, persistLanguage, type Language } from './lib/i18n';
import { filterPlayers, type RankingMode } from './lib/rating';
import type { CountryCode, RatingData, RatingMetric } from './types';

function App() {
  const { data, error } = useBadukData();

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

export function RatingsApp({ data }: { data: RatingData }) {
  const [initialHash] = useState(readHash);

  const [language, setLanguage] = useState<Language>(detectInitialLanguage);
  const [country, setCountry] = useState<CountryCode | 'all'>(initialHash.filters.country ?? 'all');
  const [mode, setMode] = useState<RankingMode>(initialHash.filters.mode ?? 'overall');
  const [sortMetric, setSortMetric] = useState<RatingMetric>(initialHash.filters.metric ?? 'own');
  const [query, setQuery] = useState(initialHash.filters.query ?? '');
  const [selectedId, setSelectedId] = useState(() => {
    const fromHash = initialHash.playerId;
    if (fromHash && data.players.some((player) => player.id === fromHash)) {
      return fromHash;
    }
    return data.players[0].id;
  });
  const [playerAId, setPlayerAId] = useState(data.players[0].id);
  const [playerBId, setPlayerBId] = useState(
    data.players.find((player) => player.names.en === 'Ke Jie')?.id ?? data.players[1].id,
  );

  const [activeTournamentId, setActiveTournamentId] = useState(initialHash.tournamentId);

  const t = copy[language];
  const languageMeta = languages.find((item) => item.key === language) ?? languages[0];
  const sourceStatuses = data.sourceStatus?.sources ?? [];

  const { getDetail, requestDetail } = usePlayerDetails(data);
  const ownHistory = useOwnHistory(true);
  const tournamentsState = useTournaments();
  const kifu = useKifu();

  useEffect(() => {
    document.documentElement.lang =
      language === 'zhHans' ? 'zh-CN' : language === 'zhHant' ? 'zh-TW' : language;
    persistLanguage(language);
  }, [language]);

  useFiltersInHash({ country, mode, metric: sortMetric, query });

  useEffect(() => {
    if (initialHash.playerId && data.players.some((player) => player.id === initialHash.playerId)) {
      scrollToProfile();
    } else if (window.location.hash.startsWith('#ratings?')) {
      // The browser cannot resolve "#ratings?country=..." to the #ratings element itself.
      document.getElementById('ratings')?.scrollIntoView({ block: 'start' });
    }
    // Run once after the initial render for deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePlayerHashListener((playerId) => {
    if (data.players.some((player) => player.id === playerId)) {
      setSelectedId(playerId);
      // Defer so the dashboard is mounted again when leaving the tournament page.
      window.setTimeout(scrollToProfile, 0);
    }
  });

  useTournamentHashListener(setActiveTournamentId);

  useEffect(() => {
    if (activeTournamentId) {
      window.scrollTo({ top: 0 });
    }
  }, [activeTournamentId]);

  useEffect(() => {
    requestDetail(selectedId);
  }, [requestDetail, selectedId]);

  useEffect(() => {
    requestDetail(playerAId);
    requestDetail(playerBId);
  }, [requestDetail, playerAId, playerBId]);

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

  const selectedPlayer =
    data.players.find((player) => player.id === selectedId) ?? filteredPlayers[0] ?? data.players[0];
  const selectedDetail = getDetail(selectedPlayer.id);
  const selectedComparison = comparisons.get(selectedPlayer.id) ?? selectedDetail?.ratingComparison;
  const playerA = data.players.find((player) => player.id === playerAId) ?? data.players[0];
  const playerB = data.players.find((player) => player.id === playerBId) ?? data.players[1];
  const optionPlayers = useMemo(
    () =>
      [...data.players]
        .sort((left, right) => {
          const leftOwn = comparisons.get(left.id)?.own_rating;
          const rightOwn = comparisons.get(right.id)?.own_rating;
          const leftRank = leftOwn?.own_rank ?? Number.MAX_SAFE_INTEGER;
          const rightRank = rightOwn?.own_rank ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }
          return (rightOwn?.own_rating ?? right.rating) - (leftOwn?.own_rating ?? left.rating);
        })
        .slice(0, 240),
    [comparisons, data.players],
  );
  const snapshotDate = data.generatedAt.slice(0, 10);
  const modelVersion =
    data.modelVersion ?? selectedComparison?.own_rating?.model_version ?? 'Baduk-R';
  const activeTournament = activeTournamentId
    ? (tournamentsState.tournaments.find((item) => item.id === activeTournamentId) ?? null)
    : null;

  const selectPlayer = (id: string) => {
    setSelectedId(id);
    writePlayerHash(id);
  };

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

  if (activeTournamentId) {
    return (
      <div className="app-shell">
        <TopBar
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          query={query}
          onQueryChange={setQuery}
          showTournaments={tournamentsState.status === 'ready'}
        />

        <main>
          {tournamentsState.status === 'loading' ? (
            <div className="tournament-page">
              <section className="panel tournament-section">
                <div className="empty-state">{t.loadingText}</div>
              </section>
            </div>
          ) : activeTournament ? (
            <TournamentPage
              t={t}
              language={language}
              nameKey={languageMeta.nameKey}
              tournament={activeTournament}
              curationNote={tournamentsState.curationNote}
              players={data.players}
              schedule={data.schedule}
              comparisons={comparisons}
              optionPlayers={optionPlayers}
              snapshotDate={snapshotDate}
              kifuEntries={kifu.entries}
              getKifuGame={kifu.getGame}
              requestKifuGame={kifu.requestGame}
            />
          ) : (
            <div className="tournament-page">
              <a className="back-link" href="#ratings">
                <ArrowLeft size={15} />
                {t.backToDashboard}
              </a>
              <section className="panel tournament-section">
                <div className="empty-state">
                  {tournamentsState.status === 'absent' ? t.tournamentsUnavailable : t.tournamentNotFound}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        t={t}
        language={language}
        onLanguageChange={setLanguage}
        query={query}
        onQueryChange={setQuery}
        showTournaments={tournamentsState.status === 'ready'}
      />

      <main>
        <ReleaseStrip t={t} language={language} data={data} modelVersion={modelVersion} />

        <div className="dashboard-grid">
          <div className="left-stack">
            <RankingTable
              t={t}
              nameKey={languageMeta.nameKey}
              country={country}
              onCountryChange={setCountry}
              mode={mode}
              onModeChange={setMode}
              sortMetric={sortMetric}
              onSortMetricChange={setSortMetric}
              players={filteredPlayers}
              comparisons={comparisons}
              selectedId={selectedPlayer.id}
              onSelect={selectPlayer}
              ownHistory={ownHistory}
            />

            <section className="lower-grid">
              <SchedulePanel
                t={t}
                language={language}
                query={query}
                snapshotDate={snapshotDate}
                schedule={data.schedule}
              />
              <NewsPanel t={t} language={language} query={query} news={data.news} />
              <KifuPanel
                t={t}
                language={language}
                nameKey={languageMeta.nameKey}
                entries={kifu.entries}
                players={data.players}
                getGame={kifu.getGame}
                requestGame={kifu.requestGame}
              />
              <SourceHubPanel t={t} sources={data.sourceHub} sourceStatuses={sourceStatuses} />
            </section>

            {tournamentsState.status === 'ready' ? (
              <TournamentsPanel
                t={t}
                language={language}
                nameKey={languageMeta.nameKey}
                tournaments={tournamentsState.tournaments}
                schedule={data.schedule}
                snapshotDate={snapshotDate}
                players={data.players}
              />
            ) : null}
          </div>

          <aside className="side-stack">
            <PredictorPanel
              t={t}
              language={language}
              nameKey={languageMeta.nameKey}
              optionPlayers={optionPlayers}
              comparisons={comparisons}
              playerA={playerA}
              playerB={playerB}
              onPlayerAChange={setPlayerA}
              onPlayerBChange={setPlayerB}
              playerADetail={getDetail(playerA.id)}
              playerBDetail={getDetail(playerB.id)}
              ownHistory={ownHistory}
            />

            <ProfilePanel
              t={t}
              language={language}
              nameKey={languageMeta.nameKey}
              player={selectedPlayer}
              detail={selectedDetail}
              comparison={selectedComparison}
              players={data.players}
              snapshotDate={snapshotDate}
              generatedAt={data.generatedAt}
              ownHistory={ownHistory}
              kifuEntries={kifu.entries}
              getKifuGame={kifu.getGame}
              requestKifuGame={kifu.requestGame}
            />

            <SimulatorPanel
              t={t}
              language={language}
              nameKey={languageMeta.nameKey}
              optionPlayers={optionPlayers}
              comparisons={comparisons}
              subtitle={t.simulatorVirtualNote}
            />

            <CountryStatsPanel t={t} players={data.players} comparisons={comparisons} />
          </aside>
        </div>

        <MethodologyPanel t={t} modelVersion={modelVersion} />
        <DataApiPanel t={t} examplePlayerId={data.players[0].id} />
      </main>
    </div>
  );
}

export default App;
