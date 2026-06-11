import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEPLOYED_HISTORY_URL, SITE_URL } from './config.mjs';
import { fetchJson } from './http.mjs';

const HISTORY_TOP_RANK = 300;
const HISTORY_MAX_POINTS = 400;

function jsonOut(value) {
  return `${JSON.stringify(value)}\n`;
}

export function mergeOwnHistory(history, ownRatings, snapshotDate, {
  topRank = HISTORY_TOP_RANK,
  maxPoints = HISTORY_MAX_POINTS,
} = {}) {
  const players = { ...(history?.players ?? {}) };

  for (const row of ownRatings) {
    if (!Number.isFinite(row.own_rank) || row.own_rank > topRank) {
      continue;
    }

    const points = (Array.isArray(players[row.player_id]) ? players[row.player_id] : [])
      .filter((point) => point.date !== snapshotDate);
    points.push({ date: snapshotDate, rating: row.own_rating, rank: row.own_rank });
    points.sort((left, right) => left.date.localeCompare(right.date));
    players[row.player_id] = points.slice(-maxPoints);
  }

  return players;
}

export async function loadOwnHistory(historyFile, { offline = false } = {}) {
  if (!offline) {
    try {
      const deployed = await fetchJson(DEPLOYED_HISTORY_URL);
      if (deployed && typeof deployed.players === 'object') {
        return deployed;
      }
    } catch {
      // fall through to the local file
    }
  }

  try {
    const local = JSON.parse(await readFile(historyFile, 'utf8'));
    if (local && typeof local.players === 'object') {
      return local;
    }
  } catch {
    // no usable history yet
  }

  return { schema_version: 1, updated_at: null, players: {} };
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildRssFeed({ players, ownRatings, generatedAt }) {
  const snapshotDate = generatedAt.slice(0, 10);
  const pubDate = new Date(generatedAt).toUTCString();
  const nameById = new Map(players.map((player) => [player.id, player.names?.en || player.name]));
  const sortedOwn = [...ownRatings].sort((left, right) => left.own_rank - right.own_rank);
  const items = [];

  const top10 = sortedOwn.slice(0, 10);
  if (top10.length) {
    const summary = top10
      .map((row) => `${row.own_rank}. ${nameById.get(row.player_id) ?? row.player_id} (${row.own_rating})`)
      .join(', ');
    items.push({
      title: `Baduk-R top 10 — ${snapshotDate}`,
      description: `Baduk-R ranking snapshot for ${snapshotDate}: ${summary}.`,
      guid: `baduk-r-${snapshotDate}-top10`,
    });
  }

  const movers = sortedOwn
    .map((row) => {
      const sevenDay = row.own_rating_delta_7d;
      const useSevenDay = sevenDay != null && sevenDay !== 0;
      const delta = useSevenDay ? sevenDay : row.own_rating_delta_30d;
      const window = useSevenDay ? '7d' : '30d';
      return { row, delta, window };
    })
    .filter((entry) => entry.delta != null && entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 9);

  for (const { row, delta, window } of movers) {
    const name = nameById.get(row.player_id) ?? row.player_id;
    const signed = delta > 0 ? `+${delta}` : String(delta);
    items.push({
      title: `${name} ${signed} (${window}) — Baduk-R ${row.own_rating}`,
      description: `${name} moved ${signed} Baduk-R points over the last ${window} and now sits at rank ${row.own_rank} with rating ${row.own_rating}.`,
      guid: `baduk-r-${snapshotDate}-mover-${row.player_id}`,
    });
  }

  const itemXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(SITE_URL)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Baduk-R daily ratings update</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Daily Baduk-R professional rating snapshot: top ranking and biggest recent movers.</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(pubDate)}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
}

export async function writeSnapshotOutputs({
  dataDir,
  feedFile,
  data,
  unresolvedExternalRatings = [],
  ownHistory,
  feedXml,
}) {
  const ratingsOutDir = path.join(dataDir, 'ratings');
  const playersOutDir = path.join(dataDir, 'players');
  const generatedAt = data.generatedAt;

  await mkdir(dataDir, { recursive: true });
  await mkdir(ratingsOutDir, { recursive: true });
  await mkdir(playersOutDir, { recursive: true });

  const coreData = { ...data, playerDetails: {} };
  const detailEntries = Object.entries(data.playerDetails);
  const detailFiles = new Set(detailEntries.map(([id]) => `${id}.json`));

  const staleFiles = (await readdir(playersOutDir)).filter(
    (file) => file.endsWith('.json') && !detailFiles.has(file),
  );

  await Promise.all([
    writeFile(path.join(dataDir, 'baduk-data.json'), jsonOut(data), 'utf8'),
    writeFile(path.join(dataDir, 'baduk-data-core.json'), jsonOut(coreData), 'utf8'),
    ...detailEntries.map(([id, detail]) =>
      writeFile(path.join(playersOutDir, `${id}.json`), jsonOut(detail), 'utf8'),
    ),
    ...staleFiles.map((file) => unlink(path.join(playersOutDir, file))),
    writeFile(
      path.join(ratingsOutDir, 'own_latest.json'),
      jsonOut({
        schema_version: 1,
        generated_at: generatedAt,
        model_version: data.modelVersion,
        own_ratings: data.ownRatings,
      }),
      'utf8',
    ),
    writeFile(
      path.join(ratingsOutDir, 'external_latest.json'),
      jsonOut({
        schema_version: 1,
        generated_at: generatedAt,
        external_ratings: data.externalRatings,
        unresolved: unresolvedExternalRatings,
      }),
      'utf8',
    ),
    writeFile(path.join(ratingsOutDir, 'source_status.json'), jsonOut(data.sourceStatus), 'utf8'),
    writeFile(
      path.join(ratingsOutDir, 'comparison_latest.json'),
      jsonOut({
        schema_version: 1,
        generated_at: generatedAt,
        rating_sources: data.ratingSources,
        comparisons: data.ratingComparisons,
      }),
      'utf8',
    ),
    writeFile(path.join(ratingsOutDir, 'own_history.json'), jsonOut(ownHistory), 'utf8'),
    writeFile(feedFile, feedXml, 'utf8'),
  ]);
}
