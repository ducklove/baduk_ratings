import { readFile } from 'node:fs/promises';

import { prestigeFile } from './config.mjs';
import { buildPlayerNameIndex, findPlayersInText, matchPlayerByName, normalizeName, toIsoDate } from './text.mjs';

function parseSimpleYamlValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

export async function loadTournamentPrestige(file = prestigeFile) {
  try {
    const text = await readFile(file, 'utf8');
    const entries = [];
    let current = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const start = line.match(/^-\s+id:\s*(.+)$/);
      if (start) {
        current = { id: parseSimpleYamlValue(start[1]) };
        entries.push(current);
        continue;
      }

      const field = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
      if (field && current) {
        current[field[1]] = parseSimpleYamlValue(field[2]);
      }
    }

    return entries;
  } catch (error) {
    console.warn(`Unable to load tournament prestige config: ${error.message}`);
    return [];
  }
}

export function findPrestige(title, prestigeEntries) {
  const normalizedTitle = normalizeName(title);
  return prestigeEntries.find((entry) =>
    (entry.aliases ?? []).some((alias) => {
      const normalizedAlias = normalizeName(alias);
      return normalizedAlias && normalizedTitle.includes(normalizedAlias);
    }),
  );
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function isInternationalEvent(event, prestige) {
  if (prestige?.international) {
    return true;
  }

  return includesAny(event.title, [
    /세계|国際|國際|国际|世界|World|LG|Samsung|春蘭|春兰|夢百合|梦百合|烂柯|爛柯|Chunlan|Lanke|MLILY/i,
  ]);
}

export function enrichScheduleEvents(events, players, ownRatings, prestigeEntries) {
  const ownRankByPlayer = new Map(ownRatings.map((row) => [row.player_id, row.own_rank]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const playerNameIndex = buildPlayerNameIndex(players);

  return events.map((event) => {
    const explicitNames = event.player_names ?? [];
    const matchedFromNames = explicitNames
      .map((name) => matchPlayerByName(name, playerNameIndex))
      .filter(Boolean);
    const matchedFromText = findPlayersInText(event.title, players);
    const matchedPlayers = new Map();

    for (const player of [...matchedFromNames, ...matchedFromText]) {
      matchedPlayers.set(player.id, player);
    }

    const unresolvedPlayers = explicitNames.filter((name) => !matchPlayerByName(name, playerNameIndex));
    const resolvedPlayerIds = [...matchedPlayers.keys()];
    const prestige = findPrestige(event.title, prestigeEntries);
    let score = 0;
    const reasons = [];

    if (isInternationalEvent(event, prestige)) {
      score += 25;
      reasons.push('international_event');
    }

    if (prestige?.title_event || includesAny(event.title, [/결승|決勝|决赛|決賽|Final|final|챔피언|冠军|冠軍|타이틀|タイトル|title/i])) {
      score += 30;
      reasons.push('title_match_or_final');
    }

    if (includesAny(event.title, [/준결승|準決勝|半决赛|半決賽|semifinal|도전자|挑戦者|league-deciding|결정/i])) {
      score += 20;
      reasons.push('semifinal_or_deciding_round');
    }

    if (includesAny(event.title, [/본선|本戦|本赛|本賽|main/i])) {
      score += 15;
      reasons.push('main_tournament');
    }

    if (includesAny(event.title, [/예선|予選|预选|預選|prelim/i])) {
      score -= 10;
      reasons.push('preliminary');
    }

    const ranks = resolvedPlayerIds
      .map((id) => ownRankByPlayer.get(id) ?? playerById.get(id)?.rank)
      .filter((rank) => Number.isFinite(rank));
    if (ranks.some((rank) => rank <= 10)) {
      score += 25;
      reasons.push('top10_player');
    } else if (ranks.some((rank) => rank <= 30)) {
      score += 15;
      reasons.push('top30_player');
    }
    if (ranks.length >= 2 && ranks.every((rank) => rank <= 100)) {
      score += 10;
      reasons.push('both_top100');
    }

    if (prestige?.prestige_score) {
      score += Number(prestige.prestige_score);
      reasons.push('tournament_prestige');
    }

    if ((event.source_confidence ?? 1) < 0.75) {
      score -= 5;
      reasons.push('low_source_confidence');
    }

    if (unresolvedPlayers.length) {
      score -= Math.min(20, 5 * unresolvedPlayers.length);
      reasons.push('unresolved_players');
    } else if (event.event_type === 'tournament' && !resolvedPlayerIds.length) {
      score -= 5;
    }

    const importanceLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
    const { player_names: _playerNames, ...publicEvent } = event;

    return {
      ...publicEvent,
      importance_score: score,
      importance_level: importanceLevel,
      importance_reasons: [...new Set(reasons)],
      resolved_players: resolvedPlayerIds,
      unresolved_players: unresolvedPlayers,
    };
  });
}

export function parseChineseDateRanges(text) {
  const normalized = text.replace(/\s+/g, '');
  const ranges = [];
  const seen = new Set();

  const add = (start, end = start, label = '') => {
    if (!start || !end) {
      return;
    }
    const key = `${start}-${end}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    ranges.push({ start, end, label: label || (start === end ? start : `${start}~${end}`) });
  };

  const rangePattern = /(20\d{2})年(\d{1,2})月(\d{1,2})日?\s*(?:至|到|-|—|－|~|～)\s*(?:(\d{1,2})月)?(\d{1,2})日/g;
  for (const match of normalized.matchAll(rangePattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const startDay = Number(match[3]);
    const endMonth = Number(match[4] ?? match[2]);
    const endDay = Number(match[5]);
    add(toIsoDate(year, month, startDay), toIsoDate(year, endMonth, endDay), match[0]);
  }

  const listedDaysPattern = /(20\d{2})年(\d{1,2})月(\d{1,2})、(\d{1,2})(?:、(\d{1,2}))?日/g;
  for (const match of normalized.matchAll(listedDaysPattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    for (const day of [match[3], match[4], match[5]].filter(Boolean)) {
      add(toIsoDate(year, month, Number(day)), toIsoDate(year, month, Number(day)), match[0]);
    }
  }

  const singlePattern = /(20\d{2})年(\d{1,2})月(\d{1,2})日/g;
  for (const match of normalized.matchAll(singlePattern)) {
    add(toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])), undefined, match[0]);
  }

  return ranges;
}
