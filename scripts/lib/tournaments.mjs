import { readFile } from 'node:fs/promises';

import { tournamentsFile } from './config.mjs';
import { buildPlayerNameIndex, matchPlayerByName, normalizeName } from './text.mjs';

export const TOURNAMENT_CURATION_NOTE =
  'Manually curated registry; winner rows carry their own source_url. Schedule linkage is automatic.';

export async function loadTournamentRegistry(file = tournamentsFile) {
  const registry = JSON.parse(await readFile(file, 'utf8'));
  if (registry.schema_version !== 1 || !Array.isArray(registry.tournaments)) {
    throw new Error(`Unexpected tournament registry schema in ${file}`);
  }
  return registry;
}

// Same normalizeName-inclusion approach as findPrestige: an event belongs to a
// tournament when its title or tournament field contains any registry alias.
export function matchTournamentEventIds(tournament, schedule) {
  const aliases = (tournament.aliases ?? [])
    .map((alias) => normalizeName(alias))
    .filter(Boolean);

  return (schedule ?? [])
    .filter((event) => {
      const haystacks = [event.title, event.tournament]
        .filter(Boolean)
        .map((text) => normalizeName(text));
      return haystacks.some((haystack) => aliases.some((alias) => haystack.includes(alias)));
    })
    .sort((left, right) => {
      if (left.date !== right.date) {
        return String(left.date).localeCompare(String(right.date));
      }
      return String(left.id).localeCompare(String(right.id));
    })
    .map((event) => event.id);
}

export function resolveWinnerRows(winners, playerNameIndex) {
  return (winners ?? []).map((winner) => ({
    edition: winner.edition,
    year: winner.year,
    winner_name: winner.winner_name,
    winner_player_id: matchPlayerByName(winner.winner_name, playerNameIndex)?.id ?? null,
    runner_up_name: winner.runner_up_name ?? null,
    runner_up_player_id: winner.runner_up_name
      ? (matchPlayerByName(winner.runner_up_name, playerNameIndex)?.id ?? null)
      : null,
    source_url: winner.source_url,
  }));
}

export function buildTournamentsExport(registry, schedule, players, generatedAt) {
  const playerNameIndex = buildPlayerNameIndex(players ?? []);

  return {
    schema_version: 1,
    generated_at: generatedAt,
    curation_note: TOURNAMENT_CURATION_NOTE,
    tournaments: (registry.tournaments ?? []).map((tournament) => ({
      id: tournament.id,
      names: tournament.names,
      region: tournament.region,
      host_country: tournament.host_country,
      organizer: tournament.organizer,
      founded: tournament.founded,
      cycle: tournament.cycle,
      format_note: tournament.format_note,
      web_url: tournament.web_url,
      winners: resolveWinnerRows(tournament.winners, playerNameIndex),
      event_ids: matchTournamentEventIds(tournament, schedule),
    })),
  };
}
