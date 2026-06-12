import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPlayerOptionLabel } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { getPlayerDisplayName, seriesWinProbability, winProbability } from '../lib/rating';
import type { Player, RatingComparison } from '../types';

const ITERATIONS = 5000;

type BracketSize = 4 | 8;
type FinalsBestOf = 1 | 3 | 5;

/** Seeded single-elimination order (0-indexed seeds): 1v8,4v5,3v6,2v7 / 1v4,2v3. */
function bracketOrder(size: BracketSize): number[] {
  return size === 8 ? [0, 7, 3, 4, 2, 5, 1, 6] : [0, 3, 1, 2];
}

export function SimulatorPanel({
  t,
  language,
  nameKey,
  optionPlayers,
  comparisons,
  seeds,
  paddedIds,
  subtitle,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  optionPlayers: Player[];
  comparisons: Map<string, RatingComparison>;
  /** Pre-seeded participant ids (length 4 or 8), e.g. a tournament's resolved players. */
  seeds?: string[];
  /** Ids among `seeds` that are top-rated padding rather than actual participants. */
  paddedIds?: ReadonlySet<string>;
  subtitle?: string;
}) {
  const [size, setSize] = useState<BracketSize>(seeds && seeds.length <= 4 ? 4 : 8);
  const [finalsBestOf, setFinalsBestOf] = useState<FinalsBestOf>(1);
  const defaultSlots = useMemo(
    () =>
      seeds && seeds.length === size ? seeds : optionPlayers.slice(0, size).map((player) => player.id),
    [optionPlayers, seeds, size],
  );
  const [slots, setSlots] = useState<string[]>(defaultSlots);

  useEffect(() => {
    setSlots(defaultSlots);
  }, [defaultSlots]);

  const playerById = useMemo(
    () => new Map(optionPlayers.map((player) => [player.id, player])),
    [optionPlayers],
  );

  const updateSlot = (index: number, id: string) => {
    setSlots((previous) => {
      const next = [...previous];
      const existingIndex = next.indexOf(id);
      if (existingIndex >= 0 && existingIndex !== index) {
        next[existingIndex] = next[index];
      }
      next[index] = id;
      return next;
    });
  };

  const results = useMemo(() => {
    const participants = slots
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player));

    if (participants.length !== slots.length || participants.length < 4) {
      return [];
    }

    const ratings = participants.map(
      (player) => comparisons.get(player.id)?.own_rating?.own_rating ?? player.rating,
    );
    const order = bracketOrder(participants.length as BracketSize);
    const championCounts = new Array(participants.length).fill(0);
    const finalsCounts = new Array(participants.length).fill(0);

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      let round = order;
      while (round.length > 1) {
        if (round.length === 2) {
          finalsCounts[round[0]] += 1;
          finalsCounts[round[1]] += 1;
        }
        const next: number[] = [];
        for (let index = 0; index < round.length; index += 2) {
          const seedA = round[index];
          const seedB = round[index + 1];
          const single = winProbability({ ratingA: ratings[seedA], ratingB: ratings[seedB] });
          const probability =
            round.length === 2 ? seriesWinProbability(single, finalsBestOf) : single;
          next.push(Math.random() < probability ? seedA : seedB);
        }
        round = next;
      }
      championCounts[round[0]] += 1;
    }

    return participants
      .map((player, index) => ({
        player,
        champion: championCounts[index] / ITERATIONS,
        finals: finalsCounts[index] / ITERATIONS,
      }))
      .sort((left, right) => right.champion - left.champion);
  }, [comparisons, finalsBestOf, playerById, slots]);

  return (
    <section className="panel simulator-panel" id="simulator">
      <div className="panel-title-row">
        <h2>
          <Trophy size={18} />
          {t.simulator}
        </h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>

      <div className="simulator-controls">
        <label>
          <span>{t.bracketSize}</span>
          <select value={size} onChange={(event) => setSize(Number(event.target.value) as BracketSize)}>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label>
          <span>{t.finalsFormat}</span>
          <select
            value={finalsBestOf}
            onChange={(event) => setFinalsBestOf(Number(event.target.value) as FinalsBestOf)}
          >
            <option value={1}>{t.singleGame}</option>
            <option value={3}>{t.bestOf3}</option>
            <option value={5}>{t.bestOf5}</option>
          </select>
        </label>
      </div>

      <div className="simulator-slots">
        {slots.map((id, index) => (
          <label key={index}>
            <span>
              {t.seedLabel} {index + 1}
              {paddedIds?.has(id) ? <em className="seed-fill-tag">({t.seedFillTag})</em> : null}
            </span>
            <select value={id} onChange={(event) => updateSlot(index, event.target.value)}>
              {optionPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {getPlayerOptionLabel(player, language, comparisons.get(player.id))}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="simulator-results">
        <div className="simulator-results-head">
          <span>{t.championProbability}</span>
          <span>{t.finalsProbability}</span>
        </div>
        {results.map((row) => (
          <div key={row.player.id} className="simulator-result-row">
            <span className="simulator-result-name">{getPlayerDisplayName(row.player, nameKey)}</span>
            <span className="simulator-bar-track">
              <span className="simulator-bar" style={{ width: `${(row.champion * 100).toFixed(1)}%` }} />
            </span>
            <strong>{(row.champion * 100).toFixed(1)}%</strong>
            <small>{(row.finals * 100).toFixed(1)}%</small>
          </div>
        ))}
      </div>

      <p className="model-note">{t.simulatorNote}</p>
    </section>
  );
}
