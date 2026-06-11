import { Target } from 'lucide-react';
import { formatSigned, getPlayerDisplayName, resultScore, seriesWinProbability, winProbability } from '../lib/rating';
import { getPlayerOptionLabel } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import type { HistoryPoint, OwnHistoryPoint, Player, PlayerDetail, RatingComparison } from '../types';
import { OverlayChart, type ChartSeries } from './OverlayChart';

function ratingSeries(
  player: Player,
  detail: PlayerDetail | undefined,
  ownHistory: Record<string, OwnHistoryPoint[]> | null,
  t: Translation,
): { points: HistoryPoint[]; sourceLabel: string } {
  const ownSeries = ownHistory?.[player.id];
  if (ownSeries && ownSeries.length >= 2) {
    return { points: ownSeries, sourceLabel: t.badukR };
  }
  return { points: detail?.history ?? player.history, sourceLabel: t.goRatingsScore };
}

export function PredictorPanel({
  t,
  language,
  nameKey,
  optionPlayers,
  comparisons,
  playerA,
  playerB,
  onPlayerAChange,
  onPlayerBChange,
  playerADetail,
  playerBDetail,
  ownHistory,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  optionPlayers: Player[];
  comparisons: Map<string, RatingComparison>;
  playerA: Player;
  playerB: Player;
  onPlayerAChange: (id: string) => void;
  onPlayerBChange: (id: string) => void;
  playerADetail: PlayerDetail | undefined;
  playerBDetail: PlayerDetail | undefined;
  ownHistory: Record<string, OwnHistoryPoint[]> | null;
}) {
  const playerAComparison = comparisons.get(playerA.id);
  const playerBComparison = comparisons.get(playerB.id);
  const playerARating = playerAComparison?.own_rating?.own_rating ?? playerA.rating;
  const playerBRating = playerBComparison?.own_rating?.own_rating ?? playerB.rating;
  const prediction = winProbability({ ratingA: playerARating, ratingB: playerBRating });
  const bestOf3Prediction = seriesWinProbability(prediction, 3);
  const bestOf5Prediction = seriesWinProbability(prediction, 5);
  const ratingDiff = playerARating - playerBRating;
  const predictionUncertainty = Math.round(
    Math.hypot(
      playerAComparison?.own_rating?.own_rating_uncertainty ?? 90,
      playerBComparison?.own_rating?.own_rating_uncertainty ?? 90,
    ),
  );
  const headToHeadGames = (playerADetail?.recentGames ?? []).filter((game) => game.opponentId === playerB.id);
  const playerAH2HWins = headToHeadGames.filter((game) => game.result === 'win').length;

  const playerAName = getPlayerDisplayName(playerA, nameKey);
  const playerBName = getPlayerDisplayName(playerB, nameKey);

  const seriesA = ratingSeries(playerA, playerADetail, ownHistory, t);
  const seriesB = ratingSeries(playerB, playerBDetail, ownHistory, t);
  const chartSeries: ChartSeries[] = [
    { id: playerA.id, name: `${playerAName} · ${seriesA.sourceLabel}`, points: seriesA.points, variant: 'a' },
    { id: playerB.id, name: `${playerBName} · ${seriesB.sourceLabel}`, points: seriesB.points, variant: 'b' },
  ];

  return (
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
          <select value={playerA.id} onChange={(event) => onPlayerAChange(event.target.value)}>
            {optionPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {getPlayerOptionLabel(player, language, comparisons.get(player.id))}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t.playerTwo}</span>
          <select value={playerB.id} onChange={(event) => onPlayerBChange(event.target.value)}>
            {optionPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {getPlayerOptionLabel(player, language, comparisons.get(player.id))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="probability-box">
        <div>
          <strong>{(prediction * 100).toFixed(1)}%</strong>
          <span>{playerAName}</span>
        </div>
        <div className="probability-track">
          <span style={{ width: `${prediction * 100}%` }} />
        </div>
        <div>
          <strong>{((1 - prediction) * 100).toFixed(1)}%</strong>
          <span>{playerBName}</span>
        </div>
      </div>

      <div className="series-grid" aria-label={t.seriesWinProbability}>
        <div>
          <span>{t.singleGame}</span>
          <strong>{(prediction * 100).toFixed(1)}%</strong>
          <small>{playerAName}</small>
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

      <div className="comparison-chart-block">
        <h3>{t.comparisonChart}</h3>
        <OverlayChart series={chartSeries} t={t} />
      </div>

      <p className="model-note">{t.modelNote}</p>
    </section>
  );
}
