import { MODEL_VERSION } from './config.mjs';
import { dateMinusDays } from './text.mjs';

export function collectGameGraph(players, playerDetails) {
  const playerIds = new Set(players.map((player) => player.id));
  const gamesByKey = new Map();

  for (const [playerId, detail] of Object.entries(playerDetails)) {
    if (!playerIds.has(playerId)) {
      continue;
    }

    for (const game of detail.modelGames ?? detail.recentGames ?? []) {
      if (!playerIds.has(game.opponentId) || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) {
        continue;
      }

      const blackId = game.color === 'black' ? playerId : game.opponentId;
      const whiteId = game.color === 'white' ? playerId : game.opponentId;
      const winnerId = game.result === 'win' ? playerId : game.opponentId;
      const loserId = game.result === 'win' ? game.opponentId : playerId;
      const sortedPlayers = [playerId, game.opponentId].sort().join('-');
      const key = `${game.date}-${sortedPlayers}-${blackId}-${winnerId}`;

      if (!gamesByKey.has(key)) {
        gamesByKey.set(key, {
          date: game.date,
          blackId,
          whiteId,
          winnerId,
          loserId,
        });
      }
    }
  }

  return [...gamesByKey.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function runBadukRModel(players, games, cutoffDate = null) {
  const ratings = new Map(players.map((player) => [player.id, 2500]));
  const counts = new Map(players.map((player) => [player.id, 0]));
  const recentCounts = new Map(players.map((player) => [player.id, 0]));
  const lastPlayed = new Map();
  const cutoff = cutoffDate ? new Date(`${cutoffDate}T00:00:00+09:00`) : null;
  const recentCutoff = cutoff
    ? new Date(cutoff.getTime() - 90 * 86400000)
    : null;

  for (const game of games) {
    if (cutoff && new Date(`${game.date}T00:00:00+09:00`) > cutoff) {
      continue;
    }

    const winnerRating = ratings.get(game.winnerId);
    const loserRating = ratings.get(game.loserId);
    if (winnerRating === undefined || loserRating === undefined) {
      continue;
    }

    const winnerGames = counts.get(game.winnerId) ?? 0;
    const loserGames = counts.get(game.loserId) ?? 0;
    const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
    const experienceFactor = 1 + Math.max(0, 24 - Math.min(winnerGames, loserGames)) / 48;
    const kFactor = 28 * experienceFactor;
    const delta = kFactor * (1 - expectedWinner);

    ratings.set(game.winnerId, winnerRating + delta);
    ratings.set(game.loserId, loserRating - delta);
    counts.set(game.winnerId, winnerGames + 1);
    counts.set(game.loserId, loserGames + 1);
    lastPlayed.set(game.winnerId, game.date);
    lastPlayed.set(game.loserId, game.date);

    if (recentCutoff && new Date(`${game.date}T00:00:00+09:00`) >= recentCutoff) {
      recentCounts.set(game.winnerId, (recentCounts.get(game.winnerId) ?? 0) + 1);
      recentCounts.set(game.loserId, (recentCounts.get(game.loserId) ?? 0) + 1);
    }
  }

  return { ratings, counts, recentCounts, lastPlayed };
}

export function buildOwnRatings(players, playerDetails, ratingDate) {
  const games = collectGameGraph(players, playerDetails);
  const current = runBadukRModel(players, games, ratingDate);
  const priorModels = new Map(
    [1, 7, 30, 90, 365].map((days) => [days, runBadukRModel(players, games, dateMinusDays(ratingDate, days))]),
  );
  const latestGameDate = games[games.length - 1]?.date ?? ratingDate;

  const ownRows = players.map((player) => {
    const currentRating = current.ratings.get(player.id) ?? 2500;
    const gamesTotal = current.counts.get(player.id) ?? 0;
    const gamesRecent = current.recentCounts.get(player.id) ?? 0;
    const lastPlayed = current.lastPlayed.get(player.id);
    const inactiveDays = lastPlayed
      ? Math.max(0, Math.round((new Date(`${latestGameDate}T00:00:00+09:00`) - new Date(`${lastPlayed}T00:00:00+09:00`)) / 86400000))
      : 999;
    const uncertainty = Math.max(
      55,
      Math.min(360, Math.round(330 / Math.sqrt(1 + gamesTotal / 5) + Math.min(120, inactiveDays * 0.18))),
    );
    const deltaFor = (days) => {
      const prior = priorModels.get(days);
      const priorCount = prior?.counts.get(player.id) ?? 0;
      if (!prior || gamesTotal === 0 || priorCount === 0) {
        return null;
      }
      return Math.round(currentRating - (prior.ratings.get(player.id) ?? 2500));
    };

    return {
      rating_date: ratingDate,
      player_id: player.id,
      own_rating: Math.round(currentRating),
      own_rating_uncertainty: uncertainty,
      own_rank: 0,
      own_rank_delta: null,
      own_rating_delta_1d: deltaFor(1),
      own_rating_delta_7d: deltaFor(7),
      own_rating_delta_30d: deltaFor(30),
      own_rating_delta_90d: deltaFor(90),
      own_rating_delta_365d: deltaFor(365),
      games_total: gamesTotal,
      games_recent: gamesRecent,
      active_flag: gamesRecent > 0,
      model_version: MODEL_VERSION,
      source_rank: player.rank,
    };
  });

  ownRows.sort((left, right) => {
    if (left.own_rating !== right.own_rating) {
      return right.own_rating - left.own_rating;
    }
    return left.own_rating_uncertainty - right.own_rating_uncertainty;
  });

  return ownRows.map((row, index) => {
    const ownRank = index + 1;
    const { source_rank: sourceRank, ...publicRow } = row;
    return {
      ...publicRow,
      own_rank: ownRank,
      own_rank_delta: sourceRank ? sourceRank - ownRank : null,
    };
  });
}
